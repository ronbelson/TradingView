import { NextResponse } from 'next/server';
import { assertWebhookSecret, getTwsExpected, saveTwsExpected } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — which MBT month we expect (e.g. MBTQ6). */
export async function GET() {
  try {
    const cfg = await getTwsExpected();
    return NextResponse.json({
      ok: true,
      expected: cfg || null,
      env_fallback: process.env.EXPECTED_MBT_LOCAL_SYMBOL || null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

/**
 * POST — set expected local symbol after confirming the month.
 * Body: { "localSymbol": "MBTQ6", "note": "optional" }
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
    const localSymbol = String(body.localSymbol || '')
      .trim()
      .toUpperCase();
    if (!/^MBT[FGHJKMNQUVXZ]\d$/i.test(localSymbol) && localSymbol !== '') {
      return NextResponse.json(
        { error: 'bad_local_symbol', hint: 'example MBTQ6' },
        { status: 400 },
      );
    }
    const saved = await saveTwsExpected({
      localSymbol: localSymbol || null,
      note: body.note || null,
    });
    return NextResponse.json({ ok: true, expected: saved });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
