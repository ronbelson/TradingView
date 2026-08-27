/**
 * Additive stack: pivot distance + swing + RSI + MACD.
 * Does not replace layerTone / hunt / RR / parent relation.
 */

import { rsiZone, rsiZoneHe } from './rsi-zone';

const NEAR_PCT = 0.45;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function absPct(from, to) {
  if (from == null || to == null || from === 0) return null;
  return (Math.abs(to - from) / Math.abs(from)) * 100;
}

function pivotCandidates(t) {
  return [
    { px: t?.railUp, name: 'פיבוט גדול עליון', kind: 'large_up' },
    { px: t?.railDn, name: 'פיבוט גדול תחתון', kind: 'large_dn' },
    { px: t?.pivotSmallUp, name: 'פיבוט קטן עליון', kind: 'small_up' },
    { px: t?.pivotSmallDn, name: 'פיבוט קטן תחתון', kind: 'small_dn' },
    { px: t?.pivotHi, name: 'פיבוט גבוה', kind: 'hi' },
    { px: t?.pivotLo, name: 'פיבוט נמוך', kind: 'lo' },
  ]
    .map((c) => ({ ...c, px: num(c.px) }))
    .filter((c) => c.px != null);
}

function nearestAbove(cands, price) {
  const list = cands
    .filter((c) => c.px > price * 1.0003)
    .map((c) => ({ ...c, distPct: absPct(price, c.px) }))
    .sort((a, b) => a.distPct - b.distPct);
  return list[0] || null;
}

function nearestBelow(cands, price) {
  const list = cands
    .filter((c) => c.px < price * 0.9997)
    .map((c) => ({ ...c, distPct: absPct(price, c.px) }))
    .sort((a, b) => a.distPct - b.distPct);
  return list[0] || null;
}

export function stackReadHe(id) {
  if (id === 'stretch_up') return 'מתיחה למעלה מול פיווט';
  if (id === 'stretch_dn') return 'מתיחה למטה מול פיווט';
  if (id === 'approach_resist') return 'מתקרב להתנגדות';
  if (id === 'approach_support') return 'מתקרב לתמיכה';
  if (id === 'room_up') return 'יש מקום לעלייה';
  if (id === 'room_dn') return 'יש מקום לירידה';
  if (id === 'rise_from_low') return 'עלייה מפיווט נמוך';
  if (id === 'drop_from_high') return 'ירידה מפיווט גבוה';
  return 'מאוזן מול פיווטים';
}

/**
 * @param {object} t slim TF
 * @param {number|null} price mark (falls back to t close if any)
 */
export function buildPivotStack(t, price) {
  if (!t) return null;
  const mark = num(price) ?? num(t.c) ?? num(t.price);
  const cands = pivotCandidates(t);
  const up = mark != null ? nearestAbove(cands, mark) : null;
  const dn = mark != null ? nearestBelow(cands, mark) : null;
  const zone = t.rsiZone || rsiZone(t.rsi);
  const macdId = t.macdPhase || null;
  const swingPct = num(t.swingPct);
  const nearUp = up?.distPct != null && up.distPct <= NEAR_PCT;
  const nearDn = dn?.distPct != null && dn.distPct <= NEAR_PCT;
  const macdHotUp = macdId === 'open' || macdId === 'cross_up';
  const macdHotDn = macdId === 'closed' || macdId === 'cross_dn';

  let id = 'balanced';
  // Stretch: near pivot + turbo RSI (+ optional MACD confirm)
  if (nearUp && (zone === 'turbo_up' || (zone === 'mid' && macdHotUp && up.distPct <= 0.25))) {
    id = 'stretch_up';
  } else if (nearDn && (zone === 'turbo_dn' || (zone === 'mid' && macdHotDn && dn.distPct <= 0.25))) {
    id = 'stretch_dn';
  } else if (nearUp) {
    id = 'approach_resist';
  } else if (nearDn) {
    id = 'approach_support';
  } else if (swingPct != null && swingPct >= 1.2 && dn && (dn.distPct == null || dn.distPct < (up?.distPct ?? 99))) {
    id = 'rise_from_low';
  } else if (swingPct != null && swingPct >= 1.2 && up && (up.distPct == null || up.distPct < (dn?.distPct ?? 99))) {
    id = 'drop_from_high';
  } else if (up && dn) {
    id = up.distPct >= dn.distPct ? 'room_up' : 'room_dn';
  } else if (up) {
    id = 'room_up';
  } else if (dn) {
    id = 'room_dn';
  }

  const bits = [];
  if (up) bits.push(`מעלה ${up.distPct.toFixed(2)}%`);
  if (dn) bits.push(`מטה ${dn.distPct.toFixed(2)}%`);
  if (swingPct != null) bits.push(`מסע ${swingPct.toFixed(2)}%`);
  if (zone) bits.push(rsiZoneHe(zone));
  if (t.macdPhaseHe) bits.push(t.macdPhaseHe);

  return {
    id,
    he: stackReadHe(id),
    nearUp,
    nearDn,
    up: up
      ? { px: up.px, name: up.name, kind: up.kind, distPct: Math.round(up.distPct * 100) / 100 }
      : null,
    dn: dn
      ? { px: dn.px, name: dn.name, kind: dn.kind, distPct: Math.round(dn.distPct * 100) / 100 }
      : null,
    swingPct: swingPct != null ? Math.round(swingPct * 100) / 100 : null,
    rsiZone: zone,
    rsiZoneHe: rsiZoneHe(zone),
    macdPhase: macdId,
    macdPhaseHe: t.macdPhaseHe || null,
    summaryHe: `${stackReadHe(id)}${bits.length ? ` · ${bits.join(' · ')}` : ''}`,
  };
}

export function attachPivotStack(t, price) {
  if (!t) return t;
  const stack = buildPivotStack(t, price);
  return { ...t, pivotStack: stack };
}
