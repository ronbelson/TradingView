/**
 * Bitcoin trading day: 03:00 → 03:00 Asia/Jerusalem ("שעון ביטקוין 3 עד 3 בלילה").
 */

export const BTC_DAY_TZ = 'Asia/Jerusalem';
export const BTC_DAY_HOUR = 3;

/**
 * @param {Date} [now]
 * @returns {{ hour: number, minute: number, y: number, m: number, d: number }}
 */
export function jerusalemParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BTC_DAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const map = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

/** Instant for Y-M-D at hour:00 in Asia/Jerusalem. */
export function jerusalemAt(y, m, d, hour = BTC_DAY_HOUR) {
  let t = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 8; i++) {
    const p = jerusalemParts(new Date(t));
    const localAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, 0);
    const wantAsUtc = Date.UTC(y, m - 1, d, hour, 0, 0);
    const delta = wantAsUtc - localAsUtc;
    if (delta === 0) break;
    t += delta;
  }
  return new Date(t);
}

function addCalendarDays(y, m, d, delta) {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Start of the BTC day that contains `now` (last 03:00 Jerusalem ≤ now).
 * @param {Date} [now]
 */
export function btcDayStart(now = new Date()) {
  const p = jerusalemParts(now);
  if (p.hour < BTC_DAY_HOUR) {
    const prev = addCalendarDays(p.y, p.m, p.d, -1);
    return jerusalemAt(prev.y, prev.m, prev.d, BTC_DAY_HOUR);
  }
  return jerusalemAt(p.y, p.m, p.d, BTC_DAY_HOUR);
}

/** @param {Date} start */
export function btcDayEnd(start) {
  const sp = jerusalemParts(start);
  const next = addCalendarDays(sp.y, sp.m, sp.d, 1);
  return jerusalemAt(next.y, next.m, next.d, BTC_DAY_HOUR);
}

/**
 * @param {'today'|'yesterday'|'week'|'month'|'all'} period
 * @param {Date} [now]
 * @returns {{ start: Date|null, end: Date|null, label_he: string }}
 */
export function btcPeriodRange(period, now = new Date()) {
  if (period === 'all') {
    return { start: null, end: null, label_he: 'הכל' };
  }
  const todayStart = btcDayStart(now);
  const todayEnd = btcDayEnd(todayStart);

  if (period === 'today') {
    return { start: todayStart, end: todayEnd, label_he: 'היום · 03:00–03:00' };
  }
  if (period === 'yesterday') {
    const mid = new Date(todayStart.getTime() - 12 * 60 * 60 * 1000);
    const start = btcDayStart(mid);
    return { start, end: todayStart, label_he: 'אתמול · 03:00–03:00' };
  }
  if (period === 'week') {
    // 7 BTC days ending at todayEnd
    const start = new Date(todayEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start, end: todayEnd, label_he: '7 ימי ביטקוין' };
  }
  // month: from 03:00 on the 1st of current Jerusalem month
  const p = jerusalemParts(todayStart);
  let start = jerusalemAt(p.y, p.m, 1, BTC_DAY_HOUR);
  if (start.getTime() > now.getTime()) {
    const prevM = p.m === 1 ? 12 : p.m - 1;
    const prevY = p.m === 1 ? p.y - 1 : p.y;
    start = jerusalemAt(prevY, prevM, 1, BTC_DAY_HOUR);
  }
  return { start, end: todayEnd, label_he: 'החודש · מ־03:00 ב־1' };
}

/** @param {unknown} iso */
export function tsMs(iso) {
  const n = Date.parse(String(iso || ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Trade row activity time for period filters.
 * @param {Record<string, unknown>} t
 */
export function tradeActivityMs(t) {
  return (
    tsMs(t.closed_at) ??
    tsMs(t.journal_at) ??
    tsMs(t.opened_at) ??
    null
  );
}

/**
 * Keep rows whose activity falls in [start, end).
 * @param {Array<Record<string, unknown>>} trades
 * @param {{ start: Date|null, end: Date|null }} range
 */
export function filterTradesByBtcPeriod(trades, range) {
  if (!range?.start || !range?.end) return trades || [];
  const a = range.start.getTime();
  const b = range.end.getTime();
  return (trades || []).filter((t) => {
    const ms = tradeActivityMs(t);
    if (ms == null) return false;
    return ms >= a && ms < b;
  });
}

/**
 * Position ids that have any non-voided activity in range (or always if all).
 * @param {Array<Record<string, unknown>>} trades
 * @param {{ start: Date|null, end: Date|null }} range
 * @param {string|null} liveOpenId
 */
export function positionIdsInPeriod(trades, range, liveOpenId) {
  const ids = new Set();
  if (liveOpenId) ids.add(String(liveOpenId));
  const rows =
    range?.start && range?.end ? filterTradesByBtcPeriod(trades, range) : trades || [];
  for (const t of rows) {
    if (t?.voided === true) continue;
    if (t?.id) ids.add(String(t.id));
  }
  return ids;
}
