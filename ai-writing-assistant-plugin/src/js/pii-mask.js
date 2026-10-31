// 外部のAIサービスへ送る前に、電話番号・メールアドレス・郵便番号・部屋番号を
// 伏せ字にする純関数群。DOM にも kintone にも依存しない（node の vm で検証
// できるようにするため）。氏名・住所は対象外で、伏せ字は一方向（元に戻さない）。
(function (global) {
  'use strict';

  const DIGIT = '[0-9０-９]';
  // 区切り文字（ハイフン類・空白・括弧）。半角と全角の空白は含めるが、改行は含めない。
  const SEP = '[-‐−ー－― 　()（）]';
  // 郵便番号の区切り（ハイフン類のみ。空白や括弧は含めない）。
  const HYPHEN = '[-‐−ー－―]';
  const REPLACEMENTS = {
    email: '［メールアドレス］',
    phone: '［電話番号］',
    postal: '［郵便番号］',
    room: '○○号室',
  };
  // 古い iOS Safari で lookbehind が使えないため、前側の境界は
  // 「(^|[^0-9０-９])」でキャプチャして置換時に先頭へ戻す。
  const BOUNDARY = '(^|[^0-9０-９])';
  const NOT_DIGIT_AFTER = '(?![0-9０-９])';

  function emptyCounts() {
    return { email: 0, phone: 0, postal: 0, room: 0 };
  }

  function maskEmail(text, counts) {
    // リテラルは評価のたびに新しいオブジェクトになるため lastIndex は持ち越さない。
    const re = /[A-Za-z0-9._%+-]+[@＠][A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    return text.replace(re, () => {
      counts.email += 1;
      return REPLACEMENTS.email;
    });
  }

  function maskPhone(text, counts) {
    // 先頭の 0 または +81 の後に9〜10桁。候補を文字数で貪欲に拾うと、
    // 空白を挟んだ次の電話番号や部屋番号まで飲み込むため、桁数で区切る。
    const re = new RegExp(
      BOUNDARY +
        '([(（]?(?:\\+81|＋８１|0|０)(?:' +
        SEP +
        '*' +
        DIGIT +
        '){9,10})' +
        NOT_DIGIT_AFTER,
      'g',
    );
    return text.replace(re, (m, head, candidate) => {
      counts.phone += 1;
      return head + REPLACEMENTS.phone;
    });
  }

  function maskPostal(text, counts) {
    const withHyphen = new RegExp(
      BOUNDARY +
        '(?:〒\\s*)?' +
        DIGIT +
        '{3}' +
        HYPHEN +
        DIGIT +
        '{4}' +
        NOT_DIGIT_AFTER,
      'g',
    );
    const withMark = new RegExp(
      '〒\\s*' + DIGIT + '{7}' + NOT_DIGIT_AFTER,
      'g',
    );
    let out = text.replace(withMark, () => {
      counts.postal += 1;
      return REPLACEMENTS.postal;
    });
    out = out.replace(withHyphen, (m, head) => {
      counts.postal += 1;
      return head + REPLACEMENTS.postal;
    });
    return out;
  }

  function maskRoom(text, counts) {
    const re = /[0-9０-９〇一二三四五六七八九十百]{1,5}[\u0020\u3000]?号室/g;
    return text.replace(re, (m) => {
      // 「〇〇号室」のような例文（数字が〇だけ）は対象外にする。
      if (!/[0-9０-９一二三四五六七八九十百]/.test(m)) {
        return m;
      }
      counts.room += 1;
      return REPLACEMENTS.room;
    });
  }

  // 適用順: メール → 電話 → 郵便 → 部屋番号。
  function maskText(text) {
    const counts = emptyCounts();
    let out = text === null || text === undefined ? '' : String(text);
    out = maskEmail(out, counts);
    out = maskPhone(out, counts);
    out = maskPostal(out, counts);
    out = maskRoom(out, counts);
    const total = counts.email + counts.phone + counts.postal + counts.room;
    return { text: out, counts: counts, total: total };
  }

  // vars を浅くコピーし、keys に挙げた文字列値だけを maskText に通す。
  function maskVars(vars, keys) {
    const copy = Object.assign({}, vars);
    const counts = emptyCounts();
    (keys || []).forEach((key) => {
      if (typeof copy[key] !== 'string') {
        return;
      }
      const r = maskText(copy[key]);
      copy[key] = r.text;
      Object.keys(counts).forEach((k) => {
        counts[k] += r.counts[k];
      });
    });
    const total = counts.email + counts.phone + counts.postal + counts.room;
    return { vars: copy, counts: counts, total: total };
  }

  // 件数が1以上の種別だけを「電話番号1件・メール1件」の形で並べる。
  function formatSummary(counts) {
    const labels = [
      ['phone', '電話番号'],
      ['email', 'メール'],
      ['postal', '郵便番号'],
      ['room', '部屋番号'],
    ];
    return labels
      .filter((pair) => counts && counts[pair[0]] > 0)
      .map((pair) => pair[1] + counts[pair[0]] + '件')
      .join('・');
  }

  global.AiPiiMask = {
    REPLACEMENTS: REPLACEMENTS,
    emptyCounts: emptyCounts,
    maskText: maskText,
    maskVars: maskVars,
    formatSummary: formatSummary,
  };
})(window);
