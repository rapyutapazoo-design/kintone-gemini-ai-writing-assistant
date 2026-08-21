(function (PLUGIN_ID) {
  'use strict';

  // ---- DOM参照 -------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);

  const els = {
    form: $('.js-submit-settings'),
    cancel: $('.js-cancel-button'),
    endpoint: $('.js-gas-endpoint'),
    secret: $('.js-shared-secret'),
    to: $('.js-to'),
    cc: $('.js-cc'),
    bcc: $('.js-bcc'),
    subject: $('.js-subject'),
    bodyHeader: $('.js-body-header'),
    bodyFooter: $('.js-body-footer'),
    includeAll: $('.js-include-all'),
    excludeFields: $('.js-exclude-fields'),
    attachmentFields: $('.js-attachment-fields'),
    condType: $('.js-cond-type'),
    condFieldRow: $('.js-cond-field-row'),
    condField: $('.js-cond-field'),
    condValue: $('.js-cond-value'),
    flagField: $('.js-flag-field'),
    flagValue: $('.js-flag-value'),
    sentDateTimeField: $('.js-sent-datetime-field'),
    schedFreq: $('.js-sched-freq'),
    schedWeekdayRow: $('.js-sched-weekday-row'),
    schedWeekday: $('.js-sched-weekday'),
    schedHour: $('.js-sched-hour'),
  };

  for (const [key, el] of Object.entries(els)) {
    if (!el) {
      throw new Error(`必須となるDOM要素が存在しません: ${key}`);
    }
  }

  // ---- ユーティリティ ------------------------------------------------------
  // カンマ・改行区切りの文字列を配列へ
  const parseList = (text) =>
    (text || '')
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const setVal = (el, val) => {
    if (val !== undefined && val !== null) el.value = val;
  };

  // 条件・スケジュールの表示切り替え
  const refreshVisibility = () => {
    els.condFieldRow.style.display =
      els.condType.value === 'field' ? '' : 'none';
    els.schedWeekdayRow.style.display =
      els.schedFreq.value === 'weekly' ? '' : 'none';
  };
  els.condType.addEventListener('change', refreshVisibility);
  els.schedFreq.addEventListener('change', refreshVisibility);

  // ---- 既存設定の読み込み --------------------------------------------------
  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID);
  let saved = {};
  if (rawConfig.mail_config) {
    try {
      saved = JSON.parse(rawConfig.mail_config);
    } catch (e) {
      console.error('設定の読み込みに失敗しました。', e);
    }
  }

  setVal(els.endpoint, saved.endpoint);
  // シークレットはProxyConfigに保存され取得できないため常に空（再入力で上書き）。
  els.to.value = (saved.to || []).join(', ');
  els.cc.value = (saved.cc || []).join(', ');
  els.bcc.value = (saved.bcc || []).join(', ');
  setVal(els.subject, saved.subjectTemplate);
  setVal(els.bodyHeader, saved.bodyHeader);
  setVal(els.bodyFooter, saved.bodyFooter);
  els.includeAll.checked = saved.includeAllFields !== false;
  els.excludeFields.value = (saved.excludeFields || []).join(', ');
  els.attachmentFields.value = (saved.attachmentFields || []).join(', ');
  if (saved.condition) {
    setVal(els.condType, saved.condition.type || 'status');
    setVal(els.condField, saved.condition.fieldCode);
    setVal(els.condValue, saved.condition.matchValue);
  }
  setVal(els.flagField, saved.sentFlagField);
  setVal(els.flagValue, saved.sentFlagValue || '送信済み');
  setVal(els.sentDateTimeField, saved.sentDateTimeField);
  if (saved.schedule) {
    setVal(els.schedFreq, saved.schedule.frequency || 'weekly');
    setVal(els.schedWeekday, saved.schedule.weekday || 'MONDAY');
    setVal(els.schedHour, saved.schedule.hour);
  }
  refreshVisibility();

  // ---- 保存処理 ------------------------------------------------------------
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();

    const endpoint = els.endpoint.value.trim();
    const secret = els.secret.value; // 空なら既存のProxyConfigを再利用
    const toList = parseList(els.to.value);

    if (!endpoint) {
      alert('GAS Web App URL を入力してください。');
      return;
    }
    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(endpoint)
    ) {
      if (
        !confirm(
          'GAS Web App URL が想定の形式（/exec で終わる）と異なります。このまま保存しますか？',
        )
      ) {
        return;
      }
    }
    if (toList.length === 0) {
      alert('TO（宛先）を1件以上入力してください。');
      return;
    }
    if (!els.flagField.value.trim()) {
      alert('送信済みフラグ フィールドコードを入力してください。');
      return;
    }

    const config = {
      endpoint: endpoint,
      to: toList,
      cc: parseList(els.cc.value),
      bcc: parseList(els.bcc.value),
      subjectTemplate: els.subject.value.trim(),
      bodyHeader: els.bodyHeader.value,
      bodyFooter: els.bodyFooter.value,
      includeAllFields: els.includeAll.checked,
      excludeFields: parseList(els.excludeFields.value),
      attachmentFields: parseList(els.attachmentFields.value),
      condition: {
        type: els.condType.value,
        fieldCode: els.condField.value.trim(),
        matchValue: els.condValue.value.trim(),
      },
      sentFlagField: els.flagField.value.trim(),
      sentFlagValue: els.flagValue.value.trim() || '送信済み',
      sentDateTimeField: els.sentDateTimeField.value.trim(),
      schedule: {
        frequency: els.schedFreq.value,
        weekday: els.schedWeekday.value,
        hour: Number(els.schedHour.value) || 0,
      },
    };

    // 1) シークレットが入力されていれば ProxyConfig を更新（秘匿保存）。
    //    GAS はリクエストヘッダーを読めないため、body フィールドとして秘匿する。
    const proceedAfterProxy = () => {
      // 2) GAS に最新設定を連携（定時送信時に GAS 側が参照するため）
      pushConfigToGas(endpoint, config, () => {
        // 3) kintone プラグイン設定として保存（シークレットは含めない）
        kintone.plugin.app.setConfig(
          { mail_config: JSON.stringify(config) },
          () => {
            alert('設定を保存しました。アプリを更新してください。');
            window.location.href = '../../flow?app=' + kintone.app.getId();
          },
        );
      });
    };

    if (secret) {
      kintone.plugin.app.setProxyConfig(
        endpoint,
        'POST',
        {},
        { secret: secret },
        proceedAfterProxy,
        (err) => {
          console.error(err);
          alert('接続設定（ProxyConfig）の保存中にエラーが発生しました。');
        },
      );
    } else {
      proceedAfterProxy();
    }
  });

  // GAS へ設定を連携（秘匿シークレットは ProxyConfig 側から自動付与される）
  function pushConfigToGas(endpoint, config, onDone) {
    kintone.plugin.app.proxy(
      PLUGIN_ID,
      endpoint,
      'POST',
      {},
      { action: 'saveConfig', payload: JSON.stringify(config) },
      (body, status) => {
        if (status < 200 || status >= 300) {
          console.error('GAS saveConfig 失敗', status, body);
          alert(
            'GASへの設定連携に失敗しました（ステータス: ' +
              status +
              '）。\nGASのURL・共有シークレット・デプロイ設定をご確認ください。設定自体はkintoneに保存します。',
          );
        }
        onDone();
      },
      (err) => {
        console.error(err);
        alert(
          'GASへの設定連携でエラーが発生しました。\nGASのURL・デプロイ設定をご確認ください。設定自体はkintoneに保存します。',
        );
        onDone();
      },
    );
  }

  els.cancel.addEventListener('click', () => {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
