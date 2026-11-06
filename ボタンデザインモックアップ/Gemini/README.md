# 生成ボタン Gemini風 モックアップ（公式ロゴ寄せ）

`index.html` をブラウザで開くだけで確認できます（ビルド不要・外部通信なし・外部フォント不使用）。先頭に「Gemini 公式ロゴ（参考）」の近似表示、続いて現行の Gemini ボタンと A〜D 案を「通常 / ホバー / 押下 / 無効（生成中） / フォーカス」で並べています。ヘッダーのボタンでモバイル表示（幅100%・390px）に切り替えられます。文言はすべて「Geminiでお知らせを作成」です。Claude 版（`../Claude/`）の構成を踏襲しています。

## 色の出所
- Google 標準色 `#EA4335`（赤）`#FBBC04`（黄）`#34A853`（緑）`#4285F4`（青）を、参考画像7（赤=上、黄=左、緑=下、青=右・中央）のおおよその見た目と見比べて採用しました。画像7の実際のスパークルは赤が `#FF4A4A` 付近、青が `#2F86FF` 付近とやや鮮やかですが、標準色の方がブランド色として確実なため標準色を使い、青の下地だけ `#3F86F6` にして画像寄りに調整しています。
- 画像5の文字: 青のグラデーション（左 `#2F72EE` 付近 → 右 `#5AA0F8` 付近）。参考表示ではこれを使用。ボタン A では 4.5:1 を満たすよう `#1558D6` → `#1A66DC` に暗くしています（派生値）。
- 画像6: スパークルは青（`#4285F4`）〜薄紫（`#C3A7F5`）、文字は青 `#4F95FF` → 紫 `#A98EF2` → ピンク赤 `#F0627A`。目視で読んだ近似値です。
- 画像7の背景: 淡い水色〜`#2F9BFF` 系の青。C の面色はコントラスト確保のため `#1F6FE5` → `#1558D6` に暗くした派生値。
- ホバー・押下・無効の補助色はすべて上記からの派生で、公式の値ではありません。
- 画像からピクセル値を機械的に抽出してはおらず、画像を目視で読み取った近似です。

## 案の一覧

| 案 | コンセプト | 色 | 文字の最小コントラスト比 |
|---|---|---|---|
| 現行（比較） | 青グラデ + 白の細い4点星 | `#4285F4`→`#2962FF`、白文字 | 3.56（基準未満）。無効は opacity .6 |
| A（推奨） | 白地ライト。画像5。薄枠のピル + フルカラーのスパークル + 青グラデ文字 | 地 `#FFF`、枠 `#DADCE0`、文字 `#1558D6`→`#1A66DC` | 通常/無効 5.28 / ホバー(`#F1F6FE`) 4.87 / 押下(`#E8F0FE`) 4.61 |
| B | ダーク。画像6。黒地 + 青〜薄紫のスパークル + 青→紫→ピンク赤の文字 | 地 `#131314`、ホバー `#1E1F20`、押下 `#000` | 通常 5.95（赤の端）/ ホバー 5.29 / 押下 6.73 / 無効 5.95 |
| C | ブルー面 + 白角丸チップ。画像7の背景と形 | `#1F6FE5`→`#1558D6`、ホバー `#1967D2`→`#1250B0`、押下 `#1250B0`→`#0F4296`、無効 `#2A5DB0`。白文字 | 通常 4.70 / ホバー 5.37 / 押下 7.50 / 無効 6.38 |
| D | 現行の改良。青グラデ維持 + 白単色の凹み4点星。角丸12px、影を控えめに | `#2468E8`→`#1A4FD0`、ホバー `#1D5CD8`→`#1543B8`、押下 `#1543B8`→`#103896`、無効 `#3A5FB5`。白文字 | 通常 4.98 / ホバー 5.87 / 押下 8.31 / 無効 6.03 |

グラデーション文字・グラデーション面は、最も不利な点（A は最も薄い青、B は赤の端、C/D は面の最も薄い端）で評価しました。WCAG 2.x の相対輝度式で全状態を実計算し（スクリプトは /tmp にのみ置き、リポジトリには含めていません）、全案・全状態で文字 4.5:1 以上です。現行の白 × `#4285F4` は 3.56:1 で未達です（`#2962FF` 端は 4.90）。

非文字要素: A のスパークル黄 `#FBBC04` × 白は 1.71 と低いですが、ロゴ由来の装飾で、ラベル文字が意味を伝えるため許容と判断しました。B のフォーカス枠 `#A98EF2` × `#131314` は 6.93、C のフォーカス枠 `#1558D6` × 白は 6.18 です。

## おすすめ
**A（白地ライト）**。kintone の白〜薄グレー画面になじみ、Gemini 公式ロゴ（画像5）の雰囲気をそのまま使え、全状態でコントラストも確保できます。無効は破線枠 + スパークル回転（opacity 不使用）で区別されます。主役ボタンとして目立たせたい場合は C、現行からの差し替えを最小にしたい場合は D が候補です。B はダークテーマ運用向けです。

