/**
 * Guard MBT contract month / local symbol.
 * When invalid → red alert + no new paper entries.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse IB lastTradeDateOrContractMonth: YYYYMMDD or YYYYMM → Date UTC end of day. */
export function parseExpiryDate(raw) {
  const s = String(raw || '').replace(/\D/g, '');
  if (s.length === 8) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    if (!(y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  }
  if (s.length === 6) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    if (!(y > 2000 && m >= 1 && m <= 12)) return null;
    // month-only: treat as last calendar day of that month
    const last = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    return last;
  }
  return null;
}

/** Futures month letter in localSymbol like MBTQ6 → 8 (Aug). */
const MONTH_LETTER = {
  F: 1,
  G: 2,
  H: 3,
  J: 4,
  K: 5,
  M: 6,
  N: 7,
  Q: 8,
  U: 9,
  V: 10,
  X: 11,
  Z: 12,
};

/**
 * Infer YYYY-MM from localSymbol e.g. MBTQ6 → 2026-08
 * @param {string|null|undefined} localSymbol
 */
export function monthFromLocalSymbol(localSymbol) {
  const s = String(localSymbol || '').toUpperCase();
  const m = s.match(/^MBT([FGHJKMNQUVXZ])(\d)$/);
  if (!m) return null;
  const month = MONTH_LETTER[m[1]];
  const year = 2020 + Number(m[2]); // 6 → 2026 (decade 2020s)
  if (!month || !(year >= 2020 && year <= 2099)) return null;
  return { year, month, yyyymm: `${year}${String(month).padStart(2, '0')}` };
}

/**
 * @param {Record<string, unknown>|null|undefined} quote
 * @param {{ expectedLocalSymbol?: string|null }} [cfg]
 */
export function evaluateMbtContract(quote, cfg = {}) {
  const expected = cfg.expectedLocalSymbol
    ? String(cfg.expectedLocalSymbol).trim().toUpperCase()
    : null;
  const local = quote?.localSymbol ? String(quote.localSymbol).trim().toUpperCase() : null;
  const expiryRaw = quote?.expiry || quote?.lastTradeDateOrContractMonth || null;
  const expiryDate = parseExpiryDate(expiryRaw);
  const now = new Date();

  /** @type {string[]} */
  const problems = [];
  let code = 'ok';

  if (!quote) {
    problems.push('אין מחיר מ־TWS');
    code = 'no_quote';
  } else if (!local) {
    problems.push('חסר שם חוזה מ־TWS');
    code = 'no_symbol';
  }

  if (expected && local && expected !== local) {
    problems.push(`שם לא נכון. צפוי ${expected} · בפועל ${local}`);
    code = 'symbol_mismatch';
  }

  if (expiryDate && now.getTime() > expiryDate.getTime()) {
    problems.push(`החודש עבר. פקיעה ${expiryRaw} · חוזה ${local || '-'}`);
    code = 'expired';
  }

  // If only month code available and no IB expiry: compare calendar month
  if (!expiryDate && local) {
    const inf = monthFromLocalSymbol(local);
    if (inf) {
      const nowYm = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1);
      const contractYm = inf.year * 100 + inf.month;
      // after contract month ended (next month already started)
      if (nowYm > contractYm) {
        problems.push(`החודש עבר לפי שם החוזה ${local}`);
        code = 'expired';
      }
    }
  }

  if (expected && !local && quote) {
    problems.push(`צפוי ${expected} · אין localSymbol בציטוט`);
    code = 'symbol_mismatch';
  }

  const ok = problems.length === 0;
  const he = ok
    ? `חוזה תקין${local ? ` · ${local}` : ''}`
    : problems.join(' · ');

  return {
    ok,
    trade_allowed: ok,
    code,
    he,
    localSymbol: local,
    expectedLocalSymbol: expected,
    expiry: expiryRaw ? String(expiryRaw) : null,
    expiryDate: expiryDate ? expiryDate.toISOString() : null,
    problems,
  };
}
