/**
 * Enrich facts_v2 into a full "story pack" for Claude.
 * Computes magnets / rail gaps / cross-TF links from numbers already in webhook.
 * Optional facts_v3 fields (bubPx, pivot anchors) used when present.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(from, to) {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

function absPct(from, to) {
  const p = pct(from, to);
  return p == null ? null : Math.abs(p);
}

/**
 * @param {object} tf row from facts_v2
 */
function enrichTf(tf) {
  if (!tf || typeof tf !== 'object') return null;
  const c = num(tf.c);
  const mas = [
    { id: 'fast', px: num(tf.mf), len: num(tf.lf) },
    { id: 'mid', px: num(tf.mm), len: num(tf.lm) },
    { id: 'slow', px: num(tf.ms), len: num(tf.ls) },
    { id: 'extra', px: num(tf.mx), len: null },
  ].filter((m) => m.px != null && c != null);

  const above = mas
    .filter((m) => m.px > c)
    .map((m) => ({ ...m, distPct: absPct(c, m.px) }))
    .sort((a, b) => a.distPct - b.distPct);
  const below = mas
    .filter((m) => m.px < c)
    .map((m) => ({ ...m, distPct: absPct(c, m.px) }))
    .sort((a, b) => a.distPct - b.distPct);

  const rh = num(tf.rh);
  const rl = num(tf.rl);
  const railWidthPct = rh != null && rl != null && c ? absPct(rl, rh) : null;
  const toRailUpPct = rh != null && c != null ? pct(c, rh) : null;
  const toRailDnPct = rl != null && c != null ? pct(c, rl) : null;

  // Optional v3 anchors
  const ph = num(tf.ph);
  const ph2 = num(tf.ph2);
  const pl = num(tf.pl);
  const pl2 = num(tf.pl2);
  const bubPx = num(tf.bubPx);
  const srh = num(tf.srh);
  const srl = num(tf.srl);

  let hiAim = null;
  let loAim = null;
  if (ph != null && ph2 != null) hiAim = ph < ph2 ? 'down' : ph > ph2 ? 'up' : 'flat';
  if (pl != null && pl2 != null) loAim = pl > pl2 ? 'up' : pl < pl2 ? 'down' : 'flat';

  const gapAboveLo = num(tf.gapAboveLo);
  const gapAboveHi = num(tf.gapAboveHi);
  const gapBelowLo = num(tf.gapBelowLo);
  const gapBelowHi = num(tf.gapBelowHi);
  const zvAboveLo = num(tf.zvAboveLo);
  const zvAboveHi = num(tf.zvAboveHi);
  const zvBelowLo = num(tf.zvBelowLo);
  const zvBelowHi = num(tf.zvBelowHi);

  return {
    tf: tf.tf,
    c,
    bub: tf.bub || '-',
    bubPx,
    oppPx: num(tf.oppPx),
    swingPct: num(tf.swingPct),
    bubAgeBars: num(tf.bubAgeBars),
    lastHiPx: num(tf.lastHiPx),
    lastLoPx: num(tf.lastLoPx),
    pvs: tf.pvs || 'none',
    stk: tf.stk || '-',
    r14: num(tf.r14),
    macd: {
      ml: num(tf.ml),
      sl: num(tf.sl),
      hi: num(tf.hi),
      mAbove: tf.mAbove === true,
      bothLo: tf.bothLo === true,
      bothHi: tf.bothHi === true,
      hRise: tf.hRise === true,
      hFall: tf.hFall === true,
      xUp: tf.xUp === true,
      xDn: tf.xDn === true,
    },
    zap: tf.zap || null,
    pink: tf.pink || null,
    channel: tf.channel || null,
    volRatio: num(tf.volRatio),
    deltaPct: num(tf.deltaPct),
    poc: num(tf.poc),
    touchUp: num(tf.touchUp),
    touchDn: num(tf.touchDn),
    gapAbove:
      gapAboveLo != null || gapAboveHi != null
        ? { lo: gapAboveLo, hi: gapAboveHi }
        : null,
    gapBelow:
      gapBelowLo != null || gapBelowHi != null
        ? { lo: gapBelowLo, hi: gapBelowHi }
        : null,
    zvAbove:
      zvAboveLo != null || zvAboveHi != null
        ? { lo: zvAboveLo, hi: zvAboveHi }
        : null,
    zvBelow:
      zvBelowLo != null || zvBelowHi != null
        ? { lo: zvBelowLo, hi: zvBelowHi }
        : null,
    rail: {
      up: rh,
      dn: rl,
      widthPct: railWidthPct,
      pos: num(tf.rp),
      toUpPct: toRailUpPct,
      toDnPct: toRailDnPct,
      hiAim,
      loAim,
      anchors: { ph, ph2, pl, pl2 },
      small: { up: srh, dn: srl },
    },
    magnetAbove: above[0] || null,
    magnetBelow: below[0] || null,
    targetsAbove: above.slice(0, 4),
    targetsBelow: below.slice(0, 4),
    nearestBreak:
      toRailUpPct != null && toRailDnPct != null
        ? Math.abs(toRailUpPct) <= Math.abs(toRailDnPct)
          ? { side: 'up', pct: toRailUpPct, level: rh }
          : { side: 'down', pct: toRailDnPct, level: rl }
        : null,
  };
}

