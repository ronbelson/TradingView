import { NextResponse } from 'next/server';
import {
  appendHealthLog,
  getHealthState,
  getTwsQuote,
  saveHealthState,
} from '@/lib/store';
import { isTwsQuoteFresh, TWS_QUOTE_FRESH_MS } from '@/lib/tws-mark';
import { sendChefAlerts } from '@/lib/chef-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Alert when quote older than this (default 60s). */
const DOWN_MS = Number(process.env.TWS_ALERT_STALE_MS || Math.max(TWS_QUOTE_FRESH_MS, 60_000));

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || process.env.TV_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;
  const url = new URL(req.url);
  const q = url.searchParams.get('secret') || '';
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron) return true;
  return q === secret || bearer === secret;
}

function quoteAgeSec(quote, nowMs = Date.now()) {
  if (!quote || typeof quote !== 'object') return null;
  const asOf = Date.parse(String(quote.asOf || quote.savedAt || ''));
  if (!Number.isFinite(asOf)) return null;
  return Math.floor((nowMs - asOf) / 1000);
}

/**
 * Cron: detect TWS bridge down/up · log · email + SMS once per transition.
 */
export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const quote = await getTwsQuote();
  const ageSec = quoteAgeSec(quote, now.getTime());
  const fresh = isTwsQuoteFresh(quote, now.getTime()) && ageSec != null && ageSec * 1000 <= DOWN_MS;
  const down = !fresh;
  const prev = (await getHealthState()) || {};
  const wasDown = prev.status === 'down';

  /** @type {Record<string, unknown>} */
  let transition = null;
  /** @type {Array<Record<string, unknown>>} */
  const notify = [];

  if (down && !wasDown) {
    const entry = await appendHealthLog({
      kind: 'down',
      age_sec: ageSec,
      quote_asOf: quote?.asOf || quote?.savedAt || null,
      symbol: quote?.localSymbol || quote?.symbol || null,
      note: 'TWS ישן · גשר למטה או Gateway מנותק',
    });
    transition = 'down';
    const text =
      `BTC CHEF: TWS למטה.\n` +
      `גיל ציטוט: ${ageSec == null ? 'אין' : ageSec + 'שנ׳'}\n` +
      `asOf: ${quote?.asOf || 'אין'}\n` +
      `בדוק Gateway + גשר בשרת.`;
    notify.push(
      await sendChefAlerts({
        subject: 'BTC CHEF · TWS למטה',
        text,
      }),
    );
    await saveHealthState({
      status: 'down',
      since: nowIso,
      last_down_at: nowIso,
      last_age_sec: ageSec,
      last_quote_asOf: quote?.asOf || null,
      last_log_at: entry.at,
    });
  } else if (!down && wasDown) {
    const entry = await appendHealthLog({
      kind: 'up',
      age_sec: ageSec,
      quote_asOf: quote?.asOf || quote?.savedAt || null,
      symbol: quote?.localSymbol || quote?.symbol || null,
      note: 'TWS חזר חי',
      down_since: prev.since || prev.last_down_at || null,
    });
    transition = 'up';
    const text =
      `BTC CHEF: TWS חזר.\n` +
      `גיל ציטוט: ${ageSec}שנ׳\n` +
      `asOf: ${quote?.asOf || ''}`;
    notify.push(
      await sendChefAlerts({
        subject: 'BTC CHEF · TWS חזר',
        text,
      }),
    );
    await saveHealthState({
      status: 'up',
      since: nowIso,
      last_up_at: nowIso,
      last_age_sec: ageSec,
      last_quote_asOf: quote?.asOf || null,
      last_log_at: entry.at,
      previous_down_since: prev.since || null,
    });
  } else {
    await saveHealthState({
      status: down ? 'down' : 'up',
      since: prev.since || nowIso,
      last_age_sec: ageSec,
      last_quote_asOf: quote?.asOf || null,
      last_check_at: nowIso,
      last_down_at: prev.last_down_at || null,
      last_up_at: prev.last_up_at || null,
    });
  }

  return NextResponse.json({
    ok: true,
    down,
    age_sec: ageSec,
    transition,
    notify,
    quote_asOf: quote?.asOf || null,
    checked_at: nowIso,
  });
}
