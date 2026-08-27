/**
 * One simple decision scene.
 * 1m is only the pulse that delivered the pack.
 * Center is always 4H. Other TFs surround it.
 */

import { layerSideHe, layerTone } from './tf-tone';
import { buildTfRelations } from './tf-relation';
import { attachRsiZone, rsiZone, rsiZoneHe } from './rsi-zone';
import { attachPivotStack, buildPivotStack } from './pivot-stack';

const TF_ORDER = ['15m', '30m', '1H', '2H', '4H', 'Day', '3D', 'Week'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bubHe(b) {
  if (b === 'HH') return 'שיא חדש';
  if (b === 'LH') return 'שיא נמוך';
  if (b === 'HL') return 'תחתית גבוהה';
  if (b === 'LL') return 'תחתית חדשה';
  return b || '-';
}

function roleOf(tf) {
  if (tf === '4H') return 'center';
  if (tf === '15m' || tf === '30m' || tf === '1H' || tf === '2H') return 'near';
  return 'wide';
}

function findTf(rows, name) {
  return (rows || []).find((t) => t.tf === name) || null;
}

function absPct(from, to) {
  if (from == null || to == null || from === 0) return null;
  return (Math.abs(to - from) / Math.abs(from)) * 100;
}

function pushSceneLevel(bucket, px, price, name, tf, weight = 1) {
  const p = num(px);
  const c = num(price);
  if (p == null || c == null) return;
  if (Math.abs(p - c) / Math.abs(c) < 0.00008) return;
  const distPct = absPct(c, p);
  if (distPct == null || distPct > 40) return;
  const side = p > c ? 'up' : 'down';
  bucket.push({
    name,
    px: p,
    distPct,
    tf: tf || null,
    side,
    weight,
  });
}

function dedupeLevels(items) {
  const sorted = [...items].sort((a, b) => a.px - b.px || (b.weight || 0) - (a.weight || 0));
  const out = [];
  for (const it of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.px - it.px) / Math.abs(it.px) < 0.0008) {
      if ((it.weight || 0) > (prev.weight || 0)) out[out.length - 1] = it;
      continue;
    }
    out.push(it);
  }
  return out;
}

function collectTfLevels(tfRow, price, weightBoost = 1) {
  if (!tfRow) return [];
  const list = [];
  const tf = tfRow.tf;
  const w = weightBoost;
  pushSceneLevel(list, tfRow.oppPx, price, `מקור מסע בועה · ${tf}`, tf, 3 * w);
  pushSceneLevel(list, tfRow.bubPx, price, `מחיר בועה · ${tf}`, tf, 2.2 * w);
  pushSceneLevel(list, tfRow.railUp, price, `פיבוט גדול עליון · ${tf}`, tf, 2.6 * w);
  pushSceneLevel(list, tfRow.railDn, price, `פיבוט גדול תחתון · ${tf}`, tf, 2.6 * w);
  pushSceneLevel(list, tfRow.pivotSmallUp, price, `פיבוט קטן עליון · ${tf}`, tf, 2.5 * w);
  pushSceneLevel(list, tfRow.pivotSmallDn, price, `פיבוט קטן תחתון · ${tf}`, tf, 2.5 * w);
  pushSceneLevel(list, tfRow.pivotHi, price, `פיבוט גבוה · ${tf}`, tf, 2.4 * w);
  pushSceneLevel(list, tfRow.pivotLo, price, `פיבוט נמוך · ${tf}`, tf, 2.4 * w);
  pushSceneLevel(list, tfRow.emaFast, price, `ממוצע מהיר · ${tf}`, tf, 1.4 * w);
  pushSceneLevel(list, tfRow.emaMid, price, `ממוצע אמצע · ${tf}`, tf, 1.5 * w);
  pushSceneLevel(list, tfRow.emaSlow, price, `ממוצע איטי · ${tf}`, tf, 1.6 * w);
  pushSceneLevel(list, tfRow.poc, price, `נפח מרבי · ${tf}`, tf, 1.8 * w);
  return list;
}

/**
 * Path from the scene itself: 4H first, then wide, then near.
 * Not the noisy short-TF EMA soup.
 */
function buildScenePath(center, tfs, price) {
  const centerList = [];
  if (center) {
    const c4 = { ...center, tf: '4H' };
    centerList.push(...collectTfLevels(c4, price, 2));
  }
  const otherList = [];
  for (const t of tfs || []) {
    if (t.tf === '4H') continue;
    const boost = t.role === 'wide' ? 1.4 : 0.85;
    otherList.push(...collectTfLevels(t, price, boost));
  }

  const centerUniq = dedupeLevels(centerList);
  const otherUniq = dedupeLevels(otherList);

  function mergeSide(side, limit) {
    const base = centerUniq
      .filter((x) => x.side === side)
      .sort((a, b) => (side === 'up' ? a.px - b.px : b.px - a.px));
    const extras = otherUniq
      .filter((x) => x.side === side)
      .sort((a, b) => (side === 'up' ? a.px - b.px : b.px - a.px) || b.weight - a.weight);
    const out = [...base];
    for (const it of extras) {
      if (out.length >= limit) break;
      const near = out.some((p) => Math.abs(p.px - it.px) / Math.abs(it.px) < 0.001);
      if (near) continue;
      out.push(it);
    }
    return out
      .sort((a, b) => (side === 'up' ? a.px - b.px : b.px - a.px))
      .slice(0, limit);
  }

  const up = mergeSide('up', 4);
  const down = mergeSide('down', 4);

  // Lean map: only nearest 4H structure + now (readable, not dense)
  const leanPool = [];
  if (center) {
    const c4 = { ...center, tf: '4H' };
    leanPool.push(
      ...collectTfLevels(
        {
          ...c4,
          // keep only structure for the open map
          emaMid: c4.emaMid,
          emaSlow: null,
          poc: null,
          bubPx: null,
        },
        price,
        3,
      ).filter((x) => {
        const n = x.name || '';
        return (
          n.includes('ממוצע מהיר') ||
          n.includes('ממוצע אמצע') ||
          n.includes('פיבוט קטן') ||
          n.includes('פיבוט גדול') ||
          n.includes('מקור מסע')
        );
      }),
    );
  }
  const leanUniq = dedupeLevels(leanPool);
  const leanUp = leanUniq
    .filter((x) => x.side === 'up')
    .sort((a, b) => a.px - b.px || b.weight - a.weight)
    .slice(0, 3);
  const leanDown = leanUniq
    .filter((x) => x.side === 'down')
    .sort((a, b) => b.px - a.px || b.weight - a.weight)
    .slice(0, 3);

  function levelHint(name, side) {
    const n = name || '';
    if (n.includes('ממוצע מהיר')) {
      return side === 'down' ? 'גע כאן ← בחינת לונג' : 'גע כאן ← בחינת שורט';
    }
    if (n.includes('ממוצע אמצע')) {
      return side === 'up' ? 'התנגדות קרובה' : 'תמיכה קרובה';
    }
    if (n.includes('פיבוט קטן תחתון') || (n.includes('פיבוט קטן') && side === 'down')) {
      return 'שבירה מטה מבטלת לונג קצר';
    }
    if (n.includes('פיבוט קטן עליון') || (n.includes('פיבוט קטן') && side === 'up')) {
      return 'שבירה מעלה מבטלת שורט קצר';
    }
    if (n.includes('פיבוט גדול תחתון') || (n.includes('פיבוט גדול') && side === 'down')) {
      return 'שבירה מטה = שורט מבני';
    }
    if (n.includes('פיבוט גדול עליון') || (n.includes('פיבוט גדול') && side === 'up')) {
      return 'שבירה מעלה = לונג מבני';
    }
    if (n.includes('מקור מסע')) {
      return side === 'up' ? 'יעד / מקור הירידה' : 'מקור העלייה';
    }
    return side === 'up' ? 'מעל המחיר' : 'מתחת למחיר';
  }

  const chartDown = [...leanDown].reverse().map((s) => ({
    side: 'down',
    px: s.px,
    label: s.name.replace(' · 4H', ''),
    hint: levelHint(s.name, 'down'),
    tf: s.tf,
    kind: 'level',
  }));
  const chartUp = leanUp.map((s) => ({
    side: 'up',
    px: s.px,
    label: s.name.replace(' · 4H', ''),
    hint: levelHint(s.name, 'up'),
    tf: s.tf,
    kind: 'level',
  }));
  const chart = [
    ...chartDown,
    {
      side: 'now',
      px: price,
      label: 'עכשיו',
      hint: 'מחיר נוכחי',
      tf: 'now',
      kind: 'now',
    },
    ...chartUp,
  ].filter((p) => p.px != null);

  return { up, down, chart };
}