function findTf(rows, name) {
  return rows.find((r) => r.tf === name) || null;
}

/**
 * Build cross-TF story links Claude needs (Hebrew-ready facts, not prose).
 */
function buildStoryLinks(enriched) {
  const d30 = findTf(enriched, '30m');
  const h1 = findTf(enriched, '1H');
  const h4 = findTf(enriched, '4H');
  const day = findTf(enriched, 'Day');
  const d3 = findTf(enriched, '3D');

  const links = [];

  if (h4 && day) {
    links.push({
      id: '4h_vs_day',
      if: 'break_or_reject_on_4h',
      thenLook: 'Day magnets + Day rail',
      dayMagnetAbove: day.magnetAbove,
      dayMagnetBelow: day.magnetBelow,
      dayRail: { up: day.rail.up, dn: day.rail.dn, toUpPct: day.rail.toUpPct, toDnPct: day.rail.toDnPct },
      h4NearestBreak: h4.nearestBreak,
      h4Bub: h4.bub,
      h4BubPx: h4.bubPx,
    });
  }

  if (d3 && day) {
    links.push({
      id: '3d_macd_vs_day',
      d3Macd: d3.macd,
      dayMacd: day.macd,
      note: '3D open/recover vs Day pressure',
    });
  }

  if (h1 && h4) {
    links.push({
      id: '1h_inside_4h',
      h1NearestBreak: h1.nearestBreak,
      h4Rail: { up: h4.rail.up, dn: h4.rail.dn },
      h1MagnetAbove: h1.magnetAbove,
      h1MagnetBelow: h1.magnetBelow,
    });
  }

  if (d30 && h1) {
    links.push({
      id: '30m_timing',
      d30NearestBreak: d30.nearestBreak,
      d30Bub: d30.bub,
      h1Bub: h1.bub,
    });
  }

  return links;
}

/**
 * @param {object} snapshot facts_v2 latest
 */
