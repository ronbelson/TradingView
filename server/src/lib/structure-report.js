/**
 * Structure station report — multi-TF board + next stop down/up.
 * Port of structure_report.py
 */

import { buildChainBoard } from './chain-board.js';

export const BOARD_ORDER = [
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

export const STATION_TFS = ['4H', '1H', '30m', '15m', '5m', '2m', 'Day', '12H', '6H', '3D', 'Week'];
export const BIG_TFS = ['4H', '6H', '12H', 'Day', '3D', 'Week'];
export const EDGE_CONFIRM_TFS = ['1H', '30m', '15m', '5m'];

const UP_STRUCT = new Set(['HH', 'HL']);
const DN_STRUCT = new Set(['LH', 'LL']);

/** @param {unknown} v */
export function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** @param {Record<string, unknown>} snapshot */
export function tfMap(snapshot) {
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {};
  for (const row of snapshot.tfs || []) {
    const name = row?.tf;
    if (name) out[String(name)] = row;
  }
  return out;
}

/** @param {Record<string, unknown>} snapshot */
export function boardMap(snapshot) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const row of snapshot.board || []) {
    const name = row?.tf;
    const bub = row?.bub;
    if (name && bub) out[String(name)] = String(bub);
  }
  if (Object.keys(out).length === 0) {
    for (const [name, row] of Object.entries(tfMap(snapshot))) {
      if (row?.bub) out[name] = String(row.bub);
    }
  }
  return out;
}

/** @param {string} bub */
function structSide(bub) {
  if (UP_STRUCT.has(bub)) return 'up';
  if (DN_STRUCT.has(bub)) return 'down';
  return 'none';
}

/** @param {string} side */
function structHe(side) {
  if (side === 'up') return 'מבנה עולה';
  if (side === 'down') return 'מבנה יורד';
  return 'אין';
}

/** @param {Record<string, unknown>} row @param {string} tf */
function levelPoints(row, tf) {
  const bub = String(row.bub || '');
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  const mapping = [
    ['mf', 'ממוצע מהיר'],
    ['mm', 'ממוצע אמצע'],
    ['ms', 'ממוצע איטי'],
    ['srl', 'פיווט קטן תחתון'],
    ['srh', 'פיווט קטן עליון'],
    ['rl', 'מסילה תחתונה'],
    ['rh', 'מסילה עליונה'],
    ['pl', 'פיווט גדול תחתון'],
    ['ph', 'פיווט גדול עליון'],
    ['pl2', 'פיווט גדול תחתון קודם'],
    ['ph2', 'פיווט גדול עליון קודם'],
    ['poc', 'נקודת נפח'],
  ];
  for (const [key, label] of mapping) {
    const px = num(row[key]);
    if (px == null) continue;
    out.push({ tf, kind: key, label, px: round2(px), bub });
  }
  const bubPx = num(row.bubPx);
  if (bubPx != null && bub) {
    let role = 'מחיר בועה';
    if (bub === 'LL' || bub === 'HL') role = 'תמיכת בועה';
    else if (bub === 'HH' || bub === 'LH') role = 'תקרת בועה';
    out.push({ tf, kind: 'bubPx', label: `${role} ${bub}`, px: round2(bubPx), bub });
  }
  const opp = num(row.oppPx);
  if (opp != null) {
    out.push({ tf, kind: 'oppPx', label: 'צד נגדי לבועה', px: round2(opp), bub });
  }
  return out;
}

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** @param {string} tf */
function tfRank(tf) {
  const i = STATION_TFS.indexOf(tf);
  return i >= 0 ? i : 99;
}

/** @param {Array<Record<string, unknown>>} rows @param {number} [tolPct] */
function dedupeStations(rows, tolPct = 0.08) {
  const sorted = [...rows].sort((a, b) => /** @type {number} */ (a.px) - /** @type {number} */ (b.px));
  /** @type {Array<Record<string, unknown>>} */
  const merged = [];
  for (const r of sorted) {
    if (!merged.length) {
      merged.push({ ...r, sources: [`${r.tf}:${r.label}`] });
      continue;
    }
    const prev = merged[merged.length - 1];
    const prevPx = /** @type {number} */ (prev.px);
    const rPx = /** @type {number} */ (r.px);
    if (prevPx && Math.abs(rPx - prevPx) / prevPx * 100 <= tolPct) {
      /** @type {string[]} */ (prev.sources).push(`${r.tf}:${r.label}`);
      if (tfRank(String(r.tf)) < tfRank(String(prev.tf))) {
        prev.tf = r.tf;
        prev.label = r.label;
        if ('kind' in r) prev.kind = r.kind;
        prev.bub = r.bub;
      }
    } else {
      merged.push({ ...r, sources: [`${r.tf}:${r.label}`] });
    }
  }
  return merged;
}

/** @param {Record<string, unknown>} snapshot */
export function buildBoard(snapshot) {
  const tfs = tfMap(snapshot);
  const board = boardMap(snapshot);
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (const tf of BOARD_ORDER) {
    const row = tfs[tf] || {};
    const bub = board[tf] || String(row.bub || '-');
    const side = structSide(bub);
    rows.push({
      tf,
      bub,
      structure: side,
      structure_he: structHe(side),
      zap: row.zap || '-',
      pink: row.pink || '-',
      channel: row.channel || '-',
      stk: row.stk || '-',
      bubPx: num(row.bubPx),
      mAbove: row.mAbove,
    });
  }
  return rows;
}

