(function (global) {
  'use strict';

  const GENERIC_SUMMARY_PROMPT = `あなたは業務文書の要約担当者です。
以下の内容を、要点を把握しやすい適切な長さに要約してください。

【要約のルール】
1. 具体的な文字数制限は設けません。元の文章量や内容の複雑さに応じて、効率的に内容を把握できる適切な長さに調整してください。
2. 短い内容は一言で簡潔に、複雑な内容は重要な詳細（日付・担当者・経緯など）を漏らさないように要約してください。
3. 冗長な表現は避け、事実関係を明確にしてください。
4. 見出し（■など）と箇条書き（・）を用いて、人間が一目で読みやすいレイアウトで出力してください。
5. Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）は使用せず、HTMLタグ（<b> <br> <div> <span>など）も出力しないこと。改行はそのまま改行文字で表現すること。

【本文】
{{body}}`;

  // opinion / contact の prompt_draft・prompt_summary は、既存の
  // config.js DEFAULT_PROMPT_DRAFT / DEFAULT_PROMPT_SUMMARY /
  // CONTACT_PROMPT_DRAFT / CONTACT_PROMPT_SUMMARY を土台として維持し、
  // フォーマット制約を書いていた行を {{formatInstruction}} に置換しただけに
  // 留めている（文面自体は作り直していない）。

  const OPINION_PROMPT_DRAFT = `あなたはマンション管理組合への意見書作成システムです。
以下の【メモ】を元に、「件名」と「本文」を作成し、必ず**JSON形式**のみで出力してください。
【出力フォーマット】
{ "subject": "件名(20文字以内)", "body": "本文" }
【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 挨拶文、署名は一切禁止。
3. 「です・ます」調。
4. {{formatInstruction}}
【メモ】
{{input}}`;

  const OPINION_PROMPT_SUMMARY = `あなたはマンション管理組合の理事会資料作成担当です。
以下の意見書の内容を、理事会資料として適切な長さに要約してください。

【要約のルール】
1. 具体的な行数制限は設けません。元の文章量や内容の複雑さに応じて、効率的に内容を把握できる適切な長さに調整してください。
2. 短い意見は一言で簡潔に、複雑な背景がある意見は重要な詳細（日付、場所、経緯など）を漏らさないように要約してください。
3. 冗長な表現は避け、事実関係を明確にしてください。
4. 見出し（■など）と箇条書き（・）を用いて、人間が一目で読みやすいレイアウトで出力してください。
5. Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）は使用せず、HTMLタグ（<b> <br> <div> <span>など）も出力しないこと。改行はそのまま改行文字で表現すること。

【本文】
{{body}}`;

  const CONTACT_PROMPT_DRAFT = `あなたは、マンション管理組合の「デジタル委員会」が運営するお問い合わせ窓口の下書き作成アシスタントです。
以下の「利用者からの指示・メモ」をもとに、デジタル委員会宛てのお問い合わせ内容として、丁寧語（です・ます調）で件名と本文の下書きを作成してください。
{{formatInstruction}}

【本文の条件】
1. 文字数目安: {{lengthInstruction}}

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【利用者からの指示・メモ】
{{input}}`;

  const CONTACT_PROMPT_SUMMARY = `あなたはマンション管理組合の理事会資料作成担当です。
以下のお問い合わせ内容を、理事会資料として適切な長さに要約してください。

【要約のルール】
1. 具体的な行数制限は設けません。元の文章量や内容の複雑さに応じて、効率的に内容を把握できる適切な長さに調整してください。
2. 短い内容は一言で簡潔に、複雑な背景がある内容は重要な詳細（日付、場所、経緯など）を漏らさないように要約してください。
3. 冗長な表現は避け、事実関係を明確にしてください。
4. 見出し（■など）と箇条書き（・）を用いて、人間が一目で読みやすいレイアウトで出力してください。
5. Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）は使用せず、HTMLタグ（<b> <br> <div> <span>など）も出力しないこと。改行はそのまま改行文字で表現すること。

【本文】
{{body}}`;

  const NOTICE_PROMPT_DRAFT = `あなたは、マンション管理組合の「デジタル委員会」が運営する業務連絡・お知らせ作成アシスタントです。
以下の【メモ】をもとに、管理組合内での業務連絡・お知らせとして、丁寧語（です・ます調）で件名と本文を作成してください。
{{formatInstruction}}

【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 挨拶文、署名は一切禁止。
3. メモに記載のない事実（日時・場所・対象者など）を創作しないこと。

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【メモ】
{{input}}`;

  const TASK_PROMPT_DRAFT = `あなたは、業務用のタスク説明文を作成するアシスタントです。
以下の【メモ】をもとに、タスクの説明文として件名と本文を作成してください。
{{formatInstruction}}

【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 挨拶文、署名は一切禁止。
3. 「です・ます」調。
4. 本文には、目的・作業内容・期限・留意点の観点を過不足なく含めること。見出し記号を使うかどうかは冒頭のフォーマット指示に従うこと。
5. メモに記載のない期限・担当者を創作しないこと。不明な場合は「メモに記載なし」と明記すること。

【件名の条件】
タスク名として15字程度で簡潔にすること。

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【メモ】
{{input}}`;

  const MANUAL_PROMPT_DRAFT = `あなたは、業務マニュアル（手順書）を作成するアシスタントです。
以下の【メモ】をもとに、業務マニュアルとして件名と本文を作成してください。
{{formatInstruction}}

【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 挨拶文、署名は一切禁止。
3. 「です・ます」調。
4. 本文には、目的・対象者・事前準備・手順・注意事項の観点を過不足なく含めること。
5. 手順は実行順に番号を振ること。
6. メモに記載のない手順や条件を創作しないこと。

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【メモ】
{{input}}`;

  const MINUTES_PROMPT_DRAFT = `あなたは、会議の議事録を作成するアシスタントです。
以下の【メモ】をもとに、議事録として件名と本文を作成してください。
{{formatInstruction}}

【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 挨拶文、署名は一切禁止。
3. 「です・ます」調。
4. 本文には、開催概要・決定事項・継続審議事項・次回開催・備考の観点を含めること。
5. メモに記載のない事実を絶対に補完しないこと。議長・記録者など、メモに記載がなく不足している項目は、備考にて「メモに記載がないため要追記」と明示すること。

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【メモ】
{{input}}`;

  const BUSINESS_PROMPT_DRAFT = `あなたは、社内外向けの汎用ビジネス文書を作成するアシスタントです。
以下の【メモ】をもとに、ビジネス文書として件名と本文を作成してください。
{{formatInstruction}}

【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 冒頭の挨拶文は禁止。ただし、結びの一文（例:「今後ともよろしくお願いいたします。」）は許容する。
3. 「です・ます」調。
4. 本文には、趣旨・内容・背景・お願い事項の観点を含めること。
5. メモに記載のない事実を創作しないこと。

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【メモ】
{{input}}`;

  const MAIL_PROMPT_DRAFT = `あなたは、社外・関係者向けのメール文面を作成するアシスタントです。
以下の【メモ】をもとに、メールの件名と本文を作成してください。
{{formatInstruction}}

【本文の条件】
1. 文字数目安: {{lengthInstruction}}
2. 冒頭に挨拶（例:「いつもお世話になっております。」等）、末尾に結び（例:「何卒よろしくお願いいたします。」等）を必ず含めること。
3. 「です・ます」調。
4. メモに記載のない事実を創作しないこと。

【出力形式】
必ず次の形式のJSONのみを出力してください。前後に説明文やコードフェンス（\`\`\`など）は一切付けないでください。
{"subject": "件名", "body": "本文"}

【メモ】
{{input}}`;

  const PRESETS = [
    {
      id: 'opinion',
      category: 'opinion',
      label: '意見書',
      description:
        '住民・利用者からの意見書の下書きを作成します。挨拶文は禁止です。',
      btn_label_draft: 'Geminiで件名・本文を作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: OPINION_PROMPT_DRAFT,
      prompt_summary: OPINION_PROMPT_SUMMARY,
      default_format_id: 'heading_bullet',
      recommended_lengths: ['200字程度', '400字程度', '600字程度'],
      summary_enabled: true,
    },
    {
      id: 'contact',
      category: 'contact',
      label: 'お問い合わせ',
      description: 'お問い合わせ内容の下書きを作成します。挨拶文は禁止です。',
      btn_label_draft: 'Geminiで下書きを作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: CONTACT_PROMPT_DRAFT,
      prompt_summary: CONTACT_PROMPT_SUMMARY,
      default_format_id: 'heading_bullet',
      recommended_lengths: ['200字程度', '400字程度', '600字程度'],
      summary_enabled: true,
    },
    {
      id: 'notice',
      category: 'contact',
      label: '業務連絡・お知らせ',
      description:
        '管理組合内向けの業務連絡・お知らせの下書きを作成します。挨拶文は禁止です。',
      btn_label_draft: 'Geminiで下書きを作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: NOTICE_PROMPT_DRAFT,
      prompt_summary: GENERIC_SUMMARY_PROMPT,
      default_format_id: 'heading_bullet',
      recommended_lengths: ['100字程度', '200字程度', '400字程度'],
      summary_enabled: true,
    },
    {
      id: 'task',
      category: 'document',
      label: 'タスク説明文',
      description:
        '短いタスクの説明文を作成します。期限・担当者の創作は禁止です。挨拶文は禁止です。',
      btn_label_draft: 'Geminiでタスク説明を作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: TASK_PROMPT_DRAFT,
      prompt_summary: GENERIC_SUMMARY_PROMPT,
      default_format_id: 'bullet_only',
      recommended_lengths: ['100字程度', '200字程度', '400字程度'],
      summary_enabled: false,
    },
    {
      id: 'manual',
      category: 'document',
      label: '業務マニュアル（手順書）',
      description:
        '手順を番号付きで示す業務マニュアルを作成します。挨拶文は禁止です。',
      btn_label_draft: 'Geminiでマニュアルを作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: MANUAL_PROMPT_DRAFT,
      prompt_summary: GENERIC_SUMMARY_PROMPT,
      default_format_id: 'numbered_steps',
      recommended_lengths: ['600字程度', '800字程度', '1200字程度'],
      summary_enabled: true,
    },
    {
      id: 'minutes',
      category: 'document',
      label: '議事録',
      description:
        '会議の議事録を作成します。メモに記載のない事実は補完せず、不足項目は備考に明示します。挨拶文は禁止です。',
      btn_label_draft: 'Geminiで議事録を作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: MINUTES_PROMPT_DRAFT,
      prompt_summary: GENERIC_SUMMARY_PROMPT,
      default_format_id: 'heading_bullet',
      recommended_lengths: ['400字程度', '600字程度', '800字程度'],
      summary_enabled: true,
    },
    {
      id: 'business',
      category: 'document',
      label: '汎用ビジネス文書',
      description:
        '社内外向けの汎用ビジネス文書を作成します。冒頭の挨拶は禁止、結びの一文のみ許容します。',
      btn_label_draft: 'Geminiで文書を作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: BUSINESS_PROMPT_DRAFT,
      prompt_summary: GENERIC_SUMMARY_PROMPT,
      default_format_id: 'heading_bullet',
      recommended_lengths: ['200字程度', '400字程度', '800字程度'],
      summary_enabled: true,
    },
    {
      id: 'mail',
      category: 'document',
      label: 'メール・依頼文',
      description:
        '社外・関係者向けのメール文面を作成します。冒頭の挨拶と結びを必ず含めます。',
      btn_label_draft: 'Geminiでメール文面を作成',
      btn_label_summary: 'Geminiで要約',
      prompt_draft: MAIL_PROMPT_DRAFT,
      prompt_summary: GENERIC_SUMMARY_PROMPT,
      default_format_id: 'paragraph',
      recommended_lengths: ['100字程度', '200字程度', '400字程度'],
      summary_enabled: false,
    },
  ];

  const CATEGORY_LABELS = {
    opinion: '意見・要望系',
    contact: '問い合わせ・連絡系',
    document: '業務ドキュメント系',
  };

  function getPreset(id) {
    return (
      PRESETS.filter(function (p) {
        return p.id === id;
      })[0] || null
    );
  }

  global.GeminiPromptPresets = {
    PRESETS: PRESETS,
    CATEGORY_LABELS: CATEGORY_LABELS,
    getPreset: getPreset,
  };
})(window);
