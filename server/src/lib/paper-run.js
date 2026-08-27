import { buildReport } from '@/lib/structure-report';
import { tickPaper } from '@/lib/paper-book';
import {
  getLatest,
  getPaperState,
  getPaperTrades,
  getTwsExpected,
  getTwsQuote,
  savePaperState,
  savePaperTrades,
} from '@/lib/store';
import { applyTwsMarkToSnapshot, isTwsQuoteFresh } from '@/lib/tws-mark';
import { evaluateMbtContract } from '@/lib/tws-contract-guard';

async function resolveExpectedLocalSymbol() {
  const cfg = await getTwsExpected();
  if (cfg?.localSymbol) return String(cfg.localSymbol);
  if (process.env.EXPECTED_MBT_LOCAL_SYMBOL) {
    return String(process.env.EXPECTED_MBT_LOCAL_SYMBOL).trim().toUpperCase();
  }
  return null;
}

async function contractGuard(tws) {
  const expectedLocalSymbol = await resolveExpectedLocalSymbol();
  return evaluateMbtContract(tws, { expectedLocalSymbol });
}

export async function runPaperOnSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { error: 'no_snapshot', paper_only: true };
  }
  const tws = await getTwsQuote();
  const contract = await contractGuard(tws);
  const marked = applyTwsMarkToSnapshot(snapshot, tws);
  const report = buildReport(marked);
  if (report.error) {
    return {
      error: report.error,
      paper_only: true,
      tws: tws || null,
      contract,
    };
  }
  const prevOpen = (await getPaperState()) || { open: null };
  const prevTrades = await getPaperTrades(MAX_KEEP());
  const paused = prevOpen.trading_paused === true;
  const contractBlocked = !contract.trade_allowed;
  const twsOk = isTwsQuoteFresh(tws);
  const blockNewEntries = contractBlocked || paused || !twsOk;
  const blockReason = contractBlocked
    ? `מסחר חסום · ${contract.he}`
    : paused
      ? String(prevOpen.trading_paused_reason || 'השף בעצירה ידנית · אין כניסות והוספות')
      : !twsOk
        ? 'TWS ישן · אין כניסות עד מחיר חי מהשרת'
        : undefined;
  const result = tickPaper(report, {
    open: prevOpen.open || null,
    trades: prevTrades,
    cooldown: prevOpen.cooldown || null,
    last_collect_key: prevOpen.last_collect_key || null,
    blockNewEntries,
    blockReason,
  });
  await savePaperState({
    open: result.open,
    note: result.note,
    cooldown: result.cooldown || null,
    last_collect_key: result.last_collect_key || null,
    collection_enabled: result.collection_enabled === true,
    trading_paused: paused,
    trading_paused_at: paused ? prevOpen.trading_paused_at || null : null,
    trading_paused_reason: paused ? prevOpen.trading_paused_reason || null : null,
    updated_at: new Date().toISOString(),
  });
  await savePaperTrades(result.trades || []);
  return {
    ...result,
    trading_paused: paused,
    trading_paused_at: paused ? prevOpen.trading_paused_at || null : null,
    trading_paused_reason: paused ? prevOpen.trading_paused_reason || null : null,
    tws: tws || null,
    tws_fresh: twsOk,
    price_source: marked.price_source || 'tv',
    contract,
  };
}

function MAX_KEEP() {
  return Number(process.env.TV_PAPER_TRADES_MAX || 5000);
}

export async function loadStructureBundle() {
  const latest = await getLatest();
  if (!latest) {
    return { error: 'no_latest' };
  }
  const tws = await getTwsQuote();
  const contract = await contractGuard(tws);
  const marked = applyTwsMarkToSnapshot(latest, tws);
  const report = buildReport(marked);
  const paper = await runPaperOnSnapshot(latest);
  return {
    ...report,
    tws: tws || null,
    tws_fresh: isTwsQuoteFresh(tws),
    price_source: marked.price_source || 'tv',
    contract: paper.contract || contract,
    paper: {
      ...paper,
      // Full journal window for UI (soft-capped in store). Do not slice to 20.
      trades: paper.trades || [],
      journal_rows: (paper.trades || []).length,
    },
  };
}
