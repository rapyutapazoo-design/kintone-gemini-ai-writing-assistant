(function (PLUGIN_ID) {
  'use strict';

  const client = window.GeminiPluginClient;

  const DEFAULT_PROMPT_DRAFT = `あなたはマンション管理組合への意見書作成システムです。
以下の【メモ】を元に、「件名」と「本文」を作成し、必ず**JSON形式**のみで出力してください。
【出力フォーマット】
{ "subject": "件名(20文字以内)", "body": "本文" }
【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 挨拶文、署名は一切禁止。
3. 「です・ます」調。
4. Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）は使用しないこと。HTMLタグ（<b> <br> <div> <span>など）も出力しないこと。構造の表現には■（見出し）と・（箇条書き）のみを使用し、改行はそのまま改行文字で表現すること。
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

  const CONTACT_PROMPT_DRAFT = `あなたは、マンション管理組合の「デジタル委員会」が運営するお問い合わせ窓口の下書き作成アシスタントです。
以下の「利用者からの指示・メモ」をもとに、デジタル委員会宛てのお問い合わせ内容として、丁寧語（です・ます調）で件名と本文の下書きを作成してください。
Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）は使用しないこと。HTMLタグ（<b> <br> <div> <span>など）も出力しないこと。構造の表現には■（見出し）と・（箇条書き）のみを使用し、改行はそのまま改行文字で表現すること。

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【利用者からの指示・メモ】
{{input}}`;

  const CONTACT_PROMPT_SUMMARY = `あなたはマンション管理組合の理事会資料作成担当です。
以下のお問い合わせ内容を、理事会資料として適切な長さに要約してください。

【要約のルール】
1. 具体的な行数制限は設けません。元の文章量や内容の複雑さに応じて、効率的に内容を把握できる適切な長さに調整してください。
2. 短い内容は一言で簡潔に、複雑な背景がある内容は重要な詳細（日付、場所、経緯など）を漏らさないように要約してください。
3. 冗長な表現は避け、事実関係を明確にしてください。
4. 見出し（■など）と箇条書き（・）を用いて、人間が一目で読みやすいレイアウトで出力してください。
5. Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）は使用せず、HTMLタグ（<b> <br> <div> <span>など）も出力しないこと。改行はそのまま改行文字で表現すること。

【本文】
{{body}}`;

  const DEFAULTS = {
    gemini_model: 'gemini-2.5-flash',
    field_input: 'keyword_input',
    field_length: 'length_option',
    field_subject: 'opinion_subject',
    field_body: 'opinion_body',
    field_summary: 'ai_summary',
    space_draft: 'btn_space_draft',
    space_summary: 'btn_space_summary',
    summary_enabled: 'yes',
    btn_label_draft: 'Geminiで件名・本文を作成',
    btn_label_summary: 'Geminiで要約',
    prompt_draft: DEFAULT_PROMPT_DRAFT,
    prompt_summary: DEFAULT_PROMPT_SUMMARY,
  };

  const STRUCTURE_PRESET_COMMON = {
    field_input: 'keyword_input',
    field_length: 'length_option',
    field_subject: 'opinion_subject',
    field_body: 'opinion_body',
    field_summary: 'ai_summary',
    space_draft: 'btn_space_draft',
    space_summary: 'btn_space_summary',
    summary_enabled: 'yes',
  };

  const WORDING_PRESET_OPINION = {
    btn_label_draft: 'Geminiで件名・本文を作成',
    btn_label_summary: 'Geminiで要約',
    prompt_draft: DEFAULT_PROMPT_DRAFT,
    prompt_summary: DEFAULT_PROMPT_SUMMARY,
  };

  const WORDING_PRESET_CONTACT = {
    btn_label_draft: 'Geminiで下書きを作成',
    btn_label_summary: 'Geminiで要約',
    prompt_draft: CONTACT_PROMPT_DRAFT,
    prompt_summary: CONTACT_PROMPT_SUMMARY,
  };

  const config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};

  let validationSeq = 0;
  let lastValidation = null;

  function showMessage(type, text) {
    const el = document.getElementById('obp-message');
    el.className = 'obp-banner obp-banner-' + type;
    el.textContent = text;
    el.style.display = '';
  }

  function hideMessage() {
    const el = document.getElementById('obp-message');
    el.style.display = 'none';
    el.textContent = '';
  }

  function setStatus(level, text) {
    const el = document.getElementById('obp-model-status');
    el.className = 'obp-status-' + level;
    el.textContent = text;
  }

  function toggleManualMode(on) {
    const select = document.getElementById('obp-model-select');
    const manual = document.getElementById('obp-model-manual');
    select.disabled = on;
    manual.disabled = !on;
    manual.style.display = on ? '' : 'none';
  }

  function getSelectedModelName() {
    const manualCheck = document.getElementById('obp-model-manual-check');
    const manual = document.getElementById('obp-model-manual');
    const select = document.getElementById('obp-model-select');
    const raw = manualCheck.checked ? manual.value : select.value;
    return client.stripModelPrefix(raw || '');
  }

  function fillFieldSelect(selectEl, fields, savedValue, allowEmpty) {
    selectEl.innerHTML = '';
    const codes = [];

    if (allowEmpty) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '（使用しない）';
      selectEl.appendChild(emptyOption);
      codes.push('');
    }

    fields.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.code;
      option.textContent = f.label ? f.code + '（' + f.label + '）' : f.code;
      selectEl.appendChild(option);
      codes.push(f.code);
    });

    const value = savedValue || '';
    if (codes.indexOf(value) === -1) {
      const missingOption = document.createElement('option');
      missingOption.value = value;
      missingOption.textContent =
        value + '（現在の設定値・このアプリに存在しません）';
      selectEl.appendChild(missingOption);
    }
    selectEl.value = value;
  }

  function getSpaceValue(selectEl, textEl) {
    return selectEl.style.display === 'none' ? textEl.value : selectEl.value;
  }

  function setSpaceValue(selectEl, textEl, value) {
    if (selectEl.style.display === 'none') {
      textEl.value = value;
    } else {
      selectEl.value = value;
    }
  }

  function collectFromFields(fields, ids) {
    (fields || []).forEach((f) => {
      if (f.type === 'SPACER' && f.elementId) {
        ids.push(f.elementId);
      } else if (f.type === 'SUBTABLE' && Array.isArray(f.fields)) {
        collectFromFields(f.fields, ids);
      }
    });
  }

  function collectSpacerIds(layoutItems, ids) {
    (layoutItems || []).forEach((item) => {
      if (item.type === 'ROW' && Array.isArray(item.fields)) {
        collectFromFields(item.fields, ids);
      } else if (item.type === 'GROUP' && Array.isArray(item.layout)) {
        collectSpacerIds(item.layout, ids);
      } else if (item.type === 'SUBTABLE' && Array.isArray(item.fields)) {
        collectFromFields(item.fields, ids);
      }
    });
  }

  async function loadFields() {
    const typeMap = {
      'obp-field-input': ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'],
      'obp-field-body': ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'],
      'obp-field-summary': ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT'],
      'obp-field-subject': ['SINGLE_LINE_TEXT'],
      'obp-field-length': ['DROP_DOWN', 'RADIO_BUTTON', 'SINGLE_LINE_TEXT'],
    };
    const allowEmptyMap = {
      'obp-field-input': false,
      'obp-field-body': false,
      'obp-field-summary': true,
      'obp-field-subject': true,
      'obp-field-length': true,
    };
    const savedMap = {
      'obp-field-input':
        config.field_input !== undefined
          ? config.field_input
          : DEFAULTS.field_input,
      'obp-field-body':
        config.field_body !== undefined
          ? config.field_body
          : DEFAULTS.field_body,
      'obp-field-summary':
        config.field_summary !== undefined
          ? config.field_summary
          : DEFAULTS.field_summary,
      'obp-field-subject':
        config.field_subject !== undefined
          ? config.field_subject
          : DEFAULTS.field_subject,
      'obp-field-length':
        config.field_length !== undefined
          ? config.field_length
          : DEFAULTS.field_length,
    };

    try {
      const res = await kintone.api(
        kintone.api.url('/k/v1/preview/app/form/fields', true),
        'GET',
        { app: kintone.app.getId() },
      );
      const allFields = Object.keys(res.properties).map(
        (code) => res.properties[code],
      );

      Object.keys(typeMap).forEach((id) => {
        const el = document.getElementById(id);
        const allowed = typeMap[id];
        const matched = allFields
          .filter((f) => allowed.indexOf(f.type) !== -1)
          .map((f) => ({ code: f.code, label: f.label }))
          .sort((a, b) => a.code.localeCompare(b.code));
        fillFieldSelect(el, matched, savedMap[id], allowEmptyMap[id]);
      });
    } catch (e) {
      console.error(e);
      showMessage(
        'warn',
        'フィールド一覧の取得に失敗しました。保存済みの設定値のみを表示しています。',
      );
      Object.keys(typeMap).forEach((id) => {
        const el = document.getElementById(id);
        fillFieldSelect(el, [], savedMap[id], allowEmptyMap[id]);
      });
    }
  }

  async function loadSpaces() {
    const savedDraft =
      config.space_draft !== undefined
        ? config.space_draft
        : DEFAULTS.space_draft;
    const savedSummary =
      config.space_summary !== undefined
        ? config.space_summary
        : DEFAULTS.space_summary;

    const draftSelect = document.getElementById('obp-space-draft');
    const draftText = document.getElementById('obp-space-draft-text');
    const summarySelect = document.getElementById('obp-space-summary');
    const summaryText = document.getElementById('obp-space-summary-text');

    try {
      const res = await kintone.api(
        kintone.api.url('/k/v1/preview/app/form/layout', true),
        'GET',
        { app: kintone.app.getId() },
      );
      const ids = [];
      collectSpacerIds(res.layout, ids);
      const spaceFields = ids.map((id) => ({ code: id, label: '' }));

      fillFieldSelect(draftSelect, spaceFields, savedDraft, false);
      fillFieldSelect(summarySelect, spaceFields, savedSummary, true);
    } catch (e) {
      console.error(e);
      draftSelect.style.display = 'none';
      draftText.style.display = '';
      draftText.value = savedDraft;

      summarySelect.style.display = 'none';
      summaryText.style.display = '';
      summaryText.value = savedSummary;
    }
  }

  function buildModelOptions(models) {
    const select = document.getElementById('obp-model-select');
    select.innerHTML = '';
    (models || []).forEach((m) => {
      const isString = typeof m === 'string';
      const rawName = isString ? m : m.name;
      const bareName = client.stripModelPrefix(rawName);
      const displayName = isString
        ? m
        : m.displayName || client.stripModelPrefix(m.name);
      const option = document.createElement('option');
      option.value = bareName;
      option.textContent = displayName + '（' + bareName + '）';
      select.appendChild(option);
    });
  }

  function applySelection(preferredBareName) {
    const select = document.getElementById('obp-model-select');
    const manualCheck = document.getElementById('obp-model-manual-check');
    const manual = document.getElementById('obp-model-manual');

    const options = Array.prototype.map.call(select.options, (o) => o.value);
    const preferred = preferredBareName || '';

    if (preferred && options.indexOf(preferred) !== -1) {
      manualCheck.checked = false;
      toggleManualMode(false);
      select.value = preferred;
      return;
    }

    if (!preferred) {
      if (options.indexOf(client.DEFAULT_MODEL) !== -1) {
        manualCheck.checked = false;
        toggleManualMode(false);
        select.value = client.DEFAULT_MODEL;
        return;
      }
      if (options.length > 0) {
        manualCheck.checked = false;
        toggleManualMode(false);
        select.value = options[0];
        return;
      }
    }

    manualCheck.checked = true;
    toggleManualMode(true);
    manual.value = preferred;
  }

  async function refreshModelList() {
    const apiKeyEl = document.getElementById('obp-api-key');
    const apiKey = apiKeyEl.value;
    const refreshBtn = document.getElementById('obp-model-refresh');

    if (!apiKey) {
      setStatus('loading', 'APIキーを入力してください');
      return null;
    }

    hideMessage();
    refreshBtn.disabled = true;
    setStatus('loading', 'モデル一覧を取得中…');

    const preferred =
      getSelectedModelName() || config.gemini_model || DEFAULTS.gemini_model;

    try {
      const models = await client.listGenerateContentModels(apiKey);
      buildModelOptions(models);
      applySelection(preferred);
    } catch (e) {
      const msg = (e.classified && e.classified.message) || e.message;
      buildModelOptions(client.FALLBACK_MODELS);
      applySelection(preferred);
      showMessage(
        'warn',
        'モデル一覧の取得に失敗しました（' +
          msg +
          '）。既知のモデルのみを表示しています。必要に応じて「一覧にないモデル名を手入力する」をご利用ください。',
      );
    }

    refreshBtn.disabled = false;
    return validateSelectedModel();
  }

  async function validateSelectedModel() {
    const apiKeyEl = document.getElementById('obp-api-key');
    const apiKey = apiKeyEl.value;
    const modelName = getSelectedModelName();

    if (!apiKey || !modelName) {
      lastValidation = null;
      setStatus('loading', '未確認');
      return null;
    }

    const seq = ++validationSeq;
    setStatus('loading', '確認中…');

    let result = await client.testModelDirect(apiKey, modelName);

    if (seq !== validationSeq) {
      return null;
    }

    const applyStatus = (r) => {
      if (r.level === 'ok') {
        setStatus('ok', '✓ 利用可能');
      } else if (r.level === 'ng') {
        setStatus('ng', '✗ 利用不可: ' + r.message);
      } else {
        setStatus('warn', '△ 確認できませんでした: ' + r.message);
      }
    };

    applyStatus(result);

    if (result.level === 'warn' && result.status === -1) {
      const proceed = confirm(
        'ブラウザからGeminiへ直接通信できませんでした。APIキーをkintoneに先に保存してから、kintone経由で確認しますか？（APIキーが保存されます）',
      );
      if (proceed) {
        try {
          await saveProxyConfig(apiKey);
          result = await client.testModelViaProxy(PLUGIN_ID, modelName);
        } catch {
          result = client.classifyError(-1, null);
        }
        if (seq !== validationSeq) {
          return null;
        }
        applyStatus(result);
      }
    }

    lastValidation = {
      model: modelName,
      level: result.level,
      message: result.message,
    };
    return lastValidation;
  }

  function saveProxyConfig(apiKey) {
    return new Promise((resolve, reject) => {
      kintone.plugin.app.setProxyConfig(
        client.PROXY_POST_PREFIX,
        'POST',
        { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        {},
        () => {
          kintone.plugin.app.setProxyConfig(
            client.PROXY_GET_PREFIX,
            'GET',
            { 'x-goog-api-key': apiKey },
            {},
            () => resolve(),
            (err) => reject(err),
          );
        },
        (err) => reject(err),
      );
    });
  }

  async function doSave() {
    const apiKey = document.getElementById('obp-api-key').value;
    const modelName = getSelectedModelName();

    showMessage(
      'info',
      '保存処理を実行しています…（kintoneプロキシ経由の確認を含むため、最大20秒程度かかる場合があります）',
    );

    try {
      await saveProxyConfig(apiKey);
    } catch (e) {
      showMessage('error', 'プロキシ設定の保存に失敗しました。詳細: ' + e);
      return;
    }

    let result = await client.testModelViaProxy(PLUGIN_ID, modelName);
    if (result.level !== 'ok') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await client.testModelViaProxy(PLUGIN_ID, modelName);
      if (result.level !== 'ok') {
        showMessage(
          'warn',
          'kintoneプロキシ経由での疎通確認に失敗しました（' +
            result.message +
            '）。設定は保存しますが、実行画面で動作しない可能性があります。',
        );
      }
    }

    const newConfig = {
      gemini_model: client.stripModelPrefix(modelName),
      field_input: document.getElementById('obp-field-input').value,
      field_length: document.getElementById('obp-field-length').value,
      field_subject: document.getElementById('obp-field-subject').value,
      field_body: document.getElementById('obp-field-body').value,
      field_summary: document.getElementById('obp-field-summary').value,
      space_draft: getSpaceValue(
        document.getElementById('obp-space-draft'),
        document.getElementById('obp-space-draft-text'),
      ),
      space_summary: getSpaceValue(
        document.getElementById('obp-space-summary'),
        document.getElementById('obp-space-summary-text'),
      ),
      summary_enabled: document.getElementById('obp-summary-enabled').checked
        ? 'yes'
        : 'no',
      btn_label_draft: document.getElementById('obp-btn-label-draft').value,
      btn_label_summary: document.getElementById('obp-btn-label-summary').value,
      prompt_draft: document.getElementById('obp-prompt-draft').value,
      prompt_summary: document.getElementById('obp-prompt-summary').value,
    };

    kintone.plugin.app.setConfig(newConfig, () => {
      alert('設定を保存しました。アプリを更新してください！');
      backToFlowScreen();
    });
  }

  async function onSaveClick() {
    const apiKey = document.getElementById('obp-api-key').value;
    const modelName = getSelectedModelName();
    const fieldInput = document.getElementById('obp-field-input').value;
    const fieldBody = document.getElementById('obp-field-body').value;
    const spaceDraft = getSpaceValue(
      document.getElementById('obp-space-draft'),
      document.getElementById('obp-space-draft-text'),
    );

    if (!apiKey || !modelName || !fieldInput || !fieldBody || !spaceDraft) {
      alert(
        '必須項目が未入力です。APIキー・モデル・「AIへの指示・メモ」フィールド・本文フィールド・下書きボタン設置スペースをすべて指定してください。',
      );
      return;
    }

    const summaryEnabled = document.getElementById(
      'obp-summary-enabled',
    ).checked;
    if (summaryEnabled) {
      const fieldSummary = document.getElementById('obp-field-summary').value;
      const spaceSummary = getSpaceValue(
        document.getElementById('obp-space-summary'),
        document.getElementById('obp-space-summary-text'),
      );
      if (!fieldSummary || !spaceSummary) {
        alert(
          '要約機能がONのため、要約フィールドと要約ボタン設置スペースの指定が必要です。',
        );
        return;
      }
    }

    if (!lastValidation || lastValidation.model !== modelName) {
      await validateSelectedModel();
    }

    if (!lastValidation) {
      alert(
        'モデルの疎通確認ができませんでした。APIキーとモデル名を確認してください。',
      );
      return;
    }

    if (lastValidation.level === 'ng') {
      alert(
        '選択したモデルはこのAPIキーでは利用できません。別のモデルを選択してください。\n' +
          lastValidation.message,
      );
      return;
    }

    if (lastValidation.level === 'warn') {
      const proceed = confirm(
        'モデルの利用可否を確認できませんでした。このまま保存しますか？\n' +
          lastValidation.message,
      );
      if (!proceed) {
        return;
      }
    }

    const saveBtn = document.getElementById('obp-save');
    const originalLabel = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    try {
      await doSave();
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  }

  function applyStructurePreset(preset) {
    if (
      !confirm(
        '現在のフィールド・スペースの設定を上書きします。よろしいですか？',
      )
    ) {
      return;
    }

    document.getElementById('obp-field-input').value = preset.field_input;
    document.getElementById('obp-field-length').value = preset.field_length;
    document.getElementById('obp-field-subject').value = preset.field_subject;
    document.getElementById('obp-field-body').value = preset.field_body;
    document.getElementById('obp-field-summary').value = preset.field_summary;
    setSpaceValue(
      document.getElementById('obp-space-draft'),
      document.getElementById('obp-space-draft-text'),
      preset.space_draft,
    );
    setSpaceValue(
      document.getElementById('obp-space-summary'),
      document.getElementById('obp-space-summary-text'),
      preset.space_summary,
    );

    const summaryOn = preset.summary_enabled !== 'no';
    document.getElementById('obp-summary-enabled').checked = summaryOn;
    document.getElementById('obp-summary-section').style.display = summaryOn
      ? ''
      : 'none';
  }

  function applyWordingPreset(preset) {
    if (
      !confirm('現在のボタン文言・プロンプトを上書きします。よろしいですか？')
    ) {
      return;
    }

    document.getElementById('obp-btn-label-draft').value =
      preset.btn_label_draft;
    document.getElementById('obp-btn-label-summary').value =
      preset.btn_label_summary;
    document.getElementById('obp-prompt-draft').value = preset.prompt_draft;
    document.getElementById('obp-prompt-summary').value = preset.prompt_summary;
  }

  function backToFlowScreen() {
    window.location.href = '../../flow?app=' + kintone.app.getId();
  }

  function bindEvents() {
    const apiKeyToggle = document.getElementById('obp-api-key-toggle');
    const apiKeyEl = document.getElementById('obp-api-key');
    const modelRefresh = document.getElementById('obp-model-refresh');
    const modelSelect = document.getElementById('obp-model-select');
    const modelManual = document.getElementById('obp-model-manual');
    const modelManualCheck = document.getElementById('obp-model-manual-check');
    const summaryEnabledEl = document.getElementById('obp-summary-enabled');
    const summarySection = document.getElementById('obp-summary-section');
    const presetStructure = document.getElementById('obp-preset-structure');
    const presetWordingOpinion = document.getElementById(
      'obp-preset-wording-opinion',
    );
    const presetWordingContact = document.getElementById(
      'obp-preset-wording-contact',
    );
    const saveBtn = document.getElementById('obp-save');
    const cancelBtn = document.getElementById('obp-cancel');

    apiKeyToggle.addEventListener('click', () => {
      const isPassword = apiKeyEl.type === 'password';
      apiKeyEl.type = isPassword ? 'text' : 'password';
      apiKeyToggle.textContent = isPassword ? '隠す' : '表示';
    });

    apiKeyEl.addEventListener('change', () => {
      lastValidation = null;
      refreshModelList();
    });

    modelRefresh.addEventListener('click', () => {
      refreshModelList();
    });

    modelSelect.addEventListener('change', () => {
      validateSelectedModel();
    });

    modelManual.addEventListener('blur', () => {
      if (modelManualCheck.checked) {
        validateSelectedModel();
      }
    });

    modelManualCheck.addEventListener('change', () => {
      toggleManualMode(modelManualCheck.checked);
      validateSelectedModel();
    });

    summaryEnabledEl.addEventListener('change', () => {
      summarySection.style.display = summaryEnabledEl.checked ? '' : 'none';
    });

    presetStructure.addEventListener('click', () =>
      applyStructurePreset(STRUCTURE_PRESET_COMMON),
    );
    presetWordingOpinion.addEventListener('click', () =>
      applyWordingPreset(WORDING_PRESET_OPINION),
    );
    presetWordingContact.addEventListener('click', () =>
      applyWordingPreset(WORDING_PRESET_CONTACT),
    );

    saveBtn.addEventListener('click', () => {
      onSaveClick();
    });

    cancelBtn.addEventListener('click', () => {
      backToFlowScreen();
    });
  }

  function init() {
    document.getElementById('obp-btn-label-draft').value =
      config.btn_label_draft || DEFAULTS.btn_label_draft;
    document.getElementById('obp-btn-label-summary').value =
      config.btn_label_summary || DEFAULTS.btn_label_summary;
    document.getElementById('obp-prompt-draft').value =
      config.prompt_draft || DEFAULTS.prompt_draft;
    document.getElementById('obp-prompt-summary').value =
      config.prompt_summary || DEFAULTS.prompt_summary;

    const summaryOn =
      (config.summary_enabled || DEFAULTS.summary_enabled) !== 'no';
    document.getElementById('obp-summary-enabled').checked = summaryOn;
    document.getElementById('obp-summary-section').style.display = summaryOn
      ? ''
      : 'none';

    toggleManualMode(false);

    bindEvents();
    loadFields();
    loadSpaces();

    buildModelOptions(client.FALLBACK_MODELS);
    applySelection(config.gemini_model || DEFAULTS.gemini_model);
    setStatus('loading', 'APIキーを入力するとモデル一覧を取得します');

    showMessage(
      'info',
      '※ 保存済みのAPIキーは読み出せません。保存するたびにAPIキーの再入力が必要です。',
    );
  }

  init();
})(kintone.$PLUGIN_ID);
