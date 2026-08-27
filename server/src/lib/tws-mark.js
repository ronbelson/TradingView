/** Max age for using TWS quote as paper mark. */
export const TWS_QUOTE_FRESH_MS = Number(process.env.TWS_QUOTE_FRESH_MS || 30_000);

/**
 * @param {Record<string, unknown>|null|undefined} quote
 * @param {number} [nowMs]
 */
export function isTwsQuoteFresh(quote, nowMs = Date.now()) {
  if (!quote || typeof quote !== 'object') return false;
  const asOf = Date.parse(String(quote.asOf || quote.savedAt || ''));
  if (!Number.isFinite(asOf)) return false;
  return nowMs - asOf <= TWS_QUOTE_FRESH_MS;
}

/**
 * Realistic paper fill vs top-of-book.
 * Open long / close short → pay ask.
 * Open short / close long → hit bid.
 * @param {'long'|'short'} side
 * @param {'open'|'close'} kind
 * @param {{ bid?: number|null, ask?: number|null, mid?: number|null, price?: number|null, tws_fresh?: boolean }} book
 */
export function fillPxFromBook(side, kind, book = {}) {
  const bid = Number(book.bid);
  const ask = Number(book.ask);
  const mid = Number(book.mid);
  const price = Number(book.price);
  const hasBid = Number.isFinite(bid) && bid > 0;
  const hasAsk = Number.isFinite(ask) && ask > 0;
  const fallback =
    Number.isFinite(mid) && mid > 0
      ? mid
      : Number.isFinite(price) && price > 0
        ? price
        : null;

  const buy = (side === 'long' && kind === 'open') || (side === 'short' && kind === 'close');
  if (buy) {
    if (book.tws_fresh && hasAsk) return ask;
    return fallback;
  }
  if (book.tws_fresh && hasBid) return bid;
  return fallback;
}

/**
 * Overlay TV snapshot mark with live TWS top-of-book when fresh.
 * Read-only quotes only — never places orders.
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>|null|undefined} quote
 */
export function applyTwsMarkToSnapshot(snapshot, quote) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  if (!isTwsQuoteFresh(quote)) {
    return { ...snapshot, tws: quote || null, tws_fresh: false };
  }

  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  const last = Number(quote.last);
  const mid = Number(quote.mid);
  const hasBid = Number.isFinite(bid) && bid > 0;
  const hasAsk = Number.isFinite(ask) && ask > 0;
  const hasLast = Number.isFinite(last) && last > 0;
  const hasMid = Number.isFinite(mid) && mid > 0;
  if (!hasMid && !hasLast && !(hasBid || hasAsk)) {
    return { ...snapshot, tws: quote, tws_fresh: false };
  }

  const mark = hasMid ? mid : hasLast ? last : hasBid && hasAsk ? (bid + ask) / 2 : hasBid ? bid : ask;
  const highCandidates = [mark, hasAsk ? ask : null, hasLast ? last : null].filter((n) => n != null);
  const lowCandidates = [mark, hasBid ? bid : null, hasLast ? last : null].filter((n) => n != null);

  return {
    ...snapshot,
    price: mark,
    high: Math.max(...highCandidates),
    low: Math.min(...lowCandidates),
    bid: hasBid ? bid : null,
    ask: hasAsk ? ask : null,
    mid: hasMid ? mid : mark,
    tws: quote,
    tws_fresh: true,
    price_source: 'tws',
  };
}
