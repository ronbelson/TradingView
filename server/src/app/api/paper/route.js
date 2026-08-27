import { NextResponse } from 'next/server';
import { getLatest } from '@/lib/store';
import { runPaperOnSnapshot } from '@/lib/paper-run';
import {
  getPaperState,
  getPaperTrades,
  savePaperState,
  savePaperTrades,
  voidPaperTrades,
  getTwsQuote,
} from '@/lib/store';
import {
  summarize,
  DEFAULT_CONTRACTS,
  DEFAULT_FEE_PER_CONTRACT,
  SCALE_PCT,
  buildManualFlattenRow,
} from '@/lib/paper-book';
import { fillPxFromBook, isTwsQuoteFresh, applyTwsMarkToSnapshot } from '@/lib/tws-mark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function okSecret(req, body) {
  const want = String(process.env.TV_WEBHOOK_SECRET || '').trim();
  if (!want) return false;
  const url = new URL(req.url);
  const q = url.searchParams.get('secret');
  const h = req.headers.get('x-tv-secret');
  const b = body && typeof body === 'object' ? body.secret : null;
  return q === want || h === want || b === want;
}

async function resolveCloseFill(side) {
  const tws = await getTwsQuote();
  const latest = await getLatest();
  const marked = applyTwsMarkToSnapshot(latest || {}, tws);
  const twsFresh = isTwsQuoteFresh(tws);
  const book = {
    bid: marked.bid ?? tws?.bid,
    ask: marked.ask ?? tws?.ask,
    mid: marked.mid ?? tws?.mid,
    price: marked.price ?? tws?.last ?? tws?.mid,
    tws_fresh: twsFresh,
  };
  const fill = fillPxFromBook(/** @type {'long'|'short'} */ (side), 'close', book);
  return {
    fill: fill != null ? Number(fill) : null,
    fill_source: twsFresh ? (side === 'long' ? 'bid' : 'ask') : 'mark',
    tws_fresh: twsFresh,
  };
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const tick = url.searchParams.get('tick') !== '0';
    const limitRaw = Number(url.searchParams.get('limit') || 0);
    if (tick) {
      const latest = await getLatest();
      const paper = await runPaperOnSnapshot(latest);
      return NextResponse.json(paper);
    }
    const state = await getPaperState();
    const trades = await getPaperTrades(limitRaw > 0 ? limitRaw : undefined);
    return NextResponse.json({
      open: state?.open || null,
      note: state?.note || '',
      trading_paused: state?.trading_paused === true,
      trading_paused_at: state?.trading_paused_at || null,
      trading_paused_reason: state?.trading_paused_reason || null,
      trades,
      stats: summarize(trades),
      journal_rows: trades.length,
      paper_only: true,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e), paper_only: true }, { status: 500 });
  }
}

