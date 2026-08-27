/**
 * Generic multi-TF chain board (read-only).
 * Bubble first · fight line · hold/break sentence.
 * Does not change paper hunt.
 */

const TOUCH_PCT = 0.08;
const FIGHT_PCT = 0.25;

const BOARD_ORDER = [
  '2m',
  '5m',
  '10m',
  '15m',
  '30m',
  '1H',
  '2H',
  '3H',
  '4H',
  '6H',
  '12H',
  'Day',
];

/** Visual order: parents on top. */
export const CHAIN_ORDER = [
  'Week',
  '3D',
  'Day',
  '12H',
  '6H',
  '4H',
  '3H',
  '2H',
  '1H',
  '30m',
  '15m',
  '10m',
  '5m',
  '2m',
];

/** @param {unknown} v */
function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** @param {Record<string, unknown>} snapshot */
function tfMap(snapshot) {
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {};
  for (const row of snapshot.tfs || []) {
    const name = row?.tf;
    if (name) out[String(name)] = row;
  }
  return out;
}

/** @param {Record<string, unknown>} snapshot */
function boardMap(snapshot) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const row of snapshot.board || []) {
    const name = row?.tf;
    const bub = row?.bub;
    if (name && bub) out[String(name)] = String(bub);
  }
  if (!Object.keys(out).length) {
    for (const [name, row] of Object.entries(tfMap(snapshot))) {
      if (row.bub) out[name] = String(row.bub);
    }
  }
  return out;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function bubSide(bub) {
  const b = String(bub || '');
  if (b === 'LL' || b === 'HL') return 'up';
  if (b === 'HH' || b === 'LH') return 'down';
  return 'flat';
}

function bubSideHe(side) {
  if (side === 'up') return 'תחתון';
  if (side === 'down') return 'עליון';
  return 'אפור';
}

/**
 * @param {number} price
 * @param {number} px
 */
export function lineStatus(price, px) {
  if (!(price > 0) || !(px > 0)) return null;
  const dist = (Math.abs(price - px) / px) * 100;
  const above = price >= px;
  if (dist <= TOUCH_PCT) {
    return {
      st: 'נגיעה',
      st_en: 'touch',
      dist_pct: round3(dist),
      above,
      tip_he: above ? 'טיפה מעל' : 'טיפה מתחת',
      role_he: above ? 'תמיכה' : 'התנגדות',
    };
  }
  if (dist <= FIGHT_PCT) {
    return {
      st: 'מאבק',
      st_en: 'fight',
      dist_pct: round3(dist),
      above,
      tip_he: above ? 'טיפה מעל' : 'טיפה מתחת',
      role_he: above ? 'תמיכה' : 'התנגדות',
    };
  }
  if (above) {
    return {
      st: 'שבר מעלה',
      st_en: 'break_up',
      dist_pct: round3(dist),
      above: true,
      tip_he: 'מעל',
      role_he: 'תמיכה',
    };
  }
  return {
    st: 'שבר מטה',
    st_en: 'break_dn',
    dist_pct: round3(dist),
    above: false,
    tip_he: 'מתחת',
    role_he: 'התנגדות',
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {number} price
 */
function gatherTfLines(row, price) {
  /** @type {Array<Record<string, unknown>>} */
  const lines = [];
  const add = (kind, label, pxRaw) => {
    const px = num(pxRaw);
    if (px == null || !(px > 0)) return;
    const st = lineStatus(price, px);
    if (!st) return;
    lines.push({
      kind,
      label,
      px: round2(px),
      ...st,
    });
  };

  add('mf', 'ממוצע מהיר', row.mf);
  add('mm', 'ממוצע אמצע', row.mm);
  add('ms', 'ממוצע איטי', row.ms);
  add('mx', 'ממוצע נוסף', row.mx);
  add('srh', 'פיווט קטן עליון', row.srh);
  add('srl', 'פיווט קטן תחתון', row.srl);
  add('ph', 'פיווט גדול עליון', row.ph);
  add('pl', 'פיווט גדול תחתון', row.pl);
  add('rh', 'מסילה עליונה', row.rh);
  add('rl', 'מסילה תחתונה', row.rl);

  return lines;
}

/**
 * Active fight = closest touch/fight, else closest line overall.
 * @param {Array<Record<string, unknown>>} lines
 */
function pickFight(lines) {
  if (!lines.length) return null;
  const hot = lines
    .filter((l) => l.st_en === 'touch' || l.st_en === 'fight')
    .sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct));
  if (hot.length) return hot[0];
  return [...lines].sort(
    (a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct),
  )[0];
}

