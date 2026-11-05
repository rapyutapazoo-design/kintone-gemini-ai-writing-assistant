# ✦ AI文章作成ローディング画面 デザインモックアップ集（Claude / AIイメージ）

Kintone向け「AI文章作成アシスタント」プラグインにおいて、AIが文章（件名・本文・要約）を生成する際のローディング画面デザイン案（全6案＋現行デザイン比較）です。

---

## 🚀 プレビュー方法（ブラウザで開くだけ）

ビルドやローカルサーバーは不要です。以下のファイルをダブルクリックしてブラウザ（Chrome / Safari / Edge 等）で開いてください。

- **[`index.html`](./index.html)（総合比較ギャラリー ＆ Kintone実画面シミュレーター）**
  - **6案一覧比較ギャラリー**: 全6案＋現行デザインを1画面で並べてアニメーション・配色を比較できます。
  - **Kintone実画面プレビュー**: 実際のKintoneレコード編集画面（PC表示 / モバイル表示切替対応）の上にローディング画面を重ねて確認できます。
  - **Claude風10単語ランダム表示**: 通常生成時のメイン文言として、`Thinking...` / `Pondering...` / `Musing...` / `Cooking...` / `Baking...` / `Crafting...` / `Computing...` / `Reticulating...` / `Noodling...` / `Clauding...` の10単語を2.4秒ごとにランダム（直前と同じ単語が連続しない仕様）でフェード表示します。またサブ表記として「文章を作成中」を常時併記します。
  - **生成中の5つの英文ストリーミング表示**: 生成中に表示される文章として、以下の5つの英訳メッセージがタイピングアニメーション（または「💬 次の英文メッセージへ」ボタンでの即時切替）で表示されます：
    1. `Chocolat Orange KitKat is seriously delicious~`（キットカットのショコラオレンジ味、美味しいですよ〜）
    2. `Between Claude, ChatGPT, and Gemini, which one do you like best?`（Claude, Chat GPT, Geminiなら、どれが好きですか？）
    3. `Are you a dog person or a cat person?`（あなたは犬派ですか？猫派ですか？）
    4. `I'm craving a strawberry Pon de Ring donut.`（いちごポンデリングが食べたいです。）
    5. `My favorite song is "This Is the Greatest Show."`（好きな曲は"this is the greatest show"です）
  - **状態テスト機能**: 上部バーの「🎲 10単語ランダム（2.4秒毎）」「↻ 次のランダム単語へ」ボタンのほか、`setSpinnerText()` による「リトライ中」「軽量モデルへのフォールバック中」「設定調整・再送中」の文言変化をワンクリックでテストできます。
  - **実装コード取得**: 各デザイン案の `LOADING_CSS` / `showSpinner()` 差し替え用コードをその場で確認・コピーできます。

---

## 🎨 デザイン案一覧（全6案）

| 案 | ファイル名 | コンセプト・特徴 | 主なカラーパレット |
|---|---|---|---|
| **案A（推奨）**<br>**Claude Editorial Warmth** | [`mockup-a-claude-warm.html`](./mockup-a-claude-warm.html) | Anthropic Claudeの象徴的なアイボリー紙面とテラコッタオレンジ、知的な明朝見出しを組み合わせた王道デザイン。カード内で原稿の行が1行ずつ紡ぎ出される演出付き。 | `#FAF8F5`（アイボリー）<br>`#D97757`（テラコッタ）<br>`#1F1E1D`（インクブラック） |
| **案B**<br>**Claude Dark Studio & Artifact** | [`mockup-b-claude-dark-artifact.html`](./mockup-b-claude-dark-artifact.html) | Claudeのダークモードと「Artifacts（文書生成パネル）」を着想源にしたプロ仕様のダークカードUI。「件名」「構成」「本文」の構造タグが生成される様子を視覚化。 | `#1C1B1A`（チャコール）<br>`#D97757`（テラコッタ）<br>`#E89B7E`（ウォームアンバー） |
| **案C**<br>**Luminous AI Orb & Neural Wave** | [`mockup-c-luminous-orb.html`](./mockup-c-luminous-orb.html) | 次世代AIをイメージした有機的に揺らぐ流体グラデーションオーブ（球体）と立体軌道リング、すりガラス（フロストガラス）カプセルの組み合わせ。 | `#D97757` × `#8B5CF6` × `#38BDF8`（オーロラグラデーション） |
| **案D**<br>**AI Co-Writer Manuscript** | [`mockup-d-manuscript-writer.html`](./mockup-d-manuscript-writer.html) | 「件名」と「本文（箇条書き）」のミニ原稿シートが目の前で書き上がっていくUX特化型デザイン。利用者に「今何を作っているか」が最も直感的に伝わります。 | `#FFFFFF`（原稿用紙）<br>`#FAF8F5`（デスクマット）<br>`#C45B3A`（アクセント） |
| **案E**<br>**Minimalist Floating Pill & Shimmer** | [`mockup-e-minimal-shimmer.html`](./mockup-e-minimal-shimmer.html) | Kintoneの業務画面を覆い隠さず、柔らかいベールの上にフローティング・カプセルだけを浮かべる非侵襲デザイン。Claude風のテキストシマー（文字の輝き）を採用。 | `#1F1E1C`（ピル背景）<br>`#FAF8F5`〜`#E89B7E`（シマー文字） |
| **案F**<br>**Cosmic Intelligence Veil** | [`mockup-f-cosmic-intelligence.html`](./mockup-f-cosmic-intelligence.html) | 現行プラグインの「全画面グラデーション＋回転リング＋スター」の構成を活かしつつ、落ち着きと品格のあるディープインディゴ〜テラコッタ配色と二重ジャイロリングへ進化させた案。 | `#181524` → `#592D36` → `#B85D43`（ディープコズミック） |

---

## 🔧 本番プラグイン（`desktop.js`）への組み込み互換性について

すべてのモックアップは以下の既存インターフェース仕様を100%維持して設計されています。

- オーバーレイ要素ID: `#kintone-spinner-overlay`（`z-index: 9999`）
- ステータステキスト要素ID: `#kintone-spinner-text`
- そのため、`ai-writing-assistant-plugin/src/js/desktop.js` 内の **`LOADING_CSS`** と **`showSpinner()`** を差し替えるだけで、既存の `hideSpinner()`（フェードアウト処理）および `setSpinnerText()`（リトライ・フォールバック時の進捗表示）がそのまま無修正で動作します。
