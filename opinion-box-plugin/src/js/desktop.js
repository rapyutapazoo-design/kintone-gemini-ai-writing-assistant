(function (PLUGIN_ID) {
  'use strict';

  // 設定読み込み
  const config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const client = window.GeminiPluginClient;
  const genOpts = window.GeminiGenerationOptions;

  const DEFAULT_PROMPT_DRAFT = `あなたはマンション管理組合への意見書作成システムです。
以下の【メモ】を元に、「件名」と「本文」を作成し、必ず**JSON形式**のみで出力してください。
【出力フォーマット】
{ "subject": "件名(20文字以内)", "body": "本文" }
【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 挨拶文、署名は一切禁止。
3. 「です・ます」調。
4. {{formatInstruction}}
【メモ】
{{input}}`;

  const DEFAULT_PROMPT_SUMMARY = `あなたはマンション管理組合の理事会資料作成担当です。
以下の意見書の内容を、理事会資料として適切な長さに要約してください。

【要約のルール】
1. 具体的な行数制限は設けません。元の文章量や内容の複雑さに応じて、効率的に内容を把握できる適切な長さに調整してください。
2. 短い意見は一言で簡潔に、複雑な背景がある意見は重要な詳細（日付、場所、経緯など）を漏らさないように要約してください。
3. 冗長な表現は避け、事実関係を明確にしてください。
4. 見出し（■など）と箇条書き（・）を用いて、人間が一目で読みやすいレイアウトで出力してください。
5. Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）は使用せず、HTMLタグ（<b> <br> <div> <span>など）も出力しないこと。改行はそのまま改行文字で表現すること。

【本文】
{{body}}`;

  const GEMINI_MODEL = config.gemini_model || 'gemini-2.5-flash';
  const F_INPUT = config.field_input || 'keyword_input';
  const F_LENGTH =
    config.field_length === undefined ? 'length_option' : config.field_length;
  const F_SUBJECT =
    config.field_subject === undefined
      ? 'opinion_subject'
      : config.field_subject;
  const F_BODY = config.field_body || 'opinion_body';
  const F_SUMMARY = config.field_summary || 'ai_summary';
  // 将来、利用者がフォーマットを選択できるようにするための予約フィールド。
  // format_mode が 'field' に切り替わって初めて参照される（現状は常に 'fixed'）。
  const F_FORMAT = config.field_format || '';
  const SPACE_DRAFT = config.space_draft || 'btn_space_draft';
  const SPACE_SUMMARY = config.space_summary || 'btn_space_summary';
  const SUMMARY_ON = (config.summary_enabled || 'yes') !== 'no';
  const LABEL_DRAFT = config.btn_label_draft || 'Geminiで件名・本文を作成';
  const LABEL_SUMMARY = config.btn_label_summary || 'Geminiで要約';
  const PROMPT_DRAFT = config.prompt_draft || DEFAULT_PROMPT_DRAFT;
  const PROMPT_SUMMARY = config.prompt_summary || DEFAULT_PROMPT_SUMMARY;

  // 文字数マッピング。length_map が未設定/空の場合は、後段で
  // legacyLengthInstruction() による現行ハードコード動作の完全再現にフォールバックする。
  const LENGTH_MODE = config.length_mode || 'field';
  const LENGTH_MAP = genOpts.parseMap(config.length_map, []);
  const LENGTH_DEFAULT = config.length_default || '';

  // フォーマットマッピング。format_map が未設定/空の場合は既定フォーマット
  // （heading_bullet）の instruction にフォールバックする。
  const FORMAT_MODE = config.format_mode || 'fixed';
  const FORMAT_MAP = genOpts.parseMap(config.format_map, []);
  const FORMAT_DEFAULT =
    config.format_default ||
    genOpts.getFormatInstructionById(genOpts.DEFAULT_FORMAT_ID);

  // 出力先の上書き保護（既定 'yes' = 確認する）
  const OVERWRITE_CONFIRM = (config.overwrite_confirm || 'yes') !== 'no';

  function renderTemplate(tpl, vars) {
    return String(tpl).replace(/\{\{(\w+)\}\}/g, (m, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m,
    );
  }

  function readFieldValue(record, code) {
    if (!code) return '';
    if (!record[code]) {
      throw new Error(
        'フィールドコード「' +
          code +
          '」がこのアプリに存在しません。プラグイン設定を確認してください。',
      );
    }
    if (record[code].type === 'RICH_TEXT') {
      return client.richTextToPlainText(record[code].value);
    }
    return record[code].value || '';
  }

  // =========================================================
  // 1. デザイン定義
  // =========================================================
  const GEMINI_LOGO_SVG = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: text-bottom; margin-right: 8px;">
        <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" fill="#fff"/>
    </svg>`;

  const BTN_STYLE = `
        display: flex; align-items: center; justify-content: center;
        padding: 10px 20px; color: #fff;
        background: linear-gradient(135deg, #4285F4 0%, #2962FF 100%);
        border: none; border-radius: 20px;
        cursor: pointer; font-weight: bold; font-size: 14px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        transition: all 0.2s ease;
    `;

  // =========================================================
  // 2. ローディング画面用CSS
  // =========================================================
  const LOADING_CSS = `
        #kintone-spinner-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 9999;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            background: linear-gradient(-45deg, #6a11cb, #2575fc, #f77062, #fe5196);
            background-size: 400% 400%;
            animation: gradientBG 10s ease infinite;
            color: white; font-family: sans-serif;
        }
        @keyframes gradientBG {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .spinner-container {
            position: relative; width: 100px; height: 100px;
            display: flex; justify-content: center; align-items: center;
        }
        .spinner-ring {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            border-radius: 50%; border: 2px solid transparent;
            background: linear-gradient(#fff, rgba(255,255,255,0.2)) border-box;
            -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor; mask-composite: exclude;
            animation: spin 1.5s linear infinite;
            box-shadow: 0 0 15px rgba(255, 255, 255, 0.4);
        }
        .spinner-star {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%); margin-left: 2px;
            font-size: 45px; color: white;
            animation: pulse-glow 2s ease-in-out infinite;
            filter: drop-shadow(0 0 10px rgba(255,255,255,0.9));
            z-index: 10; line-height: 1;
        }
        .sparkle {
            position: absolute; background: white; border-radius: 50%; opacity: 0;
            animation: sparkle-anim 2s infinite; top: 50%; left: 50%;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse-glow { 
            0%, 100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.9; }
            50% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; text-shadow: 0 0 25px white; }
        }
        @keyframes sparkle-anim {
            0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1); opacity: 0; }
        }
        .spinner-text {
            font-size: 18px; font-weight: bold; margin-top: 30px;
            letter-spacing: 1px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
    `;

  if (!document.getElementById('gemini-loading-video-style')) {
    const style = document.createElement('style');
    style.id = 'gemini-loading-video-style';
    style.innerHTML = LOADING_CSS;
    document.head.appendChild(style);
  }

  // =========================================================
  // 3. ボタン表示ロジック
  // =========================================================
  const EVENTS_EDIT = [
    'app.record.create.show',
    'app.record.edit.show',
    'mobile.app.record.create.show',
    'mobile.app.record.edit.show',
  ];
  const EVENTS_DETAIL = [
    'app.record.detail.show',
    'mobile.app.record.detail.show',
  ];

  kintone.events.on(EVENTS_EDIT, function (event) {
    const isMobile = event.type.startsWith('mobile.');
    const appManager = isMobile ? kintone.mobile.app : kintone.app;
    const space = appManager.record.getSpaceElement(SPACE_DRAFT);
    if (!space) return;
    space.innerHTML = '';

    const btn = document.createElement('button');
    btn.innerHTML = GEMINI_LOGO_SVG + LABEL_DRAFT;
    btn.style = BTN_STYLE;
    if (isMobile) {
      btn.style.width = '100%';
      btn.style.marginBottom = '10px';
    }

    btn.onclick = function (e) {
      e.preventDefault();
      generateDraft(isMobile);
    };
    space.appendChild(btn);
  });

  kintone.events.on(EVENTS_DETAIL, function (event) {
    if (!SUMMARY_ON) return;
    const isMobile = event.type.startsWith('mobile.');
    const appManager = isMobile ? kintone.mobile.app : kintone.app;
    const space = appManager.record.getSpaceElement(SPACE_SUMMARY);
    if (!space) return;
    space.innerHTML = '';

    const btnSummary = document.createElement('button');
    btnSummary.innerHTML = GEMINI_LOGO_SVG + LABEL_SUMMARY;
    btnSummary.style = BTN_STYLE;
    btnSummary.style.padding = '8px 16px';
    if (isMobile) {
      btnSummary.style.width = '100%';
      btnSummary.style.marginBottom = '10px';
    }

    btnSummary.onclick = function (e) {
      e.preventDefault();
      generateSummary(event.record, isMobile);
    };
    space.appendChild(btnSummary);
  });

  // =========================================================
  // 4. AI処理ロジック
  // =========================================================

  // 本文・件名にすでに値がある状態でAI生成を実行しようとしていないかを確認する。
  // OVERWRITE_CONFIRM が無効、または上書き対象の値が空ならそのまま続行してよい。
  function confirmOverwriteIfNeeded(record) {
    if (!OVERWRITE_CONFIRM) {
      return true;
    }
    const bodyField = record[F_BODY];
    const subjectField = F_SUBJECT ? record[F_SUBJECT] : null;
    const bodyHasValue =
      !!bodyField && !client.isFieldValueEmpty(bodyField.value, bodyField.type);
    const subjectHasValue =
      !!subjectField &&
      !client.isFieldValueEmpty(subjectField.value, subjectField.type);
    if (!bodyHasValue && !subjectHasValue) {
      return true;
    }
    return confirm(
      '本文または件名に既に入力内容があります。AIの生成結果で上書きしますか？',
    );
  }

  // 文字数の指示文を決定する。length_map 未設定時は現行のハードコード動作
  // （200/400/600文字）を完全再現する（デグレ防止のため最優先）。
  function resolveLengthInstruction(lengthOption, record) {
    if (LENGTH_MAP.length === 0) {
      return genOpts.legacyLengthInstruction(lengthOption);
    }
    const lengthFallback =
      LENGTH_DEFAULT || genOpts.legacyLengthInstruction(lengthOption);
    return genOpts.resolveOption(
      LENGTH_MODE,
      F_LENGTH,
      LENGTH_MAP,
      lengthFallback,
      record,
    );
  }

  function resolveFormatInstruction(record) {
    return genOpts.resolveOption(
      FORMAT_MODE,
      F_FORMAT,
      FORMAT_MAP,
      FORMAT_DEFAULT,
      record,
    );
  }

  async function generateDraft(isMobile) {
    const appManager = isMobile ? kintone.mobile.app : kintone.app;
    const recordData = appManager.record.get();
    const keyword = readFieldValue(recordData.record, F_INPUT);
    let lengthOption = '';
    if (F_LENGTH) {
      try {
        lengthOption = readFieldValue(recordData.record, F_LENGTH);
      } catch {
        lengthOption = '';
      }
    }

    if (!keyword) {
      alert('「AIへの指示・メモ」を入力してください。');
      return;
    }

    if (!confirmOverwriteIfNeeded(recordData.record)) {
      return;
    }

    const prompt = renderTemplate(PROMPT_DRAFT, {
      input: keyword,
      lengthInstruction: resolveLengthInstruction(
        lengthOption,
        recordData.record,
      ),
      formatInstruction: resolveFormatInstruction(recordData.record),
    });

    showSpinner();

    try {
      const rawText = await callGeminiAPI(prompt, true);
      const data = client.tryParseJsonPayload(rawText);

      const currentRecord = appManager.record.get();
      readFieldValue(currentRecord.record, F_BODY);
      const bodyText = data.body || '';
      currentRecord.record[F_BODY].value =
        currentRecord.record[F_BODY].type === 'RICH_TEXT'
          ? client.plainTextToRichText(bodyText)
          : bodyText;
      if (F_SUBJECT && currentRecord.record[F_SUBJECT]) {
        currentRecord.record[F_SUBJECT].value = data.subject;
      }
      appManager.record.set(currentRecord);
    } catch (error) {
      console.error(error);
      if (
        (error.classified && error.classified.code === 'NOT_FOUND') ||
        /404/.test(error.message)
      ) {
        alert(
          '生成に失敗しました。選択中のモデル（' +
            GEMINI_MODEL +
            '）が利用できません。プラグイン設定画面でモデルを選び直してください。\n' +
            error.message,
        );
      } else {
        alert(
          '生成に失敗しました。\nAPIキーが設定されているか確認してください。\n' +
            error.message,
        );
      }
    } finally {
      hideSpinner();
    }
  }

  async function generateSummary(record, isMobile) {
    const opinion = readFieldValue(record, F_BODY);
    const recordId = record.$id.value;
    const appId = (isMobile ? kintone.mobile.app : kintone.app).getId();

    if (client.isFieldValueEmpty(opinion, 'MULTI_LINE_TEXT')) {
      alert('「意見内容」が空のため要約できません。');
      return;
    }

    const prompt = renderTemplate(PROMPT_SUMMARY, { body: opinion });

    showSpinner();

    try {
      const resultText = await callGeminiAPI(prompt, false);
      const body = { app: appId, id: recordId, record: {} };
      body.record[F_SUMMARY] = {
        value:
          record[F_SUMMARY] && record[F_SUMMARY].type === 'RICH_TEXT'
            ? client.plainTextToRichText(resultText)
            : resultText,
      };
      await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
      alert('要約が完了しました。ページを更新します。');
      location.reload();
    } catch (error) {
      console.error(error);
      if (
        (error.classified && error.classified.code === 'NOT_FOUND') ||
        /404/.test(error.message)
      ) {
        alert(
          '要約に失敗しました。選択中のモデル（' +
            GEMINI_MODEL +
            '）が利用できません。プラグイン設定画面でモデルを選び直してください。\n' +
            error.message,
        );
      } else {
        alert(
          '要約に失敗しました。\nAPIキーが設定されているか確認してください。\n' +
            error.message,
        );
      }
    } finally {
      hideSpinner();
    }
  }

  function callGeminiAPI(prompt, requireJson = true) {
    // kintoneプロキシ経由でのリクエストURL
    const url =
      client.PROXY_POST_PREFIX +
      client.stripModelPrefix(GEMINI_MODEL) +
      ':generateContent';
    const data = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    if (requireJson) {
      data.generationConfig = { responseMimeType: 'application/json' };
    }

    // headerのx-goog-api-keyはプロキシ設定側で自動的に付与されます
    return client
      .proxyRequest(
        PLUGIN_ID,
        url,
        'POST',
        { 'Content-Type': 'application/json' },
        data,
      )
      .then(({ status, body }) => {
        if (status >= 200 && status < 300) {
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            throw new Error('レスポンスの解析に失敗しました。');
          }
          const text = client.extractText(json);
          if (!text) {
            throw new Error('AIからの応答が空でした。');
          }
          return text;
        }
        const c = client.classifyError(status, client.safeParseJson(body));
        const err = new Error('API Error ' + status + ': ' + c.message);
        err.classified = c;
        throw err;
      });
  }

  // =========================================================
  // 5. ローディング表示関数
  // =========================================================
  function showSpinner() {
    if (document.getElementById('kintone-spinner-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'kintone-spinner-overlay';
    const container = document.createElement('div');
    container.className = 'spinner-container';
    const ring = document.createElement('div');
    ring.className = 'spinner-ring';
    const star = document.createElement('div');
    star.className = 'spinner-star';
    star.innerHTML = '✦';

    for (let i = 0; i < 6; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle';
      sparkle.style.setProperty('--tx', Math.random() * 80 - 40 + 'px');
      sparkle.style.setProperty('--ty', Math.random() * 80 - 40 + 'px');
      sparkle.style.width = Math.random() * 4 + 2 + 'px';
      sparkle.style.height = sparkle.style.width;
      sparkle.style.animationDelay = Math.random() * 1.5 + 's';
      container.appendChild(sparkle);
    }

    container.appendChild(ring);
    container.appendChild(star);
    const text = document.createElement('div');
    text.className = 'spinner-text';
    text.innerText = 'Geminiが思考中です...';
    overlay.appendChild(container);
    overlay.appendChild(text);
    document.body.appendChild(overlay);
  }

  function hideSpinner() {
    const overlay = document.getElementById('kintone-spinner-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.5s';
      setTimeout(() => overlay.remove(), 500);
    }
  }
})(kintone.$PLUGIN_ID);