/**
 * Generic sentence for one TF.
 * @param {Record<string, unknown>} row
 */
export function chainSentence(row) {
  const side = String(row.side || 'flat');
  const fight = row.fight;
  const leanHe = side === 'up' ? 'מעלה' : side === 'down' ? 'מטה' : 'אפור';
  const hyp = `הנחה ${leanHe}`;
  if (!fight) {
    return {
      he: `${hyp} · אין קו מאבק צמוד · מחכים לנגיעה`,
      hyp_he: hyp,
      hold_he: 'אין קו מאבק צמוד',
      break_he: 'מחכים לנגיעה',
    };
  }
  const closeDir =
    side === 'up'
      ? 'סגירה מעל'
      : side === 'down'
        ? 'סגירה מתחת'
        : fight.above
          ? 'החזקה מעל'
          : 'החזקה מתחת';
  const hold = `כדי שיחזיק: ${closeDir} ${fight.label} ${fight.px}`;
  const br =
    side === 'up'
      ? `שובר אם חוזרים מתחת ל${fight.label} ${fight.px}`
      : side === 'down'
        ? `שובר אם חוזרים מעל ${fight.label} ${fight.px}`
        : `שובר אם נדחים מ${fight.label} ${fight.px}`;
  return {
    he: `${hyp} · ${hold} · ${br}`,
    hyp_he: hyp,
    hold_he: hold,
    break_he: br,
  };
}

/**
 * @param {Record<string, unknown>} snapshot
 * @param {number} [priceOverride]
 */
