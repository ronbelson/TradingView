import { NextResponse } from 'next/server';
import { loadStructureBundle } from '@/lib/paper-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await loadStructureBundle();
    return NextResponse.json(data, { status: data.error ? 404 : 200 });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