/** @param {Record<string, unknown>} snapshot @param {number} price */
function thinReclaim(snapshot, price) {
  const tfs = tfMap(snapshot);
  /** @type {string[]} */
  const notes = [];
  /** @type {Array<Record<string, unknown>>} */
  const checks = [];

  /** @param {Record<string, unknown>} row */
  function masFrom(row) {
    /** @type {Array<{ kind: string, label: string, px: number }>} */
    const out = [];
    for (const [k, lab] of [
      ['mf', 'ממוצע מהיר'],
      ['mm', 'ממוצע אמצע'],
      ['ms', 'ממוצע איטי'],
    ]) {
      const px = num(row[k]);
      if (px != null) out.push({ kind: k, label: lab, px: round2(px) });
    }
    return out;
  }

  for (const tf of ['5m', '2m', '15m', '30m']) {
    const row = tfs[tf] || {};
    const bub = String(row.bub || '');
    const bubPx = num(row.bubPx);
    let mases = masFrom(row);
    /** @type {string|null} */
    let proxy = null;
    if ((tf === '5m' || tf === '2m') && !mases.length) {
      const proxRow = tfs['15m'] || tfs['30m'] || {};
      mases = masFrom(proxRow);
      proxy = tfs['15m'] ? '15m' : tfs['30m'] ? '30m' : null;
    }
    if (!mases.length) continue;

    const above = mases.filter((m) => m.px > price).sort((a, b) => a.px - b.px);
    const below = mases.filter((m) => m.px < price);
    const lowLed = bub === 'LL' || bub === 'HL';
    const bounced = bubPx != null && price >= bubPx * 0.999;
    const underThin = mases.some((m) => (m.kind === 'mf' || m.kind === 'mm') && m.px > price);
    const reclaim = lowLed && bounced && underThin && above.length > 0;
    const thinAbove = above.filter((m) => m.kind === 'mf' || m.kind === 'mm');
    const nextCheck = thinAbove[0] || above[0] || null;
    const item = {
      tf,
      bub,
      bubPx,
      low_led: lowLed,
      under_thin: underThin,
      reclaim_attempt: reclaim,
      mas: mases,
      mas_proxy_tf: proxy,
      next_check: nextCheck,
      thin_above: above.slice(0, 3),
      thin_below: below.slice(-3),
    };
    checks.push(item);
    const proxyTxt = proxy ? ` (קווים מ־${proxy})` : '';
    if (reclaim && nextCheck) {
      notes.push(
        `${tf}${proxyTxt}: נמוך ${bub} ב־${bubPx} התחיל שינוי. ` +
          `נשברו פסים דקים בירידה. עכשיו ניסיון פריצה חזרה עד נקודת בדיקה ` +
          `${nextCheck.px} (${nextCheck.label})`,
      );
    } else if (lowLed && !underThin) {
      notes.push(`${tf}${proxyTxt}: הנמוך ${bub} כבר מעל או דרך הפסים הדקים`);
    } else if (lowLed && underThin) {
      notes.push(`${tf}${proxyTxt}: נמוך ${bub} ועדיין מתחת לקווים הדקים`);
    }
  }

  let primary =
    checks.find((c) => c.tf === '5m' && c.reclaim_attempt) ||
    checks.find((c) => c.reclaim_attempt) ||
    checks.find((c) => c.tf === '5m') ||
    checks[0] ||
    null;
  const active = Boolean(primary && primary.reclaim_attempt);
  return {
    active,
    primary,
    checks,
    notes,
    path: active ? 'reclaim_thin' : 'none',
    path_he: active ? 'ניסיון פריצה חזרה לקווים הדקים' : 'אין ניסיון פריצה חזרה',
  };
}

