import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const limit = url.searchParams.get('limit') || '50';
  const events = await getEvents(limit);
  return NextResponse.json({
    ok: true,
    count: events.length,
    events,
  });
}