/** Ladder = every price from long + short routes, with separate side roles. */
function buildChartFromRoutes(price, longEntry, shortEntry) {
  if (price == null) return null;
  const pool = [];
  function add(entry, tag) {
    for (const step of entry?.route || []) {
      const px = num(step.px);
      if (px == null) continue;
      pool.push({
        px,
        name: String(step.name || '').replace(' · 4H', ''),
        tag,
        role: step.role || '',
        roleHe: step.roleHe || step.role || '',
        riskPct: step.riskPct ?? null,
        rewardPct: step.rewardPct ?? null,
        rr: step.rr ?? null,
      });
    }
  }
  add(longEntry, 'long');
  add(shortEntry, 'short');
  if (!pool.length) return null;

  pool.sort((a, b) => a.px - b.px);
  const uniq = [];
  for (const p of pool) {
    const last = uniq[uniq.length - 1];
    if (last && Math.abs(last.px - p.px) / Math.abs(p.px) < 0.0008) {
      if (p.name && (!last.name || p.name.length > last.name.length)) last.name = p.name;
      last[p.tag] = {
        role: p.role,
        roleHe: p.roleHe,
        riskPct: p.riskPct,
        rewardPct: p.rewardPct,
        rr: p.rr,
      };
      continue;
    }
    const row = { px: p.px, name: p.name, long: null, short: null };
    row[p.tag] = {
      role: p.role,
      roleHe: p.roleHe,
      riskPct: p.riskPct,
      rewardPct: p.rewardPct,
      rr: p.rr,
    };
    uniq.push(row);
  }

  const levels = [];
  for (const u of uniq) {
    if (Math.abs(u.px - price) / Math.abs(price) < 0.0004) continue;
    levels.push({
      side: u.px > price ? 'up' : 'down',
      px: u.px,
      label: u.name || 'רמה',
      name: u.name || 'רמה',
      long: u.long,
      short: u.short,
      tf: '4H',
      kind: 'level',
    });
  }

  const down = levels.filter((x) => x.side === 'down').sort((a, b) => b.px - a.px);
  const up = levels.filter((x) => x.side === 'up').sort((a, b) => a.px - b.px);

  return [
    ...[...down].reverse(),
    {
      side: 'now',
      px: price,
      label: 'עכשיו',
      name: 'עכשיו',
      hint: 'מחיר נוכחי',
      long: null,
      short: null,
      tf: 'now',
      kind: 'now',
    },
    ...up,
  ];
}

function level(n) {
  if (!n || n.px == null) return null;
  return {
    name: n.label || n.kind || n.name || '',
    px: num(n.px),
    distPct: num(n.distPct),
    tf: n.tf || null,
  };
}

function maFrom(row, raw, id) {
  const pool = [
    ...(row?.targetsAbove || []),
    ...(row?.targetsBelow || []),
    row?.magnetAbove,
    row?.magnetBelow,
  ].filter(Boolean);
  const hit = pool.find((m) => m.id === id);
  if (hit?.px != null) return num(hit.px);
  if (id === 'fast') return num(raw?.mf);
  if (id === 'mid') return num(raw?.mm);
  if (id === 'slow') return num(raw?.ms);
  return null;
}

function pickMacd(row, forecastCard, raw) {
  const fromRow = row?.macd && typeof row.macd === 'object' ? row.macd : null;
  const fromFc = forecastCard?.macd && typeof forecastCard.macd === 'object' ? forecastCard.macd : null;
  const src = fromRow || fromFc || raw || {};
  return {
    ml: num(src.ml ?? raw?.ml),
    sl: num(src.sl ?? raw?.sl),
    hi: num(src.hi ?? raw?.hi),
    mAbove: src.mAbove === true || raw?.mAbove === true,
    bothLo: src.bothLo === true || raw?.bothLo === true,
    bothHi: src.bothHi === true || raw?.bothHi === true,
    hRise: src.hRise === true || raw?.hRise === true,
    hFall: src.hFall === true || raw?.hFall === true,
    xUp: src.xUp === true || raw?.xUp === true,
    xDn: src.xDn === true || raw?.xDn === true,
  };
}

/** Ron: open / approaching / cross vs signal. */
function macdPhase(macd) {
  if (!macd || macd.ml == null || macd.sl == null) return { id: 'none', he: 'מקאד חסר' };
  if (macd.xUp) return { id: 'cross_up', he: 'מקאד חצה מעלה' };
  if (macd.xDn) return { id: 'cross_dn', he: 'מקאד חצה מטה' };
  const gap = Math.abs(macd.ml - macd.sl);
  const scale = Math.max(Math.abs(macd.ml), Math.abs(macd.sl), 1);
  const rel = gap / scale;
  // approaching: near signal, or still above zero while under signal (Day shape)
  if (!macd.mAbove && (rel < 0.3 || macd.bothHi || macd.hRise)) {
    return { id: 'approaching', he: 'מקאד מתקרב' };
  }
  if (macd.mAbove && macd.hFall && rel < 0.22) {
    return { id: 'approaching', he: 'מקאד מתקרב' };
  }
  if (macd.mAbove) {
    return { id: 'open', he: 'מקאד פתוח' };
  }
  return { id: 'closed', he: 'מקאד סגור מתחת' };
}