## スパークルSVGの出所
画像7の形（上下左右の4先端が丸く、辺が中心へ向かって凹む星）を目で読み取り、100x100 座標の三次ベジェ + 先端の二次ベジェで手描きした**近似**です。`index.html` では `<path id="gem-shape">` を共通化し、`<symbol id="gem">`（フルカラー: 青の下地に緑・黄・赤の放射グラデを重ねる）、`gem-dark`（青〜薄紫の線形グラデ）、`gem-mono`（`currentColor`）を定義して `<use>` で使っています。生成中（無効）はゆっくり回転・脈動し、`prefers-reduced-motion: reduce` で停止します。

フルカラー版のスタンドアロン SVG（そのまま貼り付け可能）:

```html
<svg viewBox="0 0 100 100" width="22" height="22" aria-hidden="true"><defs><radialGradient id="gr-red" gradientUnits="userSpaceOnUse" cx="50" cy="6" r="40"><stop offset="0" stop-color="#EA4335"/><stop offset=".45" stop-color="#EA4335" stop-opacity=".85"/><stop offset="1" stop-color="#EA4335" stop-opacity="0"/></radialGradient><radialGradient id="gr-yellow" gradientUnits="userSpaceOnUse" cx="4" cy="50" r="38"><stop offset="0" stop-color="#FBBC04"/><stop offset=".45" stop-color="#FBBC04" stop-opacity=".85"/><stop offset="1" stop-color="#FBBC04" stop-opacity="0"/></radialGradient><radialGradient id="gr-green" gradientUnits="userSpaceOnUse" cx="44" cy="96" r="42"><stop offset="0" stop-color="#34A853"/><stop offset=".5" stop-color="#34A853" stop-opacity=".85"/><stop offset="1" stop-color="#34A853" stop-opacity="0"/></radialGradient><path id="gem-shape" d="M47 9 Q50 1 53 9 C54.5 36 63 46 91 47 Q99 50 91 53 C63 54 54.5 64 53 91 Q50 99 47 91 C45.5 64 37 54 9 53 Q1 50 9 47 C37 46 45.5 36 47 9 Z"/></defs><use href="#gem-shape" fill="#3F86F6"/><use href="#gem-shape" fill="url(#gr-green)"/><use href="#gem-shape" fill="url(#gr-yellow)"/><use href="#gem-shape" fill="url(#gr-red)"/></svg>
```

単色版（`color` で色が決まる。青面の白ボタン用）:

```html
<svg viewBox="0 0 100 100" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M47 9 Q50 1 53 9 C54.5 36 63 46 91 47 Q99 50 91 53 C63 54 54.5 64 53 91 Q50 99 47 91 C45.5 64 37 54 9 53 Q1 50 9 47 C37 46 45.5 36 47 9 Z"/></svg>
```

## 本番へ反映する手順
1. `ai-writing-assistant-plugin/src/js/desktop.js` の `AI_LOGO_SVG` を、採用案のスタンドアロン SVG（A・B・C はフルカラー、D は単色版）に置き換えます。単色版の色は、`BTN_STYLE` の `color`（白）が継承されます。フルカラー版を複数ボタンに置く場合は `id` が重複しないよう注意してください（gradient の id をボタンごとに変えるか、1箇所の defs に集約）。
2. `BTN_STYLE` を採用案のクラスの通常状態の宣言に置き換えます。フォントは `"Google Sans","Product Sans",system-ui,"Hiragino Sans",sans-serif` です。
3. `BTN_STYLE` は `btn.style = ...` で付ける inline style のため、`:hover` `:active` `:disabled` `:focus-visible`、`@keyframes`（スパークルの回転）、`prefers-reduced-motion` は書けません。これらは `desktop.css` 側に専用クラスを作って `.クラス:hover:not(:disabled) { ... }` の形で定義し、hover で変える背景などは inline 側から外してください（inline が優先されるため）。A/B のグラデーション文字は文字を `<span class="tx">` で包み、`background-clip:text` を CSS 側に置きます。C はチップ用の `<span class="chip">` も必要です。
4. 無効（生成中）は `disabled` を付ける実装にしてください。opacity は使わず固定色です。
5. モバイルの `width:100%` は既存の `btn.style.width = '100%'` がそのまま使えます。
6. `index.html` の `.is-hover` `.is-active` `.is-focus` は状態を並べるための補助クラスで、本番には不要です。
7. ボタン文言はプラグイン設定の `btn_label_draft` で変更できます（既定のままなら「Geminiでお知らせを作成」と入力）。

## 商標・ロゴの利用に関する注記
このモックアップは社内での検討用です。スパークルと「Gemini」文字風の表示は、参考画像から読み取った形・色の近似であり、公式ロゴの複製ではありません（画像ファイルも同梱していません）。本番で公式ロゴを使う場合は、Google のブランドガイドライン（Gemini のロゴ利用規定）を確認してください。
