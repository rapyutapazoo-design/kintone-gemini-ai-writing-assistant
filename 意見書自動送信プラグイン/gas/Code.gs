/**
 * 意見書 自動送信プラグイン — Google Apps Script 送信エンジン
 *
 * 役割:
 *   - doPost():        プラグインからの「手動送信(sendOne)」「設定連携(saveConfig)」を受け取る
 *   - scheduledSend(): 時間主導トリガーから呼ばれ、条件に合う未送信レコードを一括送信する
 *
 * 事前に「プロジェクトの設定 > スクリプト プロパティ」に以下を登録してください:
 *   KINTONE_DOMAIN   例) example.cybozu.com
 *   KINTONE_APP_ID   例) 123            （手動送信・定時送信の対象アプリ）
 *   KINTONE_API_TOKEN                    （レコード閲覧/編集/ファイルDL権限つきAPIトークン）
 *   SHARED_SECRET    プラグイン設定の「共有シークレット」と同じ値
 *
 * PLUGIN_CONFIG は saveConfig 受信時に自動で保存されます（手動設定不要）。
 */

// ============================================================================
// エントリポイント
// ============================================================================

function doPost(e) {
  try {
    const params = parseRequest_(e);

    if (params.secret !== getProp_('SHARED_SECRET')) {
      return jsonResponse_({ ok: false, error: '認証に失敗しました（secret不一致）。' });
    }

    switch (params.action) {
      case 'saveConfig':
        saveConfig_(params.payload);
        return jsonResponse_({ ok: true, saved: true });

      case 'sendOne': {
        const appId = params.appId || getProp_('KINTONE_APP_ID');
        const result = sendRecord_(appId, params.recordId, loadConfig_());
        return jsonResponse_(result);
      }

      default:
        return jsonResponse_({ ok: false, error: '不明なアクション: ' + params.action });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * 時間主導トリガーから呼ぶ関数。
 * setupTrigger() で毎日/毎週の指定時刻に登録する。
 */
function scheduledSend() {
  const config = loadConfig_();
  const appId = getProp_('KINTONE_APP_ID');
  const records = fetchTargetRecords_(appId, config);

  let success = 0;
  let failed = 0;
  records.forEach((record) => {
    try {
      const r = sendRecord_(appId, record.$id.value, config, record);
      if (r.ok) {
        success++;
      } else {
        failed++;
        console.error('送信失敗 recordId=' + record.$id.value + ': ' + r.error);
      }
    } catch (err) {
      failed++;
      console.error('送信例外 recordId=' + record.$id.value + ': ' + err);
    }
  });
  console.log('定時送信完了: 対象=' + records.length + ' 成功=' + success + ' 失敗=' + failed);
}

// ============================================================================
// 送信処理
// ============================================================================

/**
 * 1レコードを送信し、成功時に送信済みフラグを更新する。
 * @param {string} appId
 * @param {string} recordId
 * @param {Object} config
 * @param {Object} [preloadedRecord] 既に取得済みのレコード（定時送信時の再取得削減）
 */
function sendRecord_(appId, recordId, config, preloadedRecord) {
  if (!recordId) {
    return { ok: false, error: 'recordId が指定されていません。' };
  }
  const record = preloadedRecord || getRecord_(appId, recordId);
  const fieldDefs = getFieldDefs_(appId);

  const subject = buildSubject_(config, record, recordId);
  const body = buildBody_(config, record, fieldDefs);
  const attachments = collectAttachments_(config, record);

  const to = (config.to || []).join(',');
  if (!to) {
    return { ok: false, error: '宛先(TO)が設定されていません。' };
  }

  const options = { name: '意見書 自動送信' };
  if (config.cc && config.cc.length) options.cc = config.cc.join(',');
  if (config.bcc && config.bcc.length) options.bcc = config.bcc.join(',');
  if (attachments.length) options.attachments = attachments;

  GmailApp.sendEmail(to, subject, body, options);

  markAsSent_(appId, recordId, config);
  return { ok: true, recordId: recordId };
}

function buildSubject_(config, record, recordId) {
  let subject = config.subjectTemplate || ('意見書レコードのお知らせ（レコード #' + recordId + '）');
  subject = subject.replace(/\{\$id\}/g, recordId);
  subject = subject.replace(/\{([^}]+)\}/g, (m, code) => {
    const f = record[code];
    if (!f) return m;
    return formatValue_(f);
  });
  return subject;
}

function buildBody_(config, record, fieldDefs) {
  const parts = [];
  if (config.bodyHeader) parts.push(config.bodyHeader, '');

  if (config.includeAllFields !== false) {
    const exclude = config.excludeFields || [];
    const lines = [];
    Object.keys(record).forEach((code) => {
      if (isSystemField_(code)) return;
      if (exclude.indexOf(code) !== -1) return;
      const field = record[code];
      const label = labelOf_(code, fieldDefs);
      lines.push(label + ': ' + formatValue_(field));
    });
    parts.push('----------------------------------------');
    parts.push(lines.join('\n'));
    parts.push('----------------------------------------');
  }

  if (config.bodyFooter) parts.push('', config.bodyFooter);
  return parts.join('\n');
}

function collectAttachments_(config, record) {
  const fields = config.attachmentFields || [];
  const blobs = [];
  fields.forEach((code) => {
    const field = record[code];
    if (!field || field.type !== 'FILE' || !Array.isArray(field.value)) return;
    field.value.forEach((file) => {
      blobs.push(downloadFile_(file.fileKey, file.name, file.contentType));
    });
  });
  return blobs;
}

function markAsSent_(appId, recordId, config) {
  if (!config.sentFlagField) return;
  const recordPatch = {};

  // フラグフィールド: チェックボックスは配列、文字列は文字列で更新
  const fieldDefs = getFieldDefs_(appId);
  const def = fieldDefs[config.sentFlagField];
  const flagValue = config.sentFlagValue || '送信済み';
  if (def && (def.type === 'CHECK_BOX' || def.type === 'MULTI_SELECT')) {
    recordPatch[config.sentFlagField] = { value: [flagValue] };
  } else {
    recordPatch[config.sentFlagField] = { value: flagValue };
  }

  if (config.sentDateTimeField) {
    recordPatch[config.sentDateTimeField] = { value: new Date().toISOString() };
  }

  updateRecord_(appId, recordId, recordPatch);
}

// ============================================================================
// 対象レコード抽出（定時送信）
// ============================================================================

function fetchTargetRecords_(appId, config) {
  const fieldDefs = getFieldDefs_(appId);
  const query = buildQuery_(config, fieldDefs);
  let all = [];
  let offset = 0;
  const limit = 100;
  // 念のため最大 1000 件まで
  while (offset < 1000) {
    const url =
      kintoneApiUrl_('/k/v1/records.json') +
      '?app=' + encodeURIComponent(appId) +
      '&query=' + encodeURIComponent(query + ' limit ' + limit + ' offset ' + offset);
    const res = kintoneFetch_(url, 'get');
    const records = res.records || [];
    all = all.concat(records);
    if (records.length < limit) break;
    offset += limit;
  }

  // ステータス判定はクエリで表現しづらいため、取得後にコードで絞り込む
  if (config.condition && config.condition.type === 'status') {
    const target = config.condition.matchValue;
    all = all.filter((rec) => statusOf_(rec) === target);
  }
  return all;
}

/**
 * 「未送信」かつ（フィールド条件があればそれ）に合致するクエリを組み立てる。
 */
function buildQuery_(config, fieldDefs) {
  const conds = [];

  // 未送信条件
  if (config.sentFlagField) {
    const def = fieldDefs[config.sentFlagField];
    const flagValue = config.sentFlagValue || '送信済み';
    if (def && (def.type === 'CHECK_BOX' || def.type === 'MULTI_SELECT')) {
      conds.push(config.sentFlagField + ' not in ("' + escapeQuery_(flagValue) + '")');
    } else {
      conds.push(config.sentFlagField + ' = ""');
    }
  }

  // フィールド値条件
  if (config.condition && config.condition.type === 'field' && config.condition.fieldCode) {
    const def = fieldDefs[config.condition.fieldCode];
    const val = escapeQuery_(config.condition.matchValue);
    if (def && ['CHECK_BOX', 'MULTI_SELECT', 'DROP_DOWN', 'RADIO_BUTTON'].indexOf(def.type) !== -1) {
      conds.push(config.condition.fieldCode + ' in ("' + val + '")');
    } else {
      conds.push(config.condition.fieldCode + ' = "' + val + '"');
    }
  }

  return conds.length ? conds.join(' and ') + ' order by $id asc' : 'order by $id asc';
}

/** レコードからプロセス管理ステータスの値を取り出す（type=STATUS を走査） */
function statusOf_(record) {
  const keys = Object.keys(record);
  for (let i = 0; i < keys.length; i++) {
    const f = record[keys[i]];
    if (f && f.type === 'STATUS') return f.value;
  }
  // フォールバック: 既定の日本語コード
  if (record['ステータス']) return record['ステータス'].value;
  return null;
}

// ============================================================================
// kintone REST API
// ============================================================================

function getRecord_(appId, recordId) {
  const url =
    kintoneApiUrl_('/k/v1/record.json') +
    '?app=' + encodeURIComponent(appId) +
    '&id=' + encodeURIComponent(recordId);
  const res = kintoneFetch_(url, 'get');
  return res.record;
}

function updateRecord_(appId, recordId, recordPatch) {
  const url = kintoneApiUrl_('/k/v1/record.json');
  const payload = { app: appId, id: recordId, record: recordPatch };
  kintoneFetch_(url, 'put', payload);
}

function downloadFile_(fileKey, name, contentType) {
  const url = kintoneApiUrl_('/k/v1/file.json') + '?fileKey=' + encodeURIComponent(fileKey);
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'X-Cybozu-API-Token': getProp_('KINTONE_API_TOKEN') },
    muteHttpExceptions: true,
  });
  const blob = response.getBlob();
  if (name) blob.setName(name);
  if (contentType) blob.setContentType(contentType);
  return blob;
}