/** @param {Record<string, unknown>} snapshot @param {number} price @param {Record<string, unknown>} reclaim */
function edgePlan(snapshot, price, reclaim) {
  const tfs = tfMap(snapshot);
  const board = boardMap(snapshot);
  const h4 = tfs['4H'] || {};
  const bub4 = board['4H'] || String(h4.bub || '');

  /** @type {Array<Record<string, unknown>>} */
  const upperLevels = [];
  /** @type {Array<Record<string, unknown>>} */
  const lowerLevels = [];

  for (const [key, label] of [
    ['srh', 'פיווט קטן עליון'],
    ['rh', 'מסילה עליונה / קו ירוק'],
    ['ph', 'פיווט גדול עליון'],
    ['ph2', 'פיווט עליון קודם'],
    ['ms', 'ממוצע איטי'],
    ['bubPx', `מחיר בועה ${bub4}`],
  ]) {
    const px = num(h4[key]);
    if (px != null && px >= price * 0.995) {
      upperLevels.push({
        kind: key,
        label,
        px: round2(px),
        dist_pct: round3(Math.abs(px - price) / price * 100),
      });
    }
  }
  for (const [key, label] of [
    ['srl', 'פיווט קטן תחתון'],
    ['rl', 'מסילה תחתונה'],
    ['pl', 'פיווט גדול תחתון'],
    ['pl2', 'פיווט תחתון קודם'],
    ['mf', 'ממוצע מהיר'],
    ['bubPx', `מחיר בועה ${bub4}`],
  ]) {
    const px = num(h4[key]);
    if (px != null && px <= price * 1.005) {
      lowerLevels.push({
        kind: key,
        label,
        px: round2(px),
        dist_pct: round3(Math.abs(price - px) / price * 100),
      });
    }
  }

  upperLevels.sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct));
  lowerLevels.sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct));
  let nearestUp = upperLevels[0] || null;
  let nearestDn = lowerLevels[0] || null;

  const bubPx = num(h4.bubPx);
  const bubDistPct =
    bubPx != null && price > 0 ? round3((Math.abs(price - bubPx) / price) * 100) : null;
  // Bubble must be near current price — letter alone (old LL far below) is not an edge.
  const bubNear = bubDistPct != null && bubDistPct <= 0.7;
  const bottomBub = bub4 === 'LL' || bub4 === 'HL';
  const topBub = bub4 === 'HH' || bub4 === 'LH';

  if (bottomBub && bubNear && bubPx != null) {
    nearestDn = {
      kind: 'bubPx',
      label: `מחיר בועה ${bub4}`,
      px: round2(bubPx),
      dist_pct: bubDistPct,
    };
  }
  if (topBub && bubNear && bubPx != null) {
    nearestUp = {
      kind: 'bubPx',
      label: `מחיר בועה ${bub4}`,
      px: round2(bubPx),
      dist_pct: bubDistPct,
    };
  }

  const nearUpCount = upperLevels.filter((u) => /** @type {number} */ (u.dist_pct) <= 0.55).length;
  const atUpperEdge =
    nearestUp != null &&
    /** @type {number} */ (nearestUp.dist_pct) <= 0.55 &&
    topBub &&
    bubNear;
  const atLowerEdge =
    nearestDn != null &&
    /** @type {number} */ (nearestDn.dist_pct) <= 0.55 &&
    bottomBub &&
    bubNear;
  const midMove = !atUpperEdge && !atLowerEdge;

  /** @type {Array<Record<string, unknown>>} */
  const ltfRetest = [];
  for (const tf of EDGE_CONFIRM_TFS) {
    const row = tfs[tf] || {};
    const bub = board[tf] || String(row.bub || '');
    if (atUpperEdge && (bub === 'HH' || bub === 'LH' || bub === 'HL')) {
      ltfRetest.push({ tf, bub, role: 'בדיקת קצה עליון' });
    }
    if (atLowerEdge && (bub === 'LL' || bub === 'HL' || bub === 'LH')) {
      ltfRetest.push({ tf, bub, role: 'בדיקת קצה תחתון' });
    }
    // reclaim alone is not enough without a 4H bottom bubble near price
  }

  const seen = new Set();
  /** @type {Array<Record<string, unknown>>} */
  const ltfClean = [];
  for (const x of ltfRetest) {
    const k = `${x.tf}:${x.role}`;
    if (seen.has(k)) continue;
    seen.add(k);
    ltfClean.push(x);
  }

  /** @type {string|null} */
  let side = null;
  if (atUpperEdge && ltfClean.length) side = 'short_edge';
  else if (atLowerEdge && ltfClean.length) side = 'long_edge';
  else if (atUpperEdge) side = 'short_watch';
  else if (atLowerEdge) side = 'long_watch';

  /** @type {Array<Record<string, unknown>>} */
  let continueUp = [];
  /** @type {Array<Record<string, unknown>>} */
  let continueDown = [];
  for (const tf of BIG_TFS) {
    const row = tfs[tf] || {};
    const bub = board[tf] || String(row.bub || '');
    for (const [key, label] of [
      ['srh', 'פיווט קטן עליון'],
      ['rh', 'מסילה עליונה'],
      ['ph', 'פיווט גדול עליון'],
      ['bubPx', `בועה ${bub}`],
      ['ms', 'ממוצע איטי'],
      ['mf', 'ממוצע מהיר'],
      ['srl', 'פיווט קטן תחתון'],
      ['rl', 'מסילה תחתונה'],
      ['pl', 'פיווט גדול תחתון'],
    ]) {
      const px = num(row[key]);
      if (px == null) continue;
      if (px > price * 1.0005) {
        continueUp.push({
          tf,
          label,
          px: round2(px),
          dist_pct: round3((px - price) / price * 100),
          bub,
        });
      }
      if (px < price * 0.9995) {
        continueDown.push({
          tf,
          label,
          px: round2(px),
          dist_pct: round3((price - px) / price * 100),
          bub,
        });
      }
    }
  }
  continueUp = dedupeStations(continueUp).sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct)).slice(0, 6);
  continueDown = dedupeStations(continueDown)
    .sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct))
    .slice(0, 6);

  /** @type {string[]} */
  const notes = [];
  if (midMove) notes.push('לא בקצה 4 שעות. באמצע המסע. לא כניסה לפי כלל הקצה');
  if (bottomBub && !bubNear && bubPx != null) {
    notes.push(
      `יש אות תחתית ${bub4} ב־4ש במחיר ${round2(bubPx)} אבל רחוק מהמחיר. אין כניסת לונג בלי בועה קרובה`,
    );
  }
  if (topBub && !bubNear && bubPx != null) {
    notes.push(
      `יש אות עליונה ${bub4} ב־4ש במחיר ${round2(bubPx)} אבל רחוק מהמחיר. אין כניסת שורט בלי בועה קרובה`,
    );
  }
  if (atUpperEdge && nearestUp) {
    notes.push(
      `קצה עליון ב־4 שעות ליד ${nearestUp.px} (${nearestUp.label}). ניסיונות קרובים סביב הקו: ${nearUpCount}`,
    );
    notes.push('מטרה: שורט בהתחלת הדחייה אחרי שהקצרים חוזרים לבדוק. לא אחרי שכבר ירדו חזק');
  }
  if (atLowerEdge && nearestDn) {
    notes.push(`קצה תחתון ב־4 שעות ליד ${nearestDn.px} (${nearestDn.label})`);
    notes.push('מטרה: לונג בהתחלת הסיבוב מהנמוך אחרי שהקצרים חוזרים לבדוק');
  }
  if (ltfClean.length) {
    notes.push(
      'אישור קצרים: ' + ltfClean.slice(0, 5).map((x) => `${x.tf} ${x.bub} (${x.role})`).join(', '),
    );
  } else if (atUpperEdge || atLowerEdge) {
    notes.push('יש קצה ב־4 שעות אבל עדיין אין אישור חזרה מהקצרים');
  }

  if ((side === 'long_edge' || side === 'long_watch') && continueUp.length) {
    const n1 = continueUp[0];
    notes.push(`אם ממשיך למעלה: יציאה / יעד ראשון ${n1.px} (${n1.tf} ${n1.label})`);
    if (continueUp.length > 1) {
      const n2 = continueUp[1];
      notes.push(`אם ממשיך עוד: נקודה הבאה ${n2.px} (${n2.tf} ${n2.label})`);
    }
  }
  if ((side === 'short_edge' || side === 'short_watch') && continueDown.length) {
    const n1 = continueDown[0];
    notes.push(`אם ממשיך למטה: יציאה / יעד ראשון ${n1.px} (${n1.tf} ${n1.label})`);
    if (continueDown.length > 1) {
      const n2 = continueDown[1];
      notes.push(`אם ממשיך עוד: נקודה הבאה ${n2.px} (${n2.tf} ${n2.label})`);
    }
  }

  const day = tfs.Day || {};
  const week = tfs.Week || {};
  notes.push(
    `גדולים: יום ${board.Day || day.bub} · 12ש ${board['12H'] || '-'} · שבוע ${board.Week || week.bub}`,
  );

  const sideHeMap = {
    short_edge: 'קצה עליון מוכן לשורט',
    long_edge: 'קצה תחתון מוכן ללונג',
    short_watch: 'קצה עליון ממתין לאישור קצרים',
    long_watch: 'קצה תחתון ממתין לאישור קצרים',
  };

  return {
    side,
    side_he: sideHeMap[/** @type {keyof typeof sideHeMap} */ (side)] || 'אין כניסת קצה עכשיו',
    mid_move: midMove,
    at_upper_edge: atUpperEdge,
    at_lower_edge: atLowerEdge,
    near_up_attempts: nearUpCount,
    nearest_upper: nearestUp,
    nearest_lower: nearestDn,
    ltf_retest: ltfClean,
    continue_up: continueUp,
    continue_down: continueDown,
    bub4,
    notes,
  };
}