function slimTf(row, forecastCard, raw) {
  if (!row && !forecastCard && !raw) return null;
  const tf = row?.tf || forecastCard?.tf || raw?.tf;
  const macd = pickMacd(row, forecastCard, raw);
  const phase = macdPhase(macd);
  return {
    tf,
    role: roleOf(tf),
    bub: row?.bub || forecastCard?.bub || raw?.bub || '-',
    bubHe: bubHe(row?.bub || forecastCard?.bub || raw?.bub),
    bubPx: num(row?.bubPx ?? forecastCard?.bubPx ?? raw?.bubPx),
    oppPx: num(row?.oppPx ?? forecastCard?.oppPx ?? raw?.oppPx),
    swingPct: num(row?.swingPct ?? forecastCard?.swingPct ?? raw?.swingPct),
    stack: row?.stk || raw?.stk || '-',
    zap: row?.zap || forecastCard?.zap || raw?.zap || '-',
    pink: row?.pink || forecastCard?.pink || raw?.pink || '-',
    channel: row?.channel || forecastCard?.channel || raw?.channel || '-',
    rsi: num(row?.r14 ?? forecastCard?.rsi ?? raw?.r14),
    macd,
    macdAbove: macd.mAbove === true,
    macdPhase: phase.id,
    macdPhaseHe: phase.he,
    emaFast: maFrom(row, raw, 'fast'),
    emaMid: maFrom(row, raw, 'mid'),
    emaSlow: maFrom(row, raw, 'slow'),
    railUp: num(row?.rail?.up ?? raw?.rh),
    railDn: num(row?.rail?.dn ?? raw?.rl),
    pivotHi: num(row?.rail?.anchors?.ph ?? raw?.ph),
    pivotLo: num(row?.rail?.anchors?.pl ?? raw?.pl),
    pivotSmallUp: num(row?.rail?.small?.up ?? raw?.srh),
    pivotSmallDn: num(row?.rail?.small?.dn ?? raw?.srl),
    poc: num(row?.poc ?? raw?.poc),
    up: level(forecastCard?.nearestUp),
    down: level(forecastCard?.nearestDown),
  };
}

function pickEntry(side, center, pathSide, price) {
  if (!center || price == null) return null;
  const cands = [];
  if (side === 'long') {
    // Prefer pullback to EMA / small pivot / large rail — not chasing
    if (center.emaFast != null) cands.push({ px: center.emaFast, name: 'ממוצע מהיר · 4H', pref: 3 });
    if (center.emaMid != null) cands.push({ px: center.emaMid, name: 'ממוצע אמצע · 4H', pref: 2.5 });
    if (center.pivotSmallDn != null) {
      cands.push({ px: center.pivotSmallDn, name: 'פיבוט קטן תחתון · 4H', pref: 2.8 });
    }
    if (center.railDn != null) cands.push({ px: center.railDn, name: 'פיבוט גדול תחתון · 4H', pref: 2.2 });
    if (center.pivotLo != null) cands.push({ px: center.pivotLo, name: 'פיבוט נמוך · 4H', pref: 2 });
    if (center.emaSlow != null) cands.push({ px: center.emaSlow, name: 'ממוצע איטי · 4H', pref: 1.5 });
    if (center.bub === 'HL' || center.bub === 'LL') {
      if (center.bubPx != null) cands.push({ px: center.bubPx, name: `בועה ${center.bub} · 4H`, pref: 1.8 });
    }
    for (const p of pathSide || []) {
      if (p.px != null && p.px <= price) cands.push({ px: p.px, name: p.name, pref: 1 });
    }
  } else {
    if (center.emaFast != null) cands.push({ px: center.emaFast, name: 'ממוצע מהיר · 4H', pref: 3 });
    if (center.emaMid != null) cands.push({ px: center.emaMid, name: 'ממוצע אמצע · 4H', pref: 2.5 });
    if (center.pivotSmallUp != null) {
      cands.push({ px: center.pivotSmallUp, name: 'פיבוט קטן עליון · 4H', pref: 2.8 });
    }
    if (center.oppPx != null) cands.push({ px: center.oppPx, name: 'מקור מסע בועה · 4H', pref: 2.4 });
    if (center.railUp != null) cands.push({ px: center.railUp, name: 'פיבוט גדול עליון · 4H', pref: 2.2 });
    if (center.pivotHi != null) cands.push({ px: center.pivotHi, name: 'פיבוט גבוה · 4H', pref: 2 });
    if (center.bub === 'HH' || center.bub === 'LH') {
      if (center.bubPx != null) cands.push({ px: center.bubPx, name: `בועה ${center.bub} · 4H`, pref: 1.8 });
    }
    for (const p of pathSide || []) {
      if (p.px != null && p.px >= price) cands.push({ px: p.px, name: p.name, pref: 1 });
    }
  }

  const uniq = [];
  for (const c of cands) {
    const px = num(c.px);
    if (px == null) continue;
    if (uniq.some((u) => Math.abs(u.px - px) / Math.abs(px) < 0.0008)) continue;
    uniq.push({ ...c, px, distPct: absPct(price, px), pref: c.pref || 1 });
  }
  if (!uniq.length) return null;

  // Long: prefer support at or below price (pullback). If all below, nearest. Prefer EMA when above it.
  let pick = null;
  if (side === 'long') {
    const belowOrAt = uniq.filter((u) => u.px <= price * 1.0015).sort((a, b) => b.pref - a.pref || b.px - a.px);
    const above = uniq.filter((u) => u.px > price).sort((a, b) => a.px - b.px || b.pref - a.pref);
    // If price is above fast EMA, wait for that EMA (even if slightly below is closer rail)
    const ema = uniq.find((u) => u.name.startsWith('ממוצע מהיר'));
    if (ema && price > ema.px * 1.001) {
      pick = ema;
    } else {
      pick = belowOrAt[0] || above[0];
    }
  } else {
    // Short: prefer resistance ABOVE price (do not reuse pullback EMA below)
    const aboveOrAt = uniq
      .filter((u) => u.px >= price * 0.999)
      .sort((a, b) => b.pref - a.pref || a.px - b.px);
    const ema = uniq.find((u) => u.name.startsWith('ממוצע מהיר'));
    if (ema && price < ema.px * 0.999) {
      pick = ema;
    } else {
      pick = aboveOrAt[0] || uniq.sort((a, b) => a.distPct - b.distPct)[0];
    }
  }
  if (!pick) return null;

  let status = 'wait';
  let statusHe = 'להמתין למחיר באזור';
  const nearPct = Math.abs(price - pick.px) / Math.abs(pick.px);
  if (side === 'long') {
    if (nearPct <= 0.0006) {
      status = 'now';
      statusHe = 'באזור כניסה עכשיו';
    } else if (price > pick.px) {
      status = 'wait';
      statusHe = 'להמתין לירידה לאזור';
    } else {
      status = 'missed';
      statusHe = 'מתחת לאזור. לבדוק אם נשבר';
    }
  } else if (nearPct <= 0.0006) {
    status = 'now';
    statusHe = 'באזור כניסה עכשיו';
  } else if (price < pick.px) {
    status = 'wait';
    statusHe = 'להמתין לעלייה לאזור';
  } else {
    status = 'missed';
    statusHe = 'מעל האזור. לבדוק אם נשבר';
  }

  return {
    px: pick.px,
    name: pick.name,
    distPct: pick.distPct,
    status,
    statusHe,
  };
}

function nearestBelow(levels, entryPx) {
  const list = (levels || [])
    .map((l) => ({ px: num(l.px), name: l.name || '' }))
    .filter((l) => l.px != null && l.px < entryPx * 0.9995)
    .sort((a, b) => b.px - a.px);
  return list[0] || null;
}

function nearestAbove(levels, entryPx) {
  const list = (levels || [])
    .map((l) => ({ px: num(l.px), name: l.name || '' }))
    .filter((l) => l.px != null && l.px > entryPx * 1.0005)
    .sort((a, b) => a.px - b.px);
  return list[0] || null;
}

