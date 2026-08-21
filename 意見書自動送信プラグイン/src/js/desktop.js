(function (PLUGIN_ID) {
  'use strict';

  // ---- 設定読み込み --------------------------------------------------------
  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID);
  if (!rawConfig.mail_config) {
    // 未設定時は何もしない（プラグイン設定画面で設定を促す）
    return;
  }
  let CONFIG;
  try {
    CONFIG = JSON.parse(rawConfig.mail_config);
  } catch (e) {
    console.error('メール送信プラグイン: 設定の解析に失敗しました。', e);
    return;
  }

  const BTN_STYLE = `
    display: inline-flex; align-items: center; justify-content: center;
    padding: 8px 16px; color: #fff;
    background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
    border: none; border-radius: 20px;
    cursor: pointer; font-weight: bold; font-size: 14px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;

  const MAIL_ICON = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: text-bottom; margin-right: 8px;">
      <path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1.4 2L12 12.2 19.6 7H4.4Z" fill="#fff"/>
    </svg>`;

  // ---- ボタン表示 ----------------------------------------------------------
  const EVENTS_DETAIL = [
    'app.record.detail.show',
    'mobile.app.record.detail.show',
  ];

  kintone.events.on(EVENTS_DETAIL, function (event) {
    const isMobile = event.type.startsWith('mobile.');
    const space = getButtonSpace(isMobile);
    if (!space) return event;

    // 二重描画防止
    if (document.getElementById('mail-send-btn')) return event;

    const btn = document.createElement('button');
    btn.id = 'mail-send-btn';
    btn.innerHTML = MAIL_ICON + 'メール送信';
    btn.style = BTN_STYLE;
    if (isMobile) {
      btn.style.width = '100%';
      btn.style.marginBottom = '10px';
    }
    btn.onclick = function (e) {
      e.preventDefault();
      openConfirmDialog(event.record);
    };
    space.appendChild(btn);
    return event;
  });

  function getButtonSpace(isMobile) {
    if (isMobile) {
      return kintone.mobile.app.record.getHeaderSpaceElement();
    }
    return kintone.app.record.getHeaderMenuSpaceElement();
  }

  // ---- 件名プレビュー（GAS側と同じ差し込みロジックの簡易版） ----------------
  function buildSubjectPreview(record) {
    const recordId =
      record && record.$id && record.$id.value ? record.$id.value : '';
    let subject =
      CONFIG.subjectTemplate ||
      '意見書レコードのお知らせ（レコード #' + recordId + '）';
    subject = subject.replace(/\{\$id\}/g, recordId);
    subject = subject.replace(/\{([^}]+)\}/g, (match, code) => {
      const field = record[code];
      if (!field) return match;
      const v = field.value;
      if (Array.isArray(v)) return v.join(', ');
      return v == null ? '' : String(v);
    });
    return subject;
  }

  // ---- 確認ダイアログ ------------------------------------------------------
  function openConfirmDialog(record) {
    const existing = document.getElementById('mail-confirm-overlay');
    if (existing) existing.remove();

    const to = (CONFIG.to || []).join(', ') || '(未設定)';
    const cc = (CONFIG.cc || []).join(', ');
    const bcc = (CONFIG.bcc || []).join(', ');
    const subject = buildSubjectPreview(record);

    const overlay = document.createElement('div');
    overlay.id = 'mail-confirm-overlay';
    overlay.className = 'mail-confirm-overlay';

    const esc = (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    overlay.innerHTML = `
      <div class="mail-confirm-modal">
        <h3 class="mail-confirm-title">この内容でメールを送信しますか？</h3>
        <dl class="mail-confirm-list">
          <dt>TO</dt><dd>${esc(to)}</dd>
          ${cc ? `<dt>CC</dt><dd>${esc(cc)}</dd>` : ''}
          ${bcc ? `<dt>BCC</dt><dd>${esc(bcc)}</dd>` : ''}
          <dt>件名</dt><dd>${esc(subject)}</dd>
        </dl>
        <p class="mail-confirm-note">本文はレコードの内容をもとにGASが生成します。</p>
        <div class="mail-confirm-actions">
          <button type="button" class="mail-btn-cancel kintoneplugin-button-dialog-cancel">キャンセル</button>
          <button type="button" class="mail-btn-ok kintoneplugin-button-dialog-ok">送信する</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.mail-btn-cancel').onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
    overlay.querySelector('.mail-btn-ok').onclick = () => {
      close();
      sendMail(record);
    };
  }

  // ---- 送信実行（GAS呼び出し） ---------------------------------------------
  function sendMail(record) {
    const recordId = record.$id.value;
    const appId = kintone.app.getId() || kintone.mobile.app.getId();
    const endpoint = CONFIG.endpoint;

    if (!endpoint) {
      alert(
        'GASのエンドポイントが未設定です。プラグイン設定を確認してください。',
      );
      return;
    }

    showOverlay('メールを送信しています...');

    // secret は ProxyConfig 側から自動付与される
    kintone.plugin.app.proxy(
      PLUGIN_ID,
      endpoint,
      'POST',
      {},
      { action: 'sendOne', recordId: recordId, appId: appId },
      (body, status) => {
        hideOverlay();
        let result = {};
        try {
          result = JSON.parse(body);
        } catch {
          /* GASがHTML等を返した場合 */
        }
        if (status >= 200 && status < 300 && result.ok) {
          alert('メールを送信しました。ページを更新します。');
          location.reload();
        } else {
          const msg = result.error || body || 'ステータス ' + status;
          alert('送信に失敗しました。\n' + msg);
        }
      },
      (err) => {
        hideOverlay();
        console.error(err);
        alert('送信リクエストでエラーが発生しました。\n' + err);
      },
    );
  }

  // ---- ローディング表示 ----------------------------------------------------
  function showOverlay(text) {
    if (document.getElementById('mail-loading-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'mail-loading-overlay';
    overlay.className = 'mail-loading-overlay';
    overlay.innerHTML =
      '<div class="mail-spinner"></div><div class="mail-loading-text">' +
      text +
      '</div>';
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    const overlay = document.getElementById('mail-loading-overlay');
    if (overlay) overlay.remove();
  }
})(kintone.$PLUGIN_ID);
