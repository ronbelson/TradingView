import { NextResponse } from 'next/server';
import { assertWebhookSecret, getTwsQuote, saveTwsQuote } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** GET — latest TWS bid/ask (read-only). */
export async function GET() {
  try {
    const quote = await getTwsQuote();
    return NextResponse.json({ ok: true, quote: quote || null, read_only: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

/**
 * POST — push quote from local TWS bridge.
 * Auth: same secret as TradingView webhook (?secret= or x-tv-secret).
 * Body: { symbol, bid, ask, last, mid?, localSymbol?, asOf? }
 * Never accepts order fields.
 */
export async function POST(req) {
  try {
    const auth = assertWebhookSecret(req);
    if (!auth.ok) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    // Reject anything that looks like an order intent.
    if (body.order || body.action || body.transmit || body.quantity || body.qty) {
      return NextResponse.json({ error: 'orders_forbidden', read_only: true }, { status: 400 });
    }

    const bid = num(body.bid);
    const ask = num(body.ask);
    const last = num(body.last);
    const mid =
      num(body.mid) ??
      (bid != null && ask != null ? (bid + ask) / 2 : last ?? bid ?? ask);
    if (mid == null) {
      return NextResponse.json({ error: 'no_price' }, { status: 400 });
    }

    const quote = await saveTwsQuote({
      source: 'tws',
      read_only: true,
      symbol: String(body.symbol || 'MBT'),
      localSymbol: body.localSymbol ? String(body.localSymbol) : null,
      conId: body.conId != null ? Number(body.conId) : null,
      expiry: body.expiry
        ? String(body.expiry)
        : body.lastTradeDateOrContractMonth
          ? String(body.lastTradeDateOrContractMonth)
          : null,
      lastTradeDateOrContractMonth: body.lastTradeDateOrContractMonth
        ? String(body.lastTradeDateOrContractMonth)
        : body.expiry
          ? String(body.expiry)
          : null,
      bid,
      ask,
      last,
      mid,
      spread: bid != null && ask != null ? Number((ask - bid).toFixed(4)) : null,
      asOf: String(body.asOf || new Date().toISOString()),
      delayed: Boolean(body.delayed),
    });

    return NextResponse.json({ ok: true, quote, read_only: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
