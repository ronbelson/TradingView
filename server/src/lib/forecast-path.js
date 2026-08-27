/**
 * Dual-path forecast (logic-only).
 * Always builds BOTH up and down ladders from all available facts.
 * Bias is a hint from 4H + Day + 3D + Week — never hides a side.
 *
 * Spec: .tmp/btc-indicators/09-forecast-dual-path-plan.md
 */

const PATH_TFS = ['30m', '1H', '2H', '3H', '4H', 'Day', '3D', 'Week'];
const HELPER_TFS = ['30m', '1H', '2H', '3H'];
const HIGHER_TFS = ['Day', '3D', 'Week'];
const NEAR_PCT = 8; // near ladder
const FAR_PCT = 25; // landmarks still useful

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function absPct(from, to) {
  if (from == null || to == null || from === 0) return null;
  return (Math.abs(to - from) / Math.abs(from)) * 100;
}

function bubHe(b) {
  if (b === 'HH') return 'שיא חדש למעלה';
  if (b === 'LH') return 'שיא נמוך יותר';
  if (b === 'HL') return 'תחתית גבוהה יותר';
  if (b === 'LL') return 'תחתית חדשה למטה';
  return b || '-';
}

function zapHe(z) {
  if (z === 'GREEN') return 'ירוק';
  if (z === 'RED') return 'אדום דובי';
  if (z === 'PURPLE') return 'סגול מתוח';
  if (z === 'GRAY') return 'אפור מתוח';
  return z || '-';
}

function chHe(c) {
  if (c === 'up') return 'למעלה';
  if (c === 'down') return 'למטה';
  return 'אמצע';
}

function maHe(id) {
  if (id === 'fast') return 'ממוצע מהיר';
  if (id === 'mid') return 'ממוצע אמצע';
  if (id === 'slow') return 'ממוצע איטי';
  if (id === 'extra') return 'ממוצע נוסף';
  return id || 'ממוצע';
}

function findTf(rows, name) {
  return (rows || []).find((t) => t.tf === name) || null;
}

function macdBias(macd) {
  if (!macd) return 0;
  let s = 0;
  if (macd.mAbove) s += 1;
  else s -= 1;
  if (macd.hRise) s += 0.6;
  if (macd.hFall) s -= 0.6;
  if (macd.xUp) s += 1.3;
  if (macd.xDn) s -= 1.3;
  if (macd.bothLo) s -= 0.35;
  if (macd.bothHi) s += 0.35;
  return s;
}

function paintBias(tf) {
  if (!tf) return 0;
  let s = 0;
  if (tf.zap === 'GREEN') s += 1.2;
  if (tf.zap === 'RED') s -= 1.2;
  if (tf.zap === 'PURPLE') s -= 0.35;
  if (tf.zap === 'GRAY') s += 0.35;
  if (tf.pink === 'GREEN') s += 0.7;
  if (tf.pink === 'RED') s -= 0.7;
  if (tf.channel === 'up') s += 1.4;
  if (tf.channel === 'down') s -= 1.4;
  return s;
}

function macdHe(macd) {
  if (!macd) return 'מקאד חסר';
  const parts = [];
  parts.push(macd.mAbove ? 'מעל האות' : 'מתחת לאות');
  if (macd.bothLo) parts.push('שניהם מתחת לאפס');
  if (macd.bothHi) parts.push('שניהם מעל אפס');
  if (macd.hRise) parts.push('היסטוגרמה עולה');
  if (macd.hFall) parts.push('היסטוגרמה יורדת');
  if (macd.xUp) parts.push('חיתוך מעלה');
  if (macd.xDn) parts.push('חיתוך מטה');
  return parts.join(' · ');
}

function pushNode(list, px, price, meta) {
  const p = num(px);
  const c = num(price);
  if (p == null || c == null) return;
  if (Math.abs(p - c) / Math.abs(c) < 0.00005) return;
  const distPct = absPct(c, p);
  if (distPct == null || distPct > FAR_PCT) return;
  list.push({
    px: p,
    distPct,
    side: p > c ? 'up' : 'down',
    band: distPct <= NEAR_PCT ? 'near' : 'far',
    ...meta,
  });
}

/**
 * Collect every magnet / rail / gap / anchor from one enriched TF.
 */
