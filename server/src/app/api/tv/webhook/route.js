import { NextResponse } from 'next/server';
import { assertWebhookSecret, saveTvSnapshot } from '@/lib/store';
import { runPaperOnSnapshot } from '@/lib/paper-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseBody(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through to plain text
      }
    }
    const upper = trimmed.toUpperCase();
    let bubble = null;
    if (/\bHH\b/.test(upper) || upper.includes('HIGHER HIGH')) bubble = 'HH';
    else if (/\bLH\b/.test(upper) || upper.includes('LOWER HIGH')) bubble = 'LH';
    else if (/\bHL\b/.test(upper) || upper.includes('HIGHER LOW')) bubble = 'HL';
    else if (/\bLL\b/.test(upper) || upper.includes('LOWER LOW')) bubble = 'LL';
    return {
      type: 'bubble_text',
      raw: trimmed,
      bubble,
      trigger: bubble ? `chart:${bubble}` : 'plain',
    };
  }
}

export async function POST(req) {
  const auth = assertWebhookSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    const text = await req.text();
    payload = parseBody(text);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'empty_body' }, { status: 400 });
  }

  const cleaned = { ...payload };
  delete cleaned.decision;
  delete cleaned.recommend;
  delete cleaned.action;

  const saved = await saveTvSnapshot(cleaned);
  let paper = null;
  try {
    paper = await runPaperOnSnapshot(saved);
  } catch (e) {
    paper = { error: String(e?.message || e), paper_only: true };
  }
  return NextResponse.json(
    {
      ok: true,
      receivedAt: saved.receivedAt,
      trigger: saved.trigger || null,
      weakSecret: auth.weak,
      paper: paper
        ? {
            note: paper.note || null,
            open: Boolean(paper.open),
            lastClosed: Boolean(paper.lastClosed),
            stats: paper.stats || null,
          }
        : null,
    },
    { status: 200 },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: 'POST TradingView bubble JSON here. Use ?secret=TV_WEBHOOK_SECRET',
  });
}