function buildFullStoryPack(snapshot) {
  const tfs = Array.isArray(snapshot?.tfs) ? snapshot.tfs : [];
  const enriched = tfs.map(enrichTf).filter(Boolean);
  const focus = ['30m', '1H', '2H', '3H', '4H', '6H', 'Day', '3D', 'Week']
    .map((n) => findTf(enriched, n))
    .filter(Boolean);

  const missing = [];
  const sample = findTf(enriched, '4H') || enriched[0];
  if (sample && sample.bubPx == null) missing.push('bubPx');
  if (sample && sample.rail?.anchors?.ph == null) missing.push('pivot_anchors_ph_ph2_pl_pl2');
  if (sample && sample.rail?.small?.up == null) missing.push('small_rails_srh_srl');
  if (sample && sample.zap == null) missing.push('zap_pink_channel_paint');
  if (sample && sample.volRatio == null) missing.push('volRatio');
  if (sample && sample.gapAbove == null && sample.gapBelow == null) {
    missing.push('volume_fvg_gaps');
  }
  if (sample && sample.oppPx == null) missing.push('bubble_journey_oppPx');
  if (sample && sample.poc == null && sample.zvAbove == null && sample.zvBelow == null) {
    missing.push('volume_profile_poc_zv');
  }

  return {
    schema: 'story_pack_v1',
    from: snapshot?.schema || 'facts_v2',
    asOf: snapshot?.receivedAt || null,
    symbol: snapshot?.symbol || null,
    price: snapshot?.price ?? null,
    regime: snapshot?.regime || null,
    trigger: snapshot?.trigger || null,
    focus,
    links: buildStoryLinks(enriched),
    turn: ['5m', '15m', '30m'].map((n) => findTf(enriched, n)).filter(Boolean),
    missingForFullEyeLevel: missing,
    readyNow:
      'facts_v5 adds bubble journey (opp/swing/age) + volume-profile POC/zero zones + rail touches.',
  };
}

function maName(id) {
  if (id === 'fast') return 'ממוצע מהיר';
  if (id === 'mid') return 'ממוצע אמצע';
  if (id === 'slow') return 'ממוצע איטי';
  if (id === 'extra') return 'ממוצע נוסף';
  return id || 'קו';
}

/** Nearest level above/below price from MAs + large/small rails. */
function nextLevels(tf) {
  if (!tf) return { up: null, down: null };
  const c = num(tf.c);
  const candsUp = [];
  const candsDn = [];
  if (tf.magnetAbove?.px != null) {
    candsUp.push({ px: tf.magnetAbove.px, kind: maName(tf.magnetAbove.id), distPct: tf.magnetAbove.distPct });
  }
  if (tf.magnetBelow?.px != null) {
    candsDn.push({ px: tf.magnetBelow.px, kind: maName(tf.magnetBelow.id), distPct: tf.magnetBelow.distPct });
  }
  const ru = num(tf.rail?.up);
  const rd = num(tf.rail?.dn);
  const sru = num(tf.rail?.small?.up);
  const srd = num(tf.rail?.small?.dn);
  if (c != null && ru != null && ru > c) candsUp.push({ px: ru, kind: 'קו גדול', distPct: ((ru - c) / c) * 100 });
  if (c != null && rd != null && rd < c) candsDn.push({ px: rd, kind: 'קו גדול', distPct: ((c - rd) / c) * 100 });
  if (c != null && sru != null && sru > c) candsUp.push({ px: sru, kind: 'קו קטן', distPct: ((sru - c) / c) * 100 });
  if (c != null && srd != null && srd < c) candsDn.push({ px: srd, kind: 'קו קטן', distPct: ((c - srd) / c) * 100 });
  candsUp.sort((a, b) => (a.distPct ?? 99) - (b.distPct ?? 99));
  candsDn.sort((a, b) => (a.distPct ?? 99) - (b.distPct ?? 99));
  return { up: candsUp[0] || null, down: candsDn[0] || null };
}