function centerLevels(center) {
  if (!center) return [];
  return [
    { px: center.railDn, name: 'פיבוט גדול תחתון · 4H' },
    { px: center.railUp, name: 'פיבוט גדול עליון · 4H' },
    { px: center.pivotSmallDn, name: 'פיבוט קטן תחתון · 4H' },
    { px: center.pivotSmallUp, name: 'פיבוט קטן עליון · 4H' },
    { px: center.pivotLo, name: 'פיבוט נמוך · 4H' },
    { px: center.pivotHi, name: 'פיבוט גבוה · 4H' },
    { px: center.oppPx, name: 'מקור מסע בועה · 4H' },
    { px: center.emaFast, name: 'ממוצע מהיר · 4H' },
    { px: center.emaMid, name: 'ממוצע אמצע · 4H' },
    { px: center.emaSlow, name: 'ממוצע איטי · 4H' },
    { px: center.bubPx, name: `בועה ${center.bub || ''} · 4H` },
  ].filter((l) => l.px != null);
}

function isMajorLevel(name) {
  const n = String(name || '');
  return (
    n.includes('פיבוט גדול') ||
    n.includes('פיבוט גבוה') ||
    n.includes('פיבוט נמוך') ||
    n.includes('מקור מסע') ||
    n.includes('בועה') ||
    n.includes('POC') ||
    n.includes('poc')
  );
}

/**
 * RR / primary target = path end (structural), not the nearest micro level.
 * Nearest levels stay as early exits on the route.
 */
function pickPrimaryTarget(side, entryPx, pool, fallbackPx, fallbackName) {
  const ahead =
    side === 'long'
      ? pool.filter((p) => p.px > entryPx * 1.0005).sort((a, b) => a.px - b.px)
      : pool.filter((p) => p.px < entryPx * 0.9995).sort((a, b) => b.px - a.px);
  if (!ahead.length) {
    return { px: fallbackPx, name: fallbackName, first: null, ahead: [] };
  }
  const majors = ahead.filter((p) => isMajorLevel(p.name));
  const primary = majors.length ? majors[majors.length - 1] : ahead[ahead.length - 1];
  return { px: primary.px, name: primary.name, first: ahead[0], ahead };
}

function attachRiskReward(side, entry, center, path) {
  if (!entry?.px) return entry;
  const entryPx = entry.px;
  const base = centerLevels(center);
  const downs = [...base, ...(path?.down || [])];
  const ups = [...base, ...(path?.up || [])];

  const pool = [];
  for (const l of [...base, ...(path?.up || []), ...(path?.down || [])]) {
    const px = num(l.px);
    if (px == null) continue;
    if (pool.some((p) => Math.abs(p.px - px) / Math.abs(px) < 0.0008)) continue;
    pool.push({ px, name: l.name || l.label || '' });
  }
  pool.sort((a, b) => a.px - b.px);

  let stop;
  if (side === 'long') {
    stop = nearestBelow(downs, entryPx);
    if (!stop) stop = { px: entryPx * 0.985, name: 'סטופ ברירת מחדל 1.5%' };
  } else {
    stop = nearestAbove(ups, entryPx);
    if (!stop) stop = { px: entryPx * 1.015, name: 'סטופ ברירת מחדל 1.5%' };
  }

  const primary = pickPrimaryTarget(
    side,
    entryPx,
    pool,
    side === 'long' ? entryPx * 1.02 : entryPx * 0.98,
    'יעד ברירת מחדל 2%',
  );
  const target = { px: primary.px, name: primary.name };

  const riskPct = absPct(entryPx, stop.px);
  const rewardPct = absPct(entryPx, target.px);
  const rr = riskPct && riskPct > 0 ? rewardPct / riskPct : null;

  // Full route: protect behind entry, then steps toward the far target
  const route = [];
  if (side === 'long') {
    const behind = pool.filter((p) => p.px < entryPx * 0.9995).slice(-3);
    // All steps up to primary target (cap 8)
    const ahead = primary.ahead.filter((p) => p.px <= target.px * 1.0001).slice(0, 8);
    for (let i = 0; i < behind.length; i++) {
      const p = behind[i];
      route.push({
        px: p.px,
        name: p.name,
        role: i === behind.length - 1 ? 'stop' : 'protect',
        roleHe: i === behind.length - 1 ? 'סטופ' : 'הגנה',
      });
    }
    if (stop?.px != null && !route.some((r) => Math.abs(r.px - stop.px) / stop.px < 0.0008)) {
      route.push({ px: stop.px, name: stop.name, role: 'stop', roleHe: 'סטופ' });
      route.sort((a, b) => a.px - b.px);
    }
    route.push({ px: entryPx, name: entry.name, role: 'entry', roleHe: 'כניסה' });
    for (let i = 0; i < ahead.length; i++) {
      const p = ahead[i];
      const isLast = i === ahead.length - 1 || Math.abs(p.px - target.px) / target.px < 0.0008;
      route.push({
        px: p.px,
        name: p.name,
        role: isLast ? 'target' : 'step',
        roleHe: isLast ? 'יעד' : `שלב ${i + 1}`,
      });
    }
    if (target?.px != null && !route.some((r) => Math.abs(r.px - target.px) / target.px < 0.0008)) {
      route.push({ px: target.px, name: target.name, role: 'target', roleHe: 'יעד' });
    }
  } else {
    const behind = pool.filter((p) => p.px > entryPx * 1.0005).slice(0, 3);
    const ahead = primary.ahead.filter((p) => p.px >= target.px * 0.9999).slice(0, 8);
    for (let i = 0; i < behind.length; i++) {
      const p = behind[i];
      route.push({
        px: p.px,
        name: p.name,
        role: i === 0 ? 'stop' : 'protect',
        roleHe: i === 0 ? 'סטופ' : 'הגנה',
      });
    }
    if (stop?.px != null && !route.some((r) => Math.abs(r.px - stop.px) / stop.px < 0.0008)) {
      route.unshift({ px: stop.px, name: stop.name, role: 'stop', roleHe: 'סטופ' });
    }
    route.push({ px: entryPx, name: entry.name, role: 'entry', roleHe: 'כניסה' });
    for (let i = 0; i < ahead.length; i++) {
      const p = ahead[i];
      const isLast = i === ahead.length - 1 || Math.abs(p.px - target.px) / target.px < 0.0008;
      route.push({
        px: p.px,
        name: p.name,
        role: isLast ? 'target' : 'step',
        roleHe: isLast ? 'יעד' : `שלב ${i + 1}`,
      });
    }
    if (target?.px != null && !route.some((r) => Math.abs(r.px - target.px) / target.px < 0.0008)) {
      route.push({ px: target.px, name: target.name, role: 'target', roleHe: 'יעד' });
    }
  }

  // unique route by px keeping roles priority
  const routeUniq = [];
  for (const step of route) {
    const prev = routeUniq[routeUniq.length - 1];
    if (prev && Math.abs(prev.px - step.px) / Math.abs(step.px) < 0.0008) {
      if (step.role === 'entry' || step.role === 'stop' || step.role === 'target') {
        routeUniq[routeUniq.length - 1] = step;
      }
      continue;
    }
    routeUniq.push(step);
  }

  const stopPxFinal = stop?.px ?? null;
  const baseRisk = stopPxFinal != null ? absPct(entryPx, stopPxFinal) : null;
  const routeWithRr = routeUniq.map((step) => {
    if (step.role === 'entry') {
      return {
        ...step,
        riskPct: baseRisk != null ? Math.round(baseRisk * 100) / 100 : null,
        rewardPct: null,
        rr: null,
      };
    }
    if (step.role === 'stop' || step.role === 'protect') {
      const depth = absPct(entryPx, step.px);
      return {
        ...step,
        riskPct: depth != null ? Math.round(depth * 100) / 100 : null,
        rewardPct: null,
        rr: null,
      };
    }
    // step / target ahead
    const reward = absPct(entryPx, step.px);
    const rrStep = baseRisk && baseRisk > 0 && reward != null ? reward / baseRisk : null;
    return {
      ...step,
      riskPct: baseRisk != null ? Math.round(baseRisk * 100) / 100 : null,
      rewardPct: reward != null ? Math.round(reward * 100) / 100 : null,
      rr: rrStep != null ? Math.round(rrStep * 100) / 100 : null,
    };
  });

  return {
    ...entry,
    stopPx: stop.px,
    stopName: stop.name,
    targetPx: target.px,
    targetName: target.name,
    riskPct: riskPct != null ? Math.round(riskPct * 100) / 100 : null,
    rewardPct: rewardPct != null ? Math.round(rewardPct * 100) / 100 : null,
    rr: rr != null ? Math.round(rr * 100) / 100 : null,
    journey: center
      ? {
          bub: center.bub || '-',
          bubHe: center.bubHe || '-',
          fromPx: num(center.oppPx),
          bubPx: num(center.bubPx),
          swingPct: num(center.swingPct),
        }
      : null,
    route: routeWithRr,
  };
}

