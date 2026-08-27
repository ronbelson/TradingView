import { NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/candles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
  const interval = url.searchParams.get('interval') || '4h';
  const limit = Number(url.searchParams.get('limit') || 48);
  const pack = await fetchKlines({ symbol, interval, limit });
  const status = pack.ok ? 200 : 502;
  return NextResponse.json(pack, { status });
}
