/**
 * Single TF lean from local layers only (bubble / zap / channel).
 * Used by advice chips, strip, and Timeframe chart — keep identical.
 */

export function layerToneScore(t) {
  if (!t) return 0;
  let score = 0;
  // Structure: HH/HL = bullish · LH/LL = bearish
  if (t.bub === 'HH' || t.bub === 'HL') score += 1;
  if (t.bub === 'LH' || t.bub === 'LL') score -= 1;
  if (t.zap === 'GREEN') score += 1;
  if (t.zap === 'RED') score -= 1;
  if (t.channel === 'up') score += 0.5;
  if (t.channel === 'down') score -= 0.5;
  return score;
}

export function layerTone(t) {
  const score = layerToneScore(t);
  if (score >= 0.5) return 'long';
  if (score <= -0.5) return 'short';
  return 'watch';
}

export function layerSideHe(side) {
  if (side === 'long') return 'לונג';
  if (side === 'short') return 'שורט';
  return 'מעקב';
}
