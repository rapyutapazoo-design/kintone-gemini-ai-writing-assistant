(function (PLUGIN_ID) {
  'use strict';

  const formEl = document.querySelector('.js-submit-settings');
  const cancelButtonEl = document.querySelector('.js-cancel-button');
  const apiKeyEl = document.querySelector('.js-text-apikey');
  const modelEl = document.querySelector('.js-text-model');

  if (!(formEl && cancelButtonEl && apiKeyEl && modelEl)) {
    throw new Error('必須となるDOM要素が存在しません。');
  }

  // 既存の設定を読み込む
  const config = kintone.plugin.app.getConfig(PLUGIN_ID);
  if (config.gemini_model) {
    modelEl.value = config.gemini_model;
  }

  // kintoneの仕様上、ProxyConfigに保存された値（APIキー等）は取得できないため
  // APIキーのフィールドは常に空として扱い、再設定時に上書きさせる動作とします。

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();

    const apiKey = apiKeyEl.value;
    const modelName = modelEl.value;

    if (!apiKey) {
      alert('Gemini APIキーを入力してください。');
      return;
    }
    if (!modelName) {
      alert('Geminiのモデル名を入力してください。');
      return;
    }

    // Proxy API経由で送る通信先のベースURL（前方一致）
    const proxyUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
    const headers = {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json'
    };

    // kintoneのプロキシ設定にAPIキー等を保存
    kintone.plugin.app.setProxyConfig(proxyUrl, 'POST', headers, {}, () => {
      // プラグインの通常設定にモデル名を保存（こちらはフロントから取得可能）
      kintone.plugin.app.setConfig({ gemini_model: modelName }, () => {
        alert('設定を保存しました。アプリを更新設定してください！');
        window.location.href = '../../flow?app=' + kintone.app.getId();
      });
    }, (error) => {
      console.error(error);
      alert('プロキシ設定の保存中にエラーが発生しました。');
    });
  });

  cancelButtonEl.addEventListener('click', () => {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})(kintone.$PLUGIN_ID);
