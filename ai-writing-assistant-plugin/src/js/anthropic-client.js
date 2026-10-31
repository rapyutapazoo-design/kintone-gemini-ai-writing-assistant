(function (global) {
  'use strict';

  // Gemini 側のクライアント（proxy の二段構え・再試行・エラー整形）を再利用する。
  // manifest で gemini-client.js を先に読み込むこと。
  const gc = global.GeminiPluginClient;

  const API_BASE = 'https://api.anthropic.com/v1';
  const MESSAGES_URL = API_BASE + '/messages';
  const MODELS_URL = API_BASE + '/models';
  // API バージョンの移行時は公式移行ガイドで本文・レスポンスも確認する。
  const API_VERSION = '2023-06-01';
  // モデル一覧の取得に失敗したときの候補としてだけ使う。既定値として
  // 自動で保存・選択はしない。
  const MODEL_CANDIDATE_WHEN_LIST_FAILS = 'claude-haiku-5-5';
  // Claude を見限るまでの待ち時間。kintone サーバー側のタイムアウトより
  // 短くし、Gemini へ回す時間を残す。
  const CALL_TIMEOUT_MS = 30000;
  const MAX_TOKENS = 8192;
  const RETRY_STATUSES = [429, 500, 502, 503, 504, 529];
  const RETRY_MAX_ATTEMPTS = 1;
  // retry-after がこの値を超える場合は同一プロバイダで粘らず、予備へ回す。
  const MAX_RETRY_AFTER_MS = 5000;
  const LIST_TIMEOUT_MS = 15000;
  const MAX_LIST_PAGES = 5;
  const THINKING_MODE_SUPPRESS = 'suppress';
  const THINKING_MODE_DEFAULT = 'default';
  // thinking の指定を受け付けないと判明したモデル名（セッション内のみ保持）。
  const thinkingRejectedModels = new Set();

  // 文字どおり 'default' のときのみ既定任せ。キー無し・不正値は抑制にする。
  function normalizeThinkingMode(value) {
    return value === THINKING_MODE_DEFAULT
      ? THINKING_MODE_DEFAULT
      : THINKING_MODE_SUPPRESS;
  }

  function shouldSendThinking(model, thinkingMode) {
    return (
      normalizeThinkingMode(thinkingMode) === THINKING_MODE_SUPPRESS &&
      !thinkingRejectedModels.has(String(model || '').toLowerCase())
    );
  }

  // temperature / top_p / top_k は送らない（新しいモデルでは指定すると 400 に
  // なる場合があり、既定値で十分なため）。effort / output_config / fallbacks
  // と assistant の prefill も送らない（モデルごとの対応差を避ける）。
  function buildMessagesBody(model, prompt, opts) {
    const body = {
      model: model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: String(prompt) }],
    };
    if (shouldSendThinking(model, opts && opts.thinkingMode)) {
      body.thinking = { type: 'disabled' };
    }
    return body;
  }

  // x-api-key は proxy 設定（setProxyConfig）の側で付与される。同じ名前の
  // ヘッダをここでも指定すると二重になるため、絶対に含めないこと。
  function buildProxyHeaders() {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': API_VERSION,
    };
  }

  // 設定画面からの直接通信専用（kintone proxy は設定画面で使えない）。
  function buildDirectHeaders(apiKey) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  function getHeaderValue(headers, name) {
    if (!headers || typeof headers !== 'object') {
      return null;
    }
    const target = String(name).toLowerCase();
    const key = Object.keys(headers).find((k) => k.toLowerCase() === target);
    return key === undefined ? null : headers[key];
  }

  // retry-after（秒）をミリ秒で返す。無い・解釈できない場合は null。
  function getRetryAfterMs(res) {
    const value = getHeaderValue(res && res.headers, 'retry-after');
    const sec = value === null ? NaN : Number(value);
    return isFinite(sec) && sec >= 0 ? Math.round(sec * 1000) : null;
  }

  function sendMessage(pluginId, body, opts) {
    const o = opts || {};
    return gc.proxyRequestWithRetry(
      pluginId,
      MESSAGES_URL,
      'POST',
      buildProxyHeaders(),
      body,
      o.onRetry,
      {
        deadlineAt: o.deadlineAt,
        maxAttempts: RETRY_MAX_ATTEMPTS,
        retryStatuses: RETRY_STATUSES,
        timeoutMs: o.timeoutMs || CALL_TIMEOUT_MS,
        shouldStopRetry: (res) =>
          res.status === 429 && getRetryAfterMs(res) > MAX_RETRY_AFTER_MS,
      },
    );
  }

  // step: { model, prompt, thinkingMode }。thinking の指定が原因の 400 なら、
  // 指定を外して1回だけ再送する（安全網）。
  async function requestMessage(pluginId, step, opts) {
    const o = opts || {};
    const timeoutMs = o.timeoutMs || CALL_TIMEOUT_MS;
    const onProgress =
      typeof o.onProgress === 'function' ? o.onProgress : function () {};
    const body = buildMessagesBody(step.model, step.prompt, step);
    const res = await sendMessage(pluginId, body, o);
    const hasDeadlineRoom =
      typeof o.deadlineAt !== 'number' || Date.now() < o.deadlineAt - timeoutMs;
    if (
      body.thinking &&
      res.status === 400 &&
      gc.isThinkingConfigError(res.status, gc.safeParseJson(res.body)) &&
      hasDeadlineRoom
    ) {
      thinkingRejectedModels.add(String(step.model).toLowerCase());
      console.warn(
        'thinking の指定が拒否されたため、指定を外して再送します: ' +
          step.model,
      );
      onProgress({ type: 'thinking_retry', model: step.model });
      const retryBody = buildMessagesBody(step.model, step.prompt, {
        thinkingMode: THINKING_MODE_DEFAULT,
      });
      return sendMessage(pluginId, retryBody, o);
    }
    return res;
  }

  // type==='text' のブロックだけを連結する（thinking 等のブロックや
  // content[0] への依存を避ける）。
  function extractText(json) {
    if (!json || !Array.isArray(json.content)) {
      return '';
    }
    return json.content
      .map((b) =>
        b && b.type === 'text' && typeof b.text === 'string' ? b.text : '',
      )
      .join('');
  }

  // 失敗の種類: 'ok' | 'timeout' | 'busy' | 'auth' | 'thinking' | 'refusal' |
  // 'truncated' | 'empty' | 'other'
  function classifyFailureKind(status, json, bodyText) {
    const parsed = gc.parseErrorBody(json);
    if (
      status === 0 ||
      parsed.kintoneCode === 'GAIA_PR03' ||
      String(bodyText || '')
        .toLowerCase()
        .indexOf('gaia_pr03') !== -1
    ) {
      return 'timeout';
    }
    if (RETRY_STATUSES.indexOf(status) !== -1) {
      return 'busy';
    }
    if (status === 401 || status === 403) {
      return 'auth';
    }
    if (gc.isThinkingConfigError(status, json)) {
      return 'thinking';
    }
    if (status >= 200 && status < 300) {
      if (json && json.stop_reason === 'refusal') {
        return 'refusal';
      }
      if (json && json.stop_reason === 'max_tokens') {
        return 'truncated';
      }
      return extractText(json) ? 'ok' : 'empty';
    }
    return 'other';
  }

  function classifyError(status, json) {
    const result = gc.classifyError(status, json);
    const isServerError = [500, 502, 503, 504, 529].indexOf(status) !== -1;
    if (!isServerError) {
      return result;
    }
    const detail = gc.parseErrorBody(json).detail;
    return {
      level: 'warn',
      code: 'UNAVAILABLE',
      message:
        'Claude側が混雑しています（または一時的なエラーです）' +
        (detail ? '（詳細: ' + detail + '）' : ''),
      status: status,
    };
  }

  // 直接 GET でモデル一覧を取得する（設定画面用。生成はしない）。
  async function listModels(apiKey) {
    let models = [];
    let afterId = '';
    let page = 0;

    while (page < MAX_LIST_PAGES) {
      let url = MODELS_URL + '?limit=1000';
      if (afterId) {
        url += '&after_id=' + encodeURIComponent(afterId);
      }

      let res;
      try {
        res = await gc.fetchWithTimeout(
          url,
          { method: 'GET', headers: buildDirectHeaders(apiKey) },
          LIST_TIMEOUT_MS,
        );
      } catch (e) {
        const status = e && e.name === 'AbortError' ? 0 : -1;
        const err = new Error('モデル一覧の取得に失敗しました。');
        err.classified = classifyError(status, null);
        throw err;
      }

      const json = gc.safeParseJson(await res.text());
      if (!res.ok) {
        const err = new Error('モデル一覧の取得に失敗しました。');
        err.classified = classifyError(res.status, json);
        throw err;
      }

      if (json && Array.isArray(json.data)) {
        models = models.concat(json.data);
      }
      afterId = json && json.has_more && json.last_id ? json.last_id : '';
      page += 1;
      if (!afterId) {
        break;
      }
    }

    return normalizeModelList(models);
  }

  // モデル名から速度の目安（あくまで推定）を判定する。
  function getModelSpeedClass(id) {
    const lower = String(id).toLowerCase();
    if (lower.indexOf('haiku') !== -1) {
      return 'fast';
    }
    if (lower.indexOf('opus') !== -1 || lower.indexOf('fable') !== -1) {
      return 'slow';
    }
    return 'standard';
  }

  function getModelSpeedLabel(id) {
    const speedClass = getModelSpeedClass(id);
    if (speedClass === 'fast') {
      return '高速・推奨';
    }
    if (speedClass === 'slow') {
      return '低速・kintoneの制限を超える場合あり';
    }
    return '標準';
  }

  function normalizeModelList(raw) {
    const list = (Array.isArray(raw) ? raw : [])
      .filter((m) => m && m.id)
      .map((m) => ({
        id: m.id,
        displayName: m.display_name || m.id,
        createdAt: m.created_at || '',
        recommended: /haiku/i.test(m.id),
        speedClass: getModelSpeedClass(m.id),
      }));
    // 推奨（haiku）を先頭にし、その中は新しい順に並べる。
    list.sort((a, b) => {
      if (a.recommended !== b.recommended) {
        return a.recommended ? -1 : 1;
      }
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return list;
  }

  // モデル情報の取得だけで疎通を確認する。生成リクエストは決して送らない
  // （課金と時間を避けるため）。
  async function checkModelAvailability(apiKey, id) {
    let res;
    try {
      res = await gc.fetchWithTimeout(
        MODELS_URL + '/' + encodeURIComponent(id),
        { method: 'GET', headers: buildDirectHeaders(apiKey) },
        gc.TEST_TIMEOUT_MS,
      );
    } catch (e) {
      const status = e && e.name === 'AbortError' ? 0 : -1;
      return classifyError(status, null);
    }
    const json = gc.safeParseJson(await res.text());
    return classifyError(res.status, json);
  }

  global.AnthropicPluginClient = {
    API_BASE: API_BASE,
    MESSAGES_URL: MESSAGES_URL,
    MODELS_URL: MODELS_URL,
    API_VERSION: API_VERSION,
    MODEL_CANDIDATE_WHEN_LIST_FAILS: MODEL_CANDIDATE_WHEN_LIST_FAILS,
    CALL_TIMEOUT_MS: CALL_TIMEOUT_MS,
    MAX_TOKENS: MAX_TOKENS,
    RETRY_STATUSES: RETRY_STATUSES,
    RETRY_MAX_ATTEMPTS: RETRY_MAX_ATTEMPTS,
    MAX_RETRY_AFTER_MS: MAX_RETRY_AFTER_MS,
    LIST_TIMEOUT_MS: LIST_TIMEOUT_MS,
    MAX_LIST_PAGES: MAX_LIST_PAGES,
    THINKING_MODE_SUPPRESS: THINKING_MODE_SUPPRESS,
    THINKING_MODE_DEFAULT: THINKING_MODE_DEFAULT,
    normalizeThinkingMode: normalizeThinkingMode,
    buildMessagesBody: buildMessagesBody,
    buildProxyHeaders: buildProxyHeaders,
    buildDirectHeaders: buildDirectHeaders,
    sendMessage: sendMessage,
    requestMessage: requestMessage,
    extractText: extractText,
    classifyFailureKind: classifyFailureKind,
    classifyError: classifyError,
    getRetryAfterMs: getRetryAfterMs,
    listModels: listModels,
    normalizeModelList: normalizeModelList,
    getModelSpeedClass: getModelSpeedClass,
    getModelSpeedLabel: getModelSpeedLabel,
    checkModelAvailability: checkModelAvailability,
  };
})(window);
