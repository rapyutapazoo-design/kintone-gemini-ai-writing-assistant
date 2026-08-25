(function (global) {
  'use strict';

  // =========================================================
  // プロンプト自動退避ログのデータ層。
  // DOM・kintone API に一切依存しない純粋関数のみで構成する
  // （Node上でも単体検証できるようにするため）。
  // =========================================================

  // 世代の区切り行を検出する基本パターン。本文に出現しにくい形にしてある。
  // 実際の分割には行頭アンカー＋グローバル／複数行フラグの正規表現を用いる。
  const HEADER_LINE_RE = /^=====\s*\[(\d+)\][^\n]*$/gm;

  const NOTICE_PREFIX = '※古い世代を削除しました';
  const NOTICE_LINE =
    NOTICE_PREFIX + '（文字数上限のため、古い世代を自動削除しました）';

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // 本文中に区切り行と同形の行（行頭 "===== [n]"）が含まれていると
  // parseBackupLog が誤って世代境界と認識してしまうため、書き込み前に
  // 該当行の行頭へ半角スペースを1つ挿入してエスケープする。
  // unescapeBody とペアで、往復すると元の文字列に戻る（可逆）。
  function escapeBody(text) {
    return String(text == null ? '' : text).replace(
      /^(=====\s*\[\d+\])/gm,
      ' $1',
    );
  }

  // escapeBody の逆変換。行頭に半角スペース1つ＋"===== [n]" が続く行から、
  // 先頭の半角スペースだけを1つ取り除く。
  function unescapeBody(text) {
    return String(text == null ? '' : text).replace(
      /^ (=====\s*\[\d+\])/gm,
      '$1',
    );
  }

  // ローカル時刻の 'YYYY-MM-DD HH:MM' 文字列を生成する。
  function formatDateTime(date) {
    const d =
      date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    return (
      d.getFullYear() +
      '-' +
      pad2(d.getMonth() + 1) +
      '-' +
      pad2(d.getDate()) +
      ' ' +
      pad2(d.getHours()) +
      ':' +
      pad2(d.getMinutes())
    );
  }

  // 例: "===== [3] 2026-08-26 15:10 / 400字程度 / 見出し＋箇条書き ====="
  function buildEntryHeader(index, date, lengthLabel, formatLabel) {
    const dt = formatDateTime(date);
    const length = lengthLabel == null ? '' : String(lengthLabel);
    const format = formatLabel == null ? '' : String(formatLabel);
    return (
      '===== [' + index + '] ' + dt + ' / ' + length + ' / ' + format + ' ====='
    );
  }

  // 区切り行が1つも見つからない場合は、内容を失わせないために
  // テキスト全体を1件の世代として返す（datetime・meta は空文字）。
  // 空文字列の場合は空配列を返す。
  function parseBackupLog(text) {
    const str = String(text == null ? '' : text);
    if (str.length === 0) {
      return [];
    }

    const matches = [];
    HEADER_LINE_RE.lastIndex = 0;
    let m;
    while ((m = HEADER_LINE_RE.exec(str)) !== null) {
      matches.push({
        line: m[0],
        indexStr: m[1],
        start: m.index,
        end: m.index + m[0].length,
      });
      // ゼロ幅マッチ対策（本正規表現では発生しないが念のため）
      if (m[0].length === 0) {
        HEADER_LINE_RE.lastIndex += 1;
      }
    }

    if (matches.length === 0) {
      return [
        {
          index: 1,
          datetime: '',
          meta: '',
          body: str,
          raw: str,
          isFallback: true,
        },
      ];
    }

    const entries = [];
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const next = matches[i + 1];
      const rawEnd = next ? next.start : str.length;
      const raw = str.slice(cur.start, rawEnd);

      let rest = cur.line.slice(cur.line.indexOf(']') + 1);
      rest = rest.replace(/\s*=+\s*$/, '').trim();

      let datetime = '';
      let meta = '';
      const slashPos = rest.indexOf('/');
      if (slashPos === -1) {
        datetime = rest;
      } else {
        datetime = rest.slice(0, slashPos).trim();
        meta = rest.slice(slashPos + 1).trim();
      }

      const bodyRaw = str.slice(cur.end, rawEnd);
      const body = unescapeBody(
        bodyRaw.replace(/^\n+/, '').replace(/\s+$/, ''),
      );

      const idxNum = parseInt(cur.indexStr, 10);
      entries.push({
        index: isNaN(idxNum) ? i + 1 : idxNum,
        datetime: datetime,
        meta: meta,
        body: body,
        raw: raw,
        isFallback: false,
      });
    }

    return entries;
  }

  // 既存ログの先頭に新しい世代を積んで返す。
  // 連番は既存ログ中の最大連番+1を採番する（パース失敗時のフォールバック
  // 1件世代も連番1として扱われるため、その場合は2番から採番される）。
  function appendEntry(existingText, promptText, meta) {
    const opts = meta || {};
    const entries = parseBackupLog(existingText);
    let maxIndex = 0;
    entries.forEach(function (e) {
      if (typeof e.index === 'number' && e.index > maxIndex) {
        maxIndex = e.index;
      }
    });
    const nextIndex = maxIndex + 1;
    const date = opts.date instanceof Date ? opts.date : new Date();
    const header = buildEntryHeader(
      nextIndex,
      date,
      opts.lengthLabel || '',
      opts.formatLabel || '',
    );
    const body = escapeBody(String(promptText == null ? '' : promptText));
    const newEntryText = header + '\n' + body;

    const existing = String(existingText == null ? '' : existingText);
    if (existing.trim().length === 0) {
      return newEntryText;
    }
    return newEntryText + '\n\n' + existing.replace(/^\n+/, '');
  }

  // テキスト中に存在する注記行をすべて取り除く（増殖防止のための正規化）。
  function stripNoticeLines(text) {
    return String(text == null ? '' : text).replace(
      /^※古い世代を削除しました[^\n]*\n{0,2}/gm,
      '',
    );
  }

  // 上限超過時に古い世代（末尾）から世代単位で削除する。
  // maxChars <= 0（または非数値）は無制限として何もしない。
  // 世代が1件しか残っていない場合は、内容を失わせないために削除しない
  // （その場合、注記行も付与しない＝実際には削除していないため）。
  function trimToMaxChars(text, maxChars) {
    const limit =
      typeof maxChars === 'number' ? maxChars : parseInt(maxChars, 10);
    const str = String(text == null ? '' : text);

    if (!(limit > 0)) {
      return stripNoticeLines(str);
    }

    const clean = stripNoticeLines(str);
    if (clean.length <= limit) {
      return clean;
    }

    // 最初のヘッダ行より前のテキスト（手書きメモなどのプリアンブル）は
    // parseBackupLog の各世代（entry.raw）には含まれないため、削除対象に
    // 巻き込まないよう別途保持しておき、再構築時に先頭へ復元する。
    HEADER_LINE_RE.lastIndex = 0;
    const firstMatch = HEADER_LINE_RE.exec(clean);
    const preamble = firstMatch ? clean.slice(0, firstMatch.index) : '';

    const entries = parseBackupLog(clean);
    if (entries.length <= 1) {
      return clean;
    }

    const kept = entries.slice();
    let body = kept
      .map(function (e) {
        return e.raw;
      })
      .join('');
    while (
      kept.length > 1 &&
      (preamble + NOTICE_LINE + '\n\n' + body).length > limit
    ) {
      kept.pop();
      body = kept
        .map(function (e) {
          return e.raw;
        })
        .join('');
    }

    return preamble + NOTICE_LINE + '\n\n' + body;
  }

  global.GeminiPromptBackup = {
    NOTICE_LINE: NOTICE_LINE,
    NOTICE_PREFIX: NOTICE_PREFIX,
    formatDateTime: formatDateTime,
    buildEntryHeader: buildEntryHeader,
    parseBackupLog: parseBackupLog,
    appendEntry: appendEntry,
    stripNoticeLines: stripNoticeLines,
    trimToMaxChars: trimToMaxChars,
    escapeBody: escapeBody,
    unescapeBody: unescapeBody,
  };
})(window);
