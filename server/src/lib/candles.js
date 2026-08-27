/**
 * Public Binance klines. Hook has no OHLCV history — we pull candles here.
 */

const HOSTS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
];

const INTERVAL_MAP = {
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '1H': '1h',
  '2h': '2h',
  '2H': '2h',
  '4h': '4h',
  '4H': '4h',
  '1d': '1d',
  Day: '1d',
  '3d': '3d',
  '3D': '3d',
};

function mapInterval(raw) {
  const key = String(raw || '4h');
  return INTERVAL_MAP[key] || INTERVAL_MAP[key.toLowerCase()] || '4h';
}

/**
 * @param {{ symbol?: string, interval?: string, limit?: number }} opts
 */
async function fetchKlines(opts = {}) {
  const symbol = String(opts.symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const interval = mapInterval(opts.interval);
  const limit = Math.min(Math.max(Number(opts.limit) || 48, 10), 200);
  const qs = `symbol=${symbol}&interval=${interval}&limit=${limit}`;
  let lastErr = null;

  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/api/v3/klines?${qs}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        lastErr = new Error(`klines ${res.status}`);
        continue;
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) {
        lastErr = new Error('empty klines');
        continue;
      }
      const candles = rows.map((r) => ({
        t: Number(r[0]),
        o: Number(r[1]),
        h: Number(r[2]),
        l: Number(r[3]),
        c: Number(r[4]),
        v: Number(r[5]),
        tClose: Number(r[6]),
      }));
      return {
        ok: true,
        source: host.includes('vision') ? 'binance_vision' : 'binance',
        symbol,
        interval,
        intervalHe: intervalHe(interval),
        candles,
      };
    } catch (e) {
      lastErr = e;
    }
  }

  return {
    ok: false,
    reason: lastErr?.message || 'klines_failed',
    symbol,
    interval,
    candles: [],
  };
}

function intervalHe(interval) {
  const map = {
    '15m': '15 דקות',
    '30m': '30 דקות',
    '1h': 'שעה',
    '2h': 'שעתיים',
    '4h': '4 שעות',
    '1d': 'יום',
    '3d': '3 ימים',
  };
  return map[interval] || interval;
}

module.exports = { fetchKlines, mapInterval, intervalHe };