let FIELD_DEFS_CACHE_ = null;
function getFieldDefs_(appId) {
  if (FIELD_DEFS_CACHE_) return FIELD_DEFS_CACHE_;
  const url = kintoneApiUrl_('/k/v1/app/form/fields.json') + '?app=' + encodeURIComponent(appId);
  const res = kintoneFetch_(url, 'get');
  FIELD_DEFS_CACHE_ = res.properties || {};
  return FIELD_DEFS_CACHE_;
}

function kintoneFetch_(url, method, payload) {
  const options = {
    method: method,
    headers: { 'X-Cybozu-API-Token': getProp_('KINTONE_API_TOKEN') },
    muteHttpExceptions: true,
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('kintone API エラー(' + code + '): ' + text);
  }
  return text ? JSON.parse(text) : {};
}

function kintoneApiUrl_(path) {
  return 'https://' + getProp_('KINTONE_DOMAIN') + path;
}

// ============================================================================
// 値の整形
// ============================================================================

const SYSTEM_FIELDS_ = [
  '$id', '$revision', 'レコード番号', 'Record_number', '作成者', '更新者',
  '作成日時', '更新日時', 'Created_by', 'Updated_by', 'Created_datetime', 'Updated_datetime',
];

function isSystemField_(code) {
  return code.charAt(0) === '$';
}