/** @param {number} n */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** @param {Array<Record<string, unknown>>} boardRows */
function midBreaks(boardRows) {
  /** @type {Record<string, Record<string, unknown>>} */
  const focus = {};
  for (const r of boardRows) {
    if (['15m', '30m', '1H', '5m', '2m', '4H'].includes(String(r.tf))) {
      focus[String(r.tf)] = r;
    }
  }
  const down = ['15m', '30m', '1H'].filter((tf) => focus[tf]?.structure === 'down');
  const up = ['15m', '30m', '1H'].filter((tf) => focus[tf]?.structure === 'up');
  /** @type {string[]} */
  const fight = [];
  const r30 = focus['30m'] || {};
  const r1 = focus['1H'] || {};
  const r15 = focus['15m'] || {};
  const r4 = focus['4H'] || {};
  if (r30.structure === 'up' && r1.structure === 'up' && r4.zap === 'RED') {
    fight.push('30 דקות / שעה במבנה עולה מול זאפ אדום ב־4 שעות. מאבק / תיקון אפשרי');
  }
  if (r30.bub === 'HL' && r15.structure === 'down') {
    fight.push('30 דקות HL מול 15 יורד. בדיקת פריצה או עצירה ב־30');
  }
  if (r30.bub === 'HL' && r1.zap === 'RED') {
    fight.push('30 דקות HL מול שעה אדומה. תחנת מאבק');
  }
  if (r15.structure === 'up' && r1.structure === 'down') {
    fight.push('15 עולה מול שעה יורדת. מפנה או מלכודת');
  }
  /** @type {Record<string, { bub: unknown, structure: unknown, zap: unknown }>} */
  const focusOut = {};
  for (const [k, v] of Object.entries(focus)) {
    focusOut[k] = { bub: v.bub, structure: v.structure, zap: v.zap };
  }
  return {
    down_tfs: down,
    up_tfs: up,
    cascade_down: down.length >= 2,
    cascade_up: up.length >= 2,
    fight_notes: fight,
    focus: focusOut,
  };
}