function collectFromTf(tf, price) {
  if (!tf) return [];
  const name = tf.tf;
  const list = [];
  const hiAim = tf.rail?.hiAim || null;
  const loAim = tf.rail?.loAim || null;

  const mas = [
    ...(tf.targetsAbove || []),
    ...(tf.targetsBelow || []),
  ];
  // de-dupe by id from both lists + magnets
  const seenMa = new Set();
  for (const m of [...mas, tf.magnetAbove, tf.magnetBelow].filter(Boolean)) {
    if (!m?.id || seenMa.has(m.id)) continue;
    seenMa.add(m.id);
    pushNode(list, m.px, price, {
      tf: name,
      kind: 'ema',
      weight: name === '4H' || name === 'Day' ? 1.3 : 1,
      label: `${maHe(m.id)} · ${name}`,
      exact: true,
    });
  }

  // Small pivot intersection (short corridor)
  pushNode(list, tf.rail?.small?.up, price, {
    tf: name,
    kind: 'pivot_small',
    weight: 1.6,
    label: `פיבוט קטן עליון · ${name}`,
  });
  pushNode(list, tf.rail?.small?.dn, price, {
    tf: name,
    kind: 'pivot_small',
    weight: 1.6,
    label: `פיבוט קטן תחתון · ${name}`,
  });

  // Large pivot intersection rails
  const largeUpLabel =
    hiAim === 'down'
      ? `קו אדום דובי · פיבוט גדול · ${name}`
      : `פיבוט גדול עליון · ${name}`;
  const largeDnLabel =
    loAim === 'up'
      ? `קו ירוק שורי · פיבוט גדול · ${name}`
      : `פיבוט גדול תחתון · ${name}`;

  pushNode(list, tf.rail?.up, price, {
    tf: name,
    kind: hiAim === 'down' ? 'bear_line' : 'pivot_large',
    weight: hiAim === 'down' ? 2.8 : 2.3,
    label: largeUpLabel,
    hiAim,
  });
  pushNode(list, tf.rail?.dn, price, {
    tf: name,
    kind: loAim === 'up' ? 'bull_line' : 'pivot_large',
    weight: loAim === 'up' ? 2.8 : 2.3,
    label: largeDnLabel,
    loAim,
  });

  // Anchors (last confirmed swings)
  pushNode(list, tf.rail?.anchors?.ph, price, {
    tf: name,
    kind: 'anchor_hi',
    weight: 2.1,
    label: `עוגן שיא · ${name}`,
  });
  pushNode(list, tf.rail?.anchors?.pl, price, {
    tf: name,
    kind: 'anchor_lo',
    weight: 2.1,
    label: `עוגן תחתית · ${name}`,
  });

  // Volume / FVG corridors
  const gaLo = num(tf.gapAbove?.lo);
  const gaHi = num(tf.gapAbove?.hi);
  const gbLo = num(tf.gapBelow?.lo);
  const gbHi = num(tf.gapBelow?.hi);
  if (gaLo != null || gaHi != null) {
    const mid =
      gaLo != null && gaHi != null ? (gaLo + gaHi) / 2 : gaLo ?? gaHi;
    pushNode(list, mid, price, {
      tf: name,
      kind: 'vol_gap',
      weight: 1.9,
      label: `פער נרות מעל · ${name}`,
      gap: { lo: gaLo, hi: gaHi },
    });
  }
  if (gbLo != null || gbHi != null) {
    const mid =
      gbLo != null && gbHi != null ? (gbLo + gbHi) / 2 : gbLo ?? gbHi;
    pushNode(list, mid, price, {
      tf: name,
      kind: 'vol_gap',
      weight: 1.9,
      label: `פער נרות מתחת · ${name}`,
      gap: { lo: gbLo, hi: gbHi },
    });
  }

  // Volume-profile zero zones + POC
  const zvALo = num(tf.zvAbove?.lo);
  const zvAHi = num(tf.zvAbove?.hi);
  const zvBLo = num(tf.zvBelow?.lo);
  const zvBHi = num(tf.zvBelow?.hi);
  if (zvALo != null || zvAHi != null) {
    const mid =
      zvALo != null && zvAHi != null ? (zvALo + zvAHi) / 2 : zvALo ?? zvAHi;
    pushNode(list, mid, price, {
      tf: name,
      kind: 'vol_line',
      weight: 2.4,
      label: `קו נפח אפס מעל · ${name}`,
      gap: { lo: zvALo, hi: zvAHi },
    });
  }
  if (zvBLo != null || zvBHi != null) {
    const mid =
      zvBLo != null && zvBHi != null ? (zvBLo + zvBHi) / 2 : zvBLo ?? zvBHi;
    pushNode(list, mid, price, {
      tf: name,
      kind: 'vol_line',
      weight: 2.4,
      label: `קו נפח אפס מתחת · ${name}`,
      gap: { lo: zvBLo, hi: zvBHi },
    });
  }
  pushNode(list, tf.poc, price, {
    tf: name,
    kind: 'poc',
    weight: 2.0,
    label: `נקודת נפח מרבית · ${name}`,
  });

  // Bubble journey points
  pushNode(list, tf.bubPx, price, {
    tf: name,
    kind: 'bubble',
    weight: 1.2,
    label: `בועה ${tf.bub || ''} · ${name}`.trim(),
  });
  pushNode(list, tf.oppPx, price, {
    tf: name,
    kind: 'bubble_opp',
    weight: 1.7,
    label: `מקור ירידה או עלייה · ${name}`,
  });
  pushNode(list, tf.lastHiPx, price, {
    tf: name,
    kind: 'last_hi',
    weight: 1.5,
    label: `שיא בועה קודם · ${name}`,
  });
  pushNode(list, tf.lastLoPx, price, {
    tf: name,
    kind: 'last_lo',
    weight: 1.5,
    label: `תחתית בועה קודמת · ${name}`,
  });

  return list;
}

