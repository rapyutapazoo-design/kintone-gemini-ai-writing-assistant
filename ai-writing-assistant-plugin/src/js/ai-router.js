(function (global) {
  'use strict';

  // 優先順に従って複数のAIプロバイダを順に試すルーター。
  // manifest で gemini-client.js と anthropic-client.js を先に読み込むこと。
  const gc = global.GeminiPluginClient;
  const ac = global.AnthropicPluginClient;

  const PROVIDER_ANTHROPIC = 'anthropic';
  const PROVIDER_GEMINI = 'gemini';
  const ORDER_OPTIONS = [
    'anthropic,gemini',
    'gemini',
    'anthropic',
    'gemini,anthropic',
  ];
  // 全段を合わせた待ち時間の上限（最悪値）。
  const TOTAL_DEADLINE_MS = gc.TOTAL_DEADLINE_MS;

  // 後方互換の要: 設定が無い・不正な場合は Gemini のみ（従来の挙動）にする。
  function parseProviderOrder(value) {
    if (value === undefined || value === null || String(value) === '') {
      return [PROVIDER_GEMINI];
    }
    const seen = [];
    String(value)
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .forEach((v) => {
        if (
          (v === PROVIDER_ANTHROPIC || v === PROVIDER_GEMINI) &&
          seen.indexOf(v) === -1
        ) {
          seen.push(v);
        }
      });
    return seen.length > 0 ? seen : [PROVIDER_GEMINI];
  }

  function buildGeminiStep(config) {
    return {
      type: PROVIDER_GEMINI,
      label: 'Gemini',
      model: config.gemini_model || gc.DEFAULT_MODEL,
      thinkingMode: gc.normalizeThinkingMode(config.gemini_thinking),
    };
  }

  function buildProviderPlan(config) {
    const plan = [];
    parseProviderOrder(config.ai_provider_order).forEach((type) => {
      if (type === PROVIDER_GEMINI) {
        plan.push(buildGeminiStep(config));
        return;
      }
      if (!config.anthropic_model) {
        console.warn('[AI文章作成] Claudeのモデルが未設定のためスキップします');
        return;
      }
      plan.push({
        type: PROVIDER_ANTHROPIC,
        label: 'Claude',
        model: config.anthropic_model,
        thinkingMode: ac.normalizeThinkingMode(config.anthropic_thinking),
      });
    });
    if (plan.length === 0) {
      console.warn('[AI文章作成] 使用できるAIが無いため、Geminiで実行します');
      return [buildGeminiStep(config)];
    }
    return plan;
  }

  // 次の段が使う待ち時間を残して、この段の期限を決める。
  function computePhaseDeadline(overallDeadline, nextStep) {
    return nextStep
      ? overallDeadline - PROVIDERS[nextStep.type].timeoutMs
      : overallDeadline;
  }

  function parseJsonOrNull(body) {
    return gc.safeParseJson(body);
  }

  // 下書きは件名と本文を必須にする。壊れた出力で既存フィールドを上書きしない。
  function parseDraftJson(text) {
    const source = String(text || '').trim();
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    const data =
      gc.safeParseJson(source) ||
      (start !== -1 && end > start
        ? gc.safeParseJson(source.slice(start, end + 1))
        : null);
    return !!(
      data &&
      !Array.isArray(data) &&
      typeof data.subject === 'string' &&
      data.subject.trim() &&
      typeof data.body === 'string' &&
      data.body.trim()
    );
  }

  async function runAnthropic(pluginId, step, ctx) {
    const res = await ac.requestMessage(
      pluginId,
      {
        model: step.model,
        prompt: ctx.prompt,
        thinkingMode: step.thinkingMode,
      },
      {
        deadlineAt: ctx.phaseDeadline,
        timeoutMs: ac.CALL_TIMEOUT_MS,
        onRetry: (attempt, total) =>
          ctx.onProgress({ type: 'retry', attempt: attempt, total: total }),
        onProgress: ctx.onProgress,
      },
    );
    const json = parseJsonOrNull(res.body);
    const kind = ac.classifyFailureKind(res.status, json, res.body);
    const classified = ac.classifyError(res.status, json);
    const kindMessages = {
      refusal: 'Claudeが応答を拒否しました',
      truncated: '出力が上限で途切れました',
      empty: '応答が空でした',
    };
    if (kindMessages[kind]) {
      classified.message = kindMessages[kind];
    }
    return {
      ok: kind === 'ok',
      text: ac.extractText(json),
      status: res.status,
      kind: kind,
      body: res.body,
      classified: classified,
      modelUsed: step.model,
    };
  }

  async function runGemini(pluginId, step, ctx) {
    const data = {
      contents: [{ parts: [{ text: ctx.prompt }] }],
    };
    if (ctx.requireJson) {
      data.generationConfig = { responseMimeType: 'application/json' };
    }
    // maxOutputTokens は付けない（思考トークンが上限に含まれ、本文切れや
    // JSON解析失敗を招く恐れがあるため）。
    const result = await gc.generateContentWithFallback(pluginId, {
      model: step.model,
      body: data,
      thinkingMode: step.thinkingMode,
      onProgress: ctx.onProgress,
      deadlineAt: ctx.phaseDeadline,
    });
    const status = result.status;
    const json = parseJsonOrNull(result.body);
    let kind = gc.classifyFailureKind(status, json, result.body);
    let text = '';
    if (kind === 'ok') {
      text = json ? gc.extractText(json) : '';
      if (!json) {
        kind = 'other';
      } else if (!text) {
        kind = 'empty';
      }
    } else if (kind === 'other' && (status === 401 || status === 403)) {
      kind = 'auth';
    }
    const classified = gc.classifyError(status, json);
    if (kind === 'empty') {
      classified.message = '応答が空でした';
    } else if (kind === 'other' && status >= 200 && status < 300) {
      classified.message = 'レスポンスの解析に失敗しました';
    }
    return {
      ok: kind === 'ok',
      text: text,
      status: status,
      kind: kind,
      body: result.body,
      classified: classified,
      modelUsed: result.modelUsed,
      primaryModel: result.primaryModel,
      fallbackModel: result.fallbackModel,
      fallbackStatus: result.fallbackResult
        ? result.fallbackResult.status
        : undefined,
      fallbackReason: result.fallbackReason,
    };
  }

  const PROVIDERS = {
    anthropic: {
      label: 'Claude',
      timeoutMs: ac.CALL_TIMEOUT_MS,
      run: runAnthropic,
    },
    gemini: {
      label: 'Gemini',
      timeoutMs: gc.PROXY_TIMEOUT_MS,
      run: runGemini,
    },
  };

  function describeKind(kind, info) {
    const type = info && (info.provider || info.type);
    const provider = PROVIDERS[type];
    const status = info && info.status;
    const withStatus = (label) =>
      status !== undefined && status !== null && status !== 0
        ? label + '(' + status + ')'
        : label;
    if (kind === 'timeout') {
      const sec = provider ? Math.round(provider.timeoutMs / 1000) : '';
      return 'タイムアウト（' + sec + '秒）';
    }
    const labels = {
      busy: '混雑',
      auth: '認証エラー',
      other: 'エラー',
    };
    if (labels[kind]) {
      return withStatus(labels[kind]);
    }
    const plain = {
      refusal: '応答拒否',
      truncated: '出力途切れ',
      empty: '空の応答',
      thinking: '思考設定エラー',
    };
    return plain[kind] || withStatus('エラー');
  }

  // 「Claude: タイムアウト（30秒）／Gemini: 混雑(503)」の形にする。
  function summarizeAttempts(attempts) {
    return (attempts || [])
      .map((a) => a.label + ': ' + describeKind(a.kind, a))
      .join('／');
  }

  function toFailedRun(e) {
    return {
      ok: false,
      text: '',
      status: undefined,
      kind: 'other',
      body: null,
      classified: {
        level: 'warn',
        code: 'PROXY',
        message: e && e.message ? e.message : String(e),
        status: undefined,
      },
    };
  }

  function validateDraftRun(run, requireJson) {
    if (!run.ok || !requireJson || parseDraftJson(run.text)) {
      return run;
    }
    run.ok = false;
    run.kind = 'invalid_json';
    run.classified = {
      level: 'warn',
      code: 'INVALID_JSON',
      message: '件名と本文を含むJSON形式の応答を取得できませんでした。',
      status: run.status,
    };
    return run;
  }

  // 戻り値: { text, provider, label, model, elapsedMs, attempts, fallbackFrom,
  // fallbackReason, geminiFallbackModel, geminiFallbackReason }。全段が失敗
  // したら、最終段の情報を付けた Error を投げる。
  async function generateText(pluginId, params) {
    const plan = params.plan;
    const onProgress =
      typeof params.onProgress === 'function'
        ? params.onProgress
        : function () {};
    const startedAt = Date.now();
    const overallDeadline = startedAt + TOTAL_DEADLINE_MS;
    const attempts = [];
    let geminiRun = null;
    let last = null;
    let lastStep = null;

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      if (i > 0) {
        onProgress({
          type: 'provider_fallback',
          from: plan[i - 1].label,
          to: step.label,
          kind: attempts[attempts.length - 1].kind,
        });
      }
      onProgress({
        type: 'provider_start',
        provider: step.type,
        label: step.label,
        model: step.model,
        index: i,
      });
      const ctx = {
        prompt: params.prompt,
        requireJson: params.requireJson,
        onProgress: onProgress,
        phaseDeadline: computePhaseDeadline(overallDeadline, plan[i + 1]),
      };
      const stepStartedAt = Date.now();
      let run;
      try {
        run = await PROVIDERS[step.type].run(pluginId, step, ctx);
      } catch (e) {
        // proxy の reject など。次の段があれば続行する。
        run = toFailedRun(e);
      }
      run = validateDraftRun(run, params.requireJson);
      attempts.push({
        provider: step.type,
        label: step.label,
        model: step.model,
        status: run.status,
        kind: run.kind,
        elapsedMs: Date.now() - stepStartedAt,
      });
      if (step.type === PROVIDER_GEMINI) {
        geminiRun = run;
      }
      if (run.ok) {
        const failed = attempts.length > 1 ? attempts[0] : null;
        return {
          text: run.text,
          provider: step.type,
          label: step.label,
          model: run.modelUsed,
          elapsedMs: Date.now() - startedAt,
          attempts: attempts,
          fallbackFrom: failed ? failed.label : null,
          fallbackReason: failed ? failed.kind : null,
          geminiFallbackModel:
            step.type === PROVIDER_GEMINI && run.fallbackReason
              ? run.modelUsed
              : null,
          geminiFallbackReason:
            step.type === PROVIDER_GEMINI ? run.fallbackReason || null : null,
          primaryModel: step.type === PROVIDER_GEMINI ? run.primaryModel : null,
        };
      }
      last = run;
      lastStep = step;
    }

    // proxy 自体の失敗（status 無し）は従来どおり元のメッセージをそのまま使う。
    const err = new Error(
      last.status === undefined
        ? last.classified.message
        : 'API Error ' + last.status + ': ' + last.classified.message,
    );
    err.attempts = attempts;
    err.classified = last.classified;
    err.provider = lastStep.type;
    err.kind = last.kind;
    err.primaryModel =
      lastStep.type === PROVIDER_GEMINI && geminiRun
        ? geminiRun.primaryModel
        : lastStep.model;
    err.fallbackModel =
      lastStep.type === PROVIDER_GEMINI && geminiRun
        ? geminiRun.fallbackModel
        : null;
    err.fallbackStatus =
      lastStep.type === PROVIDER_GEMINI && geminiRun
        ? geminiRun.fallbackStatus
        : undefined;
    err.elapsedMs = Date.now() - startedAt;
    throw err;
  }

  global.AiProviderRouter = {
    PROVIDERS: PROVIDERS,
    ORDER_OPTIONS: ORDER_OPTIONS,
    parseProviderOrder: parseProviderOrder,
    buildProviderPlan: buildProviderPlan,
    computePhaseDeadline: computePhaseDeadline,
    generateText: generateText,
    describeKind: describeKind,
    summarizeAttempts: summarizeAttempts,
    parseDraftJson: parseDraftJson,
  };
})(window);
