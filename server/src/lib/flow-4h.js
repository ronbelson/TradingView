/**
 * 4H-centric flow map.
 * Structure bubble (LL/HL/HH/LH) + difficulty points from related TFs.
 * Volume gaps: placeholder until Hook sends them.
 */

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

function pushPoint(list, px, price, meta) {
  const p = num(px);
  const c = num(price);
  if (p == null || c == null || p === c) return;
  const side = p > c ? 'up' : 'down';
  list.push({
    side,
    px: p,
    distPct: absPct(c, p),
    ...meta,
  });
}

function collectFromTf(tf, list, price) {
  if (!tf) return;
  const name = tf.tf;

  for (const m of tf.targetsAbove || []) {
    pushPoint(list, m.px, price, { tf: name, kind: 'ema', label: maHe(m.id) });
  }
  for (const m of tf.targetsBelow || []) {
    pushPoint(list, m.px, price, { tf: name, kind: 'ema', label: maHe(m.id) });
  }
  if (tf.magnetAbove) {
    pushPoint(list, tf.magnetAbove.px, price, { tf: name, kind: 'ema', label: maHe(tf.magnetAbove.id) });
  }
  if (tf.magnetBelow) {
    pushPoint(list, tf.magnetBelow.px, price, { tf: name, kind: 'ema', label: maHe(tf.magnetBelow.id) });
  }

  pushPoint(list, tf.rail?.up, price, { tf: name, kind: 'pivot', label: 'קו גדול עליון' });
  pushPoint(list, tf.rail?.dn, price, { tf: name, kind: 'pivot', label: 'קו גדול תחתון' });
  pushPoint(list, tf.rail?.small?.up, price, { tf: name, kind: 'pivot', label: 'קו קטן עליון' });
  pushPoint(list, tf.rail?.small?.dn, price, { tf: name, kind: 'pivot', label: 'קו קטן תחתון' });

  const a = tf.rail?.anchors || {};
  pushPoint(list, a.ph, price, { tf: name, kind: 'pivot', label: 'פיבוט גבוה' });
  pushPoint(list, a.pl, price, { tf: name, kind: 'pivot', label: 'פיבוט נמוך' });
}

function dedupeClosest(points, side, limit = 8) {
  const filtered = points
    .filter((p) => p.side === side && p.distPct != null)
    .sort((a, b) => a.distPct - b.distPct);
  const out = [];
  const seen = new Set();
  for (const p of filtered) {
    const key = `${p.tf}|${p.kind}|${Math.round(p.px)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * @param {object} story - from buildFullStoryPack
 * @param {object} [snapshot]
 */
function buildFlow4h(story, snapshot) {
  const rows = story?.focus || [];
  const h4 = findTf(rows, '4H');
  const price = num(snapshot?.price ?? story?.price ?? h4?.c);
  if (!h4 || price == null) {
    return {
      ok: false,
      reason: 'need_4h',
      volumeGapsReady: false,
    };
  }

  const bub = h4.bub || '-';
  const structureDown = bub === 'LL' || bub === 'HL';
  const structureUp = bub === 'HH' || bub === 'LH';

  const helperTfs = ['30m', '1H', '2H', '3H', '4H', 'Day'];
  const raw = [];
  for (const name of helperTfs) {
    collectFromTf(findTf(rows, name), raw, price);
  }

  const up = dedupeClosest(raw, 'up', 8);
  const down = dedupeClosest(raw, 'down', 8);
  const nearestUp = up[0] || null;
  const nearestDown = down[0] || null;

  // Flow score: positive = up pressure, negative = down
  let score = 0;
  const notes = [];

  if (structureDown) {
    score -= 1.5;
    notes.push(`ב4 שעות יש ${bubHe(bub)}. מבנה נוטה למטה`);
  } else if (structureUp) {
    score += 1.5;
    notes.push(`ב4 שעות יש ${bubHe(bub)}. מבנה נוטה למעלה`);
  } else {
    notes.push('ב4 שעות אין בועה ברורה');
  }

  if (nearestDown && nearestUp) {
    if (nearestDown.distPct < nearestUp.distPct) {
      score -= 0.8;
      notes.push(`קושי קרוב יותר למטה ב${nearestDown.distPct.toFixed(2)}%`);
    } else if (nearestUp.distPct < nearestDown.distPct) {
      score += 0.8;
      notes.push(`קושי קרוב יותר למעלה ב${nearestUp.distPct.toFixed(2)}%`);
    }
  } else if (nearestDown && !nearestUp) {
    score -= 0.5;
    notes.push('יש קושי למטה ואין למעלה');
  } else if (nearestUp && !nearestDown) {
    score += 0.5;
    notes.push('יש קושי למעלה ואין למטה');
  }

  // Free air: structure continues if little difficulty on that side
  if (structureDown && (!nearestDown || nearestDown.distPct > 1.2)) {
    score -= 0.7;
    notes.push('למטה האוויר פתוח יותר. ייתכן המשך ירידה');
  }
  if (structureUp && (!nearestUp || nearestUp.distPct > 1.2)) {
    score += 0.7;
    notes.push('למעלה האוויר פתוח יותר. ייתכן המשך עלייה');
  }
  if (structureDown && nearestDown && nearestDown.distPct <= 0.4) {
    score += 0.6;
    notes.push('למטה יש קושי קרוב. ייתכן עצירה או חזרה');
  }
  if (structureUp && nearestUp && nearestUp.distPct <= 0.4) {
    score -= 0.6;
    notes.push('למעלה יש קושי קרוב. ייתכן עצירה או חזרה');
  }

  let flow = 'אמצע';
  if (score >= 1.2) flow = 'למעלה';
  else if (score <= -1.2) flow = 'למטה';

  const lines = [
    `מבנה 4 שעות: ${bubHe(bub)}`,
    `זרימה עכשיו: ${flow}`,
    nearestUp
      ? `יעד אפ מול קושי: ${nearestUp.px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${nearestUp.tf} · ${nearestUp.label}`
      : 'יעד אפ מול קושי: אין',
    nearestDown
      ? `יעד דאון מול קושי: ${nearestDown.px.toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${nearestDown.tf} · ${nearestDown.label}`
      : 'יעד דאון מול קושי: אין',
    'פערי נפח: עוד לא מחוברים להוק',
    ...notes.slice(0, 4),
  ];

  return {
    ok: true,
    centerTf: '4H',
    price,
    bub,
    bubHe: bubHe(bub),
    bubPx: h4.bubPx ?? null,
    structure: structureDown ? 'down' : structureUp ? 'up' : 'flat',
    flow,
    score: Math.round(score * 10) / 10,
    nearestUp,
    nearestDown,
    up,
    down,
    helpers: helperTfs,
    volumeGapsReady: false,
    lines,
  };
}

module.exports = { buildFlow4h };
