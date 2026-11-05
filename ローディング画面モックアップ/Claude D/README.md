# ローディング画面モックアップ（Claude D）

AI が文章を作成している間に表示するローディング画面のデザイン案です。`index.html` をブラウザで開いてください。画面上部のボタンで切り替えます。

| 案 | コンセプト | 特徴 |
|---|---|---|
| A | Claude 風 | クリーム地に、テラコッタ色のスパーク（放射状の星）が回って呼吸します。明朝系の落ち着いた文言です。 |
| B | 思考中シマー | ダーク背景で、文言に光が流れます。下の枠には、文章が書かれていくストリーミング風の表示が出ます。 |
| C | 文章が組み上がる | 紙面に行が書かれていき、ペンが動きます。「文章を作っている」ことが一目で伝わります。 |
| D | ニューラル | 光るノードがつながるネットワークの背景に、中央のオーブが脈動します。 |

## 切り替えられる項目

- 通常時の文言は全案共通で、Thinking / Pondering / Musing / Cooking / Baking / Crafting / Computing / Reticulating / Noodling / Clauding の10語を2.4秒ごとにランダム表示します（直前と同じ語は連続しません）。補助行には経過秒と並べて、Gemini 案の5文の英訳（KitKat・好きなAI・犬派猫派・ポンデリング・好きな曲）を5秒ごとに順に表示します
- 状況: 通常、混雑で再試行、軽量モデルへ切替（`setSpinnerText` が表示する文言の再現です）
- モバイル幅（390px）での表示
- 経過秒数とキャンセルボタンの表示（現行の `desktop.js` にはどちらもありません。追加案です）
- `prefers-reduced-motion` では動きを止めます

## 本番へ反映する場合

このモックアップは本番ファイルを一切変更していません。実装時は `ai-writing-assistant-plugin/src/js/desktop.js` の `LOADING_CSS`（141行目付近）と `showSpinner` / `setSpinnerText`（1043行目、1123行目付近）を置き換えます。

## Gemini D から取り込んだ案

`Gemini D` の案A・B・E・Fを、`gemini-import/` にそのままコピーしました（元のファイルは変更していません）。`index.html` の「G-A / G-B / G-E / G-F」ボタンで表示できます。単体で開いても動きます。

| ボタン | 元の案 | ファイル |
|---|---|---|
| G-A | 案A Claude Editorial Warmth | `gemini-import/mockup-a-claude-warm.html` |
| G-B | 案B Claude Dark Studio & Artifact | `gemini-import/mockup-b-claude-dark-artifact.html` |
| G-E | 案E Minimalist Floating Pill & Shimmer | `gemini-import/mockup-e-minimal-shimmer.html` |
| G-F | 案F Cosmic Intelligence Veil | `gemini-import/mockup-f-cosmic-intelligence.html` |

取り込んだ4案は、それぞれ自身の操作と文言を持っています。上部バーの「状況」「モバイル幅」ボタンは、取り込んだ4案には効きません。

取り込んだ G-A / G-B / G-F からは、「文章を作成中」「メモの意図を汲み取り〜」「文脈解析・構成案の作成・推敲を自動実行中」などの補助文を削除しています（`gemini-import/` のコピーのみ変更。`Gemini D` の元ファイルは未変更）。Claude D の案E（オーロラ）は削除しました。
