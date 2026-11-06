/**
 * 生成ボタンのデザイン（Claude風 / Gemini風）の共通モジュール。
 * 設定画面のプレビューと、レコード画面の実ボタンの両方で使う。
 * ラベルは textContent / createTextNode だけで入れる（innerHTML は使わない）。
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DESIGNS = [
    {
      id: 'claude-b',
      label: 'Claude風 B（白地・黒セリフ・テラコッタのスパーク）',
      description: '白地に黒い枠のピル型。ホバーでスパークが少し回ります。',
      provider: 'anthropic',
    },
    {
      id: 'claude-c',
      label: 'Claude風 C（黒地・白セリフ・テラコッタのスパーク）',
      description: '黒地の角丸ボタン。ホバーでスパークが回り続けます。',
      provider: 'anthropic',
    },
    {
      id: 'gemini-a',
      label: 'Gemini風 A（白地・青グラデ文字）',
      description: '白地のピル型に、フルカラーのスパークルと青い文字。',
      provider: 'gemini',
    },
    {
      id: 'gemini-b',
      label: 'Gemini風 B（ダーク・青から紫のグラデ文字）',
      description: '黒に近い地のピル型に、青から紫、赤のグラデ文字。',
      provider: 'gemini',
    },
    {
      id: 'gemini-c',
      label: 'Gemini風 C（ブルー面・白チップ）',
      description: '青い面の左に、白い角丸のチップでスパークルを置きます。',
      provider: 'gemini',
    },
  ];

  const KNOWN_IDS = DESIGNS.map((d) => d.id);

  // 描画のたびに増やす連番（SVG の gradient id を一意にする）。
  let seq = 0;

  function normalize(value) {
    if (typeof value !== 'string') return '';
    return KNOWN_IDS.indexOf(value) !== -1 ? value : '';
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  // Claude のスパーク（fill は currentColor）。
  const SPARK_POINTS =
    '428,160 468,165 485,180 510,235 548,322 630,482 640,515 650,525 655,450 665,370 672,260 676,230 692,194 721,174 745,186 764,212 749,308 713,497 722,497 737,487 772,435 838,352 900,285 921,267 963,267 992,312 980,358 908,450 852,526 820,580 828,584 940,560 1080,537 1113,553 1117,568 1104,601 1025,620 932,638 795,671 797,675 858,681 885,682 950,682 1070,690 1101,711 1120,738 1117,758 1069,781 850,730 796,716 790,717 791,720 835,762 910,830 1013,928 1019,950 1005,968 992,968 905,902 870,873 794,808 789,808 790,815 900,980 905,1024 897,1040 873,1047 846,1041 790,962 736,880 690,801 686,802 683,803 657,1093 644,1108 615,1119 591,1101 578,1071 590,1010 620,875 631,798 637,772 631,772 580,842 487,968 417,1043 400,1048 372,1034 375,1007 390,985 487,865 545,788 581,744 580,738 325,902 280,908 260,889 263,862 272,850 348,798 537,691 541,680 535,678 497,676 390,673 205,664 181,659 160,631 163,619 181,604 210,607 425,621 524,630 541,630 542,624 535,619 440,553 337,485 285,447 255,428 239,408 233,368 259,340 294,342 304,345 415,430 520,507 530,516 536,511 535,505 478,402 416,299 392,259 382,225 380,207 411,165';

  function buildClaudeSpark() {
    const svg = svgEl('svg', {
      class: 'obp-bd-sp',
      viewBox: '0 0 1280 1280',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    svg.appendChild(
      svgEl('circle', { cx: '665', cy: '665', r: '100', fill: 'currentColor' }),
    );
    svg.appendChild(
      svgEl('polygon', { fill: 'currentColor', points: SPARK_POINTS }),
    );
    return svg;
  }

  // Gemini のスパークル（4点・凹んだ形）。
  const GEM_PATH =
    'M47.6 8 C48.5 3.5 51.5 3.5 52.4 8 C54 27 72 46 92 47.6 C96.5 48.5 96.5 51.5 92 52.4 C72 54 54 73 52.4 92 C51.5 96.5 48.5 96.5 47.6 92 C46 73 28 54 8 52.4 C3.5 51.5 3.5 48.5 8 47.6 C28 46 46 27 47.6 8 Z';

  function stop(offset, color, opacity) {
    const attrs = { offset: offset, 'stop-color': color };
    if (opacity !== undefined) attrs['stop-opacity'] = opacity;
    return svgEl('stop', attrs);
  }

  function radial(id, cx, cy, r, stops) {
    const g = svgEl('radialGradient', {
      id: id,
      gradientUnits: 'userSpaceOnUse',
      cx: cx,
      cy: cy,
      r: r,
    });
    stops.forEach((s) => g.appendChild(stop(s[0], s[1], s[2])));
    return g;
  }

  // kind: 'full'（フルカラー）| 'dark'（青から薄紫の単色グラデ）
  function buildGeminiSpark(kind) {
    const n = ++seq;
    const svg = svgEl('svg', {
      class: 'obp-bd-sp',
      viewBox: '0 0 100 100',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    const defs = svgEl('defs');
    svg.appendChild(defs);
    if (kind === 'dark') {
      const lg = svgEl('linearGradient', {
        id: 'obp-bd-gr-dark-' + n,
        gradientUnits: 'userSpaceOnUse',
        x1: '4',
        y1: '70',
        x2: '96',
        y2: '30',
      });
      lg.appendChild(stop('0', '#4285F4'));
      lg.appendChild(stop('.45', '#5B98FF'));
      lg.appendChild(stop('1', '#C3A7F5'));
      defs.appendChild(lg);
      svg.appendChild(
        svgEl('path', { d: GEM_PATH, fill: 'url(#obp-bd-gr-dark-' + n + ')' }),
      );
      return svg;
    }
    const ids = {
      green: 'obp-bd-gr-green-' + n,
      yellow: 'obp-bd-gr-yellow-' + n,
      red: 'obp-bd-gr-red-' + n,
    };
    defs.appendChild(
      radial(ids.red, '46', '4', '44', [
        ['0', '#F94545'],
        ['.4', '#F94545', '.9'],
        ['.75', '#F94545', '.25'],
        ['1', '#F94545', '0'],
      ]),
    );
    defs.appendChild(
      radial(ids.yellow, '3', '52', '56', [
        ['0', '#FBBC04'],
        ['.4', '#F2C21A', '.95'],
        ['.75', '#C8D63E', '.35'],
        ['1', '#C8D63E', '0'],
      ]),
    );
    defs.appendChild(
      radial(ids.green, '44', '97', '50', [
        ['0', '#0FB866'],
        ['.45', '#2DB86A', '.9'],
        ['.8', '#2DB86A', '.25'],
        ['1', '#2DB86A', '0'],
      ]),
    );
    svg.appendChild(svgEl('path', { d: GEM_PATH, fill: '#3385FF' }));
    ['green', 'yellow', 'red'].forEach((k) => {
      svg.appendChild(
        svgEl('path', { d: GEM_PATH, fill: 'url(#' + ids[k] + ')' }),
      );
    });
    return svg;
  }

  function buildIcon(id) {
    switch (id) {
      case 'claude-b':
      case 'claude-c':
        return buildClaudeSpark();
      case 'gemini-a':
        return buildGeminiSpark('full');
      case 'gemini-b':
        return buildGeminiSpark('dark');
      case 'gemini-c': {
        const chip = document.createElement('span');
        chip.className = 'obp-bd-chip';
        chip.appendChild(buildGeminiSpark('full'));
        return chip;
      }
      default:
        return null;
    }
  }

  /**
   * ボタン要素にデザインを適用する（既存の子要素は置き換える）。
   * 不正な designId のときは何も変更しない。
   * opts: { icon: boolean, size: 'md' | 'sm' }
   */
  function apply(btn, designId, label, opts) {
    const id = normalize(designId);
    if (!btn || !id) return;
    const o = opts || {};
    const withIcon = o.icon !== false;
    btn.className =
      'obp-bd obp-bd--' + id + (o.size === 'sm' ? ' obp-bd--sm' : '');
    btn.textContent = '';
    if (withIcon) {
      const icon = buildIcon(id);
      if (icon) btn.appendChild(icon);
    }
    const text = String(label === undefined || label === null ? '' : label);
    if (id === 'gemini-a' || id === 'gemini-b') {
      const tx = document.createElement('span');
      tx.className = 'obp-bd-tx';
      tx.textContent = text;
      btn.appendChild(tx);
    } else {
      btn.appendChild(document.createTextNode(text));
    }
  }

  window.AIWritingButtonDesign = {
    DESIGNS: DESIGNS,
    KNOWN_IDS: KNOWN_IDS,
    normalize: normalize,
    apply: apply,
  };
})();