function fmtPx(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function buildTfStrip(tfs) {
  const out = [];
  for (const name of ['Week', '3D', 'Day', '4H', '2H', '1H', '30m', '15m']) {
    const t = (tfs || []).find((x) => x.tf === name);
    if (!t) continue;
    const tone = layerTone(t);
    const roleHe =
      name === '15m'
        ? 'תזמון מהיר'
        : name === '30m'
          ? 'תזמון'
          : name === '1H' || name === '2H'
            ? 'סטאפ'
            : name === '4H'
              ? 'מרכז'
              : 'הטייה';
    const macdHe = t.macdPhaseHe || macdPhase(t.macd).he;
    out.push({
      tf: name,
      tone,
      roleHe,
      text: `${t.bub || '-'} · ${t.zap || '-'} · ${macdHe}`,
    });
  }
  return out;
}

function buildBrokenAlerts(center, price) {
  const out = [];
  if (!center || price == null) return out;
  if (center.pivotSmallDn != null && price < center.pivotSmallDn * 0.999) {
    out.push({
      id: 'broke_small_dn',
      tone: 'danger',
      title: 'נשבר פיבוט קטן תחתון',
      detail: `מתחת ל־${fmtPx(center.pivotSmallDn)}. לונג חלש`,
      px: center.pivotSmallDn,
    });
  }
  if (center.railDn != null && price < center.railDn * 0.999) {
    out.push({
      id: 'broke_large_dn',
      tone: 'short',
      title: 'נשבר פיבוט גדול תחתון',
      detail: `מתחת ל־${fmtPx(center.railDn)}. שורט מבני`,
      px: center.railDn,
    });
  }
  if (center.pivotSmallUp != null && price > center.pivotSmallUp * 1.001) {
    out.push({
      id: 'broke_small_up',
      tone: 'danger',
      title: 'נשבר פיבוט קטן עליון',
      detail: `מעל ל־${fmtPx(center.pivotSmallUp)}. שורט חלש`,
      px: center.pivotSmallUp,
    });
  }
  if (center.railUp != null && price > center.railUp * 1.001) {
    out.push({
      id: 'broke_large_up',
      tone: 'long',
      title: 'נשבר פיבוט גדול עליון',
      detail: `מעל ל־${fmtPx(center.railUp)}. לונג מבני`,
      px: center.railUp,
    });
  }
  return out;
}

function buildAdvice(center, path, price, tfs) {
  if (!center || price == null) {
    return {
      lean: 'wait',
      leanHe: 'המתן',
      headline: 'אין עדיין מספיק לנתינה',
      longEntry: null,
      shortEntry: null,
      reasons: [],
      conflicts: [],
      scenarios: [],
      tfStrip: [],
    };
  }

  const RR_MIN = 1.0;
  let score = 0;
  const reasons = [];
  const conflicts = [];

  const bubLong = center.bub === 'HL' || center.bub === 'LL';
  const bubShort = center.bub === 'HH' || center.bub === 'LH';

  if (bubLong) {
    score += 1.6;
    reasons.push(`בועת 4 שעות ${center.bubHe}`);
  } else if (bubShort) {
    score -= 1.6;
    reasons.push(`בועת 4 שעות ${center.bubHe}`);
  }

  // Zap = tape / touch color (separate from pink surge)
  if (center.zap === 'GREEN') {
    score += 1.1;
    reasons.push('זאפ ירוק');
  } else if (center.zap === 'RED') {
    score -= 1.1;
    reasons.push('זאפ אדום');
  }

  // Pink = surge runline (GREEN/RED/GRAY) — different layer from zap
  const pink = String(center.pink || '').toUpperCase();
  if (pink === 'GREEN' || pink === 'PINK') {
    score += 0.9;
    reasons.push('ורד ירוק');
  } else if (pink === 'RED') {
    score -= 0.9;
    reasons.push('ורד אדום');
  } else if (pink === 'GRAY' || pink === 'GREY') {
    reasons.push('ורד אפור');
  }

  if (center.channel === 'up') {
    score += 1.2;
    reasons.push('צבע למעלה');
  } else if (center.channel === 'down') {
    score -= 1.2;
    reasons.push('צבע למטה');
  }
  if (center.stack === 'bull') {
    score += 0.8;
    reasons.push('ממוצעים שוריים');
  } else if (center.stack === 'bear') {
    score -= 0.8;
    reasons.push('ממוצעים דוביים');
  }
  if (center.macdAbove) {
    score += 0.5;
    reasons.push('מקאד מעל');
  } else {
    score -= 0.5;
    reasons.push('מקאד מתחת');
  }

  if (center.railDn != null && price < center.railDn * 0.999) {
    score -= 1.5;
    reasons.push('מתחת לפיבוט גדול תחתון');
  }
  if (center.pivotSmallDn != null && price < center.pivotSmallDn * 0.999) {
    score -= 0.8;
    reasons.push('מתחת לפיבוט קטן תחתון');
  }
  if (center.railUp != null && price > center.railUp * 1.001) {
    score += 1.5;
    reasons.push('מעל לפיבוט גדול עליון');
  }
  if (center.pivotSmallUp != null && price > center.pivotSmallUp * 1.001) {
    score += 0.8;
    reasons.push('מעל לפיבוט קטן עליון');
  }

  const h1 = (tfs || []).find((t) => t.tf === '1H');
  if (h1) {
    if (h1.zap === 'GREEN' || h1.bub === 'HL' || h1.bub === 'LL') score += 0.4;
    if (h1.zap === 'RED' || h1.bub === 'HH' || h1.bub === 'LH') score -= 0.4;
  }

  // Turn TFs: net tone only (avoid both long+short reasons)
  function turnNet(t) {
    if (!t) return 0;
    let s = 0;
    if (t.zap === 'GREEN' || t.bub === 'HL' || t.bub === 'LL') s += 1;
    if (t.zap === 'RED' || t.bub === 'HH' || t.bub === 'LH') s -= 1;
    if (t.channel === 'up') s += 0.5;
    if (t.channel === 'down') s -= 0.5;
    return s;
  }
  const m15 = (tfs || []).find((t) => t.tf === '15m');
  const m15Net = turnNet(m15);
  if (m15Net > 0) {
    score += 0.25;
    reasons.push('15 דקות תזמון לונג');
  } else if (m15Net < 0) {
    score -= 0.25;
    reasons.push('15 דקות תזמון שורט');
  }
  const m30 = (tfs || []).find((t) => t.tf === '30m');
  const m30Net = turnNet(m30);
  if (m30Net > 0) score += 0.15;
  else if (m30Net < 0) score -= 0.15;

  // === 4H is boss. Day + 3D are feedback only (3D stronger than Day). ===
  function feedbackTone(t) {
    if (!t) return 0;
    let s = 0;
    if (t.bub === 'HL' || t.bub === 'LL') s += 0.6;
    if (t.bub === 'HH' || t.bub === 'LH') s -= 0.6;
    if (t.zap === 'GREEN') s += 0.5;
    if (t.zap === 'RED') s -= 0.5;
    if (t.channel === 'up') s += 0.3;
    if (t.channel === 'down') s -= 0.3;
    if (t.stack === 'bull') s += 0.25;
    if (t.stack === 'bear') s -= 0.25;
    const phase = t.macdPhase || macdPhase(t.macd).id;
    if (phase === 'open' || phase === 'cross_up') s += 0.7;
    if (phase === 'approaching' && t.macd?.mAbove) s += 0.25;
    if (phase === 'approaching' && t.macd && !t.macd.mAbove) s -= 0.25;
    if (phase === 'closed' || phase === 'cross_dn') s -= 0.55;
    return s;
  }

  const dayTf = (tfs || []).find((t) => t.tf === 'Day');
  const d3Tf = (tfs || []).find((t) => t.tf === '3D');
  const dayTone = feedbackTone(dayTf);
  const d3Tone = feedbackTone(d3Tf);
  // 3D stronger than Day
  const higherFeedback = d3Tone * 1.35 + dayTone * 1.0;

  const dayMacdHe = dayTf?.macdPhaseHe || macdPhase(dayTf?.macd).he;
  const d3MacdHe = d3Tf?.macdPhaseHe || macdPhase(d3Tf?.macd).he;
  const feedbackBits = [];
  if (d3Tf) {
    feedbackBits.push(`3 ימים ${d3MacdHe}${d3Tone >= 0.4 ? ' · תומך' : d3Tone <= -0.4 ? ' · לוחץ' : ''}`);
  }
  if (dayTf) {
    feedbackBits.push(`יום ${dayMacdHe}${dayTone >= 0.4 ? ' · תומך' : dayTone <= -0.4 ? ' · לוחץ' : ''}`);
  }
  const feedbackHe =
    feedbackBits.length > 0
      ? `פידבק רחב: ${feedbackBits.join(' · ')}`
      : 'פידבק רחב: אין יום/3 ימים';

  // 4H wave start = structure bubble at extreme + not dead pink opposite
  let wave = 'none';
  let waveHe = 'אין תחילת גל ברורה ב־4H';
  if (bubLong && pink !== 'RED') {
    wave = 'start_long';
    waveHe = 'תחילת גל לונג ב־4H';
    score += 0.7;
    reasons.push('תחילת גל 4H לונג');
  } else if (bubShort && pink !== 'GREEN' && pink !== 'PINK') {
    wave = 'start_short';
    waveHe = 'תחילת גל שורט ב־4H';
    score -= 0.7;
    reasons.push('תחילת גל 4H שורט');
  } else if (bubLong && pink === 'RED') {
    wave = 'conflict';
    waveHe = 'בועת לונג אבל ורד אדום. לא תחילת גל נקייה';
  } else if (bubShort && (pink === 'GREEN' || pink === 'PINK')) {
    wave = 'conflict';
    waveHe = 'בועת שורט אבל ורד ירוק. לא תחילת גל נקייה';
  }

  if (d3Tf) reasons.push(`3 ימים: ${d3MacdHe}`);
  if (dayTf) reasons.push(`יום: ${dayMacdHe}`);

  const exitLongHe = 'יציאה בהיפוך 4H: בועת HH/LH או זאפ/ורד אדום';
  const exitShortHe = 'יציאה בהיפוך 4H: בועת HL/LL או זאפ/ורד ירוק';
  let holdHe = 'מחפשים תחילת גל ב־4H. מחזיקים עד היפוך 4H';
  let exitHe = 'עדיין אין צד';

  // Layer disagreement (same TF, different meanings)
  if (bubLong && center.zap === 'RED') {
    conflicts.push('בועה שורית מול זאפ אדום');
  }
  if (bubShort && center.zap === 'GREEN') {
    conflicts.push('בועה דובית מול זאפ ירוק');
  }
  if (bubLong && pink === 'RED') {
    conflicts.push('בועה שורית מול ורד אדום');
  }
  if (bubShort && (pink === 'GREEN' || pink === 'PINK')) {
    conflicts.push('בועה דובית מול ורד ירוק');
  }
  if (center.zap === 'RED' && (pink === 'GREEN' || pink === 'PINK')) {
    conflicts.push('זאפ אדום מול ורד ירוק');
  }
  if (center.zap === 'GREEN' && pink === 'RED') {
    conflicts.push('זאפ ירוק מול ורד אדום');
  }
  if (pink === 'GRAY' || pink === 'GREY') {
    conflicts.push('ורד אפור. אין גל דולק עדיין');
  }

  let lean = 'wait';
  let leanHe = 'המתן';
  let headline = 'מחכים לתחילת גל נקייה ב־4H';
  if (score >= 1.2) {
    lean = 'long';
    leanHe = 'לונג';
    headline = 'תחילת גל לונג ב־4H';
    holdHe = 'להיכנס ולהחזיק עד היפוך 4H';
    exitHe = exitLongHe;
  } else if (score <= -1.2) {
    lean = 'short';
    leanHe = 'שורט';
    headline = 'תחילת גל שורט ב־4H';
    holdHe = 'להיכנס ולהחזיק עד היפוך 4H';
    exitHe = exitShortHe;
  }

  // Feedback only: never flips 4H side. Soft note when higher TFs lean against.
  if (lean === 'long' && higherFeedback <= -1.2) {
    reasons.push('פידבק רחב לוחץ נגד. עדיין הצד מ־4H');
    holdHe = 'גל לונג מ־4H. פידבק יום/3 ימים לוחץ. כניסה רק עם אישור 4H נקי';
  } else if (lean === 'short' && higherFeedback >= 1.2) {
    reasons.push('פידבק רחב תומך נגד השורט. עדיין הצד מ־4H');
    holdHe = 'גל שורט מ־4H. פידבק יום/3 ימים תומך למעלה. כניסה רק עם אישור 4H נקי';
  } else if (lean === 'long' && higherFeedback >= 0.8) {
    reasons.push('פידבק רחב תומך בגל לונג');
  } else if (lean === 'short' && higherFeedback <= -0.8) {
    reasons.push('פידבק רחב תומך בגל שורט');
  } else if (lean === 'wait' && wave === 'start_long') {
    headline = 'תחילת גל לונג ב־4H. מחכים לניקיון שכבות';
    holdHe = 'לא נכנסים לפני ניקיון 4H. מחזיקים עד היפוך 4H אחרי כניסה';
    exitHe = exitLongHe;
  } else if (lean === 'wait' && wave === 'start_short') {
    headline = 'תחילת גל שורט ב־4H. מחכים לניקיון שכבות';
    holdHe = 'לא נכנסים לפני ניקיון 4H. מחזיקים עד היפוך 4H אחרי כניסה';
    exitHe = exitShortHe;
  }

  // RSI additive: 30–70 mid · >70 turbo up · <30 turbo down (does not flip hunt alone)
  const centerRsiZone = rsiZone(center?.rsi);
  if (centerRsiZone === 'turbo_up') {
    reasons.push('RSI 4H טורבו עלייה');
  } else if (centerRsiZone === 'turbo_dn') {
    reasons.push('RSI 4H טורבו ירידה');
  } else if (centerRsiZone === 'mid' && center?.rsi != null) {
    reasons.push('RSI 4H אמצע 30–70');
  }

  const pivot4 = center?.pivotStack || buildPivotStack(center, price);
  if (pivot4?.id === 'stretch_up') {
    reasons.push('4H מתיחה למעלה מול פיווט');
  } else if (pivot4?.id === 'stretch_dn') {
    reasons.push('4H מתיחה למטה מול פיווט');
  } else if (pivot4?.id === 'approach_resist') {
    reasons.push('4H מתקרב להתנגדות');
  } else if (pivot4?.id === 'approach_support') {
    reasons.push('4H מתקרב לתמיכה');
  }

  // EMA pullback timing on 4H only
  if (lean === 'wait' && score > 0 && center.emaFast != null && price > center.emaFast * 1.0004) {
    headline = `בינתיים להמתין לממוצע מהיר 4H ב־${fmtPx(center.emaFast)}`;
  } else if (lean === 'wait' && score < 0 && center.emaFast != null && price < center.emaFast * 0.9996) {
    headline = `בינתיים להמתין לממוצע מהיר 4H ב־${fmtPx(center.emaFast)}`;
  } else if (lean === 'long' && center.emaFast != null && price > center.emaFast * 1.002) {
    lean = 'wait';
    leanHe = 'המתן';
    headline = `תחילת גל לונג רק ליד ממוצע מהיר 4H ב־${fmtPx(center.emaFast)}. לא לרדוף`;
  } else if (lean === 'short' && center.emaFast != null && price < center.emaFast * 0.998) {
    lean = 'wait';
    leanHe = 'המתן';
    headline = `תחילת גל שורט רק ליד ממוצע מהיר 4H ב־${fmtPx(center.emaFast)}. לא לרדוף`;
  }

  // Pink gray: wave not lit yet
  if ((pink === 'GRAY' || pink === 'GREY') && (lean === 'long' || lean === 'short')) {
    lean = 'wait';
    leanHe = 'המתן';
    headline = 'ורד אפור. מחכים להדלקת גל ב־4H';
  } else if (conflicts.length >= 2 && (lean === 'long' || lean === 'short') && wave === 'conflict') {
    lean = 'wait';
    leanHe = 'המתן';
    headline = `סתירת שכבות ב־4H: ${conflicts[0]}`;
  }

  let longEntry = attachRiskReward(
    'long',
    pickEntry('long', center, path?.down, price),
    center,
    path,
  );
  let shortEntry = attachRiskReward(
    'short',
    pickEntry('short', center, path?.up, price),
    center,
    path,
  );

  function applyRrGate(entry, sideHe) {
    if (!entry?.px) return entry;
    const rr = entry.rr;
    if (rr == null) {
      return {
        ...entry,
        executable: false,
        blockHe: `${sideHe} בלי יחס ברור. פסול`,
      };
    }
    if (rr < RR_MIN) {
      return {
        ...entry,
        executable: false,
        blockHe: `${sideHe} פסול. יחס 1 ל-${rr.toFixed(2)} מתחת ל־1`,
      };
    }
    return {
      ...entry,
      executable: true,
      blockHe: null,
    };
  }

  longEntry = applyRrGate(longEntry, 'לונג');
  shortEntry = applyRrGate(shortEntry, 'שורט');

  const longOk = longEntry?.executable === true;
  const shortOk = shortEntry?.executable === true;

  // RR veto / invert handling
  if (lean === 'long' && longEntry && !longOk) {
    lean = 'wait';
    leanHe = 'המתן';
    headline = shortOk
      ? `לונג פסול ביחס ${longEntry.rr}. שורט עם יחס ${shortEntry.rr} אבל הכיוון לא שורט`
      : longEntry.blockHe;
  } else if (lean === 'short' && shortEntry && !shortOk) {
    lean = 'wait';
    leanHe = 'המתן';
    headline = longOk
      ? `שורט פסול ביחס ${shortEntry.rr}. לונג עם יחס ${longEntry.rr} אבל הכיוון לא לונג`
      : shortEntry.blockHe;
  } else if (lean === 'wait') {
    const bits = [];
    if (longEntry && !longOk && longEntry.blockHe) bits.push(longEntry.blockHe);
    if (shortEntry && !shortOk && shortEntry.blockHe) bits.push(shortEntry.blockHe);
    if (bits.length) {
      headline = `${headline} · ${bits.join(' · ')}`;
    }
  }

  const scenarios = buildBrokenAlerts(center, price);
  const tfStrip = buildTfStrip(tfs);

  // Hunt / future sim only when that side has valid R:R.
  // Wave start without valid R:R = wait, no simulation path.
  let hunt = 'none';
  let huntHe = 'אין יעד מומלץ עדיין';
  if (wave === 'start_long' && longOk) {
    hunt = 'long';
    huntHe = 'יעד מומלץ מ־4H: מסלול לונג';
  } else if (wave === 'start_short' && shortOk) {
    hunt = 'short';
    huntHe = 'יעד מומלץ מ־4H: מסלול שורט';
  } else if (lean === 'long' && longOk) {
    hunt = 'long';
    huntHe = 'יעד מומלץ מ־4H: מסלול לונג';
  } else if (lean === 'short' && shortOk) {
    hunt = 'short';
    huntHe = 'יעד מומלץ מ־4H: מסלול שורט';
  } else if (longOk && !shortOk) {
    hunt = 'long';
    huntHe = 'יעד מומלץ מ־4H: לונג עם יחס תקין';
  } else if (shortOk && !longOk) {
    hunt = 'short';
    huntHe = 'יעד מומלץ מ־4H: שורט עם יחס תקין';
  } else if (wave === 'start_long' && longEntry && !longOk) {
    huntHe = longEntry.blockHe || 'לונג פסול ביחס. אין סימולציה';
  } else if (wave === 'start_short' && shortEntry && !shortOk) {
    huntHe = shortEntry.blockHe || 'שורט פסול ביחס. אין סימולציה';
  }

  const huntEntry =
    hunt === 'long' && longOk ? longEntry : hunt === 'short' && shortOk ? shortEntry : null;
  const targetPath = buildTargetPathChart(price, hunt, huntEntry);

  const tfStates = [];
  for (const name of ['Week', '3D', 'Day', '4H', '2H', '1H', '30m', '15m']) {
    const t = (tfs || []).find((x) => x.tf === name) || (name === '4H' ? center : null);
    if (!t) continue;
    const side = layerTone(t);
    const zone = t.rsiZone || rsiZone(t.rsi);
    const pivotStack = t.pivotStack || buildPivotStack(t, price);
    tfStates.push({
      tf: name,
      side,
      sideHe: layerSideHe(side),
      bub: t.bub || '-',
      zap: t.zap || '-',
      channel: t.channel || '-',
      pink: t.pink || '-',
      stack: t.stack || '-',
      macdPhaseHe: t.macdPhaseHe || macdPhase(t.macd).he,
      rsi: t.rsi ?? null,
      rsiZone: zone,
      rsiZoneHe: t.rsiZoneHe || rsiZoneHe(zone),
      pivotStack,
      pivotStackHe: pivotStack?.he || null,
      pivotSummaryHe: pivotStack?.summaryHe || null,
    });
  }

  return {
    lean,
    leanHe,
    score: Math.round(score * 10) / 10,
    headline,
    longEntry,
    shortEntry,
    reasons: reasons.slice(0, 8),
    conflicts: conflicts.slice(0, 4),
    scenarios,
    tfStrip,
    tfStates,
    hunt,
    huntHe,
    targetPath,
    wave: {
      id: wave,
      he: waveHe,
      holdHe,
      exitHe,
      feedbackHe,
      biasZoneHe: feedbackHe,
      dayBias: Math.round(dayTone * 10) / 10,
      d3Bias: Math.round(d3Tone * 10) / 10,
      higherBias: Math.round(higherFeedback * 10) / 10,
      atTop: false,
      atBottom: false,
      dayMacdHe,
      d3MacdHe,
    },
  };
}

/** Compress entry route into up/down steps toward recommended target. */
function buildTargetPathChart(price, hunt, entry) {
  if (!entry?.px || (hunt !== 'long' && hunt !== 'short')) return null;
  if (entry.executable === false) return null;
  const route = entry.route || [];
  const steps = [];
  if (price != null) {
    steps.push({
      kind: 'now',
      kindHe: 'עכשיו',
      px: price,
      name: 'מחיר',
      dir: null,
    });
  }
  for (const step of route) {
    if (!step?.px) continue;
    if (step.role === 'protect') continue;
    let dir = null;
    if (step.role === 'entry') dir = hunt === 'long' ? (price > step.px ? 'down' : 'up') : price < step.px ? 'up' : 'down';
    else if (step.role === 'stop') dir = hunt === 'long' ? 'down' : 'up';
    else if (step.role === 'step' || step.role === 'target') dir = hunt === 'long' ? 'up' : 'down';
    steps.push({
      kind: step.role,
      kindHe: step.roleHe || step.role,
      px: step.px,
      name: String(step.name || '').replace(' · 4H', ''),
      dir,
      dirHe: dir === 'up' ? 'עלייה' : dir === 'down' ? 'ירידה' : null,
      riskPct: step.riskPct ?? null,
      rewardPct: step.rewardPct ?? null,
      rr: step.rr ?? null,
    });
  }
  // order for display: high to low like ladder
  const sorted = [...steps].sort((a, b) => b.px - a.px);
  return {
    hunt,
    huntHe: hunt === 'long' ? 'מסלול לונג ליעד' : 'מסלול שורט ליעד',
    entryPx: entry.px,
    entryName: entry.name,
    stopPx: entry.stopPx,
    targetPx: entry.targetPx,
    rr: entry.rr,
    executable: entry.executable !== false,
    blockHe: entry.blockHe || null,
    steps: sorted,
  };
}

/**
 * @param {object|null} latest raw webhook
 * @param {object|null} story enrich pack
 * @param {object|null} forecast dual-path pack
 * @param {object[]} [recentEvents] newest-first history from store (additive)
 */
function buildScene(latest, story, forecast, recentEvents = []) {
  if (!latest || typeof latest !== 'object') {
    return { ok: false, schema: 'scene_v1', reason: 'no_latest' };
  }

  const price = num(latest.price) ?? num(story?.price);
  const rows = story?.tfs || [];
  const rawRows = latest.tfs || [];
  const h4 = findTf(rows, '4H');
  const h4Raw = findTf(rawRows, '4H');
  const fc4 = (forecast?.tfs || []).find((t) => t.tf === '4H') || null;
  const center = attachPivotStack(attachRsiZone(slimTf(h4, fc4, h4Raw)), price);

  const tfs = TF_ORDER.map((name) => {
    const row = findTf(rows, name);
    const raw = findTf(rawRows, name);
    const card = (forecast?.tfs || []).find((t) => t.tf === name) || null;
    return attachPivotStack(attachRsiZone(slimTf(row, card, raw)), price);
  }).filter(Boolean);

  const { up, down, chart: leanChart } = buildScenePath(center, tfs, price);
  const advice = buildAdvice(center, { up, down }, price, tfs);
  const chart = buildChartFromRoutes(price, advice.longEntry, advice.shortEntry) || leanChart;

  // Additive layer: parent-relative roles + short history (does not change lean/hunt/RR)
  const tfRelations = buildTfRelations(tfs, recentEvents);
  const byTf = Object.fromEntries((tfRelations.rows || []).map((r) => [r.tf, r]));
  if (Array.isArray(advice.tfStates)) {
    advice.tfStates = advice.tfStates.map((s) => {
      const r = byTf[s.tf];
      if (!r) return s;
      return {
        ...s,
        parentTf: r.parentTf,
        parentSide: r.parentSide,
        flow: r.flow,
        role: r.role,
        roleHe: r.roleHe,
        historyHe: r.historyHe,
      };
    });
  }

  const chartBub = latest.chart?.bubble || null;
  const trigger = {
    pulseTf: latest.chartTf || '1',
    bub: chartBub,
    bubHe: bubHe(chartBub),
    why: String(latest.trigger || ''),
  };

  const lines = [advice.headline];
  if (advice.longEntry) {
    lines.push(
      `כניסת לונג: ${advice.longEntry.px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${advice.longEntry.name} · ${advice.longEntry.statusHe}`,
    );
  }
  if (advice.shortEntry) {
    lines.push(
      `כניסת שורט: ${advice.shortEntry.px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${advice.shortEntry.name} · ${advice.shortEntry.statusHe}`,
    );
  }
  if (trigger.bub) {
    lines.push(`עודכן מפעימת דקה ${trigger.bub}`);
  }
  const pullbacks = (tfRelations.rows || []).filter((r) => r.role === 'pullback' || r.role === 'bounce');
  for (const r of pullbacks.slice(0, 3)) {
    lines.push(`${r.tf}: ${r.roleHe}${r.historyHe ? ` · ${r.historyHe}` : ''}`);
  }

  return {
    ok: true,
    schema: 'scene_v1',
    asOf: latest.receivedAt || story?.asOf || null,
    symbol: latest.symbol || story?.symbol || null,
    price,
    trigger,
    advice,
    center,
    path: { up, down },
    chart,
    tfs,
    tfRelations,
    lines,
  };
}

module.exports = { buildScene, TF_ORDER };
