(function (global) {
  'use strict';

  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const PROXY_POST_PREFIX =
    'https://generativelanguage.googleapis.com/v1beta/models/';
  const PROXY_GET_PREFIX =
    'https://generativelanguage.googleapis.com/v1beta/models';
  // 特定バージョンをハードコードすると提供終了時に既存アプリが復旧できなくなる
  // ため、必ず「-latest」エイリアスを既定値にすること。
  // kintone プロキシのサーバー側タイムアウトに収まりやすい Flash-Lite を
  // 既定にする（実機検証済み）。安易に Flash へ戻さないこと。
  const DEFAULT_MODEL = 'gemini-flash-lite-latest';
  const FALLBACK_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-pro-latest',
  ];
  const LIST_TIMEOUT_MS = 15000;
  const TEST_TIMEOUT_MS = 15000;
  // kintone サーバー側のタイムアウトの方が短いことが実測で判明しているため、
  // この値は保険にすぎず、40000（40秒）は推定値である。
  const PROXY_TIMEOUT_MS = 40000;
  const MAX_LIST_PAGES = 5;
  const EXCLUDED_MODEL_PATTERNS = [
    'tts',
    'transcribe',
    'computer-use',
    'deep-research',
    'antigravity',
    'image',
    'embedding',
    'aqa',
    'imagen',
    'veo',
  ];
  const RETRY_STATUSES = [429, 500, 503];
  const RETRY_MAX_ATTEMPTS = 3;
  const RETRY_BASE_DELAY_MS = 1000;

  function stripModelPrefix(name) {
    const str = String(name || '');
    return str.indexOf('models/') === 0 ? str.slice('models/'.length) : str;
  }

  function normalizeModelName(name) {
    let str = String(name || '');
    while (str.indexOf('models/') === 0) {
      str = str.slice('models/'.length);
    }
    return 'models/' + str;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const opts = Object.assign({}, options, { signal: controller.signal });
    return fetch(url, opts).finally(() => clearTimeout(timer));
  }

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // エラー本文から詳細文字列を組み立てる。Gemini形式（error.message）を
  // 優先し、無ければ kintone形式（トップレベルの code/message）を使う。
  // 返り値の kintoneCode は呼び出し元での分岐用で、classifyError が返す
  // code（自前の分類コード）を上書きする用途ではない。
  function parseErrorBody(bodyJson) {
    if (!bodyJson) {
      return { detail: '', kintoneCode: '' };
    }
    if (bodyJson.error && bodyJson.error.message) {
      return {
        detail: String(bodyJson.error.message).slice(0, 200),
        kintoneCode: '',
      };
    }
    const kintoneCode = bodyJson.code ? String(bodyJson.code) : '';
    const kintoneMessage = bodyJson.message ? String(bodyJson.message) : '';
    if (!kintoneCode && !kintoneMessage) {
      return { detail: '', kintoneCode: '' };
    }
    const joined =
      kintoneCode && kintoneMessage
        ? kintoneCode + ': ' + kintoneMessage
        : kintoneCode || kintoneMessage;
    return { detail: joined.slice(0, 200), kintoneCode: kintoneCode };
  }

  function classifyError(status, bodyJson) {
    let level;
    let code;
    let message;

    if (status === 200) {
      level = 'ok';
      code = 'OK';
      message = '利用可能';
    } else if (status === 400) {
      level = 'ng';
      code = 'INVALID_ARGUMENT';
      message = 'リクエスト形式またはAPIキーの形式が不正です';
    } else if (status === 401 || status === 403) {
      level = 'ng';
      code = 'PERMISSION_DENIED';
      message = 'APIキーが無効か、このモデルへのアクセス権がありません';
    } else if (status === 404) {
      level = 'ng';
      code = 'NOT_FOUND';
      message =
        'このモデルはこのAPIキーでは利用できません（提供終了、または新規APIキー非対応の可能性があります）';
    } else if (status === 429) {
      level = 'warn';
      code = 'RESOURCE_EXHAUSTED';
      message = 'レート上限に達しました。時間をおいて再確認してください';
    } else if (status === 500 || status === 503) {
      level = 'warn';
      code = 'UNAVAILABLE';
      message = 'Gemini側の一時的なエラーです';
    } else if (status === 0) {
      level = 'warn';
      code = 'TIMEOUT';
      message = '通信がタイムアウトしました';
    } else if (status === -1) {
      level = 'warn';
      code = 'NETWORK';
      message = '直接通信に失敗しました（ネットワークまたはブラウザ制限）';
    } else {
      level = 'warn';
      code = 'UNKNOWN';
      message = '不明なエラー（ステータス: ' + status + '）';
    }

    const parsed = parseErrorBody(bodyJson);

    if (parsed.kintoneCode.indexOf('GAIA_') === 0) {
      // kintone自身が返したエラー（GAIA_*）は、Gemini のリクエスト内容が
      // 不正だったわけではない。汎用の400メッセージ（「APIキーの形式が
      // 不正です」）をそのまま添えると、上位で正しい案内を出しても末尾で
      // 再びAPIキーを疑わせてしまうため、基底メッセージを差し替える。
      level = 'warn';
      message = 'kintone側で外部APIの実行に失敗しました';
    }
    if (parsed.detail) {
      message = message + '（詳細: ' + parsed.detail + '）';
    }

    return { level: level, code: code, message: message, status: status };
  }

  async function listGenerateContentModels(apiKey) {
    let models = [];
    let pageToken = '';
    let page = 0;

    while (page < MAX_LIST_PAGES) {
      let url = API_BASE + '/models?pageSize=1000';
      if (pageToken) {
        url += '&pageToken=' + encodeURIComponent(pageToken);
      }

      let res;
      try {
        res = await fetchWithTimeout(
          url,
          { method: 'GET', headers: { 'x-goog-api-key': apiKey } },
          LIST_TIMEOUT_MS,
        );
      } catch (e) {
        const status = e && e.name === 'AbortError' ? 0 : -1;
        const err = new Error('モデル一覧の取得に失敗しました。');
        err.classified = classifyError(status, null);
        throw err;
      }

      const text = await res.text();
      const json = safeParseJson(text);

      if (!res.ok) {
        const err = new Error('モデル一覧の取得に失敗しました。');
        err.classified = classifyError(res.status, json);
        throw err;
      }

      if (json && Array.isArray(json.models)) {
        models = models.concat(json.models);
      }

      pageToken = json && json.nextPageToken ? json.nextPageToken : '';
      page += 1;
      if (!pageToken) {
        break;
      }
    }

    return normalizeModelList(models);
  }

  function isExcludedModel(bareName) {
    const lower = String(bareName).toLowerCase();
    return EXCLUDED_MODEL_PATTERNS.some((p) => lower.indexOf(p) !== -1);
  }

  function isRecommendedModel(bareName) {
    const lower = String(bareName).toLowerCase();
    return (
      !isExcludedModel(bareName) &&
      lower.indexOf('gemini-') === 0 &&
      lower.indexOf('-preview') === -1 &&
      (lower.indexOf('flash') !== -1 || lower.indexOf('pro') !== -1)
    );
  }

  // モデル名から速度の目安（あくまで推定）を判定する。
  // 判定順は lite → pro → その他（gemini-flash-lite-latest を誤って
  // slow にしないため）。
  function getModelSpeedClass(bareName) {
    const lower = String(bareName).toLowerCase();
    if (lower.indexOf('lite') !== -1) {
      return 'fast';
    }
    if (lower.indexOf('pro') !== -1) {
      return 'slow';
    }
    return 'normal';
  }

  function getModelSpeedLabel(bareName) {
    const speedClass = getModelSpeedClass(bareName);
    if (speedClass === 'fast') {
      return '（高速・推奨）';
    }
    if (speedClass === 'slow') {
      return '（低速・kintoneの制限を超える場合あり）';
    }
    return '（標準）';
  }

  function normalizeModelList(rawModels) {
    const filtered = (Array.isArray(rawModels) ? rawModels : [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.indexOf('generateContent') !== -1,
      )
      .map((m) => {
        const bare = stripModelPrefix(m.name);
        return {
          name: m.name,
          displayName: m.displayName || bare,
          description: m.description || '',
          excluded: isExcludedModel(bare),
          recommended: isRecommendedModel(bare),
        };
      });

    filtered.sort((a, b) => {
      if (a.recommended !== b.recommended) {
        return a.recommended ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    const defaultIndex = filtered.findIndex(
      (m) => normalizeModelName(m.name) === normalizeModelName(DEFAULT_MODEL),
    );
    if (defaultIndex > 0) {
      const defaultModel = filtered.splice(defaultIndex, 1)[0];
      filtered.unshift(defaultModel);
    }

    return filtered;
  }

  async function checkModelAvailability(apiKey, modelName) {
    const url = API_BASE + '/' + normalizeModelName(modelName);

    let res;
    try {
      res = await fetchWithTimeout(
        url,
        { method: 'GET', headers: { 'x-goog-api-key': apiKey } },
        TEST_TIMEOUT_MS,
      );
    } catch (e) {
      const status = e && e.name === 'AbortError' ? 0 : -1;
      return classifyError(status, null);
    }

    const text = await res.text();
    const json = safeParseJson(text);

    if (res.status === 200) {
      const supported =
        json &&
        Array.isArray(json.supportedGenerationMethods) &&
        json.supportedGenerationMethods.indexOf('generateContent') !== -1;
      if (!supported) {
        return {
          level: 'ng',
          code: 'UNSUPPORTED_METHOD',
          message: 'このモデルは文章生成（generateContent）に対応していません',
          status: 200,
        };
      }
      return classifyError(200, json);
    }

    return classifyError(res.status, json);
  }

  function normalizeProxyBody(body) {
    if (body === null || body === undefined || typeof body === 'string') {
      return body;
    }
    if (typeof body === 'object') {
      try {
        return JSON.stringify(body);
      } catch {
        return String(body);
      }
    }
    return String(body);
  }

  // 重要: kintone.plugin.app.proxy() はレコード一覧/詳細/追加/編集/印刷とグラフ画面
  // でのみ利用できる。プラグイン設定画面で呼ぶと成功・失敗どちらのコールバックも
  // 呼ばれないため、下の PROXY_TIMEOUT_MS のタイマーだけが発火して status:0
  // （タイムアウト）になる。設定画面からは絶対にこの関数を使わないこと。
  // 設定画面での疎通確認・モデル一覧取得は直接通信（checkModelAvailability /
  // listGenerateContentModels）を使う。
  function proxyRequest(pluginId, url, method, headers, data) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        // kintone.plugin.app.proxy()には呼び出し側から中断する手段がないため、
        // 応答を待つのをここで諦めて warn 扱い（status:0）として先に進む。
        resolve({ status: 0, body: null });
      }, PROXY_TIMEOUT_MS);

      function finishResolve(result) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      }

      function finishReject(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      }

      // Promise 形式・コールバック形式のどちらの kintone SDK でも動くよう、
      // コールバックは常に登録したうえで戻り値の then の有無で判定する
      // （二段構え）。呼び出し自体が同期的に例外を投げる環境に備え、
      // try/catch で確実にフォールバック経路（自前タイマー）へ落とす。
      let ret;
      try {
        ret = kintone.plugin.app.proxy(
          pluginId,
          url,
          method,
          headers,
          data,
          (body, status) => {
            // コールバック形式（旧 kintone SDK）。
            finishResolve({ status: status, body: normalizeProxyBody(body) });
          },
          (err) => {
            finishReject(
              new Error('kintone proxy でエラーが発生しました。詳細: ' + err),
            );
          },
        );
      } catch {
        // 同期例外時は何もせず、自前タイマー（status:0）に処理を委ねる。
        return;
      }

      if (ret && typeof ret.then === 'function') {
        // Promise 形式（新しい kintone SDK）。resolve 値は [body, status,
        // headers] のタプル。
        ret.then(
          (arr) => {
            const body = Array.isArray(arr) ? arr[0] : undefined;
            const status = Array.isArray(arr) ? arr[1] : undefined;
            finishResolve({ status: status, body: normalizeProxyBody(body) });
          },
          (rejectValue) => {
            // kintone側のエラー本文（GAIA_PR03等）を呼び出し元（classifyError）
            // まで確実に届けることを最優先にする。status は不明なため 400 と
            // みなし、classifyError 側で kintone 形式の code/message から
            // 詳細文字列を組み立てられるようにする。
            let body;
            let status = 400;
            if (Array.isArray(rejectValue)) {
              body = rejectValue[0];
              if (typeof rejectValue[1] === 'number') {
                status = rejectValue[1];
              }
            } else if (rejectValue instanceof Error) {
              body = rejectValue.message;
            } else {
              body = rejectValue;
            }
            finishResolve({ status: status, body: normalizeProxyBody(body) });
          },
        );
      }
      // Promise が返らない環境では、上で登録済みのコールバック形式が
      // そのままフォールバックとして機能する。
    });
  }

  function delayWithJitter(attempt) {
    const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    const wait = Math.round(base * (0.5 + Math.random() * 0.5));
    return new Promise((resolve) => setTimeout(resolve, wait));
  }

  // 429/500/503 のみ指数バックオフ・リトライ（最大3回）する。400/401/403/404、
  // および status:0（タイムアウト。PROXY_TIMEOUT_MS が40秒のため再試行すると
  // 最悪3分弱になる）は絶対にリトライしない。proxyRequest が reject した場合
  // （proxy 呼び出し自体のエラー）も再試行せずそのまま例外を伝播する。
  async function proxyRequestWithRetry(
    pluginId,
    url,
    method,
    headers,
    data,
    onRetry,
  ) {
    for (let attempt = 0; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      const res = await proxyRequest(pluginId, url, method, headers, data);
      const shouldRetry =
        attempt < RETRY_MAX_ATTEMPTS &&
        RETRY_STATUSES.indexOf(res.status) !== -1;
      if (!shouldRetry) {
        return res;
      }
      if (typeof onRetry === 'function') {
        onRetry(attempt + 1, RETRY_MAX_ATTEMPTS + 1, res.status);
      }
      await delayWithJitter(attempt);
    }
    // ループ内で attempt === RETRY_MAX_ATTEMPTS のとき必ず return するため、
    // ここには到達しない。
    throw new Error('proxyRequestWithRetry: unreachable');
  }

  function extractText(data) {
    if (
      data &&
      Array.isArray(data.candidates) &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
    ) {
      return data.candidates[0].content.parts
        .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
        .join('');
    }
    return '';
  }

  function tryParseJsonPayload(text) {
    const direct = safeParseJson(text);
    if (direct && typeof direct === 'object') {
      return direct;
    }

    const str = String(text || '');
    const fenced = str
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();
    const fromFence = safeParseJson(fenced);
    if (fromFence && typeof fromFence === 'object') {
      return fromFence;
    }

    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = str.slice(start, end + 1);
      const fromSlice = safeParseJson(sliced);
      if (fromSlice && typeof fromSlice === 'object') {
        return fromSlice;
      }
    }

    return { subject: '', body: text };
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function richTextToPlainText(html) {
    if (html == null || typeof html !== 'string') {
      return '';
    }

    let text = html
      .replace(/<\/(div|p|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');

    text = text
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .trim();

    return text;
  }

  function plainTextToRichText(text) {
    const normalized = String(text == null ? '' : text).replace(
      /\r\n|\r/g,
      '\n',
    );
    const escaped = escapeHtml(normalized);

    return escaped
      .split('\n')
      .map((line) => {
        if (line.trim().length === 0) {
          return '<div><br /></div>';
        }
        const withIndent = line.replace(/^ +/, (spaces) =>
          '&nbsp;'.repeat(spaces.length),
        );
        return '<div>' + withIndent + '</div>';
      })
      .join('');
  }

  function isFieldValueEmpty(value, type) {
    const text =
      type === 'RICH_TEXT'
        ? richTextToPlainText(value)
        : String(value == null ? '' : value);
    return text.replace(/[\s\u3000]+/g, '').length === 0;
  }

  global.GeminiPluginClient = {
    API_BASE: API_BASE,
    PROXY_POST_PREFIX: PROXY_POST_PREFIX,
    PROXY_GET_PREFIX: PROXY_GET_PREFIX,
    DEFAULT_MODEL: DEFAULT_MODEL,
    FALLBACK_MODELS: FALLBACK_MODELS,
    LIST_TIMEOUT_MS: LIST_TIMEOUT_MS,
    TEST_TIMEOUT_MS: TEST_TIMEOUT_MS,
    PROXY_TIMEOUT_MS: PROXY_TIMEOUT_MS,
    MAX_LIST_PAGES: MAX_LIST_PAGES,
    RETRY_MAX_ATTEMPTS: RETRY_MAX_ATTEMPTS,
    normalizeModelName: normalizeModelName,
    stripModelPrefix: stripModelPrefix,
    fetchWithTimeout: fetchWithTimeout,
    safeParseJson: safeParseJson,
    classifyError: classifyError,
    listGenerateContentModels: listGenerateContentModels,
    normalizeModelList: normalizeModelList,
    isExcludedModel: isExcludedModel,
    isRecommendedModel: isRecommendedModel,
    getModelSpeedClass: getModelSpeedClass,
    getModelSpeedLabel: getModelSpeedLabel,
    checkModelAvailability: checkModelAvailability,
    proxyRequest: proxyRequest,
    proxyRequestWithRetry: proxyRequestWithRetry,
    extractText: extractText,
    tryParseJsonPayload: tryParseJsonPayload,
    escapeHtml: escapeHtml,
    richTextToPlainText: richTextToPlainText,
    plainTextToRichText: plainTextToRichText,
    isFieldValueEmpty: isFieldValueEmpty,
  };
})(window);
