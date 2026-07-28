(function (global) {
  'use strict';

  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const PROXY_POST_PREFIX =
    'https://generativelanguage.googleapis.com/v1beta/models/';
  const PROXY_GET_PREFIX =
    'https://generativelanguage.googleapis.com/v1beta/models';
  const DEFAULT_MODEL = 'gemini-2.5-flash';
  const FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3.5-flash',
  ];
  const LIST_TIMEOUT_MS = 15000;
  const TEST_TIMEOUT_MS = 15000;
  const MAX_LIST_PAGES = 5;

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

    if (bodyJson && bodyJson.error && bodyJson.error.message) {
      const detail = String(bodyJson.error.message).slice(0, 200);
      message = message + '（詳細: ' + detail + '）';
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

    const filtered = models
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.indexOf('generateContent') !== -1,
      )
      .map((m) => ({
        name: m.name,
        displayName: m.displayName || stripModelPrefix(m.name),
        description: m.description || '',
      }));

    filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const defaultIndex = filtered.findIndex(
      (m) => normalizeModelName(m.name) === normalizeModelName(DEFAULT_MODEL),
    );
    if (defaultIndex > 0) {
      const defaultModel = filtered.splice(defaultIndex, 1)[0];
      filtered.unshift(defaultModel);
    }

    return filtered;
  }

  async function testModelDirect(apiKey, modelName) {
    const url =
      API_BASE + '/' + normalizeModelName(modelName) + ':generateContent';
    const data = {
      contents: [{ parts: [{ text: 'OK' }] }],
      generationConfig: { maxOutputTokens: 16, temperature: 0 },
    };

    let res;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(data),
        },
        TEST_TIMEOUT_MS,
      );
    } catch (e) {
      const status = e && e.name === 'AbortError' ? 0 : -1;
      return classifyError(status, null);
    }

    const text = await res.text();
    const json = safeParseJson(text);
    return classifyError(res.status, json);
  }

  function proxyRequest(pluginId, url, method, headers, data) {
    return new Promise((resolve, reject) => {
      kintone.plugin.app.proxy(
        pluginId,
        url,
        method,
        headers,
        data,
        (body, status) => {
          resolve({ status: status, body: body });
        },
        (err) => {
          reject(
            new Error('kintone proxy でエラーが発生しました。詳細: ' + err),
          );
        },
      );
    });
  }

  async function testModelViaProxy(pluginId, modelName) {
    const url =
      PROXY_POST_PREFIX + stripModelPrefix(modelName) + ':generateContent';
    const data = {
      contents: [{ parts: [{ text: 'OK' }] }],
      generationConfig: { maxOutputTokens: 16, temperature: 0 },
    };

    try {
      const result = await proxyRequest(
        pluginId,
        url,
        'POST',
        { 'Content-Type': 'application/json' },
        data,
      );
      return classifyError(result.status, safeParseJson(result.body));
    } catch {
      return classifyError(-1, null);
    }
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

  global.GeminiPluginClient = {
    API_BASE: API_BASE,
    PROXY_POST_PREFIX: PROXY_POST_PREFIX,
    PROXY_GET_PREFIX: PROXY_GET_PREFIX,
    DEFAULT_MODEL: DEFAULT_MODEL,
    FALLBACK_MODELS: FALLBACK_MODELS,
    LIST_TIMEOUT_MS: LIST_TIMEOUT_MS,
    TEST_TIMEOUT_MS: TEST_TIMEOUT_MS,
    MAX_LIST_PAGES: MAX_LIST_PAGES,
    normalizeModelName: normalizeModelName,
    stripModelPrefix: stripModelPrefix,
    fetchWithTimeout: fetchWithTimeout,
    safeParseJson: safeParseJson,
    classifyError: classifyError,
    listGenerateContentModels: listGenerateContentModels,
    testModelDirect: testModelDirect,
    proxyRequest: proxyRequest,
    testModelViaProxy: testModelViaProxy,
    extractText: extractText,
    tryParseJsonPayload: tryParseJsonPayload,
  };
})(window);