export function buildChainBoard(snapshot, priceOverride) {
  const tfs = tfMap(snapshot);
  const board = boardMap(snapshot);
  const price = num(priceOverride) ?? num(snapshot.price) ?? 0;

  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (const tf of CHAIN_ORDER) {
    const row = tfs[tf];
    if (!row && !board[tf]) continue;
    const bub = board[tf] || String(row?.bub || '-');
    const side = bubSide(bub);
    const lines = gatherTfLines(row || {}, price);
    const fight = pickFight(lines);
    const pivKinds = new Set(['srh', 'srl', 'ph', 'pl', 'rh', 'rl']);
    const pivs = lines.filter((l) => pivKinds.has(String(l.kind)));
    const pivHot = pivs
      .filter((l) => l.st_en === 'touch' || l.st_en === 'fight')
      .sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct));
    const pack = {
      tf,
      bub,
      side,
      side_he: bubSideHe(side),
      focus: tf === '4H',
      lines,
      fight: fight
        ? {
            kind: fight.kind,
            label: fight.label,
            px: fight.px,
            st: fight.st,
            st_en: fight.st_en,
            dist_pct: fight.dist_pct,
            tip_he: fight.tip_he,
            role_he: fight.role_he,
            above: fight.above,
            text_he: `${fight.label} ${fight.px} · ${fight.st} · ${fight.tip_he} · ${fight.role_he}`,
          }
        : null,
      mf: lines.find((l) => l.kind === 'mf') || null,
      ms: lines.find((l) => l.kind === 'ms') || null,
      piv:
        pivHot[0] ||
        pivs.sort(
          (a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct),
        )[0] ||
        null,
    };
    pack.sentence = chainSentence(pack);
    rows.push(pack);
  }

  for (const tf of BOARD_ORDER) {
    if (rows.some((r) => r.tf === tf)) continue;
    const row = tfs[tf];
    if (!row) continue;
    const bub = board[tf] || String(row.bub || '-');
    const side = bubSide(bub);
    const lines = gatherTfLines(row, price);
    const fight = pickFight(lines);
    const pack = {
      tf,
      bub,
      side,
      side_he: bubSideHe(side),
      focus: false,
      lines,
      fight: fight
        ? {
            kind: fight.kind,
            label: fight.label,
            px: fight.px,
            st: fight.st,
            st_en: fight.st_en,
            dist_pct: fight.dist_pct,
            tip_he: fight.tip_he,
            role_he: fight.role_he,
            above: fight.above,
            text_he: `${fight.label} ${fight.px} · ${fight.st} · ${fight.tip_he} · ${fight.role_he}`,
          }
        : null,
      mf: null,
      ms: null,
      piv: null,
    };
    pack.sentence = chainSentence(pack);
    rows.push(pack);
  }

  const h4 = rows.find((r) => r.tf === '4H') || null;
  const m30 = rows.find((r) => r.tf === '30m') || null;
  const h1 = rows.find((r) => r.tf === '1H') || null;
  if (m30) m30.collect = true;
  if (h1) h1.collect = true;
  // Finest TF in hook today = 2m (stand-in for breakout "minute" pivot).
  const fine = rows.find((r) => r.tf === '2m') || rows.find((r) => r.tf === '5m') || null;
  if (fine) fine.breakout = true;

  /** Working collect TFs (timing) + sticky parents (more fixed stuck points). */
  const WORK_TFS = ['30m', '1H'];
  const STICKY_TFS = ['6H', '12H', 'Day', '3D'];
  /** Higher TF = more fixed stuck point (prefer when hot). */
  const stickyRank = { '3D': 0, Day: 1, '12H': 2, '6H': 3 };
  const collectKinds = new Set(['mf', 'mm', 'ms', 'srh', 'srl', 'ph', 'pl', 'rh', 'rl']);
  const pivKinds = new Set(['srh', 'srl', 'ph', 'pl', 'rh', 'rl']);
  /** @param {Array<Record<string, unknown>>} list */
  function sortHot(list) {
    return [...list].sort((a, b) => {
      const hot = (x) => (x.st_en === 'touch' ? 0 : x.st_en === 'fight' ? 1 : 2);
      const ha = hot(a);
      const hb = hot(b);
      if (ha !== hb) return ha - hb;
      const sa = stickyRank[String(a.tf)] ?? 99;
      const sb = stickyRank[String(b.tf)] ?? 99;
      if (sa !== sb) return sa - sb;
      return /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct);
    });
  }
  /** @param {string[]} tfs @param {Set<string>} kinds @param {string} source */
  function linesFrom(tfs, kinds, source) {
    /** @type {Array<Record<string, unknown>>} */
    const out = [];
    for (const tf of tfs) {
      const row = rows.find((r) => r.tf === tf);
      if (!row) continue;
      for (const l of row.lines || []) {
        if (!kinds.has(String(l.kind))) continue;
        out.push({
          ...l,
          tf,
          label: source === 'sticky' ? `${l.label} · תקיעה ${tf}` : `${l.label} · ${tf}`,
          source,
        });
      }
    }
    return sortHot(out);
  }

  const workRows = linesFrom(WORK_TFS, collectKinds, 'work');
  const workHot = workRows.filter((l) => l.st_en === 'touch' || l.st_en === 'fight');
  const stickyRows = linesFrom(STICKY_TFS, collectKinds, 'sticky');
  const stickyHot = stickyRows.filter((l) => l.st_en === 'touch' || l.st_en === 'fight');
  /** Breakout pivots from fine TF when work + sticky are in the air. */
  const breakoutRows = sortHot(
    ((fine && fine.lines) || [])
      .filter((l) => pivKinds.has(String(l.kind)))
      .map((l) => ({
        ...l,
        tf: fine.tf,
        label: `${l.label} · התפרצות ${fine.tf}`,
        source: 'breakout_pivot',
      })),
  );
  const breakoutHot = breakoutRows.filter((l) => l.st_en === 'touch' || l.st_en === 'fight');
  const workAir = workHot.length === 0;
  const stickyAir = stickyHot.length === 0;
  const air = workAir && stickyAir;
  /** Prefer sticky stuck point when hot; else work 30m/1H; else breakout. */
  /** @type {Array<Record<string, unknown>>} */
  let actionTouches;
  /** @type {Array<Record<string, unknown>>} */
  let actionLines;
  /** @type {Record<string, unknown> | null} */
  let actionNext;
  /** @type {string} */
  let mode;
  if (stickyHot.length) {
    mode = 'sticky';
    actionTouches = stickyHot;
    actionLines = stickyRows.slice(0, 8);
    actionNext = stickyHot[0] || stickyRows[0] || null;
  } else if (workHot.length) {
    mode = 'work';
    actionTouches = workHot;
    actionLines = workRows.slice(0, 8);
    actionNext = workHot[0] || workRows[0] || null;
  } else {
    mode = 'breakout';
    actionTouches = breakoutHot;
    actionLines = breakoutRows.slice(0, 8);
    actionNext = breakoutHot[0] || breakoutRows[0] || null;
  }

  const actionTf = actionNext ? String(actionNext.tf) : mode === 'breakout' ? String(fine?.tf || '2m') : '30m';
  const workSide = m30?.side || h1?.side || fine?.side || null;
  const workSideHe = m30?.side_he || h1?.side_he || fine?.side_he || null;
  const workBub = m30?.bub || h1?.bub || fine?.bub || null;

  const collect = {
    tf: actionTf,
    active: Boolean(m30 || h1 || fine),
    air,
    mode,
    work_air: workAir,
    sticky_air: stickyAir,
    breakout_tf: fine ? String(fine.tf) : null,
    sticky_tfs: STICKY_TFS,
    bub: workBub,
    side: workSide,
    side_he: workSideHe,
    aligned_with_4h:
      h4 && workSide ? h4.side === workSide && h4.side !== 'flat' : null,
    path_side: h4?.side || null,
    path_side_he: h4?.side_he || null,
    touch_lines: actionTouches,
    lines: actionLines,
    sticky_next: stickyRows[0] || null,
    next: actionNext,
    sentence: m30?.sentence || h1?.sentence || fine?.sentence || null,
    rule_he:
      mode === 'sticky'
        ? 'תקיעה קבועה: מגע ב־6 / 12 / יום / 3D. מעדיפים נקודה יציבה יותר.'
        : mode === 'work'
          ? 'איסוף חצי שעה או שעה: מגע בפיווט או בממוצע. עם ארבע שעות = כניסה/הוספה. נגד = יציאת מקטע.'
          : 'אוויר בחצי שעה ושעה ובאבות: פיווט התפרצות מ־2 דקות. יציאת איסוף רק במגע בקו הזה.',
  };

  const kids = rows.filter((r) => ['1H', '30m', '15m'].includes(String(r.tf)));
  const parents = rows.filter((r) => ['6H', '12H', 'Day', '3D'].includes(String(r.tf)));

  /** @type {string[]} */
  const notes = [];
  if (h4) notes.push(`ארבע שעות: ${h4.sentence.he}`);
  if (mode === 'sticky' && collect.next) {
    const n = collect.next;
    notes.push(`תקיעה ${n.tf}: ${n.label} ${n.px} · ${n.st}`);
  } else if (mode === 'breakout') {
    notes.push(
      collect.next
        ? `אוויר · פיווט התפרצות ${collect.breakout_tf}: ${collect.next.label} ${collect.next.px} · ${collect.next.st}`
        : 'אוויר · אין עדיין פיווט התפרצות מ־2 דקות',
    );
  } else if (collect.next) {
    const n = collect.next;
    notes.push(
      `איסוף ${n.tf}: ${n.label} ${n.px} · ${n.st}` +
        (collect.aligned_with_4h === true
          ? ' · עם המסלול'
          : collect.aligned_with_4h === false
            ? ' · נגד המסלול'
            : ''),
    );
  }
  if (collect.sticky_next && mode !== 'sticky') {
    const s = /** @type {Record<string, unknown>} */ (collect.sticky_next);
    notes.push(`תקיעה הבאה ${s.tf}: ${s.label} ${s.px} · ${s.st}`);
  }
  const kidRed = kids.filter((k) => k.side === 'down').length;
  const kidGreen = kids.filter((k) => k.side === 'up').length;
  if (kidRed && h4?.side === 'up') {
    notes.push('ילדים אדומים מתחת. ארבע שעות במבחן מעלה בלי אישור קצר');
  }
  if (kidGreen && h4?.side === 'down') {
    notes.push('ילדים ירוקים מתחת. ארבע שעות במבחן מטה בלי אישור קצר');
  }
  const parentRed = parents.filter((p) => p.side === 'down').length;
  const parentGreen = parents.filter((p) => p.side === 'up').length;
  if (h4?.side === 'up' && parentRed) {
    notes.push('הורים אדומים. בדיקה מעלה מול תקרה');
  }
  if (h4?.side === 'down' && parentGreen) {
    notes.push('הורים ירוקים. בדיקה מטה מול רצפה');
  }

  return {
    price: round2(price),
    touch_pct: TOUCH_PCT,
    fight_pct: FIGHT_PCT,
    focus_tf: '4H',
    collect_tf: '30m',
    work_tfs: WORK_TFS,
    sticky_tfs: STICKY_TFS,
    breakout_tf: fine ? String(fine.tf) : '2m',
    sentence: h4?.sentence || null,
    collect,
    rows,
    notes,
  };
}
