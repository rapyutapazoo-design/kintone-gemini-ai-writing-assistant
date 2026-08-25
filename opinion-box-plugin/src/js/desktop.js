(function (PLUGIN_ID) {
  'use strict';

  // 設定読み込み
  const config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const client = window.GeminiPluginClient;
  const genOpts = window.GeminiGenerationOptions;
  const backup = window.GeminiPromptBackup;

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

  // =========================================================
  // プロンプトの自動退避・復元設定
  // 既定は 'no'（未設定の既存アプリの挙動を一切変えないため最重要）。
  // =========================================================
  const CLEAR_INPUT_AFTER_DRAFT =
    (config.clear_input_after_draft || 'no') === 'yes';
  const F_INPUT_BACKUP = config.field_input_backup || '';
  const BACKUP_MAX_CHARS = (function () {
    const raw = config.backup_max_chars;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return 100000;
    }
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) {
      return 100000;
    }
    return n;
  })();
  const SPACE_RESTORE = config.space_restore || '';
  const LABEL_RESTORE = config.btn_label_restore || 'プロンプトを復元';

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
    // kintone の SPA 遷移では前画面の cleanup() が呼ばれないことがあるため、
    // 復元モーダルのオーバーレイが残っていればここで除去する（軽微5）。
    removeOrphanedRestoreModal();

    const isMobile = event.type.startsWith('mobile.');
    const appManager = isMobile ? kintone.mobile.app : kintone.app;
    const space = appManager.record.getSpaceElement(SPACE_DRAFT);

    if (space) {
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
    }

    renderRestoreButton(event.record, isMobile, appManager);
  });

  kintone.events.on(EVENTS_DETAIL, function (event) {
    // kintone の SPA 遷移では前画面の cleanup() が呼ばれないことがあるため、
    // 復元モーダルのオーバーレイが残っていればここで除去する（軽微5）。
    removeOrphanedRestoreModal();

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

  // 実際に適用されたフォーマット指示文から、退避ログのメタ情報に使う
  // フォーマット名（generation-options の label）を逆引きする。
  // 一致するものがなければ「カスタム」とみなす。
  function resolveFormatLabel(formatInstruction) {
    const matched = genOpts.FORMAT_OPTIONS.filter(function (f) {
      return f.id !== 'custom' && f.instruction === formatInstruction;
    })[0];
    if (matched) {
      return matched.label;
    }
    const custom = genOpts.getFormatOption('custom');
    return custom ? custom.label : 'カスタム';
  }

  // 退避先フィールドへ新しい世代を追記し、上限を適用して書き戻す。
  // inputField・backupField は同一の record.set() で書き込まれる
  // currentRecord.record の一部（呼び出し元で存在確認済み）。
  function appendToBackupField(
    inputField,
    backupField,
    keyword,
    lengthOption,
    sourceRecord,
  ) {
    const lengthLabelForBackup = lengthOption || '指定なし';
    const formatLabelForBackup = resolveFormatLabel(
      resolveFormatInstruction(sourceRecord),
    );
    // 退避先が RICH_TEXT の場合、既存ログの読み出しも書き戻しも型に応じて
    // 変換する（軽微3: 読み書きの非対称を解消。既存ログを生HTMLのまま
    // appendEntry に渡すと区切り行がタグに包まれて検出できなくなるため）。
    const existingBackupText =
      backupField.type === 'RICH_TEXT'
        ? client.richTextToPlainText(backupField.value)
        : String(backupField.value || '');
    const appended = backup.appendEntry(existingBackupText, keyword, {
      lengthLabel: lengthLabelForBackup,
      formatLabel: formatLabelForBackup,
    });
    const trimmed = backup.trimToMaxChars(appended, BACKUP_MAX_CHARS);
    backupField.value =
      backupField.type === 'RICH_TEXT'
        ? client.plainTextToRichText(trimmed)
        : trimmed;
    // RICH_TEXT も空文字でクリアする（モバイル実機でのHTML解釈は未検証）
    inputField.value = '';
  }

  // 入力欄クリア＆退避への追記は、本文・件名の書き込みと同じ record.set()
  // 呼び出しにまとめて含めることで、失敗・タイムアウト・上書き確認キャンセル
  // の経路からは絶対に到達しない構造にする（呼び出し元で currentRecord に
  // 対して呼び、その後まとめて appManager.record.set(currentRecord) する）。
  function applyClearAndBackupIfNeeded(
    currentRecord,
    recordData,
    keyword,
    lengthOption,
  ) {
    if (!CLEAR_INPUT_AFTER_DRAFT) {
      return;
    }
    const inputField = currentRecord.record[F_INPUT];
    if (!inputField) {
      return;
    }
    if (!F_INPUT_BACKUP) {
      // 退避先未設定 → 単純クリア（復元不可）
      // RICH_TEXT も空文字でクリアする（モバイル実機でのHTML解釈は未検証）
      inputField.value = '';
      return;
    }
    const backupField = currentRecord.record[F_INPUT_BACKUP];
    if (!backupField) {
      // 退避先フィールドがこのレコード（アプリ）に存在しない場合は
      // 復元不能になることを避けるため、退避もクリアも行わない。
      console.warn(
        'プロンプト退避先フィールド「' +
          F_INPUT_BACKUP +
          '」がこのアプリに存在しないため、退避と入力欄のクリアをスキップしました。',
      );
      return;
    }
    appendToBackupField(
      inputField,
      backupField,
      keyword,
      lengthOption,
      recordData.record,
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

      // 退避処理の失敗（想定外の例外）で、API課金済みの生成結果（本文・件名）
      // ごと破棄されないよう、退避だけを個別の try/catch で分離する（重要5）。
      // 失敗時は退避とクリアのみスキップし、record.set() は必ず実行する。
      try {
        applyClearAndBackupIfNeeded(
          currentRecord,
          recordData,
          keyword,
          lengthOption,
        );
      } catch (backupError) {
        console.error(backupError);
      }

      appManager.record.set(currentRecord);
      // クリア直後もその場で復元できるよう、更新後のレコードで
      // 復元ボタンを再描画する（重要2）。
      renderRestoreButton(currentRecord.record, isMobile, appManager);
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
  // 5. プロンプト復元機能
  // =========================================================

  // 現在開いている復元モーダルの cleanup 関数。kintone の SPA 遷移では
  // モーダルを開いたまま画面が切り替わっても cleanup() が呼ばれないことが
  // あるため、次の画面表示時に removeOrphanedRestoreModal() 経由で
  // 必ず同じ cleanup() を呼び出し、オーバーレイと Esc キーリスナーの
  // 両方を確実に片付ける（軽微5）。
  let activeRestoreModalCleanup = null;

  // 前画面で開かれたまま残っている復元モーダルを除去する。
  // 各 kintone.events.on ハンドラの冒頭から呼び出す。
  function removeOrphanedRestoreModal() {
    if (activeRestoreModalCleanup) {
      const cleanupFn = activeRestoreModalCleanup;
      activeRestoreModalCleanup = null;
      cleanupFn();
      return;
    }
    // cleanup 参照が失われていても、DOM 上にオーバーレイが残っていれば
    // 念のため除去しておく（Escリスナーは cleanup 経由でのみ確実に外せるが、
    // 参照が無い状態は通常発生しない防御的フォールバック）。
    document
      .querySelectorAll('.obp-restore-modal-overlay')
      .forEach(function (el) {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
  }

  // 復元ボタンを描画してよいかを判定する。
  // いずれか該当すれば描画しない:
  //   ・復元ボタン設置スペースが未設定
  //   ・退避先フィールドが未設定
  //   ・退避先フィールドがこのレコード（アプリ）に存在しない
  //     （＝アクセス権で読めない、またはフィールド削除済み）
  //   ・退避先の値が空
  function shouldShowRestoreButton(record) {
    if (!SPACE_RESTORE || !F_INPUT_BACKUP) {
      return false;
    }
    const field = record[F_INPUT_BACKUP];
    if (!field || field.value == null) {
      return false;
    }
    const text =
      field.type === 'RICH_TEXT'
        ? client.richTextToPlainText(field.value)
        : String(field.value);
    return text.trim().length > 0;
  }

  function renderRestoreButton(record, isMobile, appManager) {
    // 復元ボタン設置スペースが下書き/要約ボタンの設置スペースと重複していると
    // space.innerHTML='' で先に描画したボタンを破棄してしまうため、
    // スペース要素へは一切触れずに描画をスキップする（重要1）。
    if (
      SPACE_RESTORE &&
      (SPACE_RESTORE === SPACE_DRAFT || SPACE_RESTORE === SPACE_SUMMARY)
    ) {
      console.warn(
        'プロンプト復元ボタン設置スペース「' +
          SPACE_RESTORE +
          '」が他のボタンの設置スペースと重複しているため、復元ボタンは表示されません。プラグイン設定でスペースIDを重複しないよう変更してください。',
      );
      return;
    }

    const space = appManager.record.getSpaceElement(SPACE_RESTORE);
    if (!space) {
      return;
    }
    // スペース要素を取得できた場合は、描画可否の判定結果に関わらず
    // 先にクリアしておく。こうしないと退避内容が空になった際に
    // 古い復元ボタンが残り続けてしまう（軽微6）。
    space.innerHTML = '';

    if (!shouldShowRestoreButton(record)) {
      return;
    }

    const btn = document.createElement('button');
    btn.textContent = LABEL_RESTORE;
    btn.style = BTN_STYLE;
    if (isMobile) {
      btn.style.width = '100%';
      btn.style.marginBottom = '10px';
    }

    btn.onclick = function (e) {
      e.preventDefault();
      handleRestoreClick(appManager);
    };
    space.appendChild(btn);
  }

  function handleRestoreClick(appManager) {
    const recordData = appManager.record.get();
    const backupField = recordData.record[F_INPUT_BACKUP];
    if (!backupField) {
      alert('退避先フィールドが見つかりません。');
      return;
    }
    const backupText =
      backupField.type === 'RICH_TEXT'
        ? client.richTextToPlainText(backupField.value)
        : String(backupField.value || '');
    const entries = backup.parseBackupLog(backupText);
    if (entries.length === 0) {
      alert('復元できる履歴がありません。');
      return;
    }
    // 区切りが1つも見つからず fallback で1件として返された場合は、
    // ログが壊れている可能性があるため確認なしで即復元せず、
    // モーダルでプレビューさせてから復元させる（軽微2）。
    if (entries.length === 1 && !entries[0].isFallback) {
      performRestore(entries[0], appManager);
      return;
    }
    showRestoreModal(entries, function (chosenEntry) {
      performRestore(chosenEntry, appManager);
    });
  }

  // 復元は入力欄への書き戻しのみを行う。退避フィールドは一切変更しない。
  function performRestore(entry, appManager) {
    const recordData = appManager.record.get();
    const inputField = recordData.record[F_INPUT];
    if (!inputField) {
      alert('「AIへの指示・メモ」フィールドが見つかりません。');
      return;
    }
    const hasValue = !client.isFieldValueEmpty(
      inputField.value,
      inputField.type,
    );
    if (hasValue) {
      const proceed = confirm(
        '入力欄に既に内容があります。復元内容で上書きしますか？',
      );
      if (!proceed) {
        return;
      }
    }
    inputField.value =
      inputField.type === 'RICH_TEXT'
        ? client.plainTextToRichText(entry.body)
        : entry.body;
    appManager.record.set(recordData);
  }

  // 動的生成する簡易モーダル（外部ライブラリ不使用）。
  // 閉じる手段はキャンセルボタン・背景クリック・Escキーの3経路すべてに対応し、
  // Escキーのリスナーはモーダルを閉じる際に必ず解除する。
  function showRestoreModal(entries, onSelect) {
    const overlay = document.createElement('div');
    overlay.className = 'obp-restore-modal-overlay';

    const card = document.createElement('div');
    card.className = 'obp-restore-modal-card';

    const title = document.createElement('div');
    title.className = 'obp-restore-modal-title';
    title.textContent = '復元する世代を選択してください';
    card.appendChild(title);

    const list = document.createElement('div');
    list.className = 'obp-restore-modal-list';

    entries.forEach(function (entry) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'obp-restore-modal-item';

      const meta = document.createElement('div');
      meta.className = 'obp-restore-modal-item-meta';
      meta.textContent =
        '[' +
        entry.index +
        '] ' +
        entry.datetime +
        (entry.meta ? ' / ' + entry.meta : '');

      const preview = document.createElement('div');
      preview.className = 'obp-restore-modal-item-preview';
      preview.textContent = entry.body.slice(0, 50);

      item.appendChild(meta);
      item.appendChild(preview);
      item.addEventListener('click', function () {
        cleanup();
        onSelect(entry);
      });
      list.appendChild(item);
    });

    card.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'obp-restore-modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'obp-restore-modal-cancel';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', function () {
      cleanup();
    });
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    overlay.appendChild(card);

    function onKeydown(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        cleanup();
      }
    }

    function onOverlayClick(e) {
      if (e.target === overlay) {
        cleanup();
      }
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeydown);
      overlay.removeEventListener('click', onOverlayClick);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (activeRestoreModalCleanup === cleanup) {
        activeRestoreModalCleanup = null;
      }
    }

    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);

    document.body.appendChild(overlay);
    activeRestoreModalCleanup = cleanup;
  }

  // =========================================================
  // 6. ローディング表示関数
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
