/**
 * Local rules engine on TradingView facts_v2 (no Claude).
 * Derives TURN / SETUP / BIAS leans, conflicts, and rail-bubble edges.
 */

const ROLE_OF = {
  '5m': 'TURN',
  '15m': 'TURN',
  '30m': 'TURN',
  '1H': 'SETUP',
  '2H': 'SETUP',
  '3H': 'SETUP',
  '4H': 'SETUP',
  '6H': 'SETUP',
  Day: 'BIAS',
  '3D': 'BIAS',
  Week: 'BIAS',
  Month: 'BIAS',
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function leanLabel(score) {
  if (score >= 2) return 'long';
  if (score <= -2) return 'short';
  return 'neutral';
}

function familyLean(scores) {
  if (!scores.length) return { score: 0, lean: 'neutral', votes: { long: 0, short: 0, neutral: 0 } };
  const votes = { long: 0, short: 0, neutral: 0 };
  let sum = 0;
  for (const s of scores) {
    sum += s;
    votes[leanLabel(s)] += 1;
  }
  const avg = sum / scores.length;
  // Majority of directional votes wins when clear
  if (votes.long >= 2 && votes.long > votes.short) return { score: avg, lean: 'long', votes };
  if (votes.short >= 2 && votes.short > votes.long) return { score: avg, lean: 'short', votes };
  return { score: avg, lean: leanLabel(Math.round(avg)), votes };
}

/**
 * Score one TF row from dry facts only.
 * Positive = long lean · negative = short lean
 */
export function scoreTf(tf, regime) {
  if (!tf || typeof tf !== 'object') {
    return { tf: '?', role: '?', score: 0, lean: 'neutral', tags: ['missing'] };
  }

  const name = tf.tf || '?';
  const role = ROLE_OF[name] || '?';
  const tags = [];
  let score = 0;
  const bear = regime === 'bear';

  // MA stack
  if (tf.stk === 'bull') {
    score += 1;
    tags.push('stack_bull');
  } else if (tf.stk === 'bear') {
    score -= 1;
    tags.push('stack_bear');
  } else if (tf.stk === 'mixed') {
    tags.push('stack_mixed');
  }

  // vs slow
  if (tf.abv === true) {
    score += bear ? 0 : 1;
    tags.push('above_slow');
  } else if (tf.abv === false) {
    score -= bear ? 0 : 1;
    tags.push('below_slow');
    if (bear) {
      score -= 1; // bear: below slow aligns with pressure
    }
  }

  const dp = num(tf.dp);
  if (dp != null) {
    if (Math.abs(dp) >= 1.5) tags.push(dp > 0 ? 'far_above_slow' : 'far_below_slow');
  }

  // Bubble
  const bub = tf.bub || '';
  if (bub === 'LL' || bub === 'HL') {
    score += 1;
    tags.push(`bub_${bub}`);
  } else if (bub === 'HH' || bub === 'LH') {
    score -= 1;
    tags.push(`bub_${bub}`);
  }

  // Rails / price vs channel
  const pvs = tf.pvs || 'none';
  if (pvs === 'below_lower' || pvs === 'at_lower') {
    score += 1;
    tags.push(pvs);
  } else if (pvs === 'above_upper' || pvs === 'at_upper') {
    score -= 1;
    tags.push(pvs);
  } else if (pvs === 'inside') {
    const rp = num(tf.rp);
    if (rp != null) {
      if (rp <= 0.35) {
        score += 0.5;
        tags.push('rail_low_third');
      } else if (rp >= 0.65) {
        score -= 0.5;
        tags.push('rail_high_third');
      }
    }
  }

  // MACD / hist dry flags
  if (tf.bothLo && tf.hRise) {
    score += 2;
    tags.push('macd_end_drop_like');
  }
  if (tf.bothHi && tf.hFall) {
    score -= 2;
    tags.push('macd_end_rally_like');
  }
  if (tf.xUp) {
    score += 1;
    tags.push('macd_cross_up');
  }
  if (tf.xDn) {
    score -= 1;
    tags.push('macd_cross_dn');
  }
  if (tf.mAbove === true) {
    score += 0.5;
    tags.push('macd_above_sig');
  } else if (tf.mAbove === false) {
    score -= 0.5;
    tags.push('macd_below_sig');
  }

  // RSI
  const r14 = num(tf.r14);
  if (r14 != null) {
    if (r14 <= 30) {
      score += 1;
      tags.push('rsi_os');
    } else if (r14 >= 70) {
      score -= 1;
      tags.push('rsi_ob');
    }
  }

  const rounded = Math.max(-5, Math.min(5, Math.round(score * 2) / 2));
  const lean = rounded >= 1.5 ? 'long' : rounded <= -1.5 ? 'short' : 'neutral';
  return {
    tf: name,
    role,
    score: rounded,
    lean,
    tags,
    bub: bub || '-',
    pvs,
    stk: tf.stk || '-',
    r14,
    dp,
  };
}

function findEdges(rows) {
  const edges = [];
  for (const r of rows) {
    const longEdge =
      (r.bub === 'LL' || r.bub === 'HL') &&
      (r.tags.includes('below_lower') ||
        r.tags.includes('at_lower') ||
        r.tags.includes('rail_low_third') ||
        r.tags.includes('macd_end_drop_like') ||
        r.tags.includes('rsi_os'));
    const shortEdge =
      (r.bub === 'HH' || r.bub === 'LH') &&
      (r.tags.includes('above_upper') ||
        r.tags.includes('at_upper') ||
        r.tags.includes('rail_high_third') ||
        r.tags.includes('macd_end_rally_like') ||
        r.tags.includes('rsi_ob'));
    if (longEdge) edges.push({ tf: r.tf, role: r.role, side: 'long', why: r.tags.slice(0, 6) });
    if (shortEdge) edges.push({ tf: r.tf, role: r.role, side: 'short', why: r.tags.slice(0, 6) });
  }
  return edges;
}

function stanceFromRollup(bias, setup, turn, regime) {
  const notes = [];
  const aligned = bias.lean !== 'neutral' && bias.lean === setup.lean;
  const conflict =
    bias.lean !== 'neutral' &&
    turn.lean !== 'neutral' &&
    bias.lean !== turn.lean;

  let stance = 'wait';
  let detail = 'No clear stack agreement';

  // Higher TF owns bias (Month/Week/Day family). Day can counter only when SETUP agrees with TURN against BIAS? Keep simple:
  // BIAS + SETUP same → lean that way
  // BIAS vs TURN conflict → wait (higher owns)
  // TURN alone with edge → watch only
  if (aligned) {
    stance = bias.lean === 'long' ? 'lean_long' : 'lean_short';
    detail = `BIAS and SETUP both ${bias.lean}`;
    notes.push(detail);
  } else if (conflict) {
    stance = 'wait_conflict';
    detail = `BIAS ${bias.lean} vs TURN ${turn.lean} · higher owns`;
    notes.push(detail);
  } else if (setup.lean !== 'neutral' && setup.lean === turn.lean) {
    stance = setup.lean === 'long' ? 'setup_turn_long' : 'setup_turn_short';
    detail = `SETUP+TURN ${setup.lean} · BIAS ${bias.lean}`;
    notes.push(detail);
  } else if (bias.lean !== 'neutral') {
    stance = bias.lean === 'long' ? 'bias_only_long' : 'bias_only_short';
    detail = `BIAS ${bias.lean} without SETUP confirm`;
    notes.push(detail);
  }

  if (regime === 'bear' && stance.includes('long')) {
    notes.push('regime_bear · long leans are counter-trend');
  }
  if (regime === 'bull' && stance.includes('short')) {
    notes.push('regime_bull · short leans are counter-trend');
  }

  return { stance, detail, aligned, conflict, notes };
}

/**
 * @param {object} snapshot - webhook payload (facts_v2 or legacy)
 */
export function analyzeStack(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const regime = snapshot.regime === 'bull' ? 'bull' : snapshot.regime === 'bear' ? 'bear' : 'unknown';
  const tfs = Array.isArray(snapshot.tfs) ? snapshot.tfs : [];
  const isFactsV2 = snapshot.schema === 'facts_v2' || snapshot.schema === 'facts_v3' || (tfs[0] && 'c' in tfs[0] && !('state' in tfs[0]));

  if (!isFactsV2) {
    return {
      ok: false,
      reason: 'need_facts_v2',
      regime,
      schema: snapshot.schema || 'legacy',
    };
  }

  const rows = tfs.map((tf) => scoreTf(tf, regime));
  const byRole = { TURN: [], SETUP: [], BIAS: [] };
  for (const r of rows) {
    if (byRole[r.role]) byRole[r.role].push(r);
  }

  const turn = familyLean(byRole.TURN.map((r) => r.score));
  const setup = familyLean(byRole.SETUP.map((r) => r.score));
  const bias = familyLean(byRole.BIAS.map((r) => r.score));
  const roll = stanceFromRollup(bias, setup, turn, regime);
  const edges = findEdges(rows);

  const chart = snapshot.chart || {};
  const chartNotes = [];
  if (chart.bothLinesBelow0 && chart.histRising) chartNotes.push('chart_macd_end_drop_like');
  if (chart.bothLinesAbove0 && chart.histFalling) chartNotes.push('chart_macd_end_rally_like');
  if (chart.bubble === 'HL' || chart.bubble === 'LL') chartNotes.push(`chart_bub_${chart.bubble}`);
  if (chart.bubble === 'HH' || chart.bubble === 'LH') chartNotes.push(`chart_bub_${chart.bubble}`);

  return {
    ok: true,
    engine: 'stack-rules-v1',
    schema: 'facts_v2',
    regime,
    trigger: snapshot.trigger || null,
    price: snapshot.price ?? null,
    symbol: snapshot.symbol || null,
    families: {
      TURN: { ...turn, rows: byRole.TURN },
      SETUP: { ...setup, rows: byRole.SETUP },
      BIAS: { ...bias, rows: byRole.BIAS },
    },
    rollup: roll,
    edges,
    chartNotes,
    rows,
  };
}
