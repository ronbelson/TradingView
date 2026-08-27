import { fillPxFromBook } from '@/lib/tws-mark';

/**
 * Paper trade book — entry + stop + scale-out by whole contracts (25% rounded).
 */

/** Exact touch band around the edge level. */
export const TOUCH_PCT = 0.0008;
/**
 * Approach band: enter when edge is מוכן even without full touch.
 * Short: price reached within this % below the edge (or touched that zone).
 * Long: within this % above the edge.
 * 0.25% ≈ $160 on BTC 65k — catches misses like $12–$15 under the print.
 */
export const APPROACH_PCT = 0.0025;
export const SCALE_PCT = 25;
export const MAX_TARGET_SLICES = 4;
export const DEFAULT_CONTRACTS = 14;
export const DEFAULT_FEE_PER_CONTRACT = 3;
/** Micro Bitcoin (MBT) size for fee vs move gate. */
export const BTC_PER_CONTRACT = 0.1;
/**
 * 30m collection layer (paper TESTING).
 * Off only when TV_PAPER_COLLECTION=0.
 */
export function isCollectionEnabled() {
  return String(process.env.TV_PAPER_COLLECTION || '1') !== '0';
}

/**
 * Skip action when expected 0.25% move on N contracts cannot cover open+close fees.
 * @param {number} price
 * @param {number} nContracts
 * @param {number} feePer
 * @param {number} [btcPer]
 */
export function passesCollectFeeGate(price, nContracts, feePer, btcPer = BTC_PER_CONTRACT) {
  const n = Number(nContracts);
  const f = Number(feePer);
  const p = Number(price);
  if (!(n > 0) || !(f >= 0) || !(p > 0)) return false;
  const gross = APPROACH_PCT * p * Number(btcPer || BTC_PER_CONTRACT) * n;
  const fees = 2 * f * n;
  return gross + 1e-9 >= fees;
}

/** @param {unknown} v */
function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** @param {number} n */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** Round scale to whole contracts; at least 1; not more than remaining. */
export function contractsForSlice(totalContracts, sizePct, remainingContracts, isFinal) {
  const total = Number(totalContracts);
  const rem = Number(remainingContracts);
  if (!(total > 0) || !(rem > 0)) return 0;
  if (isFinal) return rem;
  const want = Math.max(1, Math.round((total * Number(sizePct || 0)) / 100));
  return Math.min(want, rem);
}

/**
 * @param {Array<Record<string, unknown>>} trades
 */
export function summarize(trades) {
  const rows = trades.filter(
    (t) => (t.status === 'closed' || t.status === 'partial') && t.voided !== true,
  );
  let weight = 0;
  let weightedPnl = 0;
  let wins = 0;
  let losses = 0;
  let closedFull = 0;
  for (const t of rows) {
    const pct = num(t.pnl_pct);
    if (pct == null) continue;
    const w =
      num(t.contracts_closed) != null && num(t.contracts_total) != null && Number(t.contracts_total) > 0
        ? (Number(t.contracts_closed) / Number(t.contracts_total)) * 100
        : num(t.size_pct) ?? (t.status === 'partial' ? SCALE_PCT : 100);
    weight += w;
    weightedPnl += pct * w;
    if (t.status === 'closed') {
      closedFull += 1;
      if (pct > 0) wins += 1;
      else losses += 1;
    }
  }
  const avg = weight > 0 ? weightedPnl / weight : null;
  return {
    closed: closedFull,
    partials: trades.filter((t) => t.status === 'partial' && t.voided !== true).length,
    wins,
    losses,
    win_rate_pct: closedFull ? round2((100 * wins) / closedFull) : null,
    pnl_pct_sum: weight > 0 ? round3(weightedPnl / 100) : 0,
    avg_pnl_pct: avg != null ? round3(avg) : null,
    realized_pct_of_book: weight > 0 ? round3(weightedPnl / 100) : 0,
    journal_rows: trades.length,
    voided_rows: trades.filter((t) => t.voided === true).length,
  };
}

/** @param {number} price @param {number} level */
function near(price, level) {
  return Math.abs(price - level) / level <= TOUCH_PCT;
}

/**
 * Ready edge without requiring the exact print.
 * @param {'long'|'short'} side
 * @param {number} price
 * @param {number|null} high
 * @param {number|null} low
 * @param {number} edgePx
 * @returns {{ ok: boolean, mode: 'touch'|'approach'|null }}
 */
export function entryReach(side, price, high, low, edgePx) {
  if (!(edgePx > 0) || !(price > 0)) return { ok: false, mode: null };
  if (near(price, edgePx)) return { ok: true, mode: 'touch' };

  if (side === 'short') {
    const floor = edgePx * (1 - APPROACH_PCT);
    const hi = high != null && high > 0 ? high : price;
    // Got into the approach zone under the edge (or slightly tagged it).
    if (hi >= floor && price <= edgePx * (1 + TOUCH_PCT)) {
      return { ok: true, mode: near(hi, edgePx) || hi >= edgePx ? 'touch' : 'approach' };
    }
    return { ok: false, mode: null };
  }

  const ceiling = edgePx * (1 + APPROACH_PCT);
  const lo = low != null && low > 0 ? low : price;
  if (lo <= ceiling && price >= edgePx * (1 - TOUCH_PCT)) {
    return { ok: true, mode: near(lo, edgePx) || lo <= edgePx ? 'touch' : 'approach' };
  }
  return { ok: false, mode: null };
}

/** @param {Record<string, unknown>} levels */
function pickEntry(levels) {
  for (const e of levels.entries || []) {
    const side = e.side;
    if (side !== 'לונג' && side !== 'שורט') continue;
    if (e.status !== 'מוכן') continue;
    const px = num(e.px);
    if (px == null) continue;
    return { side: side === 'לונג' ? 'long' : 'short', px, why: e.why || '' };
  }
  return null;
}

/**
 * Full hunt chain for "מי הבא" — search all of these, not only one TF.
 * Short at the next ceiling when we arrive. Long at the next floor.
 * Micro TFs (2m/5m/…) are timing only; they are not the ceiling/floor station.
 */
const CHAIN_STATION_TFS = ['4H', '6H', '12H', 'Day', '3D', 'Week'];
const CHAIN_KIND_CEIL = new Set(['mf', 'mm', 'ms', 'mx', 'srh', 'ph', 'rh']);
const CHAIN_KIND_FLOOR = new Set(['mf', 'mm', 'ms', 'mx', 'srl', 'pl', 'rl']);
/** Arrive band = approach (0.25%). Farther = free air, no entry. */
const STATION_ARRIVE_PCT = APPROACH_PCT * 100;

