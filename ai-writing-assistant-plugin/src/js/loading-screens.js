/**
 * AI 生成中の全画面ローディング画面 デザイン集
 *
 * window.AIWritingLoading として公開する。他のスクリプトには依存しない。
 *  - DESIGNS / MODES / DEFAULT_DESIGN / DEFAULT_MODE
 *  - normalizeSettings(raw) / chooseDesign(settings, storageKey)
 *  - show(designId) / hide() / setText(text) / preview(designId)
 */
(function () {
  'use strict';

  // =========================================================
  // 1. 定数
  // =========================================================
  const DESIGNS = [
    {
      id: 'classic',
      label: 'クラシック',
      description: '従来のグラデーション背景と回転リング',
    },
    {
      id: 'claude-a',
      label: 'Claude風・クリーム',
      description: 'クリーム色の背景にテラコッタ色のスパークが回る',
    },
    {
      id: 'claude-b',
      label: '思考中シマー',
      description: 'ダーク背景で文字に光が流れ、文章が打ち込まれる',
    },
    {
      id: 'claude-c',
      label: '文章が組み上がる',
      description: '紙面に文章の行が書かれていく',
    },
    {
      id: 'claude-d',
      label: 'ニューラル',
      description: '光る接続網と脈打つオーブ',
    },
    {
      id: 'gemini-a',
      label: '暖色エディトリアル',
      description: '暖色のカードに原稿の行が書かれていく',
    },
    {
      id: 'gemini-b',
      label: 'ダーク Artifact',
      description: 'ダークなカードに光が走る',
    },
    {
      id: 'gemini-e',
      label: 'ミニマル・フローティングピル',
      description: '小さなピル型の表示で控えめに待つ',
    },
    {
      id: 'gemini-f',
      label: 'コズミック',
      description: '宇宙色のグラデーションと回転リング',
    },
  ];
  const MODES = ['fixed', 'random', 'sequential'];
  const DEFAULT_DESIGN = 'claude-a';
  const DEFAULT_MODE = 'fixed';

  const OVERLAY_ID = 'kintone-spinner-overlay';
  const TEXT_ID = 'kintone-spinner-text';
  const STYLE_ID = 'obp-loading-style';
  const CLASSIC_TEXT = 'AIが文章を作成中です…';
  const WORDS = [
    'Thinking',
    'Pondering',
    'Musing',
    'Cooking',
    'Baking',
    'Crafting',
    'Computing',
    'Reticulating',
    'Noodling',
    'Clauding',
  ];
  const WORD_INTERVAL = 2400;
  const FADE_MS = 300;
  const HIDE_MS = 500;

  const KNOWN_IDS = DESIGNS.map(function (d) {
    return d.id;
  });

  // =========================================================
  // 2. 設定の正規化・デザイン選択
  // =========================================================
  function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const mode = MODES.indexOf(src.mode) >= 0 ? src.mode : DEFAULT_MODE;
    const design =
      KNOWN_IDS.indexOf(src.design) >= 0 ? src.design : DEFAULT_DESIGN;

    let list = [];
    if (Array.isArray(src.designs)) {
      list = src.designs;
    } else if (typeof src.designs === 'string') {
      list = src.designs.split(',');
    }
    const designs = [];
    list.forEach(function (item) {
      const id = String(item).trim();
      if (KNOWN_IDS.indexOf(id) >= 0 && designs.indexOf(id) < 0) {
        designs.push(id);
      }
    });
    return {
      mode: mode,
      design: design,
      designs: designs.length > 0 ? designs : KNOWN_IDS.slice(),
    };
  }

  // localStorage が使えない場合のメモリ上フォールバック
  const memoryStore = {};

  function readStore(key) {
    try {
      const v = window.localStorage.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch {
      // localStorage 不可の場合はメモリ上の値を使う
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key)
      ? memoryStore[key]
      : null;
  }

  function writeStore(key, value) {
    memoryStore[key] = String(value);
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // 失敗してもメモリ上に保持済み
    }
  }

  function chooseDesign(settings, storageKey) {
    const s = normalizeSettings(settings);
    const key = String(storageKey || 'obp-loading');
    if (s.mode === 'random') {
      const last = readStore(key + ':last');
      let pool = s.designs;
      if (pool.length >= 2) {
        pool = pool.filter(function (id) {
          return id !== last;
        });
      }
      const picked = pool[Math.floor(Math.random() * pool.length)];
      writeStore(key + ':last', picked);
      return picked;
    }
    if (s.mode === 'sequential') {
      const n = parseInt(readStore(key + ':seq'), 10);
      const idx = isNaN(n) || n < 0 ? 0 : n % s.designs.length;
      writeStore(key + ':seq', (idx + 1) % s.designs.length);
      return s.designs[idx];
    }
    return s.design;
  }

  // =========================================================
  // 3. CSS（すべて .obp-ld-<id> 配下にスコープ）
  // =========================================================
  const DATA = (function () {
    const SANS =
      "-apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', 'Segoe UI', Meiryo, sans-serif";
    const SERIF =
      "Georgia, 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif";

    const STREAMS_GEMINI = [
      'Chocolat Orange KitKat is seriously delicious~',
      'Between Claude, ChatGPT, and Gemini, which one do you like best?',
      'Are you a dog person or a cat person?',
      "I'm craving a strawberry Pon de Ring donut.",
      'My favorite song is "This Is the Greatest Show."',
    ];
    const STREAMS_CLAUDE_B = [
      '拝啓　平素より当マンションの運営にご理解とご協力を賜り、誠にありがとうございます。 当マンションではキントーンを用いたデジタル化を推進しています。',
      "The orange chocolate flavor of KitKat is delicious, so please give it a try! Also, its color looks a lot like Claude's, which makes it kind of cute!",
    ];

    const BASE_CSS = `
.obp-ld { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box; overflow: hidden; text-align: center; transition: opacity 0.4s ease; }
.obp-ld, .obp-ld *, .obp-ld *::before, .obp-ld *::after { box-sizing: border-box; }
.obp-ld #kintone-spinner-text { transition: opacity 0.25s ease; }
.obp-ld.obp-ld-fading #kintone-spinner-text { opacity: 0; }
.obp-ld .obp-ld-stream { width: 100%; margin-top: 10px; padding: 9px 12px; border-radius: 9px; font-family: Menlo, Consolas, 'Courier New', monospace; font-size: 11.5px; line-height: 1.5; text-align: left; min-height: 44px; display: flex; align-items: center; }
.obp-ld .obp-ld-stream-light { background: rgba(217, 119, 87, 0.08); border: 1px solid rgba(217, 119, 87, 0.25); color: #4a453e; }
.obp-ld .obp-ld-stream-dark { background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(217, 119, 87, 0.35); color: #eae4d9; }
.obp-ld .obp-ld-stream-cursor { display: inline-block; width: 6px; height: 13px; background: #d97757; margin-left: 3px; vertical-align: middle; animation: obpld-stream-blink 0.9s steps(2, start) infinite; }
@keyframes obpld-stream-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.obp-ld .obp-ld-preview-close { position: fixed; top: 16px; right: 16px; z-index: 2; padding: 8px 18px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.5); background: rgba(20, 20, 20, 0.78); color: #fff; font: 600 13px/1.2 ${SANS}; cursor: pointer; }
.obp-ld .obp-ld-preview-close:hover { background: rgba(20, 20, 20, 0.95); }
@media (prefers-reduced-motion: reduce) {
  .obp-ld, .obp-ld *, .obp-ld *::before, .obp-ld *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition: none !important; }
}
`;

    const CSS = {};

    CSS.classic = `
.obp-ld-classic { background: linear-gradient(-45deg, #6a11cb, #2575fc, #f77062, #fe5196); background-size: 400% 400%; animation: obpld-classic-bg 10s ease infinite; color: white; font-family: sans-serif; }
@keyframes obpld-classic-bg { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
.obp-ld-classic .spinner-container { position: relative; width: 100px; height: 100px; display: flex; justify-content: center; align-items: center; }
.obp-ld-classic .spinner-ring { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 50%; border: 2px solid transparent; background: linear-gradient(#fff, rgba(255,255,255,0.2)) border-box; -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: obpld-classic-spin 1.5s linear infinite; box-shadow: 0 0 15px rgba(255, 255, 255, 0.4); }
.obp-ld-classic .spinner-star { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); margin-left: 2px; font-size: 45px; color: white; animation: obpld-classic-pulse 2s ease-in-out infinite; filter: drop-shadow(0 0 10px rgba(255,255,255,0.9)); z-index: 10; line-height: 1; }
.obp-ld-classic .sparkle { position: absolute; background: white; border-radius: 50%; opacity: 0; animation: obpld-classic-sparkle 2s infinite; top: 50%; left: 50%; }
@keyframes obpld-classic-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes obpld-classic-pulse { 0%, 100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.9; } 50% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; text-shadow: 0 0 25px white; } }
@keyframes obpld-classic-sparkle { 0% { transform: translate(-50%, -50%) scale(0); opacity: 0; } 50% { opacity: 1; } 100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1); opacity: 0; } }
.obp-ld-classic .spinner-text { font-size: 18px; font-weight: bold; margin-top: 30px; letter-spacing: 1px; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
`;

    CSS['claude-a'] = `
.obp-ld-claude-a { padding: 24px; background: #faf9f5; color: #3d3929; font-family: ${SERIF}; }
.obp-ld-claude-a .spark { width: 72px; height: 72px; animation: obpld-claude-a-spin 6s linear infinite; }
.obp-ld-claude-a .spark path { fill: #d97757; transform-origin: 50% 50%; animation: obpld-claude-a-breath 2.4s ease-in-out infinite; }
.obp-ld-claude-a .spark path:nth-child(2n) { animation-delay: -0.6s; }
.obp-ld-claude-a .spark path:nth-child(3n) { animation-delay: -1.2s; }
@keyframes obpld-claude-a-spin { to { transform: rotate(360deg); } }
@keyframes obpld-claude-a-breath { 0%, 100% { transform: scale(0.82); opacity: 0.75; } 50% { transform: scale(1.08); opacity: 1; } }
.obp-ld-claude-a .msg { margin-top: 26px; min-height: 1.6em; font-size: 22px; letter-spacing: 0.04em; }
.obp-ld-claude-a .msg::after { content: ''; display: inline-block; width: 1.4em; text-align: left; animation: obpld-claude-a-dots 1.6s steps(4, end) infinite; }
.obp-ld-claude-a.obp-ld-fixed .msg::after { display: none; }
@keyframes obpld-claude-a-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75%, 100% { content: '...'; } }
@media (max-width: 600px) { .obp-ld-claude-a .spark { width: 56px; height: 56px; } .obp-ld-claude-a .msg { font-size: 18px; } }
`;

    CSS['claude-b'] = `
.obp-ld-claude-b { padding: 24px; background: #262624; color: #e8e6dc; font-family: ${SANS}; }
.obp-ld-claude-b .think { display: flex; align-items: center; gap: 12px; font-size: 20px; }
.obp-ld-claude-b .think svg { width: 26px; height: 26px; animation: obpld-claude-b-spin 4s linear infinite; }
.obp-ld-claude-b .think svg path { fill: #d97757; }
.obp-ld-claude-b .shimmer { min-height: 1.6em; background: linear-gradient(100deg, #8c897f 30%, #fff 50%, #8c897f 70%); background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: obpld-claude-b-shim 2.2s linear infinite; }
@keyframes obpld-claude-b-spin { to { transform: rotate(360deg); } }
@keyframes obpld-claude-b-shim { from { background-position: 150% 0; } to { background-position: -100% 0; } }
.obp-ld-claude-b .stream { margin-top: 30px; width: min(520px, 100%); text-align: left; font-size: 14px; line-height: 1.9; color: #a9a698; background: #1f1e1d; border: 1px solid #3a3836; border-radius: 12px; padding: 16px 18px; min-height: 112px; }
.obp-ld-claude-b .stream i { display: inline-block; width: 7px; height: 1em; background: #d97757; vertical-align: -2px; animation: obpld-claude-b-blink 1s steps(2) infinite; }
@keyframes obpld-claude-b-blink { 50% { opacity: 0; } }
@media (max-width: 600px) { .obp-ld-claude-b .think { font-size: 18px; } .obp-ld-claude-b .stream { font-size: 13px; padding: 14px; } }
`;

    CSS['claude-c'] = `
.obp-ld-claude-c { padding: 24px; background: radial-gradient(circle at 50% 30%, #f3ece0, #e6ddcc); color: #3d3929; font-family: ${SANS}; }
.obp-ld-claude-c .paper { width: min(360px, 92%); background: #fffdf8; border-radius: 14px; padding: 26px 24px 22px; box-shadow: 0 18px 50px rgba(61,57,41,0.18), 0 2px 6px rgba(61,57,41,0.1); text-align: left; position: relative; }
.obp-ld-claude-c .paper .ttl { height: 12px; width: 46%; border-radius: 6px; background: #d97757; margin-bottom: 20px; animation: obpld-claude-c-title 3.6s ease-in-out infinite; transform-origin: left; }
.obp-ld-claude-c .line { height: 9px; border-radius: 5px; background: #e9e3d5; margin-bottom: 11px; transform-origin: left; animation: obpld-claude-c-write 3.6s ease-in-out infinite; }
.obp-ld-claude-c .l1 { animation-delay: 0.2s; width: 100%; }
.obp-ld-claude-c .l2 { animation-delay: 0.5s; width: 94%; }
.obp-ld-claude-c .l3 { animation-delay: 0.8s; width: 98%; }
.obp-ld-claude-c .l4 { animation-delay: 1.1s; width: 62%; }
.obp-ld-claude-c .l5 { animation-delay: 1.4s; width: 80%; }
@keyframes obpld-claude-c-write { 0% { transform: scaleX(0); opacity: 0.2; } 45%, 80% { transform: scaleX(1); opacity: 1; background: #d8cfbb; } 100% { transform: scaleX(1); opacity: 0; } }
@keyframes obpld-claude-c-title { 0% { transform: scaleX(0); } 25%, 80% { transform: scaleX(1); } 100% { transform: scaleX(1); opacity: 0; } }
.obp-ld-claude-c .pen { position: absolute; right: -14px; bottom: -18px; width: 46px; height: 46px; border-radius: 50%; background: #d97757; display: grid; place-items: center; box-shadow: 0 6px 16px rgba(217,119,87,0.45); animation: obpld-claude-c-pen 1.8s ease-in-out infinite; }
.obp-ld-claude-c .pen svg { width: 22px; height: 22px; fill: #fff; }
@keyframes obpld-claude-c-pen { 0%, 100% { transform: translate(0, 0) rotate(0); } 50% { transform: translate(-10px, -6px) rotate(-8deg); } }
.obp-ld-claude-c .msg { margin-top: 34px; min-height: 1.6em; font-size: 19px; font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .obp-ld-claude-c .ttl, .obp-ld-claude-c .line { animation: none !important; opacity: 1; transform: none; } }
@media (max-width: 600px) { .obp-ld-claude-c .pen { right: -6px; } .obp-ld-claude-c .msg { font-size: 17px; } }
`;

    CSS['claude-d'] = `
.obp-ld-claude-d { padding: 24px; background: radial-gradient(ellipse at center, #14182b 0%, #0a0c18 100%); color: #dfe6ff; font-family: ${SANS}; }
.obp-ld-claude-d canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.obp-ld-claude-d .core { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; }
.obp-ld-claude-d .orb { width: 84px; height: 84px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffd7c4, #d97757 55%, #7a2f18); box-shadow: 0 0 40px 6px rgba(217,119,87,0.55), 0 0 90px 20px rgba(217,119,87,0.2); animation: obpld-claude-d-pulse 2.4s ease-in-out infinite; }
@keyframes obpld-claude-d-pulse { 0%, 100% { transform: scale(0.94); } 50% { transform: scale(1.08); } }
.obp-ld-claude-d .msg { margin-top: 30px; min-height: 1.6em; font-size: 18px; letter-spacing: 0.08em; text-shadow: 0 0 12px rgba(150,170,255,0.5); }
@media (max-width: 600px) { .obp-ld-claude-d .orb { width: 68px; height: 68px; } .obp-ld-claude-d .msg { font-size: 16px; } }
`;

    CSS['gemini-a'] = `
.obp-ld-gemini-a { background: rgba(34, 31, 27, 0.46); backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); font-family: ${SANS}; }
.obp-ld-gemini-a .cw-card { background: #faf8f5; border: 1px solid #e6e0d5; border-radius: 22px; padding: 34px 38px 28px; width: min(440px, calc(100vw - 32px)); box-shadow: 0 24px 60px rgba(28,25,21,0.22), 0 4px 16px rgba(28,25,21,0.08); display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; overflow: hidden; }
.obp-ld-gemini-a .cw-top-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #efeae1; overflow: hidden; }
.obp-ld-gemini-a .cw-top-bar::after { content: ''; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, #d97757, #e5987d, transparent); animation: obpld-gemini-a-slide 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
@keyframes obpld-gemini-a-slide { 0% { left: -40%; } 100% { left: 100%; } }
.obp-ld-gemini-a .cw-emblem-wrap { position: relative; width: 78px; height: 78px; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
.obp-ld-gemini-a .cw-halo { position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 50%; background: radial-gradient(circle, rgba(217,119,87,0.24) 0%, rgba(217,119,87,0) 70%); animation: obpld-gemini-a-halo 3s ease-in-out infinite; }
.obp-ld-gemini-a .cw-ring-subtle { position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px; border-radius: 50%; border: 1px dashed rgba(217,119,87,0.38); animation: obpld-gemini-a-spin 18s linear infinite; }
.obp-ld-gemini-a .cw-starburst-svg { width: 44px; height: 44px; z-index: 2; animation: obpld-gemini-a-breathe 4s cubic-bezier(0.22, 1, 0.36, 1) infinite; filter: drop-shadow(0 4px 12px rgba(217,119,87,0.35)); }
@keyframes obpld-gemini-a-halo { 0%, 100% { transform: scale(0.92); opacity: 0.7; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes obpld-gemini-a-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes obpld-gemini-a-breathe { 0%, 100% { transform: rotate(0deg) scale(0.95); } 50% { transform: rotate(90deg) scale(1.08); } }
.obp-ld-gemini-a #kintone-spinner-text { min-height: 1.45em; font-family: ${SERIF}; font-size: 18px; font-weight: 600; color: #1f1e1d; letter-spacing: 0.02em; margin-bottom: 18px; line-height: 1.45; }
.obp-ld-gemini-a .cw-manuscript-box { width: 100%; background: #f3efe8; border: 1px solid #e5dfd3; border-radius: 12px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; text-align: left; }
.obp-ld-gemini-a .cw-ms-header { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 600; color: #8c857b; letter-spacing: 0.04em; }
.obp-ld-gemini-a .cw-ms-line { height: 7px; border-radius: 999px; background: #e2dcd0; overflow: hidden; position: relative; }
.obp-ld-gemini-a .cw-ms-line.l1 { width: 55%; }
.obp-ld-gemini-a .cw-ms-line.l2 { width: 92%; }
.obp-ld-gemini-a .cw-ms-line.l3 { width: 78%; }
.obp-ld-gemini-a .cw-ms-line::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, #d97757 0%, #e6a087 60%, #e2dcd0 100%); transform-origin: left; animation: obpld-gemini-a-draft 2.8s ease-in-out infinite; }
.obp-ld-gemini-a .cw-ms-line.l2::after { animation-delay: 0.4s; }
.obp-ld-gemini-a .cw-ms-line.l3::after { animation-delay: 0.8s; }
@keyframes obpld-gemini-a-draft { 0% { transform: scaleX(0.1); opacity: 0.5; } 50% { transform: scaleX(1); opacity: 1; } 100% { transform: scaleX(0.2); opacity: 0.5; } }
@media (max-width: 600px) { .obp-ld-gemini-a .cw-card { padding: 28px 20px 22px; } }
`;

    CSS['gemini-b'] = `
.obp-ld-gemini-b { background: rgba(15, 15, 14, 0.64); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); font-family: ${SANS}; }
.obp-ld-gemini-b .cd-card { width: min(460px, calc(100vw - 32px)); background: #1c1b1a; border: 1px solid rgba(217,119,87,0.35); border-radius: 20px; padding: 26px 28px; color: #f4f1ea; box-shadow: 0 28px 70px rgba(0,0,0,0.55), 0 0 40px rgba(217,119,87,0.12); display: flex; flex-direction: column; gap: 18px; }
.obp-ld-gemini-b .cd-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 14px; }
.obp-ld-gemini-b .cd-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #e89b7e; letter-spacing: 0.03em; }
.obp-ld-gemini-b .cd-spark-icon { width: 22px; height: 22px; flex-shrink: 0; animation: obpld-gemini-b-breathe 3.2s ease-in-out infinite; }
@keyframes obpld-gemini-b-breathe { 0%, 100% { transform: rotate(0deg) scale(0.95); } 50% { transform: rotate(90deg) scale(1.1); } }
.obp-ld-gemini-b .cd-artifact-stage { background: #141413; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px 18px; position: relative; overflow: hidden; }
.obp-ld-gemini-b .cd-artifact-shimmer { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(110deg, transparent 25%, rgba(217,119,87,0.09) 50%, transparent 75%); background-size: 200% 100%; animation: obpld-gemini-b-sweep 2.6s linear infinite; pointer-events: none; }
@keyframes obpld-gemini-b-sweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.obp-ld-gemini-b .cd-doc-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.obp-ld-gemini-b .cd-doc-tag { font-family: Menlo, Consolas, monospace; font-size: 10px; padding: 2px 7px; border-radius: 4px; background: rgba(217,119,87,0.18); color: #e89b7e; border: 1px solid rgba(217,119,87,0.3); flex-shrink: 0; }
.obp-ld-gemini-b .cd-doc-bar { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.1); flex: 1; position: relative; overflow: hidden; }
.obp-ld-gemini-b .cd-doc-bar::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, #d97757, #f0b29a); border-radius: 999px; animation: obpld-gemini-b-bar 2.4s ease-in-out infinite; }
.obp-ld-gemini-b .cd-doc-row:nth-child(3) .cd-doc-bar::after { animation-delay: 0.35s; right: 15%; }
.obp-ld-gemini-b .cd-doc-row:nth-child(4) .cd-doc-bar::after { animation-delay: 0.7s; right: 32%; }
@keyframes obpld-gemini-b-bar { 0%, 100% { opacity: 0.35; transform: scaleX(0.45); transform-origin: left; } 50% { opacity: 0.95; transform: scaleX(1); transform-origin: left; } }
.obp-ld-gemini-b .cd-status-area { display: flex; flex-direction: column; gap: 6px; text-align: center; }
.obp-ld-gemini-b #kintone-spinner-text { min-height: 1.4em; font-size: 16px; font-weight: 600; color: #faf8f5; letter-spacing: 0.02em; }
@media (max-width: 600px) { .obp-ld-gemini-b .cd-card { padding: 20px 18px; } .obp-ld-gemini-b .cd-badge { font-size: 11px; } }
`;

    CSS['gemini-e'] = `
.obp-ld-gemini-e { background: rgba(250, 248, 245, 0.65); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); font-family: ${SANS}; }
.obp-ld-gemini-e .ms-pill-container { background: #1f1e1c; color: #faf8f5; border: 1px solid rgba(217,119,87,0.45); border-radius: 999px; padding: 14px 26px 14px 20px; display: inline-flex; align-items: center; gap: 14px; box-shadow: 0 20px 45px rgba(20,19,18,0.26), 0 0 0 6px rgba(217,119,87,0.12); max-width: calc(100vw - 32px); }
.obp-ld-gemini-e .ms-icon-badge { width: 38px; height: 38px; border-radius: 50%; background: rgba(217,119,87,0.16); border: 1px solid rgba(217,119,87,0.4); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.obp-ld-gemini-e .ms-icon-badge svg { animation: obpld-gemini-e-spin 6s linear infinite; }
@keyframes obpld-gemini-e-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.obp-ld-gemini-e .ms-text-col { display: flex; flex-direction: column; gap: 2px; text-align: left; min-width: 0; }
.obp-ld-gemini-e #kintone-spinner-text { min-height: 1.4em; font-size: 15px; font-weight: 600; background: linear-gradient(90deg, #faf8f5 0%, #e89b7e 40%, #ffffff 55%, #faf8f5 100%); background-size: 200% auto; color: transparent; -webkit-background-clip: text; background-clip: text; animation: obpld-gemini-e-shimmer 2.4s linear infinite; }
@keyframes obpld-gemini-e-shimmer { 0% { background-position: 200% center; } 100% { background-position: 0% center; } }
.obp-ld-gemini-e .ms-meta-text { font-size: 11px; color: #9e988e; }
.obp-ld-gemini-e .ms-wave-bars { display: flex; align-items: center; gap: 3px; margin-left: 6px; }
.obp-ld-gemini-e .ms-wave-bar { width: 3px; height: 14px; border-radius: 999px; background: #d97757; animation: obpld-gemini-e-wave 1s ease-in-out infinite; }
.obp-ld-gemini-e .ms-wave-bar:nth-child(2) { animation-delay: 0.15s; height: 20px; }
.obp-ld-gemini-e .ms-wave-bar:nth-child(3) { animation-delay: 0.3s; height: 12px; }
.obp-ld-gemini-e .ms-wave-bar:nth-child(4) { animation-delay: 0.45s; height: 18px; }
@keyframes obpld-gemini-e-wave { 0%, 100% { transform: scaleY(0.45); opacity: 0.5; } 50% { transform: scaleY(1); opacity: 1; } }
@media (max-width: 600px) { .obp-ld-gemini-e .ms-pill-container { padding: 12px 18px 12px 14px; gap: 10px; } .obp-ld-gemini-e .ms-meta-text { max-width: 46vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
`;

    CSS['gemini-f'] = `
.obp-ld-gemini-f { background: linear-gradient(-45deg, #181524, #2b1e38, #592d36, #b85d43, #242f49); background-size: 400% 400%; animation: obpld-gemini-f-bg 12s ease infinite; color: #faf8f5; font-family: ${SANS}; }
@keyframes obpld-gemini-f-bg { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
.obp-ld-gemini-f .ci-center-group { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; padding: 24px; max-width: 100%; }
.obp-ld-gemini-f .ci-gyro-container { position: relative; width: 116px; height: 116px; display: flex; align-items: center; justify-content: center; }
.obp-ld-gemini-f .ci-ring-outer { position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 50%; border: 2px solid transparent; background: linear-gradient(135deg, #f4a285, rgba(255,255,255,0.08)) border-box; -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: obpld-gemini-f-spin 2.4s linear infinite; box-shadow: 0 0 24px rgba(217,119,87,0.35); }
.obp-ld-gemini-f .ci-ring-inner { position: absolute; top: 14px; left: 14px; right: 14px; bottom: 14px; border-radius: 50%; border: 1.5px dashed rgba(255,255,255,0.35); animation: obpld-gemini-f-spin 6s linear infinite reverse; }
@keyframes obpld-gemini-f-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.obp-ld-gemini-f .ci-star-center { z-index: 5; animation: obpld-gemini-f-breathe 3s ease-in-out infinite; filter: drop-shadow(0 0 16px rgba(244,162,133,0.85)); }
@keyframes obpld-gemini-f-breathe { 0%, 100% { transform: rotate(0deg) scale(0.92); } 50% { transform: rotate(90deg) scale(1.1); } }
.obp-ld-gemini-f .ci-title-pill { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 14px 28px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); max-width: calc(100vw - 32px); }
.obp-ld-gemini-f #kintone-spinner-text { min-height: 1.4em; font-size: 17px; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 4px; }
@media (max-width: 600px) { .obp-ld-gemini-f .ci-title-pill { padding: 12px 16px; } .obp-ld-gemini-f .ci-gyro-container { width: 96px; height: 96px; } }
`;

    // =========================================================
    // 4. DOM（固定の静的 HTML のみ。外部入力は入れない）
    // =========================================================
    const SPARK_8 =
      '<path d="M50 4 L55 40 L50 50 L45 40Z"/><path d="M50 96 L45 60 L50 50 L55 60Z"/>' +
      '<path d="M4 50 L40 45 L50 50 L40 55Z"/><path d="M96 50 L60 55 L50 50 L60 45Z"/>' +
      '<path d="M17 17 L43 41 L50 50 L41 43Z"/><path d="M83 83 L57 59 L50 50 L59 57Z"/>' +
      '<path d="M83 17 L59 43 L50 50 L57 41Z"/><path d="M17 83 L41 57 L50 50 L43 59Z"/>';

    const CROSS_LINES =
      '<line x1="32" y1="6" x2="32" y2="58"/><line x1="6" y1="32" x2="58" y2="32"/>' +
      '<line x1="14" y1="14" x2="50" y2="50"/><line x1="50" y1="14" x2="14" y2="50"/>';

    const STREAM_TEXT =
      '<span class="obp-ld-stream-text"></span><span class="obp-ld-stream-cursor"></span>';

    function classicHtml() {
      let sparkles = '';
      for (let i = 0; i < 6; i++) {
        const size = (Math.random() * 4 + 2).toFixed(1);
        sparkles +=
          '<div class="sparkle" style="--tx:' +
          (Math.random() * 80 - 40).toFixed(1) +
          'px;--ty:' +
          (Math.random() * 80 - 40).toFixed(1) +
          'px;width:' +
          size +
          'px;height:' +
          size +
          'px;animation-delay:' +
          (Math.random() * 1.5).toFixed(2) +
          's"></div>';
      }
      return (
        '<div class="spinner-container">' +
        sparkles +
        '<div class="spinner-ring"></div><div class="spinner-star">✦</div></div>' +
        '<div id="kintone-spinner-text" class="spinner-text"></div>'
      );
    }

    const TEXT_DIV = '<div id="kintone-spinner-text" class="msg"></div>';

    const HTML = {
      classic: classicHtml,
      'claude-a': function () {
        return (
          '<svg class="spark" viewBox="0 0 100 100" aria-hidden="true">' +
          SPARK_8 +
          '</svg>' +
          TEXT_DIV
        );
      },
      'claude-b': function () {
        return (
          '<div class="think"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 2 L58 42 L98 50 L58 58 L50 98 L42 58 L2 50 L42 42Z"/></svg>' +
          '<span id="kintone-spinner-text" class="shimmer"></span></div>' +
          '<div class="stream" aria-hidden="true"><span class="obp-ld-stream-text"></span><i></i></div>'
        );
      },
      'claude-c': function () {
        return (
          '<div class="paper"><div class="ttl"></div>' +
          '<div class="line l1"></div><div class="line l2"></div><div class="line l3"></div><div class="line l4"></div>' +
          '<div class="line l5"></div>' +
          '<div class="pen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></div></div>' +
          TEXT_DIV
        );
      },
      'claude-d': function () {
        return (
          '<canvas></canvas><div class="core"><div class="orb"></div>' +
          TEXT_DIV +
          '</div>'
        );
      },
      'gemini-a': function () {
        return (
          '<div class="cw-card"><div class="cw-top-bar"></div>' +
          '<div class="cw-emblem-wrap"><div class="cw-halo"></div><div class="cw-ring-subtle"></div>' +
          '<svg class="cw-starburst-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
          '<g stroke="#D97757" stroke-linecap="round">' +
          '<line x1="32" y1="6" x2="32" y2="58" stroke-width="4.2"/><line x1="6" y1="32" x2="58" y2="32" stroke-width="4.2"/>' +
          '<line x1="13.6" y1="13.6" x2="50.4" y2="50.4" stroke-width="3.8"/><line x1="50.4" y1="13.6" x2="13.6" y2="50.4" stroke-width="3.8"/>' +
          '<line x1="19" y1="9.5" x2="45" y2="54.5" stroke-width="3.2" opacity="0.85"/><line x1="9.5" y1="19" x2="54.5" y2="45" stroke-width="3.2" opacity="0.85"/>' +
          '<line x1="45" y1="9.5" x2="19" y2="54.5" stroke-width="3.2" opacity="0.85"/><line x1="54.5" y1="19" x2="9.5" y2="45" stroke-width="3.2" opacity="0.85"/>' +
          '</g><circle cx="32" cy="32" r="6" fill="#D97757"/><circle cx="32" cy="32" r="2.5" fill="#FAF8F5"/></svg></div>' +
          '<div id="kintone-spinner-text"></div>' +
          '<div class="cw-manuscript-box"><div class="cw-ms-header"><span>✦ AI WRITING</span></div>' +
          '<div class="cw-ms-line l1"></div><div class="cw-ms-line l2"></div><div class="cw-ms-line l3"></div>' +
          '<div class="obp-ld-stream obp-ld-stream-light"><span>' +
          STREAM_TEXT +
          '</span></div></div></div>'
        );
      },
      'gemini-b': function () {
        return (
          '<div class="cd-card"><div class="cd-header"><div class="cd-badge">' +
          '<svg class="cd-spark-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true"><g stroke="#D97757" stroke-linecap="round" stroke-width="5">' +
          CROSS_LINES +
          '</g></svg><span>CLAUDE / AI ARTIFACT COMPOSER</span></div></div>' +
          '<div class="cd-artifact-stage"><div class="cd-artifact-shimmer"></div>' +
          '<div class="cd-doc-row"><span class="cd-doc-tag">件名</span><div class="cd-doc-bar"></div></div>' +
          '<div class="cd-doc-row"><span class="cd-doc-tag">構成</span><div class="cd-doc-bar"></div></div>' +
          '<div class="cd-doc-row"><span class="cd-doc-tag">本文</span><div class="cd-doc-bar"></div></div>' +
          '<div class="obp-ld-stream obp-ld-stream-dark"><span>' +
          STREAM_TEXT +
          '</span></div></div>' +
          '<div class="cd-status-area"><div id="kintone-spinner-text"></div></div></div>'
        );
      },
      'gemini-e': function () {
        return (
          '<div class="ms-pill-container"><div class="ms-icon-badge">' +
          '<svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true"><g stroke="#D97757" stroke-linecap="round" stroke-width="5">' +
          CROSS_LINES +
          '</g></svg></div>' +
          '<div class="ms-text-col"><div id="kintone-spinner-text"></div>' +
          '<div class="ms-meta-text">✦ <span class="obp-ld-stream-text" style="color:#E89B7E;"></span><span class="obp-ld-stream-cursor"></span></div></div>' +
          '<div class="ms-wave-bars"><span class="ms-wave-bar"></span><span class="ms-wave-bar"></span><span class="ms-wave-bar"></span><span class="ms-wave-bar"></span></div></div>'
        );
      },
      'gemini-f': function () {
        return (
          '<div class="ci-center-group"><div class="ci-gyro-container">' +
          '<div class="ci-ring-outer"></div><div class="ci-ring-inner"></div>' +
          '<div class="ci-star-center"><svg width="46" height="46" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
          '<path d="M32 4L37.5 26.5L60 32L37.5 37.5L32 60L26.5 37.5L4 32L26.5 26.5L32 4Z" fill="#FAF8F5"/><circle cx="32" cy="32" r="5" fill="#D97757"/></svg></div></div>' +
          '<div class="ci-title-pill"><div id="kintone-spinner-text"></div>' +
          '<div class="obp-ld-stream obp-ld-stream-dark"><span>' +
          STREAM_TEXT +
          '</span></div></div></div>'
        );
      },
    };

    // デザインごとの動作設定
    //  suffix: 単語の末尾に付ける文字（claude-a は CSS のドットなので空）
    //  stream: ストリーミング風表示の文章と、書き終えてから次の文までの待ち文字数
    const BEHAVIOR = {
      classic: { rotate: false, suffix: '' },
      'claude-a': { rotate: true, suffix: '' },
      'claude-b': {
        rotate: true,
        suffix: '…',
        stream: { sentences: STREAMS_CLAUDE_B, tail: 20 },
      },
      'claude-c': { rotate: true, suffix: '…' },
      'claude-d': { rotate: true, suffix: '…' },
      'gemini-a': {
        rotate: true,
        suffix: '...',
        stream: { sentences: STREAMS_GEMINI, tail: 28 },
      },
      'gemini-b': {
        rotate: true,
        suffix: '...',
        stream: { sentences: STREAMS_GEMINI, tail: 28 },
      },
      'gemini-e': {
        rotate: true,
        suffix: '...',
        stream: { sentences: STREAMS_GEMINI, tail: 28 },
      },
      'gemini-f': {
        rotate: true,
        suffix: '...',
        stream: { sentences: STREAMS_GEMINI, tail: 28 },
      },
    };

    return { BASE_CSS: BASE_CSS, CSS: CSS, HTML: HTML, BEHAVIOR: BEHAVIOR };
  })();

  // =========================================================
  // 5. 実行時の状態管理
  // =========================================================
  // 表示中のオーバーレイに紐づくタイマー等。stopAll() ですべて解放する。
  let active = null;

  function newState(overlay) {
    return {
      overlay: overlay,
      wordInterval: 0,
      wordTimeout: 0,
      streamInterval: 0,
      raf: 0,
      cleanups: [],
    };
  }

  function stopWords(st) {
    if (st.wordInterval) {
      clearInterval(st.wordInterval);
      st.wordInterval = 0;
    }
    if (st.wordTimeout) {
      clearTimeout(st.wordTimeout);
      st.wordTimeout = 0;
    }
    st.overlay.classList.remove('obp-ld-fading');
  }

  function stopAll() {
    if (!active) return;
    const st = active;
    active = null;
    stopWords(st);
    if (st.streamInterval) clearInterval(st.streamInterval);
    if (st.raf) cancelAnimationFrame(st.raf);
    st.cleanups.forEach(function (fn) {
      try {
        fn();
      } catch {
        // 後始末の失敗は無視する
      }
    });
    st.cleanups = [];
  }

  function reducedMotion() {
    try {
      return !!(
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  }

  function startWords(st, suffix) {
    const el = st.overlay.querySelector('#' + TEXT_ID);
    if (!el) return;
    let last = -1;
    function next() {
      let n;
      do {
        n = Math.floor(Math.random() * WORDS.length);
      } while (n === last && WORDS.length > 1);
      last = n;
      return WORDS[n] + suffix;
    }
    el.innerText = next();
    st.wordInterval = setInterval(function () {
      st.overlay.classList.add('obp-ld-fading');
      st.wordTimeout = setTimeout(function () {
        st.wordTimeout = 0;
        el.innerText = next();
        st.overlay.classList.remove('obp-ld-fading');
      }, FADE_MS);
    }, WORD_INTERVAL);
  }

  function startStream(st, conf) {
    const target = st.overlay.querySelector('.obp-ld-stream-text');
    if (!target) return;
    let sNo = 0;
    let cNo = 0;
    st.streamInterval = setInterval(function () {
      const full = conf.sentences[sNo];
      cNo++;
      target.textContent = full.slice(0, cNo);
      if (cNo >= full.length + conf.tail) {
        cNo = 0;
        sNo = (sNo + 1) % conf.sentences.length;
      }
    }, 45);
  }

  // claude-d: ノードネットワークの canvas アニメーション
  function startNetwork(st) {
    const cv = st.overlay.querySelector('canvas');
    if (!cv || !cv.getContext) return;
    const cx = cv.getContext('2d');
    if (!cx) return;
    const reduce = reducedMotion();
    const dpr = window.devicePixelRatio || 1;
    let nodes = [];

    function fit() {
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      nodes = [];
      for (let i = 0; i < 46; i++) {
        nodes.push({
          x: Math.random() * cv.width,
          y: Math.random() * cv.height,
          vx: (Math.random() - 0.5) * 0.5 * dpr,
          vy: (Math.random() - 0.5) * 0.5 * dpr,
        });
      }
    }

    function draw() {
      cx.clearRect(0, 0, cv.width, cv.height);
      const R = 150 * dpr;
      const ph = Date.now() / 700;
      nodes.forEach(function (n) {
        if (!reduce) {
          n.x += n.vx;
          n.y += n.vy;
        }
        if (n.x < 0 || n.x > cv.width) n.vx *= -1;
        if (n.y < 0 || n.y > cv.height) n.vy *= -1;
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < R) {
            const alpha = (1 - d / R) * (0.25 + 0.2 * Math.sin(ph + i));
            cx.strokeStyle = 'rgba(140,165,255,' + alpha + ')';
            cx.lineWidth = dpr;
            cx.beginPath();
            cx.moveTo(a.x, a.y);
            cx.lineTo(b.x, b.y);
            cx.stroke();
          }
        }
      }
      nodes.forEach(function (n, i) {
        cx.fillStyle =
          i % 7 === 0 ? 'rgba(217,119,87,.9)' : 'rgba(180,196,255,.8)';
        cx.beginPath();
        cx.arc(n.x, n.y, (i % 7 === 0 ? 3 : 2) * dpr, 0, 7);
        cx.fill();
      });
    }

    function loop() {
      draw();
      st.raf = requestAnimationFrame(loop);
    }

    function onResize() {
      fit();
      if (reduce) draw();
    }

    fit();
    if (reduce) {
      draw();
    } else {
      st.raf = requestAnimationFrame(loop);
    }
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(onResize);
      ro.observe(cv);
      st.cleanups.push(function () {
        ro.disconnect();
      });
    } else {
      window.addEventListener('resize', onResize);
      st.cleanups.push(function () {
        window.removeEventListener('resize', onResize);
      });
    }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    let css = DATA.BASE_CSS;
    KNOWN_IDS.forEach(function (id) {
      css += DATA.CSS[id];
    });
    style.textContent = css;
    document.head.appendChild(style);
  }

  // =========================================================
  // 6. 公開関数
  // =========================================================
  function show(designId) {
    if (document.getElementById(OVERLAY_ID)) return;
    // DOM から消えているのに状態が残っている場合は解放しておく
    stopAll();
    const id = KNOWN_IDS.indexOf(designId) >= 0 ? designId : DEFAULT_DESIGN;
    injectStyle();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'obp-ld obp-ld-' + id;
    overlay.innerHTML = DATA.HTML[id]();
    document.body.appendChild(overlay);

    const st = newState(overlay);
    active = st;
    const conf = DATA.BEHAVIOR[id];
    const textEl = overlay.querySelector('#' + TEXT_ID);
    if (conf.rotate) {
      startWords(st, conf.suffix);
    } else if (textEl) {
      textEl.innerText = CLASSIC_TEXT;
    }
    if (conf.stream) startStream(st, conf.stream);
    if (id === 'claude-d') startNetwork(st);
  }

  function hide() {
    stopAll();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.5s';
    // 退場中に show() が呼ばれても新しい表示を妨げないよう id を外す
    overlay.removeAttribute('id');
    overlay.style.pointerEvents = 'none';
    setTimeout(function () {
      overlay.remove();
    }, HIDE_MS);
  }

  function setText(text) {
    const el = document.querySelector('#' + OVERLAY_ID + ' #' + TEXT_ID);
    if (!el) return;
    if (active) {
      stopWords(active);
    }
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.add('obp-ld-fixed');
    el.innerText = text;
  }

  function preview(designId) {
    stopAll();
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    show(designId);
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'obp-ld-preview-close';
    btn.textContent = '閉じる';
    overlay.appendChild(btn);

    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') close();
    }
    function close() {
      document.removeEventListener('keydown', onKey, true);
      hide();
    }
    btn.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    if (active) {
      active.cleanups.push(function () {
        document.removeEventListener('keydown', onKey, true);
      });
    }
  }

  window.AIWritingLoading = {
    DESIGNS: DESIGNS,
    MODES: MODES,
    DEFAULT_DESIGN: DEFAULT_DESIGN,
    DEFAULT_MODE: DEFAULT_MODE,
    normalizeSettings: normalizeSettings,
    chooseDesign: chooseDesign,
    show: show,
    hide: hide,
    setText: setText,
    preview: preview,
  };
})();