function dedupeSide(nodes, side, limitNear = 10, limitFar = 4) {
  const filtered = nodes
    .filter((n) => n.side === side && n.distPct != null)
    .sort((a, b) => a.distPct - b.distPct);

  const out = [];
  const seen = new Set();
  let nearCount = 0;
  let farCount = 0;

  for (const n of filtered) {
    // Round to ~$20 buckets — keep strongest label per bucket
    const bucket = Math.round(n.px / 20);
    const key = `${bucket}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (n.band === 'near') {
      if (nearCount >= limitNear) continue;
      nearCount += 1;
    } else {
      if (farCount >= limitFar) continue;
      farCount += 1;
    }
    out.push({ ...n, order: out.length + 1 });
  }
  return out;
}

function scoreDifficulty(step, ctx) {
  let hard = step.weight || 1;
  if (step.kind === 'bear_line' || step.kind === 'bull_line') hard += 0.8;
  if (step.kind === 'pivot_large' || step.kind === 'anchor_hi' || step.kind === 'anchor_lo') {
    hard += 0.5;
  }
  if (step.kind === 'vol_gap' || step.kind === 'vol_line') hard += 0.45;
  if (step.kind === 'poc') hard += 0.4;
  if (step.kind === 'bubble_opp') hard += 0.3;
  if (HIGHER_TFS.includes(step.tf)) hard += 0.7;
  if (step.distPct != null && step.distPct < 0.25) hard += 0.45;
  if (step.side === 'up' && ctx.macd4 > 0.8) hard -= 0.25;
  if (step.side === 'down' && ctx.macd4 < -0.8) hard -= 0.25;
  if (step.side === 'up' && ctx.paint4 < -0.8) hard += 0.35;
  if (step.side === 'down' && ctx.paint4 > 0.8) hard += 0.35;
  const difficulty = hard >= 3.4 ? 'קשה' : hard >= 2.3 ? 'בינוני' : 'קל';
  return { hard: Math.round(hard * 10) / 10, difficulty };
}

function tfCard(tf, price) {
  if (!tf) return null;
  const nodes = collectFromTf(tf, price);
  const up = nodes.filter((n) => n.side === 'up').sort((a, b) => a.distPct - b.distPct)[0] || null;
  const down =
    nodes.filter((n) => n.side === 'down').sort((a, b) => a.distPct - b.distPct)[0] || null;
  return {
    tf: tf.tf,
    bub: tf.bub || '-',
    bubHe: bubHe(tf.bub),
    bubPx: tf.bubPx ?? null,
    oppPx: tf.oppPx ?? null,
    swingPct: tf.swingPct ?? null,
    bubAgeBars: tf.bubAgeBars ?? null,
    lastHiPx: tf.lastHiPx ?? null,
    lastLoPx: tf.lastLoPx ?? null,
    zap: tf.zap || null,
    pink: tf.pink || null,
    channel: tf.channel || null,
    channelHe: chHe(tf.channel),
    volRatio: tf.volRatio ?? null,
    deltaPct: tf.deltaPct ?? null,
    poc: tf.poc ?? null,
    zvAbove: tf.zvAbove || null,
    zvBelow: tf.zvBelow || null,
    touchUp: tf.touchUp ?? null,
    touchDn: tf.touchDn ?? null,
    rsi: num(tf.r14),
    macd: tf.macd || null,
    macdHe: macdHe(tf.macd),
    macdScore: Math.round(macdBias(tf.macd) * 10) / 10,
    paintScore: Math.round(paintBias(tf) * 10) / 10,
    stk: tf.stk || null,
    hiAim: tf.rail?.hiAim || null,
    loAim: tf.rail?.loAim || null,
    nearestUp: up,
    nearestDown: down,
  };
}

function buildBias(h4, day, d3, week) {
  let score = 0;
  const notes = [];

  const bub = h4?.bub || '-';
  if (bub === 'LL' || bub === 'HL') {
    score -= 0.8;
    notes.push(`מבנה 4 שעות ${bubHe(bub)} נוטה לבדוק למטה`);
  } else if (bub === 'HH' || bub === 'LH') {
    score += 0.8;
    notes.push(`מבנה 4 שעות ${bubHe(bub)} נוטה לבדוק למעלה`);
  }

  if (h4?.oppPx != null && h4?.bubPx != null) {
    const from = Number(h4.oppPx).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const to = Number(h4.bubPx).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const sp = h4.swingPct != null ? ` · ${Number(h4.swingPct).toFixed(1)}%` : '';
    const age = h4.bubAgeBars != null ? ` · ${Math.round(h4.bubAgeBars)} נרות` : '';
    notes.push(`סיפור בועה 4 שעות: מ${from} אל ${to}${sp}${age}`);
  }
  if (h4?.touchDn != null) {
    notes.push(`נגיעות בקו תחתון גדול ב4 שעות: ${Math.round(h4.touchDn)}`);
  }
  if (h4?.touchUp != null) {
    notes.push(`נגיעות בקו עליון גדול ב4 שעות: ${Math.round(h4.touchUp)}`);
  }
  if (h4?.poc != null) {
    notes.push(`נקודת נפח מרבית ב4 שעות: ${Number(h4.poc).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  }
  if (h4?.zvBelow) {
    notes.push('יש קו נפח אפס מתחת ב4 שעות');
  }
  if (h4?.zvAbove) {
    notes.push('יש קו נפח אפס מעל ב4 שעות');
  }

  const p4 = paintBias(h4);
  score += p4 * 0.55;
  if (h4?.channel) notes.push(`צבע 4 שעות: ${chHe(h4.channel)}`);
  if (h4?.zap) notes.push(`זאפ 4 שעות: ${zapHe(h4.zap)}`);

  const m4 = macdBias(h4?.macd);
  score += m4 * 0.5;
  notes.push(`מקאד 4 שעות: ${macdHe(h4?.macd)}`);

  const rsi = num(h4?.r14);
  if (rsi != null) {
    notes.push(`מדד כוח יחסי 4 שעות: ${rsi.toFixed(1)}`);
    if (rsi >= 65) score -= 0.35;
    if (rsi <= 35) score += 0.35;
  }

  if (day) {
    score += macdBias(day.macd) * 0.45 + paintBias(day) * 0.35;
    notes.push(`יום: בועה ${bubHe(day.bub)} · מקאד ${macdHe(day.macd)} · צבע ${chHe(day.channel)}`);
  }
  if (d3) {
    score += macdBias(d3.macd) * 0.55 + paintBias(d3) * 0.4;
    notes.push(`3 ימים: בועה ${bubHe(d3.bub)} · מקאד ${macdHe(d3.macd)} · צבע ${chHe(d3.channel)}`);
  }
  if (week) {
    score += macdBias(week.macd) * 0.35 + paintBias(week) * 0.25;
    notes.push(`שבוע: בועה ${bubHe(week.bub)} · מקאד ${macdHe(week.macd)} · צבע ${chHe(week.channel)}`);
  }

  let lean = 'אמצע';
  if (score >= 1.1) lean = 'למעלה';
  else if (score <= -1.1) lean = 'למטה';

  return {
    score: Math.round(score * 10) / 10,
    lean,
    notes,
  };
}

/**
 * @param {object} story
 * @param {object} [snapshot]
 */
function buildForecastPath(story, snapshot) {
  const rows = story?.focus || [];
  const h4 = findTf(rows, '4H');
  const day = findTf(rows, 'Day');
  const d3 = findTf(rows, '3D');
  const week = findTf(rows, 'Week');
  const price = num(snapshot?.price ?? story?.price ?? h4?.c);

  if (!h4 || price == null) {
    return { ok: false, reason: 'need_4h' };
  }

  const raw = [];
  for (const name of PATH_TFS) {
    raw.push(...collectFromTf(findTf(rows, name), price));
  }

  const ctx = {
    macd4: macdBias(h4.macd),
    paint4: paintBias(h4),
  };

  const upRaw = dedupeSide(raw, 'up', 10, 4);
  const downRaw = dedupeSide(raw, 'down', 10, 4);

  const up = upRaw.map((s) => ({ ...s, ...scoreDifficulty(s, ctx) }));
  const down = downRaw.map((s) => ({ ...s, ...scoreDifficulty(s, ctx) }));

  const bias = buildBias(h4, day, d3, week);

  const tfs = PATH_TFS.map((n) => tfCard(findTf(rows, n), price)).filter(Boolean);

  const helpers = HELPER_TFS.map((n) => {
    const card = tfs.find((t) => t.tf === n);
    if (!card) return null;
    return {
      tf: n,
      bub: card.bub,
      channel: card.channel,
      zap: card.zap,
      macdHe: card.macdHe,
      surrenderUp: card.nearestUp,
      surrenderDown: card.nearestDown,
    };
  }).filter(Boolean);

  const higher = HIGHER_TFS.map((n) => tfs.find((t) => t.tf === n)).filter(Boolean);

  // Dual chart: left = down path (reversed farthest→nearest then now then up)
  const downChart = [...down].slice(0, 6).reverse().map((s, i) => ({
    x: i,
    px: s.px,
    label: s.label,
    tf: s.tf,
    kind: s.kind,
    difficulty: s.difficulty,
    side: 'down',
  }));
  const upChart = up.slice(0, 6).map((s, i) => ({
    x: downChart.length + 1 + i,
    px: s.px,
    label: s.label,
    tf: s.tf,
    kind: s.kind,
    difficulty: s.difficulty,
    side: 'up',
  }));
  const chart = [
    ...downChart,
    {
      x: downChart.length,
      px: price,
      label: 'עכשיו',
      tf: 'now',
      kind: 'now',
      side: 'now',
    },
    ...upChart,
  ];

  const volReady = Boolean(h4.zap || h4.channel || h4.volRatio != null);

  const lines = [
    `שתי דרכים פתוחות מהמחיר ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    `נטייה רכה: ${bias.lean} · ציון ${bias.score}`,
    up[0]
      ? `למעלה ראשון: ${up[0].px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${up[0].label} · ${up[0].difficulty}`
      : 'למעלה: אין מחסום קרוב',
    up[1]
      ? `למעלה אחרי פריצה: ${up[1].px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${up[1].label}`
      : 'למעלה אחרי פריצה: פתוח יחסית',
    down[0]
      ? `למטה ראשון: ${down[0].px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${down[0].label} · ${down[0].difficulty}`
      : 'למטה: אין מחסום קרוב',
    down[1]
      ? `למטה אחרי פריצה: ${down[1].px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${down[1].label}`
      : 'למטה אחרי פריצה: פתוח יחסית',
    ...bias.notes.slice(0, 8),
  ];

  // Keep legacy single-direction fields for older UI bits
  const dir = bias.lean === 'למעלה' ? 'up' : bias.lean === 'למטה' ? 'down' : 'flat';

  return {
    ok: true,
    schema: 'forecast_path_v2',
    centerTf: '4H',
    price,
    bub: h4.bub || '-',
    bubHe: bubHe(h4.bub),
    bubPx: h4.bubPx ?? null,
    direction: dir,
    directionHe: bias.lean,
    bias,
    score: bias.score,
    confidence: Math.max(
      0.2,
      Math.min(0.9, 0.35 + Math.min(0.4, Math.abs(bias.score) / 5) + (volReady ? 0.15 : 0)),
    ),
    paint: {
      zap: h4.zap || null,
      pink: h4.pink || null,
      channel: h4.channel || null,
      volRatio: h4.volRatio ?? null,
    },
    macd: h4.macd || null,
    rsi: num(h4.r14),
    up,
    down,
    steps: dir === 'up' ? up : down,
    next: (dir === 'up' ? up[0] : down[0]) || null,
    afterBreak: (dir === 'up' ? up[1] : down[1]) || null,
    nearestUp: up[0] || null,
    nearestDown: down[0] || null,
    chart,
    tfs,
    helpers,
    higher,
    volumeGapsReady: volReady,
    lines,
  };
}

module.exports = { buildForecastPath };