/**
 * Collect MA / pivot lines from every chain TF present on the board.
 * @param {Record<string, unknown>} report
 * @returns {Array<Record<string, unknown>>}
 */
function chainStationLines(report) {
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  const seen = new Set();

  const push = (tf, kind, label, px, stEn) => {
    const p = num(px);
    if (p == null || !(p > 0)) return;
    const k = `${tf}|${kind}|${round2(p)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({
      tf: String(tf),
      kind: String(kind || ''),
      label: String(label || kind || ''),
      px: round2(p),
      st_en: String(stEn || ''),
    });
  };

  // Prefer live chain lines (all MAs + pivots with status).
  const chain = report.chain && typeof report.chain === 'object' ? report.chain : null;
  const rows = Array.isArray(chain?.rows) ? chain.rows : [];
  for (const tf of CHAIN_STATION_TFS) {
    const row = rows.find((r) => String(r.tf) === tf);
    if (!row) continue;
    for (const l of row.lines || []) {
      const kind = String(l.kind || '');
      if (!CHAIN_KIND_CEIL.has(kind) && !CHAIN_KIND_FLOOR.has(kind)) continue;
      push(tf, kind, l.label || kind, l.px, l.st_en);
    }
  }

  // Fallback: stations board (covers gaps if a chain row is missing).
  const stations = report.stations && typeof report.stations === 'object' ? report.stations : null;
  for (const listName of ['above', 'below']) {
    for (const s of (stations && stations[listName]) || []) {
      const tf = String(s.tf || '');
      if (!CHAIN_STATION_TFS.includes(tf)) continue;
      const kind = String(s.kind || '');
      if (!CHAIN_KIND_CEIL.has(kind) && !CHAIN_KIND_FLOOR.has(kind)) continue;
      push(tf, kind, s.label || kind, s.px, s.st_en);
    }
  }

  return out;
}

/**
 * Next station above price across the whole chain (מי הבא מעלה).
 * @param {Array<Record<string, unknown>>} lines
 * @param {number} price
 */
function nextCeilingInChain(lines, price) {
  const floorPx = price * (1 - TOUCH_PCT);
  return (
    lines
      .filter((l) => CHAIN_KIND_CEIL.has(String(l.kind)))
      .filter((l) => Number(l.px) >= floorPx)
      .sort((a, b) => Number(a.px) - Number(b.px))[0] || null
  );
}

/**
 * Next station below price across the whole chain (מי הבא מטה).
 * @param {Array<Record<string, unknown>>} lines
 * @param {number} price
 */
function nextFloorInChain(lines, price) {
  const ceilPx = price * (1 + TOUCH_PCT);
  return (
    lines
      .filter((l) => CHAIN_KIND_FLOOR.has(String(l.kind)))
      .filter((l) => Number(l.px) <= ceilPx)
      .sort((a, b) => Number(b.px) - Number(a.px))[0] || null
  );
}

/**
 * Entry gate: bubble alone is not enough. No freeze locks.
 * Find "מי הבא" in ALL chain TFs (4H→Week). Enter only when price arrived
 * at that station (touch / fight / within 0.25%). Farther = free air.
 *
 * @param {Record<string, unknown>} report
 * @param {number} price
 * @param {'long'|'short'} side
 * @returns {{ ok: boolean, why: string, context: Record<string, unknown> }}
 */
export function higherTfStructureGate(report, price, side) {
  const lines = chainStationLines(report);
  const nextUp = nextCeilingInChain(lines, price);
  const nextDn = nextFloorInChain(lines, price);
  const ctx = {
    price: round2(price),
    next_up: nextUp,
    next_dn: nextDn,
    chain_tfs: CHAIN_STATION_TFS,
    struct4: report.h4 && typeof report.h4 === 'object' ? report.h4.structure || null : null,
    bub4: report.h4 && typeof report.h4 === 'object' ? report.h4.bub || null : null,
  };

  if (!(price > 0)) {
    return { ok: false, why: 'אין מחיר לשער תחנה', context: ctx };
  }

  if (side === 'short') {
    if (!nextUp) {
      return {
        ok: false,
        why: 'אין שורט · אין תקרה בשרשרת (4H עד Week) · חיפשת בכלם',
        context: ctx,
      };
    }
    const distPct = ((Number(nextUp.px) - price) / price) * 100;
    const arrived =
      nextUp.st_en === 'touch' ||
      nextUp.st_en === 'fight' ||
      distPct <= STATION_ARRIVE_PCT;
    if (arrived) {
      return {
        ok: true,
        why: `תחנה הבאה מעלה · ${nextUp.tf} ${nextUp.label} ${nextUp.px}`,
        context: { ...ctx, ceiling: nextUp, dist_pct: round3(distPct) },
      };
    }
    return {
      ok: false,
      why: `אין שורט באוויר · תחנה הבאה מעלה ${nextUp.tf} ${nextUp.label} ${nextUp.px} (+${round3(distPct)}%) · מחכים להגעה`,
      context: { ...ctx, ceiling: nextUp, dist_pct: round3(distPct) },
    };
  }

  // long
  if (!nextDn) {
    return {
      ok: false,
      why: 'אין לונג · אין רצפה בשרשרת (4H עד Week) · חיפשת בכלם',
      context: ctx,
    };
  }
  const distDn = ((price - Number(nextDn.px)) / price) * 100;
  const arrivedDn =
    nextDn.st_en === 'touch' ||
    nextDn.st_en === 'fight' ||
    distDn <= STATION_ARRIVE_PCT;
  if (arrivedDn) {
    return {
      ok: true,
      why: `תחנה הבאה מטה · ${nextDn.tf} ${nextDn.label} ${nextDn.px}`,
      context: { ...ctx, floor: nextDn, dist_pct: round3(distDn) },
    };
  }
  return {
    ok: false,
    why: `אין לונג באוויר · תחנה הבאה מטה ${nextDn.tf} ${nextDn.label} ${nextDn.px} (−${round3(distDn)}%) · מחכים להגעה`,
    context: { ...ctx, floor: nextDn, dist_pct: round3(distDn) },
  };
}

/** Prefer structure stop, clamped between 0.2% min and 0.5% max from entry. */
export const STOP_EMERGENCY_PCT = 0.005;
/** Avoid lace/wick stops that are too tight (e.g. $40 on BTC ~65k). */
export const STOP_MIN_PCT = 0.002;

/**
 * @param {'long'|'short'} side
 * @param {number} entry
 * @param {number|null} candidatePx
 * @param {string} why
 * @returns {[number, string]}
 */
export function clampStopDistance(side, entry, candidatePx, why) {
  const minDist = entry * STOP_MIN_PCT;
  const maxDist = entry * STOP_EMERGENCY_PCT;
  if (side === 'short') {
    const minStop = round2(entry + minDist);
    const maxStop = round2(entry + maxDist);
    let px = candidatePx != null ? round2(candidatePx) : maxStop;
    if (!(px > entry)) px = maxStop;
    if (px < minStop) return [minStop, `${why || 'סטופ'} · הורחב למינימום 0.2%`];
    if (px > maxStop) return [maxStop, `סטופ 0.5% מהכניסה · קרוב מ־${why || 'סטופ'}`];
    return [px, why || 'סטופ'];
  }
  const minStop = round2(entry - minDist);
  const maxStop = round2(entry - maxDist);
  let px = candidatePx != null ? round2(candidatePx) : maxStop;
  if (!(px < entry)) px = maxStop;
  if (px > minStop) return [minStop, `${why || 'סטופ'} · הורחב למינימום 0.2%`];
  if (px < maxStop) return [maxStop, `סטופ 0.5% מהכניסה · קרוב מ־${why || 'סטופ'}`];
  return [px, why || 'סטופ'];
}

/** @param {string} side @param {number} entry @param {Record<string, unknown>} levels @param {Record<string, unknown>} fights */
function stopFor(side, entry, levels, fights) {
  const want = side === 'long' ? 'סטופ לונג' : 'סטופ שורט';
  /** @type {number|null} */
  let structPx = null;
  /** @type {string} */
  let structWhy = '';

  for (const s of levels.stops || []) {
    if (s.side !== want) continue;
    const px = num(s.px);
    if (px == null) continue;
    if (side === 'long' && px < entry) {
      structPx = round2(px);
      structWhy = s.why || 'סטופ';
      break;
    }
    if (side === 'short' && px > entry) {
      structPx = round2(px);
      structWhy = s.why || 'סטופ';
      break;
    }
  }

  if (structPx == null) {
    if (side === 'long') {
      const nf = fights.next_fight_below;
      const px = num(nf?.px);
      if (px != null && px < entry) {
        structPx = round2(px);
        structWhy = `מאבק מטה · ${nf?.tf || ''}`;
      }
    } else {
      const nf = fights.next_fight_above;
      const px = num(nf?.px);
      if (px != null && px > entry) {
        structPx = round2(px);
        structWhy = `מאבק מעלה · ${nf?.tf || ''}`;
      }
    }
  }

  return clampStopDistance(
    /** @type {'long'|'short'} */ (side),
    entry,
    structPx,
    structPx != null ? structWhy : 'סטופ מבנה',
  );
}

/** @param {string} side @param {number} entry @param {Record<string, unknown>} levels */
function targetsFor(side, entry, levels) {
  /** @type {Array<{ px: number, why: string }>} */
  const out = [];
  for (const x of levels.exits || []) {
    const label = x.side || '';
    const px = num(x.px);
    if (px == null) continue;
    if (side === 'long' && (String(label).includes('יציאת לונג') || label === 'יעד מעלה') && px > entry) {
      out.push({ px: round2(px), why: x.why || String(label) });
    }
    if (side === 'short' && (String(label).includes('יציאת שורט') || label === 'יעד מטה') && px < entry) {
      out.push({ px: round2(px), why: x.why || String(label) });
    }
  }
  const seen = new Set();
  /** @type {Array<{ px: number, why: string }>} */
  const uniq = [];
  for (const t of out) {
    if (seen.has(t.px)) continue;
    seen.add(t.px);
    uniq.push(t);
  }
  return uniq.slice(0, MAX_TARGET_SLICES);
}

/**
 * Active 30m collect touch/fight line from report.chain.collect.
 * @param {Record<string, unknown>} report
 */
export function collectTrigger(report) {
  const chain = report.chain && typeof report.chain === 'object' ? report.chain : null;
  const collect = chain?.collect && typeof chain.collect === 'object' ? chain.collect : null;
  if (!collect || !collect.active) return null;
  const path = String(collect.path_side || '');
  if (path !== 'up' && path !== 'down') return null;
  /** @type {Array<Record<string, unknown>>} */
  const touches = Array.isArray(collect.touch_lines) ? collect.touch_lines : [];
  const next = touches[0] || (collect.next && typeof collect.next === 'object' ? collect.next : null);
  if (!next) return null;
  const st = String(next.st_en || '');
  if (st !== 'touch' && st !== 'fight') return null;
  const px = num(next.px);
  if (px == null) return null;
  return {
    path,
    path_he: path === 'up' ? 'מעלה' : 'מטה',
    aligned: collect.aligned_with_4h === true,
    against: collect.aligned_with_4h === false,
    side: path === 'up' ? 'long' : 'short',
    side_he: path === 'up' ? 'לונג' : 'שורט',
    line: next,
    px,
    st,
    kind: String(next.kind || ''),
    label: String(next.label || 'קו'),
    key: `30m:${next.kind}:${px}:${st}`,
    bub: collect.bub != null ? String(collect.bub) : null,
  };
}

/** @param {string} side @param {number} entry @param {number} exitPx */
function pnl(side, entry, exitPx) {
  if (side === 'long') return round3(((exitPx - entry) / entry) * 100);
  return round3(((entry - exitPx) / entry) * 100);
}

/**
 * @param {Record<string, unknown>} openTrade
 * @param {number} exitPx
 * @param {string} reason
 * @param {string} kind
 * @param {string} ts
 * @param {number} contractsClosed
 * @param {'partial'|'closed'} status
 * @param {number} [targetIndex]
 */
function exitRow(openTrade, exitPx, reason, kind, ts, contractsClosed, status, targetIndex) {
  const side = /** @type {string} */ (openTrade.side);
  const entry = Number(openTrade.entry);
  const total = Number(openTrade.contracts_total || DEFAULT_CONTRACTS);
  const feePer = Number(openTrade.fee_per_contract ?? DEFAULT_FEE_PER_CONTRACT);
  const pnlPct = pnl(side, entry, exitPx);
  const sizePct = total > 0 ? round2((contractsClosed / total) * 100) : SCALE_PCT;
  return {
    id: openTrade.id,
    status,
    side,
    side_he: side === 'long' ? 'לונג' : 'שורט',
    entry,
    stop: openTrade.stop,
    targets: openTrade.targets || [],
    exit: round2(exitPx),
    exit_kind: kind,
    exit_reason: reason,
    size_pct: sizePct,
    contracts_total: total,
    contracts_closed: contractsClosed,
    fee_per_contract: feePer,
    fee_usd: round2(contractsClosed * feePer),
    target_index: targetIndex ?? null,
    pnl_pct: pnlPct,
    result_he: pnlPct > 0 ? 'הצלחה' : 'כישלון',
    opened_at: openTrade.opened_at,
    closed_at: ts,
    entry_why: openTrade.entry_why,
    stop_why: openTrade.stop_why,
  };
}

/**
 * Manual flat of remaining size at fillPx (paper only).
 * @param {Record<string, unknown>} openTrade
 * @param {number} fillPx
 * @param {string} [reason]
 * @param {string} [ts]
 */
export function buildManualFlattenRow(openTrade, fillPx, reason, ts) {
  const rem = Number(openTrade.contracts_remaining);
  const n = rem > 0 ? rem : Number(openTrade.contracts_total) || DEFAULT_CONTRACTS;
  return exitRow(
    openTrade,
    fillPx,
    reason || 'סגירה ידנית מהשף',
    'manual_flat',
    ts || new Date().toISOString(),
    n,
    'closed',
    null,
  );
}

/** @returns {string} */
function shortId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeOpen(open) {
  if (!open) return null;
  const total = num(open.contracts_total) || DEFAULT_CONTRACTS;
  let remainingContracts = num(open.contracts_remaining);
  const remainingPct = num(open.remaining_pct);
  if (remainingContracts == null) {
    if (remainingPct != null) {
      remainingContracts = Math.max(0, Math.round((total * remainingPct) / 100));
    } else {
      remainingContracts = total;
    }
  }
  const hit = Array.isArray(open.targets_hit) ? open.targets_hit.map(Number) : [];
  return {
    ...open,
    contracts_total: total,
    contracts_remaining: remainingContracts,
    remaining_pct: total > 0 ? round2((remainingContracts / total) * 100) : remainingPct ?? 100,
    targets_hit: hit,
    scale_pct: SCALE_PCT,
    fee_per_contract: num(open.fee_per_contract) ?? DEFAULT_FEE_PER_CONTRACT,
  };
}

/**
 * @param {Record<string, unknown>} report
 * @param {{ open?: Record<string, unknown>|null, trades?: Array<Record<string, unknown>>, blockNewEntries?: boolean, blockReason?: string, cooldown?: Record<string, unknown>|null }} [prevState]
 */
export function tickPaper(report, prevState = {}) {
  const price = num(report.price);
  // Bar high/low when present (hook). Fallback to mark so old snapshots still work.
  const high = num(report.high) ?? price;
  const low = num(report.low) ?? price;
  const bid = num(report.bid);
  const ask = num(report.ask);
  const mid = num(report.mid) ?? price;
  const twsFresh = Boolean(report.tws_fresh || report.price_source === 'tws');
  const book = { bid, ask, mid, price, tws_fresh: twsFresh };
  const h4 = report.h4 && typeof report.h4 === 'object' ? report.h4 : {};
  const bub4 = h4.bub != null ? String(h4.bub) : null;
  const bar4 = h4.bar_key != null ? String(h4.bar_key) : null;
  const struct4 = h4.structure != null ? String(h4.structure) : null;
  if (price == null) {
    const trades = prevState.trades || [];
    return {
      error: 'no price',
      open: null,
      lastClosed: null,
      note: '',
      trades,
      stats: summarize(trades),
      paper_only: true,
      cooldown: prevState.cooldown || null,
    };
  }

  const levels = report.levels || {};
  const fights = report.fights || {};
  const ts = String(report.receivedAt || new Date().toISOString());
  const collectOn = isCollectionEnabled();
  const trig = collectOn ? collectTrigger(report) : null;
  let lastCollectKey =
    prevState.last_collect_key != null ? String(prevState.last_collect_key) : null;
  let collectDid = false;

  let open = normalizeOpen(prevState.open || null);
  /** @type {Record<string, unknown>|null} */
  let cooldown =
    prevState.cooldown && typeof prevState.cooldown === 'object'
      ? { ...prevState.cooldown }
      : null;
  // Unlock only when 4H structure is no longer against us.
  // Short stop → stay cooled while structure still "up".
  // Long stop → stay cooled while structure still "down".
  if (cooldown && String(cooldown.reason || '') === 'stop') {
    const side = String(cooldown.side || '');
    if (side === 'short' && struct4 && struct4 !== 'up') cooldown = null;
    else if (side === 'long' && struct4 && struct4 !== 'down') cooldown = null;
    else if (!struct4 && !bub4) {
      // no structure feed — fall back to bar/bubble unlock
      const sameSideBub = String(cooldown.bub4 || '') === String(bub4 || '');
      const sameBar = String(cooldown.bar_key || '') === String(bar4 || '');
      if (!sameSideBub || !sameBar) cooldown = null;
    }
  }
  /** @type {Array<Record<string, unknown>>} */
  const trades = [...(prevState.trades || [])];
  /** @type {Record<string, unknown>|null} */
  let lastClosed = null;
  /** @type {Array<Record<string, unknown>>} */
  const partialsThisTick = [];
  let note = '';
  let fullyClosedThisTick = false;

  if (open) {
    const side = /** @type {string} */ (open.side);
    const stop = num(open.stop);
    const targets = open.targets || [];
    let remContracts = Number(open.contracts_remaining);
    const total = Number(open.contracts_total);
    /** @type {number[]} */
    const targetsHit = [...(open.targets_hit || [])];

    // Money fills (stop / targets) require live TWS book.
    // Never stop or scale-out on TradingView spikes when the quote bridge is stale.
    if (!twsFresh) {
      const tvSpike =
        stop != null &&
        ((side === 'short' && high != null && high >= stop) ||
          (side === 'long' && low != null && low <= stop));
      note = tvSpike
        ? `TWS ישן · ספייק TV ליד סטופ · אין מילוי עד מחיר חי (TV hi/lo ${high}/${low})`
        : `TWS ישן · פוזיציה מוקפאת ליציאות · אין סטופ/יעד מ־TradingView`;
    }

    // Short stop (buy cover): ask reaches stop. Long stop (sell): bid reaches stop.
    // Probe is TWS-only — never bar high/low from TV.
    const stopProbe =
      side === 'short'
        ? twsFresh && ask != null
          ? ask
          : null
        : twsFresh && bid != null
          ? bid
          : null;
    const hitStop =
      twsFresh &&
      stop != null &&
      stopProbe != null &&
      ((side === 'long' && stopProbe <= stop) || (side === 'short' && stopProbe >= stop));

    if (hitStop && remContracts > 0) {
      const n = remContracts;
      // Market stop: pay the live book. Never fall back to a TV mark spike.
      const fill =
        fillPxFromBook(/** @type {'long'|'short'} */ (side), 'close', book) ??
        /** @type {number} */ (stopProbe) ??
        /** @type {number} */ (stop);
      const row = exitRow(
        open,
        round2(fill),
        String(open.stop_why || 'סטופ') + ' · מילוי TWS',
        'stop',
        ts,
        n,
        'closed',
      );
      row.fill_source = side === 'short' ? 'ask' : 'bid';
      trades.push(row);
      lastClosed = row;
      open = null;
      fullyClosedThisTick = true;
      cooldown = {
        side,
        bub4: bub4 || null,
        bar_key: bar4 || null,
        structure: struct4 || null,
        reason: 'stop',
        set_at: ts,
        he:
          side === 'short'
            ? 'צינון אחרי סטופ שורט · אין שורט חדש כל עוד מבנה 4ש עולה'
            : 'צינון אחרי סטופ לונג · אין לונג חדש כל עוד מבנה 4ש יורד',
      };
      note = `יציאה בסטופ · ${n} חוזים · ${row.fill_source} · ` + cooldown.he;
    } else if (twsFresh) {
      for (let i = 0; i < targets.length && remContracts > 0; i++) {
        if (targetsHit.includes(i)) continue;
        const t = targets[i];
        const tpx = num(typeof t === 'object' && t != null ? t.px : t);
        if (tpx == null) continue;
        // Target touch uses live TWS book only — never TV mark / bar extremes.
        const targetProbe =
          side === 'short'
            ? ask != null
              ? ask
              : null
            : bid != null
              ? bid
              : null;
        if (targetProbe == null) continue;
        const touched =
          (side === 'long' && targetProbe >= tpx) || (side === 'short' && targetProbe <= tpx);
        if (!touched) continue;
        // Reject ghost fills at entry (0% move) — not a real scale-out.
        const fillCheck =
          fillPxFromBook(/** @type {'long'|'short'} */ (side), 'close', book) ?? price;
        const movePct =
          side === 'long'
            ? ((fillCheck - Number(open.entry)) / Number(open.entry)) * 100
            : ((Number(open.entry) - fillCheck) / Number(open.entry)) * 100;
        if (!(movePct > 0.02)) continue;

        const n = contractsForSlice(total, SCALE_PCT, remContracts, false);
        if (!(n > 0)) break;
        remContracts -= n;
        targetsHit.push(i);
        const why = (typeof t === 'object' && t?.why) || `יעד ${i + 1}`;
        const fill =
          fillPxFromBook(/** @type {'long'|'short'} */ (side), 'close', book) ?? tpx;

        if (remContracts <= 0) {
          const row = exitRow(open, round2(fill), String(why) + (twsFresh ? ' · מילוי TWS' : ''), 'target', ts, n, 'closed', i);
          row.fill_source = twsFresh ? (side === 'short' ? 'ask' : 'bid') : 'mark';
          trades.push(row);
          lastClosed = row;
          open = null;
          fullyClosedThisTick = true;
          note = `יציאה מלאה ביעד ${i + 1} · ${n} חוזים` + (twsFresh ? ` · ${row.fill_source}` : '');
          break;
        }

        const row = exitRow(open, round2(fill), String(why) + (twsFresh ? ' · מילוי TWS' : ''), 'target', ts, n, 'partial', i);
        row.fill_source = twsFresh ? (side === 'short' ? 'ask' : 'bid') : 'mark';
        trades.push(row);
        partialsThisTick.push(row);
        note = `יציאה חלקית ${n} חוזים ביעד ${i + 1} · נשאר ${remContracts}` + (twsFresh ? ` · ${row.fill_source}` : '');
      }

      if (open) {
        const mtm =
          fillPxFromBook(/** @type {'long'|'short'} */ (side), 'close', book) ?? price;
        open = {
          ...open,
          contracts_remaining: remContracts,
          remaining_pct: total > 0 ? round2((remContracts / total) * 100) : 0,
          targets_hit: targetsHit,
          mark: mtm != null ? round2(mtm) : open.mark,
          mark_source: twsFresh ? (side === 'short' ? 'ask' : 'bid') : 'mark',
          mark_at: ts,
        };
        if (!note) {
          note = `בפוזיציה · נשאר ${remContracts}/${total} חוזים · מחכים ליעד או סטופ`;
        }
      }
    }
  }

  // --- 30m collection: ONE segment exit when against 4H path (never flat the book) ---
  if (
    collectOn &&
    twsFresh &&
    trig &&
    open &&
    !fullyClosedThisTick &&
    !collectDid &&
    (trig.against || String(open.side) !== String(trig.side))
  ) {
    const actionKey = `${trig.key}:exit`;
    if (actionKey !== lastCollectKey) {
      const rem = Number(open.contracts_remaining);
      const total = Number(open.contracts_total) || DEFAULT_CONTRACTS;
      // Keep at least one hunt segment on the book. Collection is a roll, not a flat.
      const minKeep = Math.max(1, contractsForSlice(total, SCALE_PCT, total, false));
      let n = contractsForSlice(total, SCALE_PCT, rem, false);
      if (rem - n < minKeep) n = rem - minKeep;
      if (n > 0 && rem - n >= minKeep) {
        const fill =
          fillPxFromBook(/** @type {'long'|'short'} */ (open.side), 'close', book) ?? price;
        const why =
          `איסוף 30ד · יציאת מקטע · ${trig.label} ${trig.px} · ${trig.st === 'touch' ? 'נגיעה' : 'מאבק'}` +
          (twsFresh ? ' · מילוי TWS' : '');
        const left = rem - n;
        const row = exitRow(open, round2(fill), why, 'collect30', ts, n, 'partial');
        row.fill_source = twsFresh ? (open.side === 'short' ? 'ask' : 'bid') : 'mark';
        row.source = 'collect30';
        trades.push(row);
        partialsThisTick.push(row);
        open = {
          ...open,
          contracts_remaining: left,
          remaining_pct: total > 0 ? round2((left / total) * 100) : 0,
          last_collect_key: actionKey,
          last_collect_at: ts,
        };
        note = `איסוף · מקטע ${n} חוזים · נשאר ${left} · חצי שעה נגד המסלול`;
        lastCollectKey = actionKey;
        collectDid = true;
      } else if (!note.includes('איסוף')) {
        note =
          (note ? note + ' · ' : '') +
          `איסוף · בלי יציאה · נשאר ${rem} מתחת לרצפת מקטע (${minKeep})`;
      }
    }
  }

  // Partial book still open: allow add-back to full size on same-side approach/touch (0.25%).
  let huntAdded = false;
  const exitedThisTick = partialsThisTick.length > 0;
  if (
    open &&
    !fullyClosedThisTick &&
    !exitedThisTick &&
    !prevState.blockNewEntries &&
    Number(open.contracts_remaining) < Number(open.contracts_total)
  ) {
    const cand = pickEntry(levels);
    const sameSide = cand && String(cand.side) === String(open.side);
    // Add-back reach uses mark only (not bar high/low) — same bar extremes
    // stay true for hours and would re-add every webhook.
    const reachCand = sameSide
      ? entryReach(cand.side, price, price, price, cand.px)
      : { ok: false, mode: null };
    // Also allow regular approach/touch back to this position's original edge.
    const origEdge = num(open.edge_px);
    const reachOrig =
      sameSide && origEdge != null
        ? entryReach(cand.side, price, price, price, origEdge)
        : { ok: false, mode: null };
    const reach = reachCand.ok
      ? reachCand
      : reachOrig.ok
        ? { ...reachOrig, edge_px: origEdge }
        : { ok: false, mode: null };
    const reachPx = reachCand.ok ? cand.px : reachOrig.ok ? origEdge : cand?.px;
    const cooled =
      cooldown &&
      cand &&
      String(cooldown.side) === String(cand.side) &&
      String(cooldown.reason || '') === 'stop';
    const sameBarAdd =
      bar4 &&
      open.last_add_bar_key != null &&
      String(open.last_add_bar_key) === String(bar4);

    if (cooled) {
      if (!note) note = String(cooldown.he || 'צינון אחרי סטופ · אין הוספה');
    } else if (sameBarAdd) {
      if (!note.includes('הוספה')) {
        note =
          (note ? note + ' · ' : '') +
          'אין הוספה חוזרת באותו נר 4ש · מחכים לנר חדש או ליעד/סטופ';
      }
    } else if (reach.ok && cand && sameSide && reachPx != null) {
      const addGate = higherTfStructureGate(report, price, /** @type {'long'|'short'} */ (cand.side));
      if (!addGate.ok) {
        if (!note.includes('אין הוספה') && !note.includes('אין שורט') && !note.includes('אין לונג')) {
          note = (note ? note + ' · ' : '') + `ציד · אין הוספה · ${addGate.why}`;
        }
      } else {
      const rem = Number(open.contracts_remaining);
      const total = Number(open.contracts_total) || DEFAULT_CONTRACTS;
      const need = Math.max(0, total - rem);
      if (need > 0) {
        const rawFill = fillPxFromBook(cand.side, 'open', book) ?? price;
        const fillPx = round2(/** @type {number} */ (rawFill));
        const fillSrc = twsFresh ? (cand.side === 'short' ? 'bid' : 'ask') : 'mark';
        const feePer = Number(open.fee_per_contract) || DEFAULT_FEE_PER_CONTRACT;
        const oldEntry = Number(open.entry);
        const avgEntry = round2((oldEntry * rem + fillPx * need) / total);
        const [stop, stopWhy] = stopFor(cand.side, avgEntry, levels, fights);
        const targets = targetsFor(cand.side, avgEntry, levels);
        const miss = round2(Math.abs(Number(reachPx) - fillPx));
        const modeWhy =
          reach.mode === 'touch'
            ? ` · מגע מלא · קצה ${round2(reachPx)}`
            : ` · גישה רגילה 0.25% · קצה ${round2(reachPx)} · פער $${miss}`;
        const bookWhy = twsFresh ? ` · מילוי ${fillSrc} TWS` : '';
        const gateWhy = addGate.why ? ` · ${addGate.why}` : '';
        const why = `הוספה חזרה ${need} חוזים · ${cand.why}${modeWhy}${bookWhy}${gateWhy}`;

        open = {
          ...open,
          entry: avgEntry,
          edge_px: round2(reachPx),
          entry_mode: reach.mode,
          fill_source: fillSrc,
          stop: stop != null ? stop : open.stop,
          stop_why: stop != null ? stopWhy : open.stop_why,
          targets: targets.length ? targets : open.targets,
          entry_why: why,
          entry_gate: addGate.context,
          entry_gate_why: addGate.why,
          contracts_remaining: total,
          remaining_pct: 100,
          // Keep targets_hit — never re-arm the same scale-outs after add-back.
          targets_hit: [...(open.targets_hit || [])],
          fee_open_usd: Number(open.fee_open_usd || 0) + need * feePer,
          add_count: Number(open.add_count || 0) + 1,
          last_add_at: ts,
          last_add_px: fillPx,
          last_add_n: need,
          last_add_bar_key: bar4 || open.last_add_bar_key || null,
          mark: fillPx,
          mark_source: fillSrc,
          mark_at: ts,
        };
        trades.push({
          id: open.id,
          status: 'add',
          side: open.side,
          side_he: open.side_he,
          entry: fillPx,
          avg_entry: avgEntry,
          edge_px: round2(reachPx),
          entry_mode: reach.mode,
          fill_source: fillSrc,
          stop: open.stop,
          entry_why: why,
          entry_gate: addGate.context,
          entry_gate_why: addGate.why,
          opened_at: open.opened_at,
          closed_at: ts,
          contracts_total: total,
          contracts_remaining: total,
          contracts_closed: need,
          contracts_added: need,
          remaining_pct: 100,
          fee_per_contract: feePer,
          fee_usd: need * feePer,
          add_count: open.add_count,
          leg: Number(open.add_count || 0) + 1,
          result_he: 'הוספה',
          source: 'hunt',
        });
        note = `הוספה חזרה · +${need} חוזים · ${reach.mode === 'touch' ? 'מגע' : 'גישה'} · מילוי ${fillPx} (${fillSrc}) · ממוצע ${avgEntry} · שוב ${total}/${total}`;
        huntAdded = true;
      }
      }
    } else if (cand && sameSide && !reach.ok && !note) {
      note = `בפוזיציה · נשאר ${open.contracts_remaining}/${open.contracts_total} · מחכים למגע או גישה 0.25% להוספה · או ליעד/סטופ`;
    }
  }

  // --- 30m collection: add back when aligned with 4H + touch + fee gate ---
  if (
    collectOn &&
    twsFresh &&
    trig &&
    trig.aligned &&
    open &&
    !fullyClosedThisTick &&
    !exitedThisTick &&
    !huntAdded &&
    !collectDid &&
    !prevState.blockNewEntries &&
    String(open.side) === String(trig.side) &&
    Number(open.contracts_remaining) < Number(open.contracts_total)
  ) {
    const actionKey = `${trig.key}:add`;
    const rem = Number(open.contracts_remaining);
    const total = Number(open.contracts_total) || DEFAULT_CONTRACTS;
    const need = Math.max(0, total - rem);
    const feePer = Number(open.fee_per_contract) || DEFAULT_FEE_PER_CONTRACT;
    if (
      need > 0 &&
      actionKey !== lastCollectKey &&
      passesCollectFeeGate(price, need, feePer)
    ) {
      const addGate = higherTfStructureGate(report, price, /** @type {'long'|'short'} */ (trig.side));
      if (!addGate.ok) {
        if (!note.includes('איסוף')) {
          note = (note ? note + ' · ' : '') + `איסוף · אין הוספה · ${addGate.why}`;
        }
      } else {
      const rawFill = fillPxFromBook(/** @type {'long'|'short'} */ (trig.side), 'open', book) ?? price;
      const fillPx = round2(/** @type {number} */ (rawFill));
      const fillSrc = twsFresh ? (trig.side === 'short' ? 'bid' : 'ask') : 'mark';
      const oldEntry = Number(open.entry);
      const avgEntry = round2((oldEntry * rem + fillPx * need) / total);
      const [stop, stopWhy] = stopFor(trig.side, avgEntry, levels, fights);
      const targets = targetsFor(trig.side, avgEntry, levels);
      const why =
        `איסוף 30ד · הוספה ${need} · ${trig.label} ${trig.px} · ${trig.st === 'touch' ? 'נגיעה' : 'מאבק'}` +
        (twsFresh ? ` · מילוי ${fillSrc}` : '') +
        (addGate.why ? ` · ${addGate.why}` : '');
      open = {
        ...open,
        entry: avgEntry,
        edge_px: trig.px,
        entry_mode: trig.st,
        fill_source: fillSrc,
        stop: stop != null ? stop : open.stop,
        stop_why: stop != null ? stopWhy : open.stop_why,
        targets: targets.length ? targets : open.targets,
        entry_why: why,
        entry_gate: addGate.context,
        entry_gate_why: addGate.why,
        contracts_remaining: total,
        remaining_pct: 100,
        // Keep targets_hit — never re-arm the same scale-outs after add-back.
        targets_hit: [...(open.targets_hit || [])],
        fee_open_usd: Number(open.fee_open_usd || 0) + need * feePer,
        add_count: Number(open.add_count || 0) + 1,
        last_add_at: ts,
        last_add_px: fillPx,
        last_add_n: need,
        last_add_bar_key: bar4 || open.last_add_bar_key || null,
        last_collect_key: actionKey,
        last_collect_at: ts,
        mark: fillPx,
        mark_source: fillSrc,
        mark_at: ts,
      };
      trades.push({
        id: open.id,
        status: 'add',
        side: open.side,
        side_he: open.side_he,
        entry: fillPx,
        avg_entry: avgEntry,
        edge_px: trig.px,
        entry_mode: trig.st,
        fill_source: fillSrc,
        stop: open.stop,
        entry_why: why,
        entry_gate: addGate.context,
        entry_gate_why: addGate.why,
        opened_at: open.opened_at,
        closed_at: ts,
        contracts_total: total,
        contracts_remaining: total,
        contracts_closed: need,
        contracts_added: need,
        remaining_pct: 100,
        fee_per_contract: feePer,
        fee_usd: need * feePer,
        add_count: open.add_count,
        leg: Number(open.add_count || 0) + 1,
        result_he: 'הוספה איסוף',
        source: 'collect30',
      });
      note = `איסוף · הוספה +${need} · חצי שעה עם המסלול · מילוי ${fillPx}`;
      lastCollectKey = actionKey;
      collectDid = true;
      }
    } else if (need > 0 && actionKey !== lastCollectKey && !passesCollectFeeGate(price, need, feePer)) {
      if (!note.includes('איסוף')) {
        note = (note ? note + ' · ' : '') + 'איסוף · דילוג הוספה · עמלה גדולה מול תנועה';
      }
    }
  }

  let huntOpened = false;
  if (open == null && !fullyClosedThisTick) {
    if (prevState.blockNewEntries) {
      note = String(prevState.blockReason || 'מסחר חסום · חוזה לא תקין');
    } else {
    const cand = pickEntry(levels);
    const reach = cand ? entryReach(cand.side, price, high, low, cand.px) : { ok: false, mode: null };

    // Stop-loop guard: same side still locked until 4H bubble or candle rolls.
    const cooled =
      cooldown &&
      cand &&
      String(cooldown.side) === String(cand.side) &&
      String(cooldown.reason || '') === 'stop';

    if (cooled) {
      note = String(cooldown.he || 'צינון אחרי סטופ · אין כניסה חוזרת');
    } else if (reach.ok && cand) {
      const gate = higherTfStructureGate(report, price, /** @type {'long'|'short'} */ (cand.side));
      if (!gate.ok) {
        note = gate.why;
      } else {
      // Fill at live bid/ask when TWS is fresh (short open → bid, long open → ask).
      const rawFill =
        fillPxFromBook(cand.side, 'open', book) ?? price;
      const fillPx = round2(/** @type {number} */ (rawFill));
      const fillSrc = twsFresh ? (cand.side === 'short' ? 'bid' : 'ask') : 'mark';
      const [stop, stopWhy] = stopFor(cand.side, fillPx, levels, fights);
      const targets = targetsFor(cand.side, fillPx, levels);
      if (stop == null) {
        note = 'אין כניסה · חסר סטופ';
      } else {
        const total = DEFAULT_CONTRACTS;
        const feePer = DEFAULT_FEE_PER_CONTRACT;
        const miss = round2(Math.abs(cand.px - fillPx));
        const approachWhy =
          reach.mode === 'approach'
            ? ` · כניסה בגישה בלי מגע מלא · קצה ${round2(cand.px)} · פער $${miss}`
            : '';
        const bookWhy = twsFresh ? ` · מילוי ${fillSrc} TWS` : '';
        const gateWhy = gate.why ? ` · ${gate.why}` : '';
        const why = `${cand.why}${approachWhy}${bookWhy}${gateWhy}`;
        open = {
          id: shortId(),
          side: cand.side,
          side_he: cand.side === 'long' ? 'לונג' : 'שורט',
          entry: fillPx,
          edge_px: round2(cand.px),
          entry_mode: reach.mode,
          fill_source: fillSrc,
          stop,
          stop_why: stopWhy,
          targets,
          entry_why: why,
          entry_gate: gate.context,
          entry_gate_why: gate.why,
          opened_at: ts,
          opened_price_mark: fillPx,
          contracts_total: total,
          contracts_remaining: total,
          remaining_pct: 100,
          targets_hit: [],
          scale_pct: SCALE_PCT,
          fee_per_contract: feePer,
          fee_open_usd: total * feePer,
        };
        trades.push({
          id: open.id,
          status: 'opened',
          side: open.side,
          side_he: open.side_he,
          entry: open.entry,
          edge_px: open.edge_px,
          entry_mode: reach.mode,
          fill_source: fillSrc,
          stop,
          targets,
          entry_why: why,
          entry_gate: gate.context,
          entry_gate_why: gate.why,
          stop_why: stopWhy,
          opened_at: ts,
          mark: fillPx,
          contracts_total: total,
          contracts_remaining: total,
          remaining_pct: 100,
          scale_pct: SCALE_PCT,
          fee_per_contract: feePer,
          fee_usd: total * feePer,
          contracts_closed: total,
          source: 'hunt',
        });
        note =
          reach.mode === 'approach'
            ? `נפתחה בגישה בלי מגע מלא · קצה ${round2(cand.px)} · מילוי ${fillPx} (${fillSrc}) · פער $${miss}`
            : `נפתחה עסקת פייפר · מילוי ${fillPx} (${fillSrc}) · ${total} חוזים`;
        huntOpened = true;
      }
      }
    }
    }
  }

  // --- 30m collection: new entry when flat + aligned + touch + fee gate ---
  if (
    collectOn &&
    twsFresh &&
    trig &&
    trig.aligned &&
    open == null &&
    !fullyClosedThisTick &&
    !huntOpened &&
    !collectDid &&
    !prevState.blockNewEntries
  ) {
    const actionKey = `${trig.key}:open`;
    const total = DEFAULT_CONTRACTS;
    const feePer = DEFAULT_FEE_PER_CONTRACT;
    const cooled =
      cooldown &&
      String(cooldown.side) === String(trig.side) &&
      String(cooldown.reason || '') === 'stop';
    if (cooled) {
      if (!note) note = String(cooldown.he || 'צינון אחרי סטופ · אין כניסת איסוף');
    } else if (actionKey === lastCollectKey) {
      // already acted on this touch
    } else if (!passesCollectFeeGate(price, total, feePer)) {
      if (!note || note.includes('מחכים')) {
        note = 'איסוף · דילוג כניסה · עמלה גדולה מול תנועה צפויה';
      }
    } else {
      const gate = higherTfStructureGate(report, price, /** @type {'long'|'short'} */ (trig.side));
      if (!gate.ok) {
        note = `איסוף · ${gate.why}`;
      } else {
      const rawFill = fillPxFromBook(/** @type {'long'|'short'} */ (trig.side), 'open', book) ?? price;
      const fillPx = round2(/** @type {number} */ (rawFill));
      const fillSrc = twsFresh ? (trig.side === 'short' ? 'bid' : 'ask') : 'mark';
      const [stop, stopWhy] = stopFor(trig.side, fillPx, levels, fights);
      const targets = targetsFor(trig.side, fillPx, levels);
      if (stop == null) {
        if (!note) note = 'איסוף · אין כניסה · חסר סטופ';
      } else {
        const why =
          `איסוף 30ד · כניסה · ${trig.side_he} · ${trig.label} ${trig.px} · ${trig.st === 'touch' ? 'נגיעה' : 'מאבק'}` +
          (twsFresh ? ` · מילוי ${fillSrc}` : '') +
          (gate.why ? ` · ${gate.why}` : '');
        open = {
          id: shortId(),
          side: trig.side,
          side_he: trig.side_he,
          entry: fillPx,
          edge_px: trig.px,
          entry_mode: trig.st,
          fill_source: fillSrc,
          stop,
          stop_why: stopWhy,
          targets,
          entry_why: why,
          entry_gate: gate.context,
          entry_gate_why: gate.why,
          opened_at: ts,
          opened_price_mark: fillPx,
          contracts_total: total,
          contracts_remaining: total,
          remaining_pct: 100,
          targets_hit: [],
          scale_pct: SCALE_PCT,
          fee_per_contract: feePer,
          fee_open_usd: total * feePer,
          last_collect_key: actionKey,
          last_collect_at: ts,
          source: 'collect30',
        };
        trades.push({
          id: open.id,
          status: 'opened',
          side: open.side,
          side_he: open.side_he,
          entry: open.entry,
          edge_px: open.edge_px,
          entry_mode: trig.st,
          fill_source: fillSrc,
          stop,
          targets,
          entry_why: why,
          entry_gate: gate.context,
          entry_gate_why: gate.why,
          stop_why: stopWhy,
          opened_at: ts,
          mark: fillPx,
          contracts_total: total,
          contracts_remaining: total,
          remaining_pct: 100,
          scale_pct: SCALE_PCT,
          fee_per_contract: feePer,
          fee_usd: total * feePer,
          contracts_closed: total,
          source: 'collect30',
        });
        note = `איסוף · נפתחה · חצי שעה עם המסלול · מילוי ${fillPx} · ${total} חוזים`;
        lastCollectKey = actionKey;
        collectDid = true;
      }
      }
    }
  }

  // Clear collect debounce when no longer touching that line
  if (trig && lastCollectKey && !String(lastCollectKey).startsWith(trig.key)) {
    // different line — keep key until acted; ok
  } else if (!trig && lastCollectKey && !open) {
    lastCollectKey = null;
  }

  if (open == null && !note) {
    note = collectOn
      ? 'אין פוזיציה · מחכים לציד או לאיסוף חצי שעה'
      : 'אין פוזיציה · מחכים לכניסה מוכנה';
  }

  return {
    open,
    lastClosed,
    partials: partialsThisTick,
    note,
    trades,
    stats: summarize(trades),
    paper_only: true,
    scale_pct: SCALE_PCT,
    contracts_default: DEFAULT_CONTRACTS,
    fee_per_contract: DEFAULT_FEE_PER_CONTRACT,
    cooldown,
    last_collect_key: lastCollectKey,
    collection_enabled: collectOn,
    collect_trigger: trig
      ? {
          path: trig.path_he,
          aligned: trig.aligned,
          against: trig.against,
          label: trig.label,
          px: trig.px,
          st: trig.st,
        }
      : null,
  };
}
