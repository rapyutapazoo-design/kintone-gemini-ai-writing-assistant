(function (PLUGIN_ID) {
  'use strict';

  const client = window.GeminiPluginClient;
  const anthropic = window.AnthropicPluginClient;
  const genOpts = window.GeminiGenerationOptions;
  const presets = window.GeminiPromptPresets;

  const OPINION_PRESET = presets.getPreset('opinion');
  const DEFAULT_FORMAT_INSTRUCTION = genOpts.getFormatInstructionById(
    genOpts.DEFAULT_FORMAT_ID,
  );

  const DEFAULTS = {
    ai_provider_order: 'anthropic,gemini',
    anthropic_model: '',
    anthropic_thinking: 'suppress',
    pii_mask: 'yes',
    gemini_model: 'gemini-flash-lite-latest',
    field_input: 'keyword_input',
    field_length: 'length_option',
    field_subject: 'opinion_subject',
    field_body: 'opinion_body',
    field_summary: 'ai_summary',
    field_format: '',
    space_draft: 'btn_space_draft',
    space_summary: 'btn_space_summary',
    summary_enabled: 'yes',
    btn_label_draft: OPINION_PRESET.btn_label_draft,
    btn_label_summary: OPINION_PRESET.btn_label_summary,
    prompt_draft: OPINION_PRESET.prompt_draft,
    prompt_summary: OPINION_PRESET.prompt_summary,
    length_mode: 'field',
    length_map: '[]',
    length_default: '',
    format_mode: 'fixed',
    format_map: genOpts.stringifyMap([
      { option: '', instruction: DEFAULT_FORMAT_INSTRUCTION },
    ]),
    format_default: DEFAULT_FORMAT_INSTRUCTION,
    overwrite_confirm: 'yes',
    gemini_thinking: 'suppress',
    preset_id: '',
    clear_input_after_draft: 'no',
    field_input_backup: '',
    backup_max_chars: '100000',
    space_restore: '',
    btn_label_restore: 'プロンプトを復元',
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

  const config = kintone.plugin.app.getConfig(PLUGIN_ID) || {};

  let validationSeq = 0;
  const lastValidation = { anthropic: null, gemini: null };
  let validationSeqAnthropic = 0;
  let fieldMetaCache = {};
  let currentLengthRows = genOpts.parseMap(config.length_map, []);
  let appliedPresetId = config.preset_id || '';
  let savedApiKeyExists = false;
  let savedApiKeyMasked = '';
  // 保存済みAPIキーの実値。設定画面では kintone.plugin.app.proxy() が使えないため、
  // モデル一覧取得・疎通確認は直接通信でこの値を使う。
  // DOM（入力欄・メッセージ）へは絶対に書き出さないこと。
  let savedApiKeyValue = '';
  let savedAnthropicKeyExists = false;
  let savedAnthropicKeyMasked = '';
  // 保存済みの実値は直接通信にだけ使い、DOMへは書き出さない。
  let savedAnthropicKeyValue = '';
  let allFetchedAnthropicModels = [];
  // 直近に取得したモデル一覧（excluded/recommended フラグ付き）。
  // 「すべてのモデルを表示する」チェックボックスの切り替え時、API再取得なしで
  // 表示を切り替えるために保持する。
  let allFetchedModels = [];

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

  // =========================================================
  // フィールドメタ情報（選択肢を含む）のキャッシュ構築
  // =========================================================
  function buildFieldMetaCache(properties) {
    const meta = {};
    Object.keys(properties || {}).forEach((code) => {
      const f = properties[code];
      const options = [];
      if (f.options) {
        Object.keys(f.options).forEach((label) => {
          const idx = parseInt(f.options[label].index, 10);
          options.push({ label: label, index: isNaN(idx) ? 0 : idx });
        });
        options.sort((a, b) => a.index - b.index);
      }
      meta[code] = {
        type: f.type,
        options: options.map((o) => o.label),
        required: !!f.required,
      };
    });
    fieldMetaCache = meta;
  }

  async function loadFields() {
    const typeMap = {
      'obp-field-input': ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'],
      'obp-field-body': ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'],
      'obp-field-summary': ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'],
      'obp-field-subject': ['SINGLE_LINE_TEXT'],
      'obp-field-length': ['DROP_DOWN', 'RADIO_BUTTON', 'SINGLE_LINE_TEXT'],
      'obp-field-format': ['DROP_DOWN', 'RADIO_BUTTON', 'SINGLE_LINE_TEXT'],
      // 全世代を追記する退避ログのため、文字列（複数行）のみに限定する。
      // 1行では全世代が読めず、リッチエディターはHTMLタグ混入で
      // 区切り行（===== [n] ...）の構造が壊れるため対象外とする。
      'obp-field-input-backup': ['MULTI_LINE_TEXT'],
    };
    const allowEmptyMap = {
      'obp-field-input': false,
      'obp-field-body': false,
      'obp-field-summary': true,
      'obp-field-subject': true,
      'obp-field-length': true,
      'obp-field-format': true,
      'obp-field-input-backup': true,
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
      'obp-field-format':
        config.field_format !== undefined
          ? config.field_format
          : DEFAULTS.field_format,
      'obp-field-input-backup':
        config.field_input_backup !== undefined
          ? config.field_input_backup
          : DEFAULTS.field_input_backup,
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

      buildFieldMetaCache(res.properties);

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
      fieldMetaCache = {};
      Object.keys(typeMap).forEach((id) => {
        const el = document.getElementById(id);
        fillFieldSelect(el, [], savedMap[id], allowEmptyMap[id]);
      });
    }

    renderLengthMapTable();
    updateBackupCheck();
  }

  async function reloadFieldMeta() {
    try {
      const res = await kintone.api(
        kintone.api.url('/k/v1/preview/app/form/fields', true),
        'GET',
        { app: kintone.app.getId() },
      );
      buildFieldMetaCache(res.properties);
      renderLengthMapTable();
      updateBackupCheck();
      showMessage('info', 'フィールドの選択肢を再読込しました。');
    } catch (e) {
      console.error(e);
      showMessage('warn', 'フィールドの選択肢の再読込に失敗しました。');
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
    const savedRestore =
      config.space_restore !== undefined
        ? config.space_restore
        : DEFAULTS.space_restore;

    const draftSelect = document.getElementById('obp-space-draft');
    const draftText = document.getElementById('obp-space-draft-text');
    const summarySelect = document.getElementById('obp-space-summary');
    const summaryText = document.getElementById('obp-space-summary-text');
    const restoreSelect = document.getElementById('obp-space-restore');
    const restoreText = document.getElementById('obp-space-restore-text');

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
      fillFieldSelect(restoreSelect, spaceFields, savedRestore, true);
    } catch (e) {
      console.error(e);
      draftSelect.style.display = 'none';
      draftText.style.display = '';
      draftText.value = savedDraft;

      summarySelect.style.display = 'none';
      summaryText.style.display = '';
      summaryText.value = savedSummary;

      restoreSelect.style.display = 'none';
      restoreText.style.display = '';
      restoreText.value = savedRestore;
    }

    updateBackupCheck();
  }

  // =========================================================
  // 文字数マッピング表
  // =========================================================
  function getFieldMeta(fieldCode) {
    return fieldMetaCache[fieldCode] || null;
  }

  function isManualLengthMode(fieldCode) {
    const meta = getFieldMeta(fieldCode);
    if (!fieldCode || !meta) {
      return true;
    }
    return meta.type === 'SINGLE_LINE_TEXT';
  }

  function getFieldOptions(fieldCode) {
    const meta = getFieldMeta(fieldCode);
    return meta ? meta.options : [];
  }

  function updateLengthCheck() {
    const el = document.getElementById('obp-length-check');
    const fieldCode = document.getElementById('obp-field-length').value;
    const messages = [];

    if (currentLengthRows.length === 0) {
      messages.push(
        '文字数マッピングが未設定のため、互換モード（既存のハードコード動作: 200/400/600文字）で動作します。',
      );
    } else {
      const emptyOptions = currentLengthRows
        .filter((r) => r.option && !r.instruction)
        .map((r) => r.option);
      if (emptyOptions.length > 0) {
        messages.push(
          '指示文が空の選択肢があります: ' + emptyOptions.join('、'),
        );
      }

      if (fieldCode) {
        const fieldOptions = getFieldOptions(fieldCode);
        if (fieldOptions.length > 0) {
          const orphan = currentLengthRows
            .filter((r) => r.option && fieldOptions.indexOf(r.option) === -1)
            .map((r) => r.option);
          if (orphan.length > 0) {
            messages.push(
              'マッピングにあるが、フィールドに存在しない選択肢があります: ' +
                orphan.join('、'),
            );
          }
        }
      }
    }

    if (messages.length > 0) {
      el.style.display = '';
      el.textContent = messages.join(' / ');
    } else {
      el.style.display = 'none';
      el.textContent = '';
    }
  }

  function renderLengthMapTable() {
    const fieldCode = document.getElementById('obp-field-length').value;
    const manual = isManualLengthMode(fieldCode);
    const tbody = document.getElementById('obp-length-map-body');
    tbody.innerHTML = '';

    let rows;
    if (manual) {
      rows =
        currentLengthRows.length > 0
          ? currentLengthRows
          : [{ option: '', instruction: '' }];
    } else {
      const options = getFieldOptions(fieldCode);
      rows = options.map((opt) => {
        const existing = currentLengthRows.filter((r) => r.option === opt)[0];
        return {
          option: opt,
          instruction: existing ? existing.instruction : '',
        };
      });
    }
    currentLengthRows = rows;

    rows.forEach((row, idx) => {
      const tr = document.createElement('tr');

      const optTd = document.createElement('td');
      if (manual) {
        const optInput = document.createElement('input');
        optInput.type = 'text';
        optInput.value = row.option;
        optInput.className = 'obp-map-option-input';
        optInput.addEventListener('input', () => {
          currentLengthRows[idx].option = optInput.value;
          updateLengthCheck();
        });
        optTd.appendChild(optInput);
      } else {
        optTd.textContent = row.option;
        optTd.className = 'obp-map-option-readonly';
      }
      tr.appendChild(optTd);

      const instTd = document.createElement('td');
      const instInput = document.createElement('input');
      instInput.type = 'text';
      instInput.value = row.instruction;
      instInput.className = 'obp-map-instruction-input';
      instInput.addEventListener('input', () => {
        currentLengthRows[idx].instruction = instInput.value;
        updateLengthCheck();
      });
      instTd.appendChild(instInput);
      tr.appendChild(instTd);

      const delTd = document.createElement('td');
      if (manual) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '削除';
        delBtn.addEventListener('click', () => {
          currentLengthRows.splice(idx, 1);
          renderLengthMapTable();
        });
        delTd.appendChild(delBtn);
      }
      tr.appendChild(delTd);

      tbody.appendChild(tr);
    });

    if (manual) {
      const addTr = document.createElement('tr');
      const addTd = document.createElement('td');
      addTd.colSpan = 3;
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '行を追加';
      addBtn.addEventListener('click', () => {
        currentLengthRows.push({ option: '', instruction: '' });
        renderLengthMapTable();
      });
      addTd.appendChild(addBtn);
      addTr.appendChild(addTd);
      tbody.appendChild(addTr);
    }

    updateLengthCheck();
  }

  // =========================================================
  // プロンプト自動退避・復元の設定チェック（保存はブロックしない警告のみ）
  // =========================================================
  function getFieldRequired(fieldCode) {
    const meta = getFieldMeta(fieldCode);
    return !!(meta && meta.required);
  }

  function updateBackupCheck() {
    const el = document.getElementById('obp-backup-check');
    const clearOnEl = document.getElementById('obp-clear-input-after-draft');
    if (!el || !clearOnEl) {
      return;
    }

    const messages = [];
    const restoreSpace = getSpaceValue(
      document.getElementById('obp-space-restore'),
      document.getElementById('obp-space-restore-text'),
    );

    if (clearOnEl.checked) {
      const backupField = document.getElementById(
        'obp-field-input-backup',
      ).value;
      if (!backupField) {
        messages.push(
          '退避先フィールドが未設定のため、削除されたプロンプトは復元できなくなります。',
        );
      }

      const inputField = document.getElementById('obp-field-input').value;
      if (getFieldRequired(inputField)) {
        messages.push(
          '「AIへの指示・メモ」フィールドが必須項目に設定されています。自動削除により必須項目が空になり、保存時にエラーになります。フィールドの必須設定を外してください。',
        );
      }

      if (!restoreSpace) {
        messages.push(
          '復元ボタン設置スペースが未設定のため、復元ボタンが表示されません。',
        );
      }
    }

    // 復元ボタン設置スペースが下書き/要約ボタンの設置スペースと重複していると
    // 実行画面で先に描画したボタンが破棄されてしまう（重要1）。
    // clear_input_after_draft が無効でも復元ボタン自体は表示され得るため、
    // このチェックはチェックボックスの状態に関わらず行う。
    // 警告のみで、保存はブロックしない。
    if (restoreSpace) {
      const draftSpace = getSpaceValue(
        document.getElementById('obp-space-draft'),
        document.getElementById('obp-space-draft-text'),
      );
      const summarySpace = getSpaceValue(
        document.getElementById('obp-space-summary'),
        document.getElementById('obp-space-summary-text'),
      );
      if (restoreSpace === draftSpace || restoreSpace === summarySpace) {
        messages.push(
          '復元ボタン設置スペースが他のボタンと重複しています。復元ボタンは表示されません。',
        );
      }
    }

    if (messages.length === 0) {
      el.style.display = 'none';
      el.textContent = '';
    } else {
      el.style.display = '';
      el.textContent = messages.join(' / ');
    }
  }

  // =========================================================
  // フォーマット設定
  // =========================================================
  function populateFormatSelect() {
    const select = document.getElementById('obp-format-select');
    select.innerHTML = '';
    genOpts.FORMAT_OPTIONS.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.label;
      select.appendChild(opt);
    });
  }

  function loadFormatFromConfig() {
    const map = genOpts.parseMap(config.format_map, []);
    const instruction =
      (map[0] && map[0].instruction) ||
      config.format_default ||
      DEFAULTS.format_default;
    const matchedFormat = genOpts.FORMAT_OPTIONS.filter(
      (f) => f.id !== 'custom' && f.instruction === instruction,
    )[0];
    const formatId = matchedFormat ? matchedFormat.id : 'custom';
    document.getElementById('obp-format-select').value = formatId;
    document.getElementById('obp-format-instruction').value = instruction;
    renderFormatExample(formatId);
  }

  function renderFormatExample(formatId) {
    const el = document.getElementById('obp-format-example');
    if (!el) {
      return;
    }
    const f = genOpts.getFormatOption(formatId);
    if (formatId === 'custom' || !f || !f.example) {
      el.textContent = '独自の指示のため、出力例はありません。';
      return;
    }
    el.textContent = f.example;
  }

  // =========================================================
  // 用途プリセット
  // =========================================================
  function populatePresetSelect() {
    const select = document.getElementById('obp-preset-select');
    select.innerHTML = '';
    const categories = ['opinion', 'contact', 'document'];
    categories.forEach((cat) => {
      const presetsInCat = presets.PRESETS.filter((p) => p.category === cat);
      if (presetsInCat.length === 0) {
        return;
      }
      const group = document.createElement('optgroup');
      group.label = presets.CATEGORY_LABELS[cat] || cat;
      presetsInCat.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });

    const initial = config.preset_id || 'opinion';
    if (presets.getPreset(initial)) {
      select.value = initial;
    }
    updatePresetDescription();
  }

  function updatePresetDescription() {
    const id = document.getElementById('obp-preset-select').value;
    const preset = presets.getPreset(id);
    document.getElementById('obp-preset-description').textContent = preset
      ? preset.description
      : '';
    renderPresetExample();
  }

  function renderPresetExample() {
    const id = document.getElementById('obp-preset-select').value;
    const preset = presets.getPreset(id);
    const subjectEl = document.getElementById('obp-preset-example-subject');
    const bodyEl = document.getElementById('obp-preset-example-body');
    if (!subjectEl || !bodyEl) {
      return;
    }
    if (preset && preset.example_output) {
      subjectEl.textContent = preset.example_output.subject || '';
      bodyEl.textContent = preset.example_output.body || '';
    } else {
      subjectEl.textContent = 'この用途の出力例は登録されていません。';
      bodyEl.textContent = 'この用途の出力例は登録されていません。';
    }
  }

  function updatePresetCurrentLabel() {
    const el = document.getElementById('obp-preset-current');
    const id = config.preset_id;
    if (!id) {
      el.textContent = '未適用（個別項目のみで設定されています）';
      return;
    }
    const preset = presets.getPreset(id);
    el.textContent = preset
      ? '現在: ' + preset.label
      : '現在: ' + id + '（不明なプリセットIDです）';
  }

  function applyPromptPreset(id) {
    const preset = presets.getPreset(id);
    if (!preset) {
      return;
    }
    if (
      !confirm(
        '現在のボタン文言・プロンプト・フォーマット・要約設定を「' +
          preset.label +
          '」の内容で上書きします。よろしいですか？',
      )
    ) {
      return;
    }

    document.getElementById('obp-btn-label-draft').value =
      preset.btn_label_draft;
    document.getElementById('obp-btn-label-summary').value =
      preset.btn_label_summary;
    document.getElementById('obp-prompt-draft').value = preset.prompt_draft;
    document.getElementById('obp-prompt-summary').value = preset.prompt_summary;

    document.getElementById('obp-format-select').value =
      preset.default_format_id;
    const f = genOpts.getFormatOption(preset.default_format_id);
    document.getElementById('obp-format-instruction').value = f
      ? f.instruction
      : '';
    renderFormatExample(preset.default_format_id);

    const summaryOn = !!preset.summary_enabled;
    document.getElementById('obp-summary-enabled').checked = summaryOn;
    document.getElementById('obp-summary-section').style.display = summaryOn
      ? ''
      : 'none';

    appliedPresetId = preset.id;
    checkPromptDraftWarnings();
  }

  // =========================================================
  // プロンプト保存時警告（{{lengthInstruction}} / {{formatInstruction}}）
  // =========================================================
  function checkPromptDraftWarnings() {
    const promptDraft = document.getElementById('obp-prompt-draft').value;
    const warnEl = document.getElementById('obp-prompt-draft-warning');
    const hasLength = promptDraft.indexOf('{{lengthInstruction}}') !== -1;
    const hasFormat = promptDraft.indexOf('{{formatInstruction}}') !== -1;

    const messages = [];
    if (!hasLength) {
      messages.push(
        '{{lengthInstruction}} が含まれていないため、文字数の指定が生成結果に反映されません。',
      );
    }
    if (!hasFormat) {
      messages.push(
        '{{formatInstruction}} が含まれていないため、フォーマット設定が生成結果に反映されません。',
      );
    }

    if (messages.length === 0) {
      warnEl.style.display = 'none';
      warnEl.innerHTML = '';
      return true;
    }

    warnEl.style.display = '';
    warnEl.innerHTML = '';
    const textEl = document.createElement('div');
    textEl.textContent = messages.join(' ');
    warnEl.appendChild(textEl);

    if (!hasFormat) {
      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.textContent = 'プロンプトを最新形式に更新する';
      updateBtn.addEventListener('click', () => {
        const presetId = document.getElementById('obp-preset-select').value;
        const preset = presets.getPreset(presetId);
        if (!preset) {
          alert('更新元の用途プリセットを選択してください。');
          return;
        }
        if (
          !confirm(
            'プロンプトを「' +
              preset.label +
              '」の最新プロンプトで上書きします。よろしいですか？',
          )
        ) {
          return;
        }
        document.getElementById('obp-prompt-draft').value = preset.prompt_draft;
        checkPromptDraftWarnings();
      });
      warnEl.appendChild(updateBtn);
    }

    return false;
  }

  function getSelectedProviderOrder() {
    const selected = document.querySelector(
      'input[name="obp-provider-order"]:checked',
    );
    return selected ? selected.value : 'gemini';
  }

  function setSelectedProviderOrder(value) {
    const valid = [
      'anthropic,gemini',
      'gemini',
      'anthropic',
      'gemini,anthropic',
    ];
    const order = valid.indexOf(value) !== -1 ? value : 'gemini';
    document
      .querySelectorAll('input[name="obp-provider-order"]')
      .forEach((el) => {
        el.checked = el.value === order;
      });
  }

  function orderIncludes(order, type) {
    return order.split(',').indexOf(type) !== -1;
  }

  function getThinkingSetting(type, order) {
    if (!orderIncludes(order, type)) {
      return config[type + '_thinking'] || DEFAULTS[type + '_thinking'];
    }
    const id =
      type === 'anthropic'
        ? 'obp-anthropic-thinking-default'
        : 'obp-thinking-default';
    return document.getElementById(id).checked ? 'default' : 'suppress';
  }

  function updateProviderBlockState() {
    const order = getSelectedProviderOrder();
    ['anthropic', 'gemini'].forEach((type) => {
      const inactive = !orderIncludes(order, type);
      document
        .getElementById('obp-' + type + '-block')
        .classList.toggle('obp-provider-inactive', inactive);
      document.getElementById('obp-' + type + '-inactive-label').textContent =
        inactive ? '（未使用）' : '';
    });
  }

  function setAnthropicStatus(level, message) {
    const el = document.getElementById('obp-anthropic-model-status');
    el.className = 'obp-status-' + level;
    el.textContent = message;
  }

  function toggleAnthropicManualMode(on) {
    document.getElementById('obp-anthropic-model-select').disabled = on;
    const manual = document.getElementById('obp-anthropic-model-manual');
    manual.disabled = !on;
    manual.style.display = on ? '' : 'none';
  }

  function getSelectedAnthropicModel() {
    const manual = document.getElementById(
      'obp-anthropic-model-manual-check',
    ).checked;
    const id = manual
      ? 'obp-anthropic-model-manual'
      : 'obp-anthropic-model-select';
    return document.getElementById(id).value.trim();
  }

  function getVisibleAnthropicModels() {
    if (document.getElementById('obp-anthropic-model-show-all').checked) {
      return allFetchedAnthropicModels;
    }
    return allFetchedAnthropicModels.filter((m) => m.speedClass !== 'slow');
  }

  function buildAnthropicModelOptions(models) {
    const select = document.getElementById('obp-anthropic-model-select');
    select.innerHTML = '';
    (models || []).forEach((m) => {
      const id = typeof m === 'string' ? m : m.id;
      const displayName = typeof m === 'string' ? m : m.displayName || id;
      const option = document.createElement('option');
      option.value = id;
      option.textContent =
        displayName + '（' + id + '）— ' + anthropic.getModelSpeedLabel(id);
      select.appendChild(option);
    });
  }

  function applyAnthropicSelection(preferredId) {
    const select = document.getElementById('obp-anthropic-model-select');
    const check = document.getElementById('obp-anthropic-model-manual-check');
    const options = Array.prototype.map.call(select.options, (o) => o.value);
    if (preferredId && options.indexOf(preferredId) !== -1) {
      check.checked = false;
      toggleAnthropicManualMode(false);
      select.value = preferredId;
    } else if (preferredId) {
      check.checked = true;
      toggleAnthropicManualMode(true);
      document.getElementById('obp-anthropic-model-manual').value = preferredId;
    } else {
      check.checked = false;
      toggleAnthropicManualMode(false);
      select.value = '';
    }
  }

  async function refreshAnthropicModelList() {
    const apiKey = getEffectiveAnthropicKey();
    const btn = document.getElementById('obp-anthropic-model-refresh');
    if (!apiKey) {
      setAnthropicStatus('loading', 'APIキーを入力してください');
      return null;
    }
    const preferred = getSelectedAnthropicModel() || config.anthropic_model;
    const seq = ++validationSeqAnthropic;
    btn.disabled = true;
    setAnthropicStatus('loading', 'モデル一覧を取得中…');
    try {
      const models = await anthropic.listModels(apiKey);
      if (
        seq !== validationSeqAnthropic ||
        apiKey !== getEffectiveAnthropicKey()
      )
        return null;
      allFetchedAnthropicModels = models;
      buildAnthropicModelOptions(getVisibleAnthropicModels());
      applyAnthropicSelection(preferred);
      if (preferred && !models.some((m) => m.id === preferred)) {
        showMessage(
          'warn',
          '保存済みのClaudeモデル（' +
            preferred +
            '）は一覧にありません。利用可否を確認してください。',
        );
      }
    } catch (e) {
      if (
        seq !== validationSeqAnthropic ||
        apiKey !== getEffectiveAnthropicKey()
      )
        return null;
      allFetchedAnthropicModels = [];
      buildAnthropicModelOptions([]);
      applyAnthropicSelection(preferred);
      showMessage(
        'warn',
        'Claudeモデル一覧の取得に失敗しました。確認済みのモデルIDを手入力し、利用可否を確認してください。' +
          ((e.classified && e.classified.message) || e.message),
      );
    } finally {
      btn.disabled = false;
    }
    return validateSelectedAnthropicModel();
  }

  async function validateSelectedAnthropicModel() {
    const apiKey = getEffectiveAnthropicKey();
    const model = getSelectedAnthropicModel();
    const seq = ++validationSeqAnthropic;
    lastValidation.anthropic = null;
    if (!apiKey || !model) {
      setAnthropicStatus('loading', '未確認');
      return null;
    }
    setAnthropicStatus('loading', '確認中…');
    const result = await anthropic.checkModelAvailability(apiKey, model);
    if (
      seq !== validationSeqAnthropic ||
      apiKey !== getEffectiveAnthropicKey() ||
      model !== getSelectedAnthropicModel()
    )
      return null;
    lastValidation.anthropic = {
      model: model,
      key: apiKey,
      level: result.level,
      message: result.message,
    };
    if (result.level === 'ok')
      setAnthropicStatus('ok', '✓ 利用可能（モデル情報の取得に成功）');
    else if (result.level === 'ng')
      setAnthropicStatus('ng', '✗ 利用不可: ' + result.message);
    else
      setAnthropicStatus('warn', '△ 確認できませんでした: ' + result.message);
    return result;
  }

  // 「すべてのモデルを表示する」の状態に応じて、select に流し込むモデル一覧を
  // 決定する。allFetchedModels 未取得時は FALLBACK_MODELS（文字列配列）を返す。
  function getVisibleModels() {
    const showAllEl = document.getElementById('obp-model-show-all');
    const showAll = !!showAllEl && showAllEl.checked;
    if (!allFetchedModels.length) {
      return client.FALLBACK_MODELS;
    }
    if (showAll) {
      return allFetchedModels;
    }
    const recommended = allFetchedModels.filter((m) => m.recommended);
    return recommended.length > 0 ? recommended : allFetchedModels;
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
      option.textContent =
        displayName +
        '（' +
        bareName +
        '）' +
        client.getModelSpeedLabel(bareName);
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
    const apiKey = getEffectiveApiKey();
    const refreshBtn = document.getElementById('obp-model-refresh');

    if (!apiKey) {
      setStatus('loading', 'APIキーを入力してください');
      return null;
    }

    hideMessage();
    refreshBtn.disabled = true;
    setStatus('loading', 'モデル一覧を取得中…');

    const seq = ++validationSeq;
    const preferred =
      getSelectedModelName() || config.gemini_model || DEFAULTS.gemini_model;

    try {
      const models = await client.listGenerateContentModels(apiKey);
      if (seq !== validationSeq || apiKey !== getEffectiveApiKey()) return null;
      allFetchedModels = models;
      buildModelOptions(getVisibleModels());
      applySelection(preferred);
      checkSavedModelAvailability();
    } catch (e) {
      if (seq !== validationSeq || apiKey !== getEffectiveApiKey()) return null;
      const msg = (e.classified && e.classified.message) || e.message;
      allFetchedModels = [];
      buildModelOptions(client.FALLBACK_MODELS);
      applySelection(preferred);
      showMessage(
        'warn',
        'モデル一覧の取得に失敗しました（' +
          msg +
          '）。既知のモデルのみを表示しています。必要に応じて「一覧にないモデル名を手入力する」をご利用ください。',
      );
    } finally {
      refreshBtn.disabled = false;
    }
    return validateSelectedModel();
  }

  // 保存済みモデル（config.gemini_model）が今回取得した一覧に無い場合、
  // 選び直しを促す warn バナーを表示する。値の自動書き換えは行わない。
  function checkSavedModelAvailability() {
    const savedModel = config.gemini_model;
    if (!savedModel) {
      return;
    }
    const found = allFetchedModels.some(
      (m) => client.stripModelPrefix(m.name) === savedModel,
    );
    if (!found) {
      showMessage(
        'warn',
        '保存済みのモデル（' +
          savedModel +
          '）は現在のAPIキーでは利用できません。モデルを選び直して保存してください。',
      );
    }
  }

  async function validateSelectedModel() {
    const apiKey = getEffectiveApiKey();
    const modelName = getSelectedModelName();

    if (!apiKey || !modelName) {
      ++validationSeq;
      lastValidation.gemini = null;
      setStatus('loading', '未確認');
      return null;
    }

    const seq = ++validationSeq;
    lastValidation.gemini = null;
    setStatus('loading', '確認中…');

    // 設定画面では kintone.plugin.app.proxy() が使えないため、疎通確認は
    // 必ずブラウザからの直接通信で行う。疎通確認はモデル情報の GET 取得
    // （generateContent は行わない）のみで判定する。
    const result = await client.checkModelAvailability(apiKey, modelName);

    if (
      seq !== validationSeq ||
      apiKey !== getEffectiveApiKey() ||
      modelName !== getSelectedModelName()
    ) {
      return null;
    }

    if (result.level === 'ok') {
      setStatus('ok', '✓ 利用可能（モデル情報の取得に成功）');
    } else if (result.level === 'ng') {
      setStatus('ng', '✗ 利用不可: ' + result.message);
    } else if (result.status === -1) {
      setStatus(
        'warn',
        '△ 設定画面からは疎通確認できませんでした（ブラウザから直接通信できない環境の可能性があります）。保存後にレコード画面で動作をご確認ください。',
      );
    } else {
      setStatus('warn', '△ 確認できませんでした: ' + result.message);
    }

    lastValidation.gemini = {
      model: modelName,
      key: apiKey,
      level: result.level,
      message: result.message,
    };
    return lastValidation.gemini;
  }

  // =========================================================
  // 保存済みAPIキーの読み出し。
  // 実値は設定画面での直接通信（モデル一覧取得・疎通確認）にのみ使い、
  // 画面には末尾4桁のマスクだけを表示する。入力欄には書き戻さない。
  // =========================================================
  function maskApiKey(value) {
    const str = String(value || '');
    return str ? '••••••••' + str.slice(-4) : '';
  }

  function getSavedApiKeyInfo() {
    if (typeof kintone.plugin.app.getProxyConfig !== 'function') {
      return { saved: false, masked: '', value: '' };
    }
    try {
      const proxyConfig = kintone.plugin.app.getProxyConfig(
        client.PROXY_POST_PREFIX,
        'POST',
      );
      const headerValue =
        proxyConfig &&
        proxyConfig.headers &&
        proxyConfig.headers['x-goog-api-key'];
      if (!headerValue) {
        return { saved: false, masked: '', value: '' };
      }
      return {
        saved: true,
        masked: maskApiKey(headerValue),
        value: String(headerValue),
      };
    } catch {
      return { saved: false, masked: '', value: '' };
    }
  }

  function getSavedAnthropicKeyInfo() {
    if (typeof kintone.plugin.app.getProxyConfig !== 'function')
      return { saved: false, masked: '', value: '' };
    try {
      const proxy = kintone.plugin.app.getProxyConfig(
        anthropic.MESSAGES_URL,
        'POST',
      );
      const headers = (proxy && proxy.headers) || {};
      const key = Object.keys(headers).find(
        (name) => name.toLowerCase() === 'x-api-key',
      );
      const value = key && headers[key];
      return value
        ? { saved: true, masked: maskApiKey(value), value: String(value) }
        : { saved: false, masked: '', value: '' };
    } catch {
      return { saved: false, masked: '', value: '' };
    }
  }

  function getEffectiveAnthropicKey() {
    return (
      document.getElementById('obp-anthropic-api-key').value ||
      savedAnthropicKeyValue
    );
  }

  function updateAnthropicKeyStatusLabel() {
    const el = document.getElementById('obp-anthropic-api-key-status');
    el.textContent = savedAnthropicKeyExists
      ? '✓ APIキーは設定済みです（' +
        savedAnthropicKeyMasked +
        '）。変更しない場合は空欄のまま保存してください。'
      : 'APIキーは未設定です。Claudeを使う場合は入力してください。';
    el.className =
      'obp-api-key-status obp-api-key-status-' +
      (savedAnthropicKeyExists ? 'saved' : 'empty');
  }

  function saveAnthropicProxyConfig(apiKey) {
    return new Promise((resolve, reject) => {
      kintone.plugin.app.setProxyConfig(
        anthropic.MESSAGES_URL,
        'POST',
        { 'x-api-key': apiKey },
        {},
        resolve,
        reject,
      );
    });
  }

  // 入力欄の値を優先し、未入力なら保存済みの実値を使う（直接通信用）
  function getEffectiveApiKey() {
    return document.getElementById('obp-api-key').value || savedApiKeyValue;
  }

  function updateApiKeyStatusLabel() {
    const el = document.getElementById('obp-api-key-status');
    if (!el) {
      return;
    }
    if (savedApiKeyExists) {
      el.textContent =
        '✓ APIキーは設定済みです' +
        (savedApiKeyMasked ? '（' + savedApiKeyMasked + '）' : '') +
        '。変更しない場合は空欄のまま保存してください。';
      el.className = 'obp-api-key-status obp-api-key-status-saved';
    } else {
      el.textContent = 'APIキーは未設定です。初回は入力が必要です。';
      el.className = 'obp-api-key-status obp-api-key-status-empty';
    }
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

  function settingsStillMatch(order, snapshot) {
    return (
      order === getSelectedProviderOrder() &&
      snapshot.every(
        (item) =>
          item.key === item.provider.key() &&
          item.model === item.provider.model(),
      )
    );
  }

  async function saveSelectedProxyKeys(order, snapshot) {
    const anthropicKey = document.getElementById('obp-anthropic-api-key').value;
    const apiKey = document.getElementById('obp-api-key').value;
    if (orderIncludes(order, 'anthropic') && anthropicKey) {
      if (!settingsStillMatch(order, snapshot)) return false;
      try {
        await saveAnthropicProxyConfig(anthropicKey);
      } catch (e) {
        showMessage(
          'error',
          'Claudeのプロキシ設定の保存に失敗しました。詳細: ' + e,
        );
        return false;
      }
      if (!settingsStillMatch(order, snapshot)) return false;
      savedAnthropicKeyExists = true;
      savedAnthropicKeyMasked = maskApiKey(anthropicKey);
      savedAnthropicKeyValue = anthropicKey;
      updateAnthropicKeyStatusLabel();
    }

    if (orderIncludes(order, 'gemini') && apiKey) {
      if (!settingsStillMatch(order, snapshot)) return false;
      try {
        await saveProxyConfig(apiKey);
      } catch (e) {
        showMessage('error', 'プロキシ設定の保存に失敗しました。詳細: ' + e);
        return false;
      }
      if (!settingsStillMatch(order, snapshot)) return false;
      savedApiKeyExists = true;
      savedApiKeyMasked = maskApiKey(apiKey);
      savedApiKeyValue = apiKey;
      updateApiKeyStatusLabel();
    }
    return true;
  }

  async function doSave(order, snapshot) {
    if (!settingsStillMatch(order, snapshot)) return;
    showMessage('info', '保存処理を実行しています…');
    if (!(await saveSelectedProxyKeys(order, snapshot))) {
      if (!settingsStillMatch(order, snapshot)) {
        showMessage(
          'error',
          '保存中に使用順・APIキーまたはモデルが変更されました。再度保存してください。',
        );
      }
      return;
    }
    // キー欄が空なら既存のプロキシ設定を保持する。

    checkPromptDraftWarnings();
    updateBackupCheck();

    const formatInstructionValue = document.getElementById(
      'obp-format-instruction',
    ).value;
    const formatModeChecked = document.querySelector(
      'input[name="obp-format-mode"]:checked',
    );

    const backupMaxCharsInput = document.getElementById(
      'obp-backup-max-chars',
    ).value;
    const backupMaxCharsTrimmed = (backupMaxCharsInput || '').trim();
    const backupMaxCharsNum = parseInt(backupMaxCharsTrimmed, 10);
    let backupMaxCharsFinal;
    if (
      backupMaxCharsTrimmed !== '' &&
      !isNaN(backupMaxCharsNum) &&
      backupMaxCharsNum >= 0
    ) {
      backupMaxCharsFinal = String(backupMaxCharsNum);
    } else {
      backupMaxCharsFinal = DEFAULTS.backup_max_chars;
      alert(
        '退避の文字数上限に不正な値が入力されていたため、既定値（' +
          DEFAULTS.backup_max_chars +
          '字）にフォールバックして保存します。',
      );
    }

    const newConfig = {
      ...config,
      ai_provider_order: order,
      anthropic_model: orderIncludes(order, 'anthropic')
        ? getSelectedAnthropicModel()
        : config.anthropic_model || '',
      anthropic_thinking: getThinkingSetting('anthropic', order),
      pii_mask: document.getElementById('obp-pii-mask').checked ? 'yes' : 'no',
      gemini_model: orderIncludes(order, 'gemini')
        ? client.stripModelPrefix(getSelectedModelName())
        : config.gemini_model || DEFAULTS.gemini_model,
      field_input: document.getElementById('obp-field-input').value,
      field_length: document.getElementById('obp-field-length').value,
      field_subject: document.getElementById('obp-field-subject').value,
      field_body: document.getElementById('obp-field-body').value,
      field_summary: document.getElementById('obp-field-summary').value,
      field_format: document.getElementById('obp-field-format').value,
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
      length_mode: 'field',
      length_map: genOpts.stringifyMap(
        currentLengthRows.filter((r) => r.option || r.instruction),
      ),
      length_default: document.getElementById('obp-length-default').value,
      format_mode: formatModeChecked ? formatModeChecked.value : 'fixed',
      format_map: genOpts.stringifyMap([
        { option: '', instruction: formatInstructionValue },
      ]),
      format_default: formatInstructionValue,
      overwrite_confirm: document.getElementById('obp-overwrite-confirm-no')
        .checked
        ? 'no'
        : 'yes',
      gemini_thinking: getThinkingSetting('gemini', order),
      preset_id: appliedPresetId || '',
      clear_input_after_draft: document.getElementById(
        'obp-clear-input-after-draft',
      ).checked
        ? 'yes'
        : 'no',
      field_input_backup: document.getElementById('obp-field-input-backup')
        .value,
      space_restore: getSpaceValue(
        document.getElementById('obp-space-restore'),
        document.getElementById('obp-space-restore-text'),
      ),
      backup_max_chars: backupMaxCharsFinal,
      btn_label_restore: document.getElementById('obp-btn-label-restore').value,
    };

    if (!settingsStillMatch(order, snapshot)) {
      showMessage(
        'error',
        '保存中にAPIキーまたはモデルが変更されました。再度保存してください。',
      );
      return;
    }
    kintone.plugin.app.setConfig(newConfig, () => {
      alert('設定を保存しました。アプリを更新してください！');
      backToFlowScreen();
    });
  }

  async function validateProvidersForSave(selected) {
    for (const provider of selected) {
      if (!provider.key() || !provider.model()) {
        alert(provider.label + 'のAPIキーとモデルを指定してください。');
        return false;
      }
    }
    const warnings = [];
    for (const provider of selected) {
      const previous = lastValidation[provider.type];
      if (
        !previous ||
        previous.key !== provider.key() ||
        previous.model !== provider.model()
      )
        await provider.validate();
      const current = lastValidation[provider.type];
      if (
        !current ||
        current.key !== provider.key() ||
        current.model !== provider.model()
      ) {
        alert(
          provider.label +
            'のモデルの疎通確認ができませんでした。APIキーとモデル名を確認してください。',
        );
        return false;
      }
      if (current.level === 'ng') {
        alert(
          provider.label + 'のモデルは利用できません。\n' + current.message,
        );
        return false;
      }
      if (current.level === 'warn')
        warnings.push(provider.label + ': ' + current.message);
    }
    if (
      warnings.length &&
      !confirm(
        'モデルの利用可否を確認できませんでした。このまま保存しますか？\n' +
          warnings.join('\n'),
      )
    )
      return false;
    // 確認中に入力が変更された場合は古い結果で保存しない。
    if (
      selected.some(
        (provider) =>
          !lastValidation[provider.type] ||
          lastValidation[provider.type].key !== provider.key() ||
          lastValidation[provider.type].model !== provider.model(),
      )
    ) {
      alert('APIキーまたはモデルが変更されました。再度保存してください。');
      return false;
    }

    return true;
  }

  async function onSaveClick() {
    const order = getSelectedProviderOrder();
    const fieldInput = document.getElementById('obp-field-input').value;
    const fieldBody = document.getElementById('obp-field-body').value;
    const spaceDraft = getSpaceValue(
      document.getElementById('obp-space-draft'),
      document.getElementById('obp-space-draft-text'),
    );

    if (!fieldInput || !fieldBody || !spaceDraft) {
      alert(
        '必須項目が未入力です。「AIへの指示・メモ」フィールド・本文フィールド・下書きボタン設置スペースを指定してください。',
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

    // {{lengthInstruction}} / {{formatInstruction}} の欠落は警告のみで保存はブロックしない
    checkPromptDraftWarnings();

    const selected = [];
    if (orderIncludes(order, 'anthropic'))
      selected.push({
        type: 'anthropic',
        label: 'Claude',
        key: getEffectiveAnthropicKey,
        model: getSelectedAnthropicModel,
        validate: validateSelectedAnthropicModel,
      });
    if (orderIncludes(order, 'gemini'))
      selected.push({
        type: 'gemini',
        label: 'Gemini',
        key: getEffectiveApiKey,
        model: getSelectedModelName,
        validate: validateSelectedModel,
      });
    if (!(await validateProvidersForSave(selected))) return;

    const saveBtn = document.getElementById('obp-save');
    const originalLabel = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    try {
      await doSave(
        order,
        selected.map((provider) => ({
          provider: provider,
          key: provider.key(),
          model: provider.model(),
        })),
      );
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

    renderLengthMapTable();
  }

  function backToFlowScreen() {
    window.location.href = '../../flow?app=' + kintone.app.getId();
  }

  function bindAnthropicEvents() {
    const key = document.getElementById('obp-anthropic-api-key');
    const toggle = document.getElementById('obp-anthropic-api-key-toggle');
    const select = document.getElementById('obp-anthropic-model-select');
    const manual = document.getElementById('obp-anthropic-model-manual');
    const check = document.getElementById('obp-anthropic-model-manual-check');
    toggle.addEventListener('click', () => {
      const visible = key.type === 'password';
      key.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? '隠す' : '表示';
    });
    key.addEventListener('input', () => {
      ++validationSeqAnthropic;
      lastValidation.anthropic = null;
    });
    key.addEventListener('change', () => {
      if (getEffectiveAnthropicKey()) refreshAnthropicModelList();
    });
    document
      .getElementById('obp-anthropic-model-refresh')
      .addEventListener('click', refreshAnthropicModelList);
    select.addEventListener('change', validateSelectedAnthropicModel);
    manual.addEventListener('input', () => {
      ++validationSeqAnthropic;
      lastValidation.anthropic = null;
    });
    manual.addEventListener('blur', () => {
      if (check.checked) validateSelectedAnthropicModel();
    });
    check.addEventListener('change', () => {
      toggleAnthropicManualMode(check.checked);
      validateSelectedAnthropicModel();
    });
    document
      .getElementById('obp-anthropic-model-show-all')
      .addEventListener('change', () => {
        const current = getSelectedAnthropicModel();
        buildAnthropicModelOptions(getVisibleAnthropicModels());
        applyAnthropicSelection(current);
      });
    document
      .querySelectorAll('input[name="obp-provider-order"]')
      .forEach((el) => {
        el.addEventListener('change', updateProviderBlockState);
      });
  }

  function bindEvents() {
    const apiKeyToggle = document.getElementById('obp-api-key-toggle');
    const apiKeyEl = document.getElementById('obp-api-key');
    const modelRefresh = document.getElementById('obp-model-refresh');
    const modelSelect = document.getElementById('obp-model-select');
    const modelManual = document.getElementById('obp-model-manual');
    const modelManualCheck = document.getElementById('obp-model-manual-check');
    const modelShowAll = document.getElementById('obp-model-show-all');
    const summaryEnabledEl = document.getElementById('obp-summary-enabled');
    const summarySection = document.getElementById('obp-summary-section');
    const presetStructure = document.getElementById('obp-preset-structure');
    const presetApply = document.getElementById('obp-preset-apply');
    const presetSelect = document.getElementById('obp-preset-select');
    const fieldLengthSelect = document.getElementById('obp-field-length');
    const lengthReload = document.getElementById('obp-length-reload');
    const lengthRecommendCopy = document.getElementById(
      'obp-length-recommend-copy',
    );
    const formatSelect = document.getElementById('obp-format-select');
    const promptDraft = document.getElementById('obp-prompt-draft');
    const saveBtn = document.getElementById('obp-save');
    const cancelBtn = document.getElementById('obp-cancel');
    const clearInputAfterDraftEl = document.getElementById(
      'obp-clear-input-after-draft',
    );
    const fieldInputEl = document.getElementById('obp-field-input');
    const fieldInputBackupEl = document.getElementById(
      'obp-field-input-backup',
    );
    const spaceRestoreEl = document.getElementById('obp-space-restore');
    const spaceRestoreTextEl = document.getElementById(
      'obp-space-restore-text',
    );
    const spaceDraftEl = document.getElementById('obp-space-draft');
    const spaceDraftTextEl = document.getElementById('obp-space-draft-text');
    const spaceSummaryEl = document.getElementById('obp-space-summary');
    const spaceSummaryTextEl = document.getElementById(
      'obp-space-summary-text',
    );

    apiKeyToggle.addEventListener('click', () => {
      const isPassword = apiKeyEl.type === 'password';
      apiKeyEl.type = isPassword ? 'text' : 'password';
      apiKeyToggle.textContent = isPassword ? '隠す' : '表示';
    });

    apiKeyEl.addEventListener('change', () => {
      ++validationSeq;
      lastValidation.gemini = null;
      if (apiKeyEl.value || savedApiKeyValue) {
        refreshModelList();
      }
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

    modelShowAll.addEventListener('change', () => {
      const current = getSelectedModelName();
      buildModelOptions(getVisibleModels());
      applySelection(current);
    });

    summaryEnabledEl.addEventListener('change', () => {
      summarySection.style.display = summaryEnabledEl.checked ? '' : 'none';
    });

    presetStructure.addEventListener('click', () =>
      applyStructurePreset(STRUCTURE_PRESET_COMMON),
    );

    presetSelect.addEventListener('change', updatePresetDescription);
    presetApply.addEventListener('click', () =>
      applyPromptPreset(presetSelect.value),
    );

    fieldLengthSelect.addEventListener('change', () => {
      renderLengthMapTable();
    });

    lengthReload.addEventListener('click', () => {
      reloadFieldMeta();
    });

    lengthRecommendCopy.addEventListener('click', async () => {
      const text = genOpts.RECOMMENDED_LENGTHS.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showMessage('info', '推奨選択肢をクリップボードにコピーしました。');
      } catch (e) {
        console.error(e);
        alert(
          'コピーに失敗しました。以下の文字列を手動でコピーしてください:\n' +
            text,
        );
      }
    });

    formatSelect.addEventListener('change', () => {
      const f = genOpts.getFormatOption(formatSelect.value);
      document.getElementById('obp-format-instruction').value = f
        ? f.instruction
        : '';
      renderFormatExample(formatSelect.value);
    });

    promptDraft.addEventListener('input', () => {
      checkPromptDraftWarnings();
    });

    clearInputAfterDraftEl.addEventListener('change', () => {
      updateBackupCheck();
    });
    fieldInputEl.addEventListener('change', () => {
      updateBackupCheck();
    });
    fieldInputBackupEl.addEventListener('change', () => {
      updateBackupCheck();
    });
    spaceRestoreEl.addEventListener('change', () => {
      updateBackupCheck();
    });
    spaceRestoreTextEl.addEventListener('input', () => {
      updateBackupCheck();
    });
    // 復元ボタン設置スペースの重複警告（重要1）はドラフト/要約側の
    // スペース変更でも再判定が必要なため、こちらの変更にも反応させる。
    spaceDraftEl.addEventListener('change', () => {
      updateBackupCheck();
    });
    spaceDraftTextEl.addEventListener('input', () => {
      updateBackupCheck();
    });
    spaceSummaryEl.addEventListener('change', () => {
      updateBackupCheck();
    });
    spaceSummaryTextEl.addEventListener('input', () => {
      updateBackupCheck();
    });

    saveBtn.addEventListener('click', () => {
      onSaveClick();
    });

    cancelBtn.addEventListener('click', () => {
      backToFlowScreen();
    });
    bindAnthropicEvents();
  }

  function initProviderSettings() {
    const savedAnthropicInfo = getSavedAnthropicKeyInfo();
    savedAnthropicKeyExists = savedAnthropicInfo.saved;
    savedAnthropicKeyMasked = savedAnthropicInfo.masked;
    savedAnthropicKeyValue = savedAnthropicInfo.value;
    updateAnthropicKeyStatusLabel();
    const initialOrder =
      config.ai_provider_order ||
      (Object.keys(config).length === 0 || savedAnthropicKeyExists
        ? DEFAULTS.ai_provider_order
        : 'gemini');
    setSelectedProviderOrder(initialOrder);
    updateProviderBlockState();
    document.getElementById('obp-pii-mask').checked = config.pii_mask !== 'no';
    document.getElementById(
      config.anthropic_thinking === 'default'
        ? 'obp-anthropic-thinking-default'
        : 'obp-anthropic-thinking-suppress',
    ).checked = true;
    buildAnthropicModelOptions([]);
    applyAnthropicSelection(config.anthropic_model || '');
    toggleManualMode(false);
    if (savedAnthropicKeyValue) refreshAnthropicModelList();
    else
      setAnthropicStatus(
        'loading',
        'APIキーを入力するとモデル一覧を取得します',
      );
  }

  function init() {
    initProviderSettings();
    document.getElementById('obp-btn-label-draft').value =
      config.btn_label_draft || DEFAULTS.btn_label_draft;
    document.getElementById('obp-btn-label-summary').value =
      config.btn_label_summary || DEFAULTS.btn_label_summary;
    document.getElementById('obp-btn-label-restore').value =
      config.btn_label_restore || DEFAULTS.btn_label_restore;
    document.getElementById('obp-prompt-draft').value =
      config.prompt_draft || DEFAULTS.prompt_draft;
    document.getElementById('obp-prompt-summary').value =
      config.prompt_summary || DEFAULTS.prompt_summary;

    document.getElementById('obp-clear-input-after-draft').checked =
      (config.clear_input_after_draft || DEFAULTS.clear_input_after_draft) ===
      'yes';
    document.getElementById('obp-backup-max-chars').value =
      config.backup_max_chars !== undefined
        ? config.backup_max_chars
        : DEFAULTS.backup_max_chars;

    document.getElementById('obp-length-default').value =
      config.length_default !== undefined
        ? config.length_default
        : DEFAULTS.length_default;
    document.getElementById('obp-length-recommend-list').textContent =
      genOpts.RECOMMENDED_LENGTHS.join('、');

    const overwriteVal = config.overwrite_confirm || DEFAULTS.overwrite_confirm;
    document.getElementById(
      overwriteVal === 'no'
        ? 'obp-overwrite-confirm-no'
        : 'obp-overwrite-confirm-yes',
    ).checked = true;

    // キー無し・不正値は抑制（既定）。文字どおり 'default' のときのみ既定任せ。
    document.getElementById(
      config.gemini_thinking === 'default'
        ? 'obp-thinking-default'
        : 'obp-thinking-suppress',
    ).checked = true;

    const formatModeVal = config.format_mode || DEFAULTS.format_mode;
    const formatModeEl = document.getElementById(
      formatModeVal === 'field'
        ? 'obp-format-mode-field'
        : 'obp-format-mode-fixed',
    );
    if (formatModeEl) {
      formatModeEl.checked = true;
    }

    const summaryOn =
      (config.summary_enabled || DEFAULTS.summary_enabled) !== 'no';
    document.getElementById('obp-summary-enabled').checked = summaryOn;
    document.getElementById('obp-summary-section').style.display = summaryOn
      ? ''
      : 'none';

    populatePresetSelect();
    updatePresetCurrentLabel();
    populateFormatSelect();
    loadFormatFromConfig();
    checkPromptDraftWarnings();

    bindEvents();
    loadFields();
    loadSpaces();

    // 実値はメモリ内でのみ保持する（入力欄やメッセージへは書き出さない）
    const savedApiKeyInfo = getSavedApiKeyInfo();
    savedApiKeyExists = savedApiKeyInfo.saved;
    savedApiKeyMasked = savedApiKeyInfo.masked;
    savedApiKeyValue = savedApiKeyInfo.value;
    updateApiKeyStatusLabel();

    buildModelOptions(client.FALLBACK_MODELS);
    applySelection(config.gemini_model || DEFAULTS.gemini_model);

    if (savedApiKeyValue) {
      // 保存済みキーがあるので、開いた時点で最新のモデル一覧を取得する
      setStatus('loading', 'モデル一覧を取得中…');
      refreshModelList();
    } else if (orderIncludes(getSelectedProviderOrder(), 'gemini')) {
      setStatus('loading', 'APIキーを入力するとモデル一覧を取得します');
      showMessage(
        'info',
        'APIキーが未設定です。Google AI Studio等で取得したAPIキーを入力してください。',
      );
    }
  }

  init();
})(kintone.$PLUGIN_ID);