function labelOf_(code, fieldDefs) {
  if (fieldDefs[code] && fieldDefs[code].label) return fieldDefs[code].label;
  return code;
}

function formatValue_(field) {
  if (!field) return '';
  const v = field.value;
  switch (field.type) {
    case 'CHECK_BOX':
    case 'MULTI_SELECT':
    case 'CATEGORY':
      return Array.isArray(v) ? v.join(', ') : '';
    case 'USER_SELECT':
    case 'ORGANIZATION_SELECT':
    case 'GROUP_SELECT':
    case 'STATUS_ASSIGNEE':
      return Array.isArray(v) ? v.map((u) => u.name).join(', ') : '';
    case 'CREATOR':
    case 'MODIFIER':
      return v && v.name ? v.name : '';
    case 'FILE':
      return Array.isArray(v) ? v.map((f) => f.name).join(', ') : '';
    case 'SUBTABLE':
      return formatSubtable_(v);
    case 'RICH_TEXT':
      return richTextToPlainText_(v);
    default:
      return v == null ? '' : String(v);
  }
}

/**
 * RICH_TEXT フィールドの value（HTML文字列）をプレーンテキストに変換する。
 * opinion-box-plugin/src/js/gemini-client.js の richTextToPlainText と
 * 同等のロジック。GAS(Apps Script) はプラグイン側のJSをimportできないため、
 * 意図的にコードを重複させている。両者を変更する際は必ず同期すること。
 */