/** @param {Record<string, unknown>} snapshot @param {number} price */
function stations(snapshot, price) {
  const tfs = tfMap(snapshot);
  /** @type {Array<Record<string, unknown>>} */
  const below = [];
  /** @type {Array<Record<string, unknown>>} */
  const above = [];
  for (const tf of STATION_TFS) {
    const row = tfs[tf];
    if (!row) continue;
    for (const pt of levelPoints(row, tf)) {
      const px = /** @type {number} */ (pt.px);
      if (px < price) {
        below.push({ ...pt, dist_pct: round3((price - px) / price * 100), side: 'below' });
      } else if (px > price) {
        above.push({ ...pt, dist_pct: round3((px - price) / price * 100), side: 'above' });
      }
    }
  }
  const belowM = dedupeStations(below).sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct));
  const aboveM = dedupeStations(above).sort((a, b) => /** @type {number} */ (a.dist_pct) - /** @type {number} */ (b.dist_pct));
  return {
    below: belowM.slice(0, 8),
    above: aboveM.slice(0, 8),
    next_below: belowM[0] || null,
    next_above: aboveM[0] || null,
  };
}

/** @param {Array<Record<string, unknown>>} boardRows @param {Record<string, unknown>} breaks @param {Record<string, unknown>} st @param {number} price @param {Record<string, unknown>} [reclaim] */
function hypothesis(boardRows, breaks, st, price, reclaim = {}) {
  const h4 = boardRows.find((r) => r.tf === '4H') || {};
  const day = boardRows.find((r) => r.tf === 'Day') || {};
  const nxt = st.next_below;
  /** @type {string[]} */
  const notes = [];
  let path = 'wait';

  if (reclaim.active) {
    path = 'reclaim_thin';
    notes.push(...(reclaim.notes || []));
    const prim = reclaim.primary || {};
    const nc = prim.next_check;
    if (nc) {
      notes.push(`נקודת בדיקה הבאה: ${nc.px} (${prim.tf} ${nc.label})`);
    }
    notes.push('אם נעצרים בקו הדק: בדיקת פריצה / דחייה');
    notes.push('אם נפרץ הקו הדק מעלה: המשך לנקודת בדיקה הבאה מעל');
    if (breaks.fight_notes?.length) notes.push(.../** @type {string[]} */ (breaks.fight_notes));
  } else if (breaks.cascade_down || (breaks.down_tfs || []).length >= 2) {
    notes.push('יש שבר / מבנה יורד בכמה פסים אמצעיים');
    if (nxt) {
      notes.push(
        `תחנה הבאה מטה: ${nxt.px} (${nxt.tf} ${nxt.label}) במרחק ${nxt.dist_pct}%`,
      );
      if (breaks.fight_notes?.length) {
        path = 'retest_or_hold';
        notes.push(.../** @type {string[]} */ (breaks.fight_notes));
        notes.push('תרחיש א: נעצרים בתחנה ומסתובבים לבדוק פריצה');
        notes.push('תרחיש ב: שוברים את התחנה וממשיכים מטה');
      } else if (h4.zap === 'RED' && h4.channel === 'down') {
        path = 'continue_down';
        notes.push('4 שעות אדום וערוץ למטה. המשך מטה עד התחנה סביר יותר מברירת מחדל');
      } else {
        path = 'station_check';
        notes.push('בודקים איך מגיבים על התחנה הבאה');
      }
    } else {
      path = 'open_air';
      notes.push('אין תחנה קרובה בנתונים מתחת למחיר');
    }
  } else if (breaks.cascade_up) {
    path = 'up_structure';
    notes.push('מבנה עולה בפסים האמצעיים');
    if (reclaim.notes?.length) notes.push(.../** @type {string[]} */ (reclaim.notes));
    const nxtUp = st.next_above;
    if (nxtUp) {
      notes.push(`תחנה הבאה מעלה: ${nxtUp.px} (${nxtUp.tf} ${nxtUp.label})`);
    }
  } else {
    path = 'mixed';
    notes.push('אין מפל יורד ברור ב־15 / 30 / שעה');
    if (reclaim.notes?.length) notes.push(.../** @type {string[]} */ (reclaim.notes));
    if (breaks.fight_notes?.length) notes.push(.../** @type {string[]} */ (breaks.fight_notes));
  }

  if (day.structure === 'down') {
    notes.push('יום במבנה יורד. שאיפות מטה מקבלות רשות גבוהה יותר');
  } else if (day.structure === 'up') {
    notes.push('יום במבנה עולה. ירידה עלולה להיות תיקון לתחנה ולא מפולת');
  }

  const pathHeMap = {
    continue_down: 'המשך מטה לתחנה',
    retest_or_hold: 'עצירה / בדיקת פריצה מול המשך',
    station_check: 'בדיקת תחנה',
    open_air: 'אוויר מתחת',
    up_structure: 'מבנה מעלה',
    reclaim_thin: 'ניסיון פריצה חזרה לקווים הדקים',
    mixed: 'מעורב',
    wait: 'המתנה',
  };

  return {
    path,
    path_he: pathHeMap[/** @type {keyof typeof pathHeMap} */ (path)] || path,
    notes,
    price,
    anchor_4h: { bub: h4.bub, zap: h4.zap, channel: h4.channel },
  };
}

