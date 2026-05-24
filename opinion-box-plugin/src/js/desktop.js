(function (PLUGIN_ID) {
  "use strict";

  // モデル名の取得
  const config = kintone.plugin.app.getConfig(PLUGIN_ID);
  const GEMINI_MODEL = config.gemini_model || "gemini-2.5-flash";

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
  const EVENTS_EDIT = ['app.record.create.show', 'app.record.edit.show', 'mobile.app.record.create.show', 'mobile.app.record.edit.show'];
  const EVENTS_DETAIL = ['app.record.detail.show', 'mobile.app.record.detail.show'];

  kintone.events.on(EVENTS_EDIT, function (event) {
    const isMobile = event.type.startsWith('mobile.');
    const appManager = isMobile ? kintone.mobile.app : kintone.app;
    const space = appManager.record.getSpaceElement('btn_space_draft');
    if (!space) return;
    space.innerHTML = '';

    const btn = document.createElement('button');
    btn.innerHTML = GEMINI_LOGO_SVG + 'Geminiで件名・本文を作成';
    btn.style = BTN_STYLE;
    if (isMobile) { btn.style.width = "100%"; btn.style.marginBottom = "10px"; }

    btn.onclick = function (e) { e.preventDefault(); generateDraft(isMobile); };
    space.appendChild(btn);
  });

  kintone.events.on(EVENTS_DETAIL, function (event) {
    const isMobile = event.type.startsWith('mobile.');
    const appManager = isMobile ? kintone.mobile.app : kintone.app;
    const space = appManager.record.getSpaceElement('btn_space_summary');
    if (!space) return;
    space.innerHTML = '';

    const btnSummary = document.createElement('button');
    btnSummary.innerHTML = GEMINI_LOGO_SVG + 'Geminiで要約';
    btnSummary.style = BTN_STYLE;
    btnSummary.style.padding = "8px 16px";
    if (isMobile) { btnSummary.style.width = "100%"; btnSummary.style.marginBottom = "10px"; }

    btnSummary.onclick = function (e) { e.preventDefault(); generateSummary(event.record, isMobile); };
    space.appendChild(btnSummary);
  });

  // =========================================================
  // 4. AI処理ロジック
  // =========================================================
  async function generateDraft(isMobile) {
    const appManager = isMobile ? kintone.mobile.app : kintone.app;
    const recordData = appManager.record.get();
    const keyword = recordData.record.keyword_input.value;
    const lengthOption = recordData.record.length_option.value;

    if (!keyword) { alert("「AIへの指示・メモ」を入力してください。"); return; }

    let lengthInstruction = "200文字程度の簡潔な文章";
    if (lengthOption) {
      if (lengthOption.indexOf("400") !== -1) lengthInstruction = "400文字程度の標準的な文章";
      if (lengthOption.indexOf("600") !== -1) lengthInstruction = "600文字程度の詳細な文章";
    }

    const prompt = `あなたはマンション管理組合への意見書作成システムです。\n以下の【メモ】を元に、「件名」と「本文」を作成し、必ず**JSON形式**のみで出力してください。\n【出力フォーマット】\n{ "subject": "件名(20文字以内)", "body": "本文" }\n【本文の条件】\n1. 文字数目安: ${lengthInstruction}\n2. 挨拶文、署名は一切禁止。\n3. 「です・ます」調。\n【メモ】\n${keyword}`;

    showSpinner();

    try {
      const rawText = await callGeminiAPI(prompt, true);
      const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanText);

      const currentRecord = appManager.record.get();
      currentRecord.record.opinion_body.value = data.body;
      currentRecord.record.opinion_subject.value = data.subject;
      appManager.record.set(currentRecord);

    } catch (error) {
      console.error(error);
      alert("生成に失敗しました。\nAPIキーが設定されているか確認してください。\n" + error.message);
    } finally {
      hideSpinner();
    }
  }

  async function generateSummary(record, isMobile) {
    const opinion = record.opinion_body.value;
    const recordId = record.$id.value;
    const appId = (isMobile ? kintone.mobile.app : kintone.app).getId();

    if (!opinion) { alert("「意見内容」が空のため要約できません。"); return; }

    const prompt = `あなたはマンション管理組合の理事会資料作成担当です。\n以下の意見書の内容を、理事会資料として適切な長さに要約してください。\n\n【要約のルール】\n1. 具体的な行数制限は設けません。元の文章量や内容の複雑さに応じて、効率的に内容を把握できる適切な長さに調整してください。\n2. 短い意見は一言で簡潔に、複雑な背景がある意見は重要な詳細（日付、場所、経緯など）を漏らさないように要約してください。\n3. 冗長な表現は避け、事実関係を明確にしてください。\n4. 見出し（■など）と箇条書き（・）を用いて、人間が一目で読みやすいレイアウトで出力してください。\n\n【本文】\n${opinion}`;

    showSpinner();

    try {
      const resultText = await callGeminiAPI(prompt, false);
      const body = { app: appId, id: recordId, record: { ai_summary: { value: resultText } } };
      await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
      alert('要約が完了しました。ページを更新します。');
      location.reload();
    } catch (error) {
      console.error(error);
      alert("要約に失敗しました。\nAPIキーが設定されているか確認してください。\n" + error.message);
    } finally {
      hideSpinner();
    }
  }

  function callGeminiAPI(prompt, requireJson = true) {
    return new Promise((resolve, reject) => {
      // kintoneプロキシ経由でのリクエストURL
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
      const data = { 
        contents: [{ parts: [{ text: prompt }] }]
      };
      
      if (requireJson) {
        data.generationConfig = { responseMimeType: "application/json" };
      }

      // headerのx-goog-api-keyはプロキシ設定側で自動的に付与されます
      kintone.plugin.app.proxy(
        PLUGIN_ID,
        url,
        'POST',
        { 'Content-Type': 'application/json' },
        data,
        (body, status, headers) => {
          if (status >= 200 && status < 300) {
            try {
              const json = JSON.parse(body);
              if (json.candidates && json.candidates.length > 0) {
                resolve(json.candidates[0].content.parts[0].text);
              } else {
                reject(new Error('AIからの応答が空でした。'));
              }
            } catch (e) {
              reject(new Error('レスポンスの解析に失敗しました。'));
            }
          } else {
            try {
              const errorJson = JSON.parse(body);
              const errMsg = errorJson.error ? errorJson.error.message : 'Unknown Error';
              reject(new Error(`API Error ${status}: ${errMsg}`));
            } catch (e) {
              reject(new Error(`API Error ${status}`));
            }
          }
        },
        (err) => {
          reject(new Error('kintone proxy でエラーが発生しました。詳細: ' + err));
        }
      );
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
    const ring = document.createElement('div'); ring.className = 'spinner-ring';
    const star = document.createElement('div');
    star.className = 'spinner-star'; star.innerHTML = '✦';

    for (let i = 0; i < 6; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle';
      sparkle.style.setProperty('--tx', (Math.random() * 80 - 40) + 'px');
      sparkle.style.setProperty('--ty', (Math.random() * 80 - 40) + 'px');
      sparkle.style.width = (Math.random() * 4 + 2) + 'px';
      sparkle.style.height = sparkle.style.width;
      sparkle.style.animationDelay = (Math.random() * 1.5) + 's';
      container.appendChild(sparkle);
    }

    container.appendChild(ring); container.appendChild(star);
    const text = document.createElement('div');
    text.className = 'spinner-text'; text.innerText = 'Geminiが思考中です...';
    overlay.appendChild(container); overlay.appendChild(text);
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