function buildVisualBrief(snapshot, rules, story) {
  const price = num(snapshot?.price ?? story?.price);
  const regime = snapshot?.regime || rules?.regime || '-';
  const roll = rules?.rollup;
  const fam = rules?.families || {};
  const day = (story?.focus || []).find((t) => t.tf === 'Day');
  const d3 = (story?.focus || []).find((t) => t.tf === '3D');
  const h4 = (story?.focus || []).find((t) => t.tf === '4H');
  const d30 = (story?.focus || []).find((t) => t.tf === '30m');

  const sideWord = (lean) => (lean === 'long' ? 'קנייה' : lean === 'short' ? 'מכירה' : 'אין כיוון');

  const dayLv = nextLevels(day);
  const d3Lv = nextLevels(d3);
  const h4Lv = nextLevels(h4);

  const bubHe = (b) => {
    if (b === 'HH') return 'שיא חדש למעלה';
    if (b === 'LH') return 'שיא נמוך יותר';
    if (b === 'HL') return 'תחתית גבוהה יותר';
    if (b === 'LL') return 'תחתית חדשה למטה';
    return b || '-';
  };

  const lines = [];
  lines.push(`1. מחיר עכשיו ${fmt(price)}`);
  lines.push(`2. השוק הכללי ${regime === 'bear' ? 'יורד' : regime === 'bull' ? 'עולה' : regime}`);
  lines.push(`3. ביום הכיוון הוא ${sideWord(fam.BIAS?.lean)}`);
  lines.push(`4. ב4 שעות הכיוון הוא ${sideWord(fam.SETUP?.lean)}`);
  lines.push(`5. בקצר הכיוון הוא ${sideWord(fam.TURN?.lean)}`);
  if (h4) lines.push(`6. ב4 שעות יש ${bubHe(h4.bub)}`);
  if (h4Lv.down) lines.push(`7. ב4 שעות היעד הבא למטה הוא ${fmt(h4Lv.down.px)}`);
  if (h4Lv.up) lines.push(`8. ב4 שעות היעד הבא למעלה הוא ${fmt(h4Lv.up.px)}`);
  if (day) lines.push(`9. ביום יש ${bubHe(day.bub)}`);
  if (dayLv.up) lines.push(`10. ביום היעד הבא למעלה הוא ${fmt(dayLv.up.px)}`);
  if (dayLv.down) lines.push(`11. ביום היעד הבא למטה הוא ${fmt(dayLv.down.px)}`);
  if (d3Lv.up) lines.push(`12. ב3 ימים היעד הבא למעלה הוא ${fmt(d3Lv.up.px)}`);
  if (d3Lv.down) lines.push(`13. ב3 ימים היעד הבא למטה הוא ${fmt(d3Lv.down.px)}`);
  if (d30) lines.push(`14. ב30 דקות יש ${bubHe(d30.bub)}`);
  if (regime === 'bear' && String(roll?.stance || '').includes('long')) {
    lines.push('15. זהירות. קנייה עכשיו נגד השוק היורד');
  }

  return {
    title: 'במילים פשוטות',
    lines,
    levels: {
      day: { title: 'יום', ...dayLv },
      d3: { title: '3 ימים', ...d3Lv },
      h4: { title: '4 שעות', ...h4Lv },
    },
    targets: {
      up: dayLv.up,
      down: dayLv.down || h4Lv.down,
      dayUp: dayLv.up,
      dayDn: dayLv.down,
      h4Up: h4Lv.up,
      h4Dn: h4Lv.down,
      d3Up: d3Lv.up,
      d3Dn: d3Lv.down,
    },
    clocks: {
      bias: fam.BIAS?.lean || 'neutral',
      setup: fam.SETUP?.lean || 'neutral',
      turn: fam.TURN?.lean || 'neutral',
      biasScore: fam.BIAS?.score ?? 0,
      setupScore: fam.SETUP?.score ?? 0,
      turnScore: fam.TURN?.score ?? 0,
    },
    rails: {
      h4: h4
        ? { up: h4.rail?.up, dn: h4.rail?.dn, pos: h4.rail?.pos, c: h4.c, bub: h4.bub, bubPx: h4.bubPx }
        : null,
      day: day
        ? { up: day.rail?.up, dn: day.rail?.dn, pos: day.rail?.pos, c: day.c, bub: day.bub, bubPx: day.bubPx }
        : null,
      d3: d3
        ? { up: d3.rail?.up, dn: d3.rail?.dn, pos: d3.rail?.pos, c: d3.c, bub: d3.bub, bubPx: d3.bubPx }
        : null,
    },
    price,
  };
}

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

module.exports = { enrichTf, buildStoryLinks, buildFullStoryPack, buildVisualBrief };