/** @param {number} price @param {Record<string, unknown>} edge @param {Record<string, unknown>} reclaim @param {Record<string, unknown>} stationsData @param {Array<Record<string, unknown>>} boardRows */
function fightMap(price, edge, reclaim, stationsData, boardRows) {
  /** @type {Array<Record<string, unknown>>} */
  const below = [];
  /** @type {Array<Record<string, unknown>>} */
  const above = [];

  for (const s of stationsData.below || []) {
    below.push({
      px: s.px,
      dist_pct: s.dist_pct,
      tf: s.tf,
      label: s.label,
      role: 'מאבק מטה / בדיקה אפשרית בחזרה',
    });
  }
  for (const s of stationsData.above || []) {
    above.push({
      px: s.px,
      dist_pct: s.dist_pct,
      tf: s.tf,
      label: s.label,
      role: 'מאבק מעלה / בדיקה או יעד',
    });
  }

  if (edge.nearest_lower) {
    const d = edge.nearest_lower;
    below.unshift({
      px: d.px,
      dist_pct: d.dist_pct,
      tf: '4H',
      label: d.label,
      role: 'קצה תחתון 4ש',
    });
  }
  if (edge.nearest_upper) {
    const u = edge.nearest_upper;
    above.unshift({
      px: u.px,
      dist_pct: u.dist_pct,
      tf: '4H',
      label: u.label,
      role: 'קצה עליון 4ש / קו דחייה',
    });
  }

  const prim = reclaim.primary || {};
  if (prim.next_check) {
    const nc = prim.next_check;
    const dist = price ? round3(Math.abs(nc.px - price) / price * 100) : null;
    const item = {
      px: nc.px,
      dist_pct: dist,
      tf: prim.tf || '5m',
      label: nc.label,
      role: 'קו דק / חצי שעה מול 5 · בדיקה חיה',
    };
    if (nc.px >= price) above.unshift(item);
    else below.unshift(item);
  }

  /** @param {Array<Record<string, unknown>>} rows */
  function dedupe(rows) {
    const sorted = [...rows].sort(
      (a, b) =>
        (a.dist_pct != null ? /** @type {number} */ (a.dist_pct) : 999) -
        (b.dist_pct != null ? /** @type {number} */ (b.dist_pct) : 999),
    );
    /** @type {Array<Record<string, unknown>>} */
    const out = [];
    for (const r of sorted) {
      if (out.length && out[out.length - 1].px) {
        const prevPx = /** @type {number} */ (out[out.length - 1].px);
        const rPx = /** @type {number} */ (r.px);
        if (Math.abs(rPx - prevPx) / prevPx * 100 < 0.06) {
          out[out.length - 1].role = `${out[out.length - 1].role} · ${r.role}`;
          out[out.length - 1].label = `${out[out.length - 1].label} / ${r.label}`;
          continue;
        }
      }
      out.push(r);
    }
    return out.slice(0, 7);
  }

  const belowDeduped = dedupe(below);
  const aboveDeduped = dedupe(above);

  /** @type {Record<string, Record<string, unknown>>} */
  const board = {};
  for (const r of boardRows) board[String(r.tf)] = r;
  const h4 = board['4H'] || {};
  const day = board.Day || {};

  let mode = 'נדנוד / בדיקות';
  if (h4.bub === 'HH' || h4.bub === 'LH') {
    if (h4.zap === 'GREEN' && h4.channel === 'up') mode = 'שינוי מגמה מעלה ב־4ש אפשרי';
  }
  if (h4.bub === 'LL' || h4.bub === 'LH') {
    if (h4.zap === 'RED' && h4.channel === 'down') mode = 'המשך / מגמה מטה ב־4ש';
  }
  if (reclaim.active) mode = 'בדיקת פריצה חזרה מהנמוכים';

  /** @type {string[]} */
  const notes = [
    'המחיר עולה ויורד כל הזמן. כל תחנה היא מאבק לפי פס',
    'אם יש כניסה: תמיד יש מאבק הבא מתחת, ומאבק הבא מעל',
    'חזרה לבדוק 5 / 30 / 15 / שעה זה נורמלי. לא סוף המסע',
    `מצב עכשיו: ${mode}`,
    `4ש ${h4.bub} · יום ${day.bub}`,
  ];
  if (belowDeduped.length) {
    const b0 = belowDeduped[0];
    notes.push(`המאבק הבא מטה: ${b0.px} · ${b0.tf} · ${b0.role}`);
  }
  if (aboveDeduped.length) {
    const a0 = aboveDeduped[0];
    notes.push(`המאבק הבא מעלה: ${a0.px} · ${a0.tf} · ${a0.role}`);
  }

  return {
    mode_he: mode,
    next_fight_below: belowDeduped[0] || null,
    next_fight_above: aboveDeduped[0] || null,
    fights_below: belowDeduped,
    fights_above: aboveDeduped,
    notes,
  };
}

