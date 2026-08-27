/**
 * RSI zones (additive). Does not replace lean / hunt / RR.
 * 30–70 = mid · above 70 = turbo up · below 30 = turbo down
 */

export const RSI_OS = 30;
export const RSI_OB = 70;

export function rsiZone(rsi) {
  const n = Number(rsi);
  if (!Number.isFinite(n)) return null;
  if (n > RSI_OB) return 'turbo_up';
  if (n < RSI_OS) return 'turbo_dn';
  return 'mid';
}

export function rsiZoneHe(zone) {
  if (zone === 'turbo_up') return 'טורבו עלייה';
  if (zone === 'turbo_dn') return 'טורבו ירידה';
  if (zone === 'mid') return 'אמצע 30–70';
  return null;
}

export function attachRsiZone(t) {
  if (!t) return t;
  const zone = rsiZone(t.rsi);
  return {
    ...t,
    rsiZone: zone,
    rsiZoneHe: rsiZoneHe(zone),
  };
}
