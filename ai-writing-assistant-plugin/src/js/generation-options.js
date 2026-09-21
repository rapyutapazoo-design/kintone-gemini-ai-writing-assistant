(function (global) {
  'use strict';

  // =========================================================
  // フォーマット定義（確定値）
  // 「文字数」と同型のデータ構造を将来の利用者選択に備えて用意する。
  // 現時点では管理者が設定画面で1つを選ぶ固定運用（mode='fixed'）。
  // =========================================================
  const FORMAT_OPTIONS = [
    {
      id: 'heading_bullet',
      label: '見出し＋箇条書き（■・）',
      description:
        '意見書・タスク・議事録・汎用ビジネス文書向け。最も汎用性が高い既定値。',
      instruction:
        '構造の表現には■（見出し）と・（箇条書き）のみを使用し、改行は改行文字で表現すること。Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）とHTMLタグ（<b> <br> <div> <span>など）は一切出力しないこと。',
      example: `■背景
X月X日に開催された理事会にて、共用部の照明について住民の方からご意見をいただきました。
■内容
・エントランス照明が夜間に暗く感じられ、防犯上の不安があるとのことです。
・LED照明への交換を希望されています。
・費用については次期修繕積立金からの充当をご検討ください。
■備考
現地確認のうえ、次回理事会にてあらためてご検討をお願いいたします。`,
    },
    {
      id: 'bullet_only',
      label: '箇条書きのみ（・）',
      description: 'タスク説明・短い業務連絡向け。100〜200字の短文に適する。',
      instruction:
        '見出しは使用せず、・（中黒）による箇条書きのみで簡潔に記述すること。Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）とHTMLタグ（<b> <br> <div> <span>など）は一切出力しないこと。',
      example: `・来週X月X日（水）に共用部エレベーターの定期点検を実施します。
・点検時間は午前9時から正午までを予定しています。
・点検中はエレベーターを一時的に停止しますので、階段のご利用にご協力をお願いいたします。
・作業員が共用部に立ち入りますので、あらかじめご了承ください。
・詳細は1階掲示板の案内をご確認ください。`,
    },
    {
      id: 'paragraph',
      label: '段落文（見出しなし）',
      description:
        'メール・依頼文・社外文書向け。挨拶文と結びを含む文章に適する。',
      instruction:
        '見出しや箇条書きは使用せず、段落による通常の文章として記述すること。段落の区切りは空行で表現すること。Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）とHTMLタグ（<b> <br> <div> <span>など）は一切出力しないこと。',
      example: `いつもお世話になっております。

先日ご相談いただいた駐輪場の件について、ご連絡いたします。〇〇号室にお住まいの方からいただいたご意見をもとに、管理組合内で検討を行いました。

現在の区画数では台数が不足している状況のため、増設について次回の理事会で議題として取り上げる予定です。結果が出次第、あらためてご案内いたします。

何卒よろしくお願いいたします。`,
    },
    {
      id: 'numbered_steps',
      label: '番号付き手順（1. 2. 3.）',
      description: '業務マニュアル・手順書向け。順序性を明示できる。',
      instruction:
        '作業手順は「1.」「2.」のように半角数字とピリオドで番号を振り、実行順に記述すること。手順以外の補足は■（見出し）で区切ること。Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）とHTMLタグ（<b> <br> <div> <span>など）は一切出力しないこと。',
      example: `1. 管理組合窓口にて申請書を受け取ります。
2. 必要事項を記入し、X月X日までに窓口まで提出してください。
3. 受理後、担当者が内容を確認し、結果を後日ご連絡します。
4. 承認された場合は、指定の期間内に作業を行ってください。
■注意事項
申請書に不備がある場合、再提出をお願いすることがあります。`,
    },
    {
      id: 'notice_letter',
      label: '掲示文（宛先＋記書き）',
      description:
        '住民・利用者向けのお知らせ・掲示文向け。発信日・宛先・差出人・記書きを含む定型構造。',
      instruction:
        '文頭に発信日・宛先（例:「居住者各位」）・差出人（管理組合名など）をそれぞれ1行で記載し、続けて挨拶文と主文を段落で記述すること。日時・場所・対象・費用などの個別項目は「記」の行の後に「・項目名: 内容」の形式でまとめ、末尾は「以上」の1行で締めること。■と・以外の装飾記号は使用せず、Markdown記法（**太字**、##見出し、-や*の箇条書き、コードフェンスなど）とHTMLタグ（<b> <br> <div> <span>など）は一切出力しないこと。',
      example: `X月X日
居住者各位
管理組合

日頃より管理組合の運営にご協力いただき、誠にありがとうございます。
下記のとおり共用部の清掃作業を実施いたしますので、お知らせいたします。

記
・実施日: X月X日（土）
・時間: 午前9時から正午まで
・対象箇所: エントランス、廊下、駐輪場
・お願い: 作業中は共用部への私物の放置をお控えください。

ご不便をおかけしますが、ご理解のほどよろしくお願いいたします。

以上`,
    },
    {
      id: 'custom',
      label: 'カスタム（自由記述）',
      description: '独自のフォーマット指示を記述します。',
      instruction: '',
      example: '',
    },
  ];

  const DEFAULT_FORMAT_ID = 'heading_bullet';

  // =========================================================
  // 文字数候補の推奨リスト（フィールド作成時の選択肢の目安）
  // =========================================================
  const RECOMMENDED_LENGTHS = [
    '指定なし',
    '100字程度',
    '200字程度',
    '400字程度',
    '600字程度',
    '800字程度',
    '1200字程度',
  ];

  function getFormatOption(id) {
    return (
      FORMAT_OPTIONS.filter(function (f) {
        return f.id === id;
      })[0] || null
    );
  }

  function getFormatInstructionById(id) {
    const f = getFormatOption(id);
    return f ? f.instruction : '';
  }

  // =========================================================
  // ラベルからの文字数指示文の動的生成
  // =========================================================
  function extractLengthNumber(label) {
    const m = /(\d{2,5})\s*[字文]/.exec(String(label == null ? '' : label));
    return m ? parseInt(m[1], 10) : null;
  }

  function buildLengthInstructionFromNumber(num) {
    return num + '文字程度（±20%）の文章';
  }

  // ラベルから指示文を生成する関数。数値抽出できない場合は汎用の指示文を返す。
  function buildLengthInstructionFromLabel(label) {
    const num = extractLengthNumber(label);
    if (num) {
      return buildLengthInstructionFromNumber(num);
    }
    return '内容量に応じた適切な長さ';
  }

  // =========================================================
  // JSONマッピングのパース／シリアライズ（失敗時は既定値へフォールバック）
  // =========================================================
  function parseMap(jsonStr, fallback) {
    const fallbackValue = Array.isArray(fallback) ? fallback : [];
    if (!jsonStr) {
      return fallbackValue;
    }
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return fallbackValue;
    } catch {
      return fallbackValue;
    }
  }

  function stringifyMap(map) {
    try {
      return JSON.stringify(Array.isArray(map) ? map : []);
    } catch {
      return '[]';
    }
  }

  function readRecordFieldValue(record, fieldCode) {
    if (!record || !fieldCode) {
      return '';
    }
    const field = record[fieldCode];
    if (!field || field.value == null) {
      return '';
    }
    return String(field.value);
  }

  // =========================================================
  // 共通解決関数（文字数・フォーマットで共用）
  //   mode === 'fixed' → map[0].instruction を返す
  //   mode === 'field' → フィールド値で map を照合して返す
  // フォールバック順序（mode==='field'時）:
  //   1. フィールド未設定 or 値が空 → defaultInstruction
  //   2. 値が map の option と完全一致 → その instruction
  //   3. 一致しないが値から数値抽出可 → 動的生成した指示文
  //   4. いずれも不可 → defaultInstruction
  // =========================================================
  function resolveOption(mode, fieldCode, map, defaultInstruction, record) {
    const list = Array.isArray(map) ? map : [];
    const fallback = defaultInstruction || '';

    if (mode === 'fixed') {
      const first = list[0];
      if (first && typeof first.instruction === 'string' && first.instruction) {
        return first.instruction;
      }
      return fallback;
    }

    // mode === 'field'
    if (!fieldCode) {
      return fallback;
    }

    const value = readRecordFieldValue(record, fieldCode);
    if (!value) {
      return fallback;
    }

    const matched = list.filter(function (item) {
      return item && item.option === value;
    })[0];
    if (
      matched &&
      typeof matched.instruction === 'string' &&
      matched.instruction
    ) {
      return matched.instruction;
    }

    const num = extractLengthNumber(value);
    if (num) {
      return buildLengthInstructionFromNumber(num);
    }

    return fallback;
  }

  // =========================================================
  // レガシー互換: length_map 未設定時に現行のハードコード動作を再現する。
  // 既定 '200文字程度の簡潔な文章'。値に '400' を含めば '400文字程度の標準的な文章'、
  // '600' を含めば '600文字程度の詳細な文章'（後勝ち）。
  // この互換性は既存アプリのデグレ防止のため最重要。
  // =========================================================
  function legacyLengthInstruction(value) {
    let lengthInstruction = '200文字程度の簡潔な文章';
    const str = value || '';
    if (str) {
      if (str.indexOf('400') !== -1) {
        lengthInstruction = '400文字程度の標準的な文章';
      }
      if (str.indexOf('600') !== -1) {
        lengthInstruction = '600文字程度の詳細な文章';
      }
    }
    return lengthInstruction;
  }

  global.GeminiGenerationOptions = {
    FORMAT_OPTIONS: FORMAT_OPTIONS,
    DEFAULT_FORMAT_ID: DEFAULT_FORMAT_ID,
    RECOMMENDED_LENGTHS: RECOMMENDED_LENGTHS,
    getFormatOption: getFormatOption,
    getFormatInstructionById: getFormatInstructionById,
    extractLengthNumber: extractLengthNumber,
    buildLengthInstructionFromNumber: buildLengthInstructionFromNumber,
    buildLengthInstructionFromLabel: buildLengthInstructionFromLabel,
    parseMap: parseMap,
    stringifyMap: stringifyMap,
    resolveOption: resolveOption,
    legacyLengthInstruction: legacyLengthInstruction,
  };
})(window);
