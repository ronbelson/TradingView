/**
 * Parent-relative TF layer (additive).
 * Read top-down: Week → 3D → Day → 4H → … → 15m
 * Parent = higher TF. Child may correct against parent even when local lean matches.
 * Does not replace local layerTone / hunt / RR.
 */

import { layerSideHe, layerTone } from './tf-tone';

export const TF_PARENT = {
  '15m': '30m',
  '30m': '1H',
  '1H': '2H',
  '2H': '4H',
  '4H': 'Day',
  Day: '3D',
  '3D': 'Week',
};

/** Display / walk order: high TF first. */
export const TF_TOP_DOWN = ['Week', '3D', 'Day', '4H', '2H', '1H', '30m', '15m'];

/** @deprecated use TF_TOP_DOWN — kept for older imports */
export const TF_CHILD_ORDER = TF_TOP_DOWN;

/**
 * Child pressure vs structure (MACD + pivot stack).
 * up = still open / rising against a short parent → correction.
 * dn = pressing down against a long parent → pullback.
 */
export function childFlow(t) {
  if (!t) return 'flat';
  let v = 0;
  const macd = t.macdPhase || t.pivotStack?.macdPhase || null;
  if (macd === 'open' || macd === 'cross_up') v += 1;
  if (macd === 'closed' || macd === 'cross_dn') v -= 1;
  const pid = t.pivotStack?.id || null;
  if (
    pid === 'rise_from_low' ||
    pid === 'stretch_up' ||
    pid === 'room_up' ||
    pid === 'approach_resist'
  ) {
    v += 1;
  }
  if (
    pid === 'drop_from_high' ||
    pid === 'stretch_dn' ||
    pid === 'room_dn' ||
    pid === 'approach_support'
  ) {
    v -= 1;
  }
  if (v > 0) return 'up';
  if (v < 0) return 'dn';
  return 'flat';
}

/**
 * Local side → role vs parent.
 * Counter-flow beats same-side continuation (e.g. Week short + 3D MACD open up = bounce).
 */
export function relationRole(parentSide, childSide, flow = 'flat') {
  if (!parentSide || parentSide === 'watch') return 'loose';

  if (parentSide === 'short' && flow === 'up') return 'bounce';
  if (parentSide === 'long' && flow === 'dn') return 'pullback';

  if (!childSide || childSide === 'watch') return 'wait_child';

  if (parentSide === childSide) {
    return parentSide === 'long' ? 'continuation_up' : 'continuation_dn';
  }
  if (parentSide === 'long' && childSide === 'short') return 'pullback';
  if (parentSide === 'short' && childSide === 'long') return 'bounce';
  return 'loose';
}

export function relationHe(role) {
  if (role === 'continuation_up') return 'המשך עלייה מול האב';
  if (role === 'continuation_dn') return 'המשך ירידה מול האב';
  if (role === 'pullback') return 'משיכה מול האב';
  if (role === 'bounce') return 'תיקון מול האב';
  if (role === 'wait_child') return 'ילד במעקב מול האב';
  return 'יחס חלש לאב';
}

export function relationEn(role) {
  if (role === 'continuation_up') return 'Continuation with parent up';
  if (role === 'continuation_dn') return 'Continuation with parent down';
  if (role === 'pullback') return 'Pullback vs parent';
  if (role === 'bounce') return 'Correction vs parent';
  if (role === 'wait_child') return 'Child watching vs parent';
  return 'Loose vs parent';
}

function sideMapFromTfs(tfs) {
  const map = {};
  for (const t of tfs || []) {
    if (!t?.tf) continue;
    map[t.tf] = layerTone(t);
  }
  return map;
}

function tfByName(tfs) {
  const map = {};
  for (const t of tfs || []) {
    if (!t?.tf) continue;
    map[t.tf] = t;
  }
  return map;
}

/** Lightweight sides from raw webhook tfs (history events). */
export function sideMapFromRawEvent(event) {
  const map = {};
  for (const row of event?.tfs || []) {
    if (!row?.tf) continue;
    map[row.tf] = layerTone({
      bub: row.bub || '-',
      zap: row.zap || '-',
      channel: row.channel || row.paint || '-',
    });
  }
  return map;
}

/**
 * Compare current child/parent to previous snapshots.
 * prevMaps: oldest → newest excluding current, or newest-first — we take up to 3.
 */
export function historyHint(tf, parentTf, currentMap, prevMaps) {
  if (!parentTf || !prevMaps?.length) return null;
  const curChild = currentMap[tf];
  const curParent = currentMap[parentTf];
  if (!curChild || !curParent || curParent === 'watch') return null;

  for (const prev of prevMaps) {
    const wasChild = prev[tf];
    const wasParent = prev[parentTf];
    if (!wasChild || !wasParent) continue;
    if (wasParent === curParent && wasChild !== curChild) {
      if (curParent === 'long' && wasChild === 'long' && curChild === 'short') {
        return {
          id: 'pullback_started',
          he: 'התחילה משיכה מול האב',
          en: 'Pullback started vs parent',
        };
      }
      if (curParent === 'short' && wasChild === 'short' && curChild === 'long') {
        return {
          id: 'bounce_started',
          he: 'התחיל תיקון מול האב',
          en: 'Correction started vs parent',
        };
      }
      if (wasChild !== curParent && curChild === curParent) {
        return {
          id: 'realigned',
          he: 'חזר ליישור עם האב',
          en: 'Realigned with parent',
        };
      }
    }
    if (wasParent === curParent && wasChild === curChild) {
      break;
    }
  }
  return null;
}

/**
 * Build additive relation rows. Existing local sides unchanged.
 * @param {object[]} tfs slim tfs from scene
 * @param {object[]} recentEvents newest-first snapshots excluding or including latest
 */
export function buildTfRelations(tfs, recentEvents = []) {
  const currentMap = sideMapFromTfs(tfs);
  const byTf = tfByName(tfs);
  const prevMaps = (recentEvents || [])
    .slice(0, 4)
    .map(sideMapFromRawEvent)
    .filter((m) => Object.keys(m).length > 0);

  let history = prevMaps;
  if (history.length && JSON.stringify(history[0]) === JSON.stringify(currentMap)) {
    history = history.slice(1);
  }
  history = history.slice(0, 3);

  const rows = [];
  for (const tf of TF_TOP_DOWN) {
    if (!(tf in currentMap) && !(tfs || []).some((t) => t.tf === tf)) continue;
    const parentTf = TF_PARENT[tf] || null;
    const side = currentMap[tf] || 'watch';
    const parentSide = parentTf ? currentMap[parentTf] || null : null;
    const flow = childFlow(byTf[tf]);
    const role = parentTf ? relationRole(parentSide, side, flow) : 'root';
    const hint = parentTf ? historyHint(tf, parentTf, currentMap, history) : null;
    rows.push({
      tf,
      side,
      sideHe: layerSideHe(side),
      parentTf,
      parentSide,
      parentSideHe: parentSide ? layerSideHe(parentSide) : null,
      flow,
      role: parentTf ? role : 'root',
      roleHe: parentTf ? relationHe(role) : 'שורש',
      history: hint,
      historyHe: hint?.he || null,
    });
  }
  return {
    schema: 'tf_relation_v1',
    historyDepth: history.length,
    rows,
  };
}