/** @param {number} price @param {Record<string, unknown>} edge @param {Record<string, unknown>} reclaim @param {Record<string, unknown>} st @param {Record<string, unknown>} [fights] */
function levelsPlan(price, edge, reclaim, st, fights = {}) {
  /** @type {Array<Record<string, unknown>>} */
  const entries = [];
  /** @type {Array<Record<string, unknown>>} */
  const exits = [];

  const side = edge.side;
  if ((side === 'long_edge' || side === 'long_watch') && edge.nearest_lower) {
    const lv = edge.nearest_lower;
    const ready = side === 'long_edge';
    entries.push({
      side: 'לונג',
      px: lv.px,
      status: ready ? 'מוכן' : 'ממתין לאישור קצרים',
      why: `קצה תחתון 4ש · ${lv.label}`,
    });
    for (let i = 0; i < (edge.continue_up || []).slice(0, 4).length; i++) {
      const t = /** @type {Array<Record<string, unknown>>} */ (edge.continue_up)[i];
      exits.push({
        side: 'יציאת לונג / יעד',
        px: t.px,
        order: i + 1,
        why: `אם ממשיך מעלה · ${t.tf} ${t.label}`,
      });
    }
  }
  if ((side === 'short_edge' || side === 'short_watch') && edge.nearest_upper) {
    const lv = edge.nearest_upper;
    const ready = side === 'short_edge';
    entries.push({
      side: 'שורט',
      px: lv.px,
      status: ready ? 'מוכן' : 'ממתין לאישור קצרים',
      why: `קצה עליון 4ש · ${lv.label} · ניסיונות~${edge.near_up_attempts}`,
    });
    for (let i = 0; i < (edge.continue_down || []).slice(0, 4).length; i++) {
      const t = /** @type {Array<Record<string, unknown>>} */ (edge.continue_down)[i];
      exits.push({
        side: 'יציאת שורט / יעד',
        px: t.px,
        order: i + 1,
        why: `אם ממשיך מטה · ${t.tf} ${t.label}`,
      });
    }
  }

  const prim = reclaim.primary || {};
  if (reclaim.active && prim.next_check) {
    const nc = prim.next_check;
    entries.push({
      side: 'בדיקת כניסה קצרה',
      px: nc.px,
      status: 'ניסיון פריצה חזרה',
      why: `${prim.tf} מהנמוך ${prim.bub} עד הקו הדק / צהוב`,
    });
  }

  const nfDn = fights.next_fight_below;
  const nfUp = fights.next_fight_above;
  if (nfDn) {
    exits.push({
      side: 'מאבק הבא מטה',
      px: nfDn.px,
      order: 0,
      why: `${nfDn.tf} · ${nfDn.role} · ${nfDn.label || ''}`,
    });
  }
  if (nfUp) {
    exits.push({
      side: 'מאבק הבא מעלה',
      px: nfUp.px,
      order: 0,
      why: `${nfUp.tf} · ${nfUp.role} · ${nfUp.label || ''}`,
    });
  }

  if (!exits.some((e) => String(e.side).startsWith('יציאת'))) {
    for (let i = 0; i < (st.above || []).slice(0, 3).length; i++) {
      const t = /** @type {Array<Record<string, unknown>>} */ (st.above)[i];
      exits.push({ side: 'יעד מעלה', px: t.px, order: i + 1, why: `${t.tf} ${t.label}` });
    }
    for (let i = 0; i < (st.below || []).slice(0, 3).length; i++) {
      const t = /** @type {Array<Record<string, unknown>>} */ (st.below)[i];
      exits.push({ side: 'יעד מטה', px: t.px, order: i + 1, why: `${t.tf} ${t.label}` });
    }
  }

  /** @type {Array<Record<string, unknown>>} */
  const stops = [];
  for (const e of entries) {
    if (e.side === 'לונג') {
      let cands = (edge.continue_down || []).filter(
        (x) => x.px != null && /** @type {number} */ (x.px) < /** @type {number} */ (e.px) * 0.999,
      );
      if (!cands.length) {
        cands = (st.below || []).filter(
          (x) => x.px != null && /** @type {number} */ (x.px) < /** @type {number} */ (e.px) * 0.999,
        );
      }
      if (nfDn && /** @type {number} */ (nfDn.px) < /** @type {number} */ (e.px) * 0.999) {
        cands = [{ px: nfDn.px, tf: nfDn.tf, label: nfDn.label || '' }, ...cands];
      }
      if (cands.length) {
        const dn = cands[0];
        stops.push({
          side: 'סטופ לונג',
          px: dn.px,
          why: `מתחת לכניסה / מאבק מטה · ${dn.tf || ''} ${dn.label || ''}`,
        });
      }
    }
    if (e.side === 'שורט') {
      let cands = (edge.continue_up || []).filter(
        (x) => x.px != null && /** @type {number} */ (x.px) > /** @type {number} */ (e.px) * 1.001,
      );
      if (!cands.length) {
        cands = (st.above || []).filter(
          (x) => x.px != null && /** @type {number} */ (x.px) > /** @type {number} */ (e.px) * 1.001,
        );
      }
      if (nfUp && /** @type {number} */ (nfUp.px) > /** @type {number} */ (e.px) * 1.001) {
        cands = [{ px: nfUp.px, tf: nfUp.tf, label: nfUp.label || '' }, ...cands];
      }
      if (cands.length) {
        const up = cands[0];
        stops.push({
          side: 'סטופ שורט',
          px: up.px,
          why: `מעל הכניסה / מאבק מעלה · ${up.tf || ''} ${up.label || ''}`,
        });
      }
    }
  }

  const entrySummary = entries.length
    ? entries.map((e) => `${e.side} ${e.px} (${e.status})`).join(' · ')
    : 'אין כניסה מוכנה';

  return {
    price,
    entries,
    exits,
    stops,
    mid_move: Boolean(edge.mid_move),
    mode_he: fights.mode_he,
    summary_he: [fights.mode_he || '', entrySummary].filter(Boolean).join(' · ').replace(/^ · | · $/g, ''),
  };
}