/**
 * Manual paper controls (secret required).
 * - pause / resume
 * - flatten / flatten_and_pause
 * - void_ghost_loop / clean_add_loop / undo_collect_flatten
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!okSecret(req, body)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const action = String(body.action || '');

    if (action === 'pause' || action === 'resume') {
      const state = (await getPaperState()) || {};
      const paused = action === 'pause';
      const reason = paused
        ? String(body.reason || 'השף בעצירה ידנית · אין כניסות והוספות')
        : null;
      const next = {
        ...state,
        trading_paused: paused,
        trading_paused_at: paused ? new Date().toISOString() : null,
        trading_paused_reason: reason,
        note: paused
          ? reason
          : state.open
            ? `השף חזר לפעילות · פוזיציה פתוחה ${state.open.side_he || state.open.side}`
            : 'השף חזר לפעילות · אין פוזיציה פתוחה',
        updated_at: new Date().toISOString(),
      };
      await savePaperState(next);
      return NextResponse.json({
        ok: true,
        action,
        trading_paused: paused,
        note: next.note,
        open: next.open || null,
        paper_only: true,
      });
    }

    if (action === 'flatten' || action === 'flatten_and_pause') {
      const state = (await getPaperState()) || {};
      const open = state.open;
      if (!open || !open.id) {
        if (action === 'flatten_and_pause') {
          const next = {
            ...state,
            open: null,
            trading_paused: true,
            trading_paused_at: new Date().toISOString(),
            trading_paused_reason: 'השף בעצירה ידנית · אין כניסות והוספות',
            note: 'השף בעצירה ידנית · אין פוזיציה לסגירה',
            updated_at: new Date().toISOString(),
          };
          await savePaperState(next);
          return NextResponse.json({
            ok: true,
            action,
            flattened: false,
            trading_paused: true,
            note: next.note,
            paper_only: true,
          });
        }
        return NextResponse.json({ error: 'no_open' }, { status: 404 });
      }

      const side = String(open.side || '');
      const { fill, fill_source, tws_fresh } = await resolveCloseFill(side);
      if (!(fill > 0)) {
        return NextResponse.json({ error: 'no_fill_price' }, { status: 409 });
      }

      const ts = new Date().toISOString();
      const why =
        action === 'flatten_and_pause'
          ? `סגירה ידנית + עצירת שף · מילוי ${fill_source}`
          : `סגירה ידנית מהשף · מילוי ${fill_source}`;
      const row = buildManualFlattenRow(open, fill, why, ts);
      row.fill_source = fill_source;
      row.source = 'manual';

      const trades = await getPaperTrades();
      trades.push(row);
      await savePaperTrades(trades);

      const pauseNow = action === 'flatten_and_pause';
      const next = {
        ...state,
        open: null,
        note: pauseNow
          ? `נסגר ידנית · ${row.side_he} · יציאה ${fill} · ${row.pnl_pct}% · השף בעצירה`
          : `נסגר ידנית · ${row.side_he} · יציאה ${fill} · ${row.pnl_pct}%`,
        trading_paused: pauseNow ? true : state.trading_paused === true,
        trading_paused_at: pauseNow
          ? ts
          : state.trading_paused
            ? state.trading_paused_at || null
            : null,
        trading_paused_reason: pauseNow
          ? 'השף בעצירה ידנית · אין כניסות והוספות'
          : state.trading_paused
            ? state.trading_paused_reason || null
            : null,
        last_collect_key: null,
        updated_at: ts,
      };
      await savePaperState(next);
      return NextResponse.json({
        ok: true,
        action,
        flattened: true,
        tws_fresh,
        fill,
        fill_source,
        closed: row,
        trading_paused: next.trading_paused === true,
        note: next.note,
        stats: summarize(trades),
        paper_only: true,
      });
    }

    if (action === 'void_ghost_loop') {
      const id = String(body.id || body.trade_id || '').trim();
      if (!id) {
        return NextResponse.json({ error: 'missing_id' }, { status: 400 });
      }
      const { voided, trades } = await voidPaperTrades((t) => {
        if (String(t.id) !== id) return false;
        if (t.status === 'add') return true;
        if (t.status === 'partial') {
          const pct = Number(t.pnl_pct);
          return !Number.isFinite(pct) || Math.abs(pct) < 0.02;
        }
        return false;
      }, 'void_ghost_loop');
      return NextResponse.json({
        ok: true,
        id,
        voided,
        journal_rows: trades.length,
        stats: summarize(trades),
        paper_only: true,
      });
    }

    if (action === 'clean_add_loop') {
      const state = (await getPaperState()) || {};
      const open = state.open;
      if (!open || !open.id) {
        return NextResponse.json({ error: 'no_open' }, { status: 404 });
      }
      const id = String(open.id);
      const feePer = Number(open.fee_per_contract) || DEFAULT_FEE_PER_CONTRACT;
      const total = Number(open.contracts_total) || DEFAULT_CONTRACTS;
      const { voided } = await voidPaperTrades((t) => {
        if (String(t.id) !== id) return false;
        if (t.status === 'add') return true;
        if (t.status === 'partial') {
          const pct = Number(t.pnl_pct);
          return !Number.isFinite(pct) || Math.abs(pct) < 0.02;
        }
        return false;
      }, 'clean_add_loop');

      const cleaned = {
        ...open,
        contracts_remaining: total,
        remaining_pct: 100,
        targets_hit: [],
        add_count: 0,
        fee_open_usd: total * feePer,
        last_add_at: null,
        last_add_px: null,
        last_add_n: null,
        last_add_bar_key: null,
        cleaned_at: new Date().toISOString(),
        restore_note: 'clean_add_loop',
      };
      await savePaperState({
        open: cleaned,
        note: `נוקה לולאת הוספה · נשאר ${total}/${total} · עמלת פתיחה ${total * feePer}$ · בוטלו ${voided} שורות ביומן`,
        cooldown: state.cooldown || null,
        last_collect_key: null,
        collection_enabled: state.collection_enabled !== false,
        trading_paused: state.trading_paused === true,
        trading_paused_at: state.trading_paused_at || null,
        trading_paused_reason: state.trading_paused_reason || null,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({
        ok: true,
        voided,
        open: cleaned,
        paper_only: true,
      });
    }

    if (action !== 'undo_collect_flatten') {
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
    }

    const state = (await getPaperState()) || {};
    if (state.open) {
      return NextResponse.json({ error: 'already_open', open: state.open }, { status: 409 });
    }

    const trades = await getPaperTrades();
    let cut = -1;
    for (let i = trades.length - 1; i >= 0; i--) {
      const t = trades[i];
      if (
        t &&
        t.voided !== true &&
        t.status === 'closed' &&
        (t.source === 'collect30' || t.exit_kind === 'collect30') &&
        Number(t.contracts_closed) > 0
      ) {
        cut = i;
        break;
      }
    }
    if (cut < 0) {
      return NextResponse.json({ error: 'no_collect_flatten_found' }, { status: 404 });
    }

    const bad = trades[cut];
    const id = String(bad.id || '');
    const nClosed = Number(bad.contracts_closed) || 0;
    const total = Number(bad.contracts_total) || DEFAULT_CONTRACTS;
    const rem = Math.max(1, nClosed);
    const feePer = Number(bad.fee_per_contract) || DEFAULT_FEE_PER_CONTRACT;

    let stop = bad.stop;
    let targets = bad.targets || [];
    let entryWhy = bad.entry_why || 'שוחזר אחרי באג איסוף';
    for (let i = cut - 1; i >= 0; i--) {
      const t = trades[i];
      if (String(t.id) !== id) continue;
      if (t.status === 'add' || t.status === 'opened') {
        if (t.stop != null) stop = t.stop;
        if (t.targets) targets = t.targets;
        if (t.entry_why) entryWhy = t.entry_why;
        break;
      }
    }

    await voidPaperTrades(
      (t) =>
        String(t.id) === id &&
        t.status === 'closed' &&
        String(t.closed_at || '') === String(bad.closed_at || '') &&
        Number(t.contracts_closed) === nClosed,
      'undo_collect_flatten',
    );

    const open = {
      id,
      side: bad.side || 'long',
      side_he: bad.side_he || (bad.side === 'short' ? 'שורט' : 'לונג'),
      entry: Number(bad.entry),
      edge_px: bad.edge_px ?? null,
      entry_mode: bad.entry_mode || 'restore',
      fill_source: 'restore',
      stop,
      stop_why: bad.stop_why || 'סטופ משוחזר',
      targets,
      entry_why: `${entryWhy} · שוחזר רצפה אחרי באג איסוף`,
      opened_at: bad.opened_at,
      contracts_total: total,
      contracts_remaining: rem,
      remaining_pct: total > 0 ? Math.round((rem / total) * 10000) / 100 : 0,
      targets_hit: [],
      scale_pct: SCALE_PCT,
      fee_per_contract: feePer,
      fee_open_usd: Number(bad.fee_open_usd) || rem * feePer,
      restored_at: new Date().toISOString(),
      restore_note: 'undo_collect_flatten',
    };

    await savePaperState({
      open,
      note: `שוחזר · נשאר ${rem}/${total} אחרי ביטול סגירת איסוף שגויה`,
      cooldown: state.cooldown || null,
      last_collect_key: null,
      collection_enabled: true,
      trading_paused: state.trading_paused === true,
      trading_paused_at: state.trading_paused_at || null,
      trading_paused_reason: state.trading_paused_reason || null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      voided: {
        status: bad.status,
        source: bad.source,
        contracts_closed: nClosed,
        exit: bad.exit,
        closed_at: bad.closed_at,
      },
      open,
      paper_only: true,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e), paper_only: true }, { status: 500 });
  }
}