function richTextToPlainText_(html) {
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
    .map(function (line) {
      return line.replace(/[ \t]+$/g, '');
    })
    .join('\n')
    .trim();

  return text;
}

function formatSubtable_(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '(なし)';
  return rows
    .map((row, i) => {
      const cells = Object.keys(row.value || {}).map((code) => {
        return '  - ' + code + ': ' + formatValue_(row.value[code]);
      });
      return '[' + (i + 1) + ']\n' + cells.join('\n');
    })
    .join('\n');
}

// ============================================================================
// 設定・プロパティ・ユーティリティ
// ============================================================================

function saveConfig_(payload) {
  // payload は JSON文字列。妥当性を軽く確認して保存する。
  JSON.parse(payload);
  PropertiesService.getScriptProperties().setProperty('PLUGIN_CONFIG', payload);
}

function loadConfig_() {
  const raw = getProp_('PLUGIN_CONFIG');
  if (!raw) throw new Error('PLUGIN_CONFIG が未設定です。プラグイン設定画面で一度保存してください。');
  return JSON.parse(raw);
}

function getProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (v == null) throw new Error('スクリプトプロパティ ' + key + ' が未設定です。');
  return v;
}

function parseRequest_(e) {
  // kintone proxy は form-encoded で送るため e.parameter を優先。
  if (e && e.parameter && (e.parameter.action || e.parameter.secret)) {
    return e.parameter;
  }
  // 念のため JSON ボディにも対応
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      /* fallthrough */
    }
  }
  return {};
}

function escapeQuery_(s) {
  return String(s == null ? '' : s).replace(/"/g, '\\"');
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ============================================================================
// トリガー設定ヘルパー（GASエディタから手動実行）
// ============================================================================

/**
 * PLUGIN_CONFIG の schedule 設定に従って scheduledSend の時間主導トリガーを再作成する。
 * プラグインで設定を保存した後、このGAS関数を一度手動実行してください。
 */
function setupTrigger() {
  // 既存の scheduledSend トリガーを削除
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'scheduledSend') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const config = loadConfig_();
  const sched = config.schedule || {};
  const hour = Number(sched.hour) || 9;

  let builder = ScriptApp.newTrigger('scheduledSend').timeBased();
  if (sched.frequency === 'weekly') {
    const weekday = ScriptApp.WeekDay[sched.weekday] || ScriptApp.WeekDay.MONDAY;
    builder = builder.onWeekDay(weekday).atHour(hour);
  } else {
    builder = builder.everyDays(1).atHour(hour);
  }
  builder.create();
  console.log('トリガーを設定しました: ' + sched.frequency + ' ' + hour + '時');
}