/**
 * Build full structure report from a TV snapshot.
 * @param {Record<string, unknown>} snapshot
 */
export function buildReport(snapshot) {
  if (snapshot.latest && !snapshot.tfs) {
    snapshot = /** @type {Record<string, unknown>} */ (snapshot.latest);
  }
  const price = num(snapshot.price) || 0;
  const dayPct = num(snapshot.dayPct);
  const boardRows = buildBoard(snapshot);
  const br = midBreaks(boardRows);
  const st = stations(snapshot, price);
  const reclaim = thinReclaim(snapshot, price);
  const edge = edgePlan(snapshot, price, reclaim);
  const fights = fightMap(price, edge, reclaim, st, boardRows);
  let hyp = hypothesis(boardRows, br, st, price, reclaim);

  if (edge.notes?.length) {
    hyp = {
      ...hyp,
      notes: [...(edge.notes || []), ...(hyp.notes || [])],
      edge_side_he: edge.side_he,
    };
    if ((edge.side === 'short_edge' || edge.side === 'long_edge') && !edge.mid_move) {
      hyp.path = edge.side;
      hyp.path_he = edge.side_he;
    }
  }

  const levels = levelsPlan(price, edge, reclaim, st, fights);
  const chain = buildChainBoard(snapshot, price);

  const boardOut = boardRows.map((r) => ({
    tf: r.tf,
    bub: r.bub,
    structure: r.structure,
    structure_he: r.structure_he,
    zap: r.zap,
    channel: r.channel,
    stk: r.stk,
  }));

  return {
    price,
    open: num(snapshot.open),
    high: num(snapshot.high),
    low: num(snapshot.low),
    bid: num(snapshot.bid),
    ask: num(snapshot.ask),
    mid: num(snapshot.mid) ?? price,
    tws_fresh: snapshot.tws_fresh === true,
    price_source: snapshot.price_source || 'tv',
    barConfirmed: snapshot.barConfirmed === true || snapshot.barConfirmed === 'true',
    dayPct,
    schema: snapshot.schema,
    receivedAt: snapshot.receivedAt,
    trigger: snapshot.trigger,
    symbol: snapshot.symbol,
    regime: snapshot.regime,
    board: boardOut,
    edge: {
      side: edge.side,
      side_he: edge.side_he,
      mid_move: edge.mid_move,
      nearest_upper: edge.nearest_upper,
      nearest_lower: edge.nearest_lower,
      continue_up: edge.continue_up,
      continue_down: edge.continue_down,
      ltf_retest: edge.ltf_retest,
      notes: edge.notes,
      at_upper_edge: edge.at_upper_edge,
      at_lower_edge: edge.at_lower_edge,
      near_up_attempts: edge.near_up_attempts,
    },
    reclaim: {
      active: reclaim.active,
      primary: reclaim.primary,
      notes: reclaim.notes,
      path_he: reclaim.path_he,
    },
    stations: {
      below: st.below,
      above: st.above,
      next_below: st.next_below,
      next_above: st.next_above,
    },
    fights: {
      mode_he: fights.mode_he,
      next_fight_below: fights.next_fight_below,
      next_fight_above: fights.next_fight_above,
      fights_below: fights.fights_below,
      fights_above: fights.fights_above,
      notes: fights.notes,
    },
    levels: {
      entries: levels.entries,
      exits: levels.exits,
      stops: levels.stops,
      mid_move: levels.mid_move,
      mode_he: levels.mode_he,
      summary_he: levels.summary_he,
      price: levels.price,
    },
    hypo: {
      path: hyp.path,
      path_he: hyp.path_he,
      notes: hyp.notes,
    },
    breaks: br,
    h4: {
      bub: edge.bub4 || (boardOut.find((r) => r.tf === '4H') || {}).bub || null,
      structure: (boardOut.find((r) => r.tf === '4H') || {}).structure || null,
      structure_he: (boardOut.find((r) => r.tf === '4H') || {}).structure_he || null,
      bar_key: fourHourBarKey(snapshot.receivedAt),
    },
    chain,
  };
}

/** UTC 4H bar identity for cooldown (new candle unlocks re-entry). */
function fourHourBarKey(raw) {
  const t = Date.parse(String(raw || ''));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const slot = Math.floor(d.getUTCHours() / 4) * 4;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(slot).padStart(2, '0')}`;
}
