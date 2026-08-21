(function () {
    "use strict";

    // ---------------------------------------------------------
    // 1. アイコンとスタイルの定義
    // ---------------------------------------------------------
    const GEMINI_ICON = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px; margin-bottom: 2px;">
        <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" fill="#fff"/>
    </svg>`;

    const ICONS = {
        PLUS_PC: `<span style="display:inline-block; width:20px; height:20px; line-height:20px; text-align:center; background-color:#eee; color:#666; border-radius:50%; font-weight:bold; border:1px solid #ccc; margin: 0 4px;">＋</span>`,
        // モバイル用 追加ボタン（白背景・青文字）
        PLUS_MOBILE: `<span style="display:inline-block; padding:3px 8px; background-color:#fff; color:#2062bf; border:1px solid #2062bf; border-radius:4px; font-weight:bold; font-size:12px; margin: 0 4px;"><span style="font-size:14px; vertical-align:middle;">⊕</span> 追加</span>`,
        SAVE_BTN: `<span style="display:inline-block; padding:3px 10px; background:#3498db; color:#fff; border-radius:3px; font-size:12px; font-weight:bold; margin: 0 4px;">保存</span>`,
        GEMINI_BTN: `<span style="display: inline-block; padding: 4px 10px; color: #fff; background: linear-gradient(135deg, #4285F4 0%, #2962FF 100%); border-radius: 12px; font-size: 11px; font-weight: bold; margin: 0 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); vertical-align: middle;">${GEMINI_ICON}Geminiで件名・本文を作成</span>`
    };

    // ---------------------------------------------------------
    // 2. HTML生成関数
    // ---------------------------------------------------------
    function createGuideHTML(isMobile, isAccordion) {
        const plusIcon = isMobile ? ICONS.PLUS_MOBILE : ICONS.PLUS_PC;
        // モバイル版の保存ボタン位置は「右下」
        const savePosition = isMobile ? '右下の' : '左上の';

        const contentHTML = `
            <div style="font-size: 13px; color: #333; line-height: 1.8;">
                <div style="margin-bottom: 10px;">
                    <strong>① 新規作成：</strong><br>
                    ${isMobile ? '画面右下の' : '画面右上の'} ${plusIcon} ボタンを押してください。
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>② 内容の入力（AI利用も可）：</strong><br>
                    ご自身で手入力するか、AIに下書きさせることも可能です。<br>
                    <div style="margin-top: 6px; padding: 8px; background-color: #eef4fc; border-left: 4px solid #2062bf; border-radius: 2px;">
                        <strong style="color: #2062bf;">💡 AIを使う場合の手順</strong><br>
                        1. 先に<strong>「AIへのプロンプト」</strong>に入力する<br>
                        2. その後、${ICONS.GEMINI_BTN} ボタンを押す
                    </div>
                </div>
                <div style="margin-bottom: 10px; padding: 10px; background-color: #fff0f0; border-left: 4px solid #d32f2f; border-radius: 2px;">
                    <strong style="color: #d32f2f;">⚠️ 注意事項</strong><br>
                    入力した内容は、文章生成のため<strong>外部のAIサービス（Google Gemini）に送信されます。</strong><br>
                    氏名・住所・電話番号・部屋番号・口座情報などの<strong style="color: #d32f2f;">個人情報は入力しないでください。</strong>
                </div>
                <div>
                    <strong>③ 保存：</strong><br>
                    内容を確認し、${savePosition} ${ICONS.SAVE_BTN} ボタンを押して提出完了です。
                </div>
            </div>
        `;

        const containerStyle = "background-color: #fff; border-radius: 8px; border: 1px solid #e3e7e8; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;";

        // --- 一覧画面用（常時表示） ---
        if (!isAccordion) {
            const margin = isMobile ? "margin: 10px;" : "margin: 16px 16px 0 16px; padding: 15px 20px;";
            const innerPadding = isMobile ? "padding: 15px;" : "";

            return `
                <div id="my-app-guide-container" style="${containerStyle} ${margin} ${innerPadding}">
                    <h2 style="margin-top: 0; margin-bottom: 12px; font-size: 16px; font-weight: bold; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                        📝 意見書・要望書アプリの使い方
                    </h2>
                    ${contentHTML}
                </div>
            `;
        }
        // --- フォーム画面用（開閉式・モバイル入力画面） ---
        else {
            const toggleId = 'guide-toggle-' + Date.now() + Math.floor(Math.random() * 1000);
            const contentId = 'guide-content-' + Date.now() + Math.floor(Math.random() * 1000);

            return `
                <div style="${containerStyle} margin: 10px 10px 20px 10px;">
                    <div id="${toggleId}" style="padding: 12px 15px; background: #f7f9fa; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: #2062bf; font-size: 14px;">
                        <span>📝 アプリの使い方を見る</span>
                        <span style="font-size: 12px; color: #888;">▼</span>
                    </div>
                    <div id="${contentId}" style="display: none; padding: 15px; border-top: 1px solid #eee;">
                        ${contentHTML}
                    </div>
                </div>
            `;
        }
    }

    // ---------------------------------------------------------
    // 3. PC版のイベント処理
    // ---------------------------------------------------------
    kintone.events.on(['app.record.index.show', 'app.record.create.show', 'app.record.edit.show', 'app.record.detail.show'], function (event) {
        if (document.getElementById('my-guide-pc-container')) return;

        let targetEl = null;
        if (event.type === 'app.record.index.show') {
            targetEl = kintone.app.getHeaderSpaceElement();
        } else {
            targetEl = document.querySelector('.gaia-argoui-app-view');
        }

        if (targetEl) {
            const div = document.createElement('div');
            div.id = 'my-guide-pc-container';
            if (event.type !== 'app.record.index.show') {
                div.innerHTML = createGuideHTML(false, false);
                targetEl.insertBefore(div, targetEl.firstChild);
            } else {
                targetEl.innerHTML = createGuideHTML(false, false);
                if (targetEl.firstElementChild) targetEl.firstElementChild.style.margin = "0 0 20px 0";
            }
        }
    });

    // ---------------------------------------------------------
    // 4. スマホ版のイベント処理
    // ---------------------------------------------------------

    // ■ A. 一覧画面 (index): ヘッダーに「常時表示」
    kintone.events.on('mobile.app.record.index.show', function (event) {
        if (document.getElementById('my-mobile-guide-index')) return;

        const headerSpace = kintone.mobile.app.getHeaderSpaceElement();
        if (headerSpace) {
            const wrapper = document.createElement('div');
            wrapper.id = 'my-mobile-guide-index';
            wrapper.innerHTML = createGuideHTML(true, false);
            headerSpace.appendChild(wrapper);
        }
    });

    // ■ B. 詳細・作成・編集画面: フォームの上に「開閉式表示」
    const MOBILE_FORM_EVENTS = ['mobile.app.record.create.show', 'mobile.app.record.edit.show', 'mobile.app.record.detail.show'];

    kintone.events.on(MOBILE_FORM_EVENTS, function (event) {
        // 既に表示済みなら終了
        if (document.getElementById('my-mobile-guide-form')) return;

        // 挿入するHTML要素を作成
        const wrapper = document.createElement('div');
        wrapper.id = 'my-mobile-guide-form';
        wrapper.innerHTML = createGuideHTML(true, true);

        // 開閉ロジック
        const toggleBtn = wrapper.querySelector('[id^="guide-toggle-"]');
        const contentDiv = wrapper.querySelector('[id^="guide-content-"]');
        if (toggleBtn && contentDiv) {
            toggleBtn.onclick = function () {
                const isClosed = contentDiv.style.display === 'none';
                contentDiv.style.display = isClosed ? 'block' : 'none';
                this.querySelector('span:last-child').innerText = isClosed ? '▲' : '▼';
            };
        }

        // モバイル版のメインコンテンツエリアへの挿入（MutationObserverを使用）
        const targetSelector = '.gaia-mobile-v2-view-panel-content';
        const mobileContent = document.querySelector(targetSelector);

        if (mobileContent) {
            if (!document.getElementById('my-mobile-guide-form')) {
                mobileContent.insertBefore(wrapper, mobileContent.firstChild);
            }
        } else {
            const observer = new MutationObserver((mutations, obs) => {
                const content = document.querySelector(targetSelector);
                if (content) {
                    if (!document.getElementById('my-mobile-guide-form')) {
                        content.insertBefore(wrapper, content.firstChild);
                    }
                    obs.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // 10秒後にフォールバックとしてObserverを停止する（無限監視防止）
            setTimeout(() => observer.disconnect(), 10000);
        }
    });

})();