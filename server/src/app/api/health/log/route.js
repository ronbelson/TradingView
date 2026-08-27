import { NextResponse } from 'next/server';
import { getHealthLog, getHealthState, getTwsQuote } from '@/lib/store';
import { isTwsQuoteFresh } from '@/lib/tws-mark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const limit = url.searchParams.get('limit') || '80';
  const [log, state, quote] = await Promise.all([
    getHealthLog(limit),
    getHealthState(),
    getTwsQuote(),
  ]);
  const asOf = quote?.asOf || quote?.savedAt || null;
  const ageSec = asOf
    ? Math.floor((Date.now() - Date.parse(String(asOf))) / 1000)
    : null;
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    tws_fresh: isTwsQuoteFresh(quote),
    age_sec: ageSec,
    quote_asOf: asOf,
    state: state || null,
    log: Array.isArray(log) ? [...log].reverse() : [],
  });
}
