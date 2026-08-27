'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ChainBoardView from '@/components/ChainBoardView';
import { APP_VERSION } from '@/lib/version';
import {
  btcPeriodRange,
  filterTradesByBtcPeriod,
  positionIdsInPeriod,
} from '@/lib/btc-day';

const REFRESH_MS = 15000;
const CONTRACTS_KEY = 'btc_chef_contracts';
const FEE_PER_KEY = 'btc_chef_fee_per_contract';
const BTC_PER_KEY = 'btc_chef_btc_per_contract';
const PAPER_SECRET_KEY = 'btc_chef_paper_secret';
const DEFAULT_CONTRACTS = '14';
const DEFAULT_FEE_PER = '3'; // $ per contract per open or close
const DEFAULT_BTC_PER = '0.1'; // CME Micro Bitcoin (MBT)

function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(3)}%`;
}

function pnlPctOpen(side, entry, mark) {
  const e = Number(entry);
  const m = Number(mark);
  if (!(e > 0) || !(m > 0)) return null;
  if (side === 'long') return ((m - e) / e) * 100;
  if (side === 'short') return ((e - m) / e) * 100;
  return null;
}

/** Whole contracts for a scale slice. Round; at least 1; not more than remaining. */
function contractsForSlice(totalContracts, sizePct, remainingContracts, isFinal) {
  const total = Number(totalContracts);
  const rem = Number(remainingContracts);
  if (!(total > 0) || !(rem > 0)) return 0;
  if (isFinal) return rem;
  const want = Math.max(1, Math.round((total * Number(sizePct || 0)) / 100));
  return Math.min(want, rem);
}

/**
 * Walk journal in order and attach contracts_closed / remaining_after per exit.
 * @returns {Map<string, { contracts_closed: number, fee: number, remaining_after: number }>}
 */
function fillContractMeta(trades, totalContracts, feePer) {
  const fallbackTotal = Number(totalContracts);
  const fallbackFee = Number(feePer) || 0;
  /** @type {Map<string, number>} */
  const remaining = new Map();
  /** @type {Map<string, number>} */
  const totals = new Map();
  /** @type {Map<string, { contracts_closed: number, fee: number, remaining_after: number, open_fee?: number }>} */
  const meta = new Map();

  const ordered = [...(trades || [])]
    .filter((t) => t && t.voided !== true)
    .sort((a, b) => {
    const ta = Date.parse(String(a.closed_at || a.opened_at || 0)) || 0;
    const tb = Date.parse(String(b.closed_at || b.opened_at || 0)) || 0;
    if (ta !== tb) return ta - tb;
    const rank = (s) => (s === 'opened' ? 0 : s === 'add' ? 1 : s === 'partial' ? 2 : 3);
    const ra = rank(a.status);
    const rb = rank(b.status);
    if (ra !== rb) return ra - rb;
    const ia = a.target_index != null ? Number(a.target_index) : 99;
    const ib = b.target_index != null ? Number(b.target_index) : 99;
    if (ia !== ib) return ia - ib;
    return Number(a.exit || 0) - Number(b.exit || 0);
  });

  for (const t of ordered) {
    const id = String(t.id || '');
    const fee = Number(t.fee_per_contract) || fallbackFee;
    if (t.status === 'opened') {
      const total = Number(t.contracts_total) || fallbackTotal;
      totals.set(id, total);
      remaining.set(id, total);
      meta.set(`${id}:opened`, {
        contracts_closed: total,
        fee: total * fee,
        remaining_after: total,
        open_fee: total * fee,
      });
      continue;
    }
    if (t.status === 'add') {
      const total = totals.get(id) || Number(t.contracts_total) || fallbackTotal;
      totals.set(id, total);
      const rem = remaining.get(id) ?? 0;
      const n = Math.max(0, Number(t.contracts_added ?? t.contracts_closed) || 0);
      const after = Math.min(total, rem + n);
      remaining.set(id, after);
      meta.set(`${id}:add:${t.closed_at}:${t.entry}`, {
        contracts_closed: n,
        fee: n * fee,
        remaining_after: after,
      });
      continue;
    }
    if (t.status !== 'partial' && t.status !== 'closed') continue;
    const total = totals.get(id) || Number(t.contracts_total) || fallbackTotal;
    const rem = remaining.get(id) ?? total;
    const isFinal = t.status === 'closed';
    const stored = Number(t.contracts_closed);
    const n =
      Number.isFinite(stored) && stored > 0
        ? Math.min(rem, Math.round(stored))
        : contractsForSlice(total, t.size_pct, rem, isFinal);
    const after = Math.max(0, rem - n);
    remaining.set(id, after);
    meta.set(`${id}:${t.status}:${t.closed_at}:${t.exit}:${t.target_index}`, {
      contracts_closed: n,
      fee: n * fee,
      remaining_after: after,
    });
  }
  return { meta, remaining };
}

/** Gross $: contracts × btcPer × price move */
function moneyFromContracts(side, entry, exitPx, contractCount, btcPer) {
  const e = Number(entry);
  const x = Number(exitPx);
  const c = Number(contractCount);
  const m = Number(btcPer);
  if (!(e > 0) || !(x > 0) || !(c > 0) || !(m > 0)) return null;
  const move = side === 'long' || side === 'לונג' ? x - e : e - x;
  return c * m * move;
}

function agoHe(raw) {
  if (!raw) return '';
  const t = Date.parse(String(raw));
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'לפני רגע';
  if (sec < 3600) return `לפני ${Math.floor(sec / 60)} דקות`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h < 24) return m ? `לפני ${h} שעות ו${m} דקות` : `לפני ${h} שעות`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

/** Group journal rows by position id. Newest position first. Steps: open → exits in time order. */
function groupPaperPositions(trades) {
  const byId = new Map();
  for (const t of trades || []) {
    if (!t || t.voided === true) continue;
    if (t.status !== 'opened' && t.status !== 'partial' && t.status !== 'closed' && t.status !== 'add') continue;
    const id = String(t.id || '');
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, { id, opened: null, exits: [], side: t.side, side_he: t.side_he, entry: t.entry, stop: t.stop, opened_at: t.opened_at });
    const g = byId.get(id);
    if (t.status === 'opened') {
      g.opened = t;
      g.side = t.side;
      g.side_he = t.side_he;
      g.entry = t.entry;
      g.stop = t.stop;
      g.opened_at = t.opened_at;
      g.targets = t.targets;
    } else if (t.status === 'add') {
      g.exits.push(t);
      if (t.avg_entry != null) g.entry = t.avg_entry;
      if (t.stop != null) g.stop = t.stop;
    } else {
      g.exits.push(t);
      if (!g.opened_at && t.opened_at) g.opened_at = t.opened_at;
      if (g.entry == null && t.entry != null) g.entry = t.entry;
      if (g.stop == null && t.stop != null) g.stop = t.stop;
      if (!g.side && t.side) g.side = t.side;
      if (!g.side_he && t.side_he) g.side_he = t.side_he;
    }
  }
  for (const g of byId.values()) {
    // Always chronological. Target-index sort scrambled add-back legs (יעד 1 twice out of order).
    g.exits.sort((a, b) => {
      const ta = Date.parse(String(a.closed_at || 0)) || 0;
      const tb = Date.parse(String(b.closed_at || 0)) || 0;
      if (ta !== tb) return ta - tb;
      const rank = (s) => (s === 'add' ? 0 : s === 'partial' ? 1 : 2);
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      const ia = a.target_index != null ? Number(a.target_index) : 99;
      const ib = b.target_index != null ? Number(b.target_index) : 99;
      if (ia !== ib) return ia - ib;
      return Number(a.exit || 0) - Number(b.exit || 0);
    });
    const tOpen = Date.parse(String(g.opened_at || 0)) || 0;
    g._sort = tOpen;
  }
  return [...byId.values()].sort((a, b) => b._sort - a._sort);
}

function exitMetaKey(t) {
  if (t?.status === 'add') return `${t.id}:add:${t.closed_at}:${t.entry}`;
  return `${t.id}:${t.status}:${t.closed_at}:${t.exit}:${t.target_index}`;
}

/** Exact Israel clock for paper open/close ticks (webhook time). */
function clockHe(raw) {
  if (!raw) return '';
  const d = new Date(String(raw));
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function LevelRow({ item }) {
  const side = item.side || item.role || '';
  let color = '#c9d1d9';
  if (String(side).includes('לונג') || String(side).includes('מעלה')) color = '#3fb950';
  if (String(side).includes('שורט') || String(side).includes('מטה') || String(side).includes('סטופ')) {
    color = '#ff7b72';
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid #21262d',
      }}
    >
      <div>
        <div style={{ fontWeight: 700, color }}>
          {side}
          {item.status ? ` · ${item.status}` : ''}
        </div>
        <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>{item.why || ''}</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(item.px)}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section
      style={{
        background: '#141b24',
        border: '1px solid #243041',
        borderRadius: 14,
        padding: '12px 14px',
        marginBottom: 12,
      }}
    >
      <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#7cb7ff' }}>{title}</h2>
      {children}
    </section>
  );
}

export default function ReportPage() {
  const [tab, setTab] = useState('io');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [contracts, setContracts] = useState(DEFAULT_CONTRACTS);
  /** Older positions collapsed; latest always open. */
  const [expandedIds, setExpandedIds] = useState(() => ({}));
  /** Entry-why panels collapsed by default (+ / −). */
  const [whyOpenIds, setWhyOpenIds] = useState(() => ({}));
  /** BTC day clock 03:00→03:00 Asia/Jerusalem (night) */
  const [journalPeriod, setJournalPeriod] = useState('today');
  const [feePer, setFeePer] = useState(DEFAULT_FEE_PER);
  const [btcPer, setBtcPer] = useState(DEFAULT_BTC_PER);
  const [investReady, setInvestReady] = useState(false);
  const [ctrlBusy, setCtrlBusy] = useState(false);
  const [ctrlMsg, setCtrlMsg] = useState('');

  useEffect(() => {
    try {
      const c = localStorage.getItem(CONTRACTS_KEY);
      const f = localStorage.getItem(FEE_PER_KEY);
      const b = localStorage.getItem(BTC_PER_KEY);
      if (c != null && c !== '') setContracts(String(c));
      if (f != null && f !== '') setFeePer(String(f));
      else {
        // migrate old round-trip key once
        const old = localStorage.getItem('btc_chef_fee_round_trip');
        if (old === '100' || old == null) setFeePer(DEFAULT_FEE_PER);
        else setFeePer(DEFAULT_FEE_PER);
      }
      if (b != null && b !== '') setBtcPer(String(b));
    } catch {
      // ignore
    }
    setInvestReady(true);
  }, []);

  useEffect(() => {
    if (!investReady) return;
    try {
      localStorage.setItem(CONTRACTS_KEY, contracts || DEFAULT_CONTRACTS);
      localStorage.setItem(FEE_PER_KEY, feePer || DEFAULT_FEE_PER);
      localStorage.setItem(BTC_PER_KEY, btcPer || DEFAULT_BTC_PER);
    } catch {
      // ignore
    }
  }, [contracts, feePer, btcPer, investReady]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/structure?t=${Date.now()}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j);
      const p = j?.paper || {};
      if (p.fee_per_contract != null && Number(p.fee_per_contract) > 0) {
        setFeePer(String(p.fee_per_contract));
      }
      if (p.contracts_default != null && Number(p.contracts_default) > 0) {
        setContracts(String(p.contracts_default));
      }
      setErr('');
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const resolvePaperSecret = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(PAPER_SECRET_KEY);
      if (saved) return saved;
    } catch {
      // ignore
    }
    const typed = typeof window !== 'undefined' ? window.prompt('סוד שליטה לשף') : '';
    if (!typed) return '';
    try {
      sessionStorage.setItem(PAPER_SECRET_KEY, typed);
    } catch {
      // ignore
    }
    return typed;
  }, []);

  const runPaperControl = useCallback(
    async (action) => {
      const labels = {
        flatten: 'לסגור את הפוזיציה עכשיו',
        pause: 'לעצור את השף בלי כניסות חדשות',
        resume: 'להפעיל את השף מחדש',
        flatten_and_pause: 'לסגור פוזיציה ולעצור את השף',
      };
      if (!window.confirm(`${labels[action] || action}?`)) return;
      const secret = resolvePaperSecret();
      if (!secret) {
        setCtrlMsg('בוטל · חסר סוד');
        return;
      }
      setCtrlBusy(true);
      setCtrlMsg('מבצע…');
      try {
        const r = await fetch('/api/paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tv-secret': secret },
          body: JSON.stringify({ action, secret }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (r.status === 401) {
            try {
              sessionStorage.removeItem(PAPER_SECRET_KEY);
            } catch {
              // ignore
            }
          }
          throw new Error(j.error || `http_${r.status}`);
        }
        setCtrlMsg(j.note || 'בוצע');
        await load();
      } catch (e) {
        setCtrlMsg(String(e.message || e));
      } finally {
        setCtrlBusy(false);
      }
    },
    [load, resolvePaperSecret],
  );

  const lv = data?.levels || {};
  const paper = data?.paper || {};
  const fm = data?.fights || {};
  const edge = data?.edge || {};
  // Open MTM: if TWS fresh, mark-to-market at close side (short→ask, long→bid). Else TV/mid price.
  const mark = useMemo(() => {
    const twsFresh = !!data?.tws_fresh;
    const side = paper.open?.side;
    const bid = Number(data?.tws?.bid ?? data?.bid);
    const ask = Number(data?.tws?.ask ?? data?.ask);
    if (paper.open && twsFresh && side === 'short' && Number.isFinite(ask) && ask > 0) return ask;
    if (paper.open && twsFresh && side === 'long' && Number.isFinite(bid) && bid > 0) return bid;
    const live = Number(paper.open?.mark);
    if (paper.open && Number.isFinite(live) && live > 0) return live;
    return data?.price;
  }, [data?.tws_fresh, data?.tws?.bid, data?.tws?.ask, data?.bid, data?.ask, data?.price, paper.open]);

  const openPct = useMemo(() => {
    if (!paper.open) return null;
    return pnlPctOpen(paper.open.side, paper.open.entry, mark);
  }, [paper.open, mark]);

  const fill = useMemo(
    () => fillContractMeta(paper.trades || [], contracts, feePer),
    [paper.trades, contracts, feePer],
  );

  const periodRange = useMemo(() => btcPeriodRange(journalPeriod), [journalPeriod]);

  const periodTrades = useMemo(
    () => filterTradesByBtcPeriod(paper.trades || [], periodRange),
    [paper.trades, periodRange],
  );

  const periodIds = useMemo(
    () =>
      positionIdsInPeriod(
        paper.trades || [],
        periodRange,
        journalPeriod === 'today' || journalPeriod === 'all'
          ? paper.open?.id || null
          : null,
      ),
    [paper.trades, periodRange, journalPeriod, paper.open?.id],
  );

  const allPositions = useMemo(() => groupPaperPositions(paper.trades || []), [paper.trades]);
  const positions = useMemo(
    () => allPositions.filter((p) => periodIds.has(String(p.id))),
    [allPositions, periodIds],
  );

  const periodStats = useMemo(() => {
    const rows = periodTrades.filter(
      (t) => (t.status === 'closed' || t.status === 'partial') && t.voided !== true,
    );
    let wins = 0;
    let losses = 0;
    let closed = 0;
    let partials = 0;
    let weight = 0;
    let weighted = 0;
    for (const t of rows) {
      const pct = Number(t.pnl_pct);
      if (!Number.isFinite(pct)) continue;
      const tot = Number(t.contracts_total) || Number(contracts) || 0;
      const n = Number(t.contracts_closed) || 0;
      const w = tot > 0 && n > 0 ? (n / tot) * 100 : t.status === 'partial' ? 25 : 100;
      weight += w;
      weighted += pct * w;
      if (t.status === 'closed') {
        closed += 1;
        if (pct > 0) wins += 1;
        else losses += 1;
      } else partials += 1;
    }
    return {
      closed,
      partials,
      wins,
      losses,
      win_rate_pct: closed ? Math.round((1000 * wins) / closed) / 10 : null,
      pnl_pct_sum: weight > 0 ? Math.round((weighted / 100) * 1000) / 1000 : 0,
      journal_rows: periodTrades.filter((t) => t.voided !== true).length,
      voided_rows: periodTrades.filter((t) => t.voided === true).length,
    };
  }, [periodTrades, contracts]);

  const openRemainingContracts = useMemo(() => {
    if (!paper.open) return 0;
    const live = Number(paper.open.contracts_remaining);
    if (Number.isFinite(live) && live >= 0) return live;
    const id = String(paper.open.id || '');
    if (fill.remaining.has(id)) return fill.remaining.get(id) || 0;
    const remPct = Number(paper.open.remaining_pct ?? 100);
    return Math.max(0, Math.round((Number(contracts) * remPct) / 100));
  }, [paper.open, fill, contracts]);

  const openGross = useMemo(() => {
    if (!paper.open || !(openRemainingContracts > 0)) return null;
    return moneyFromContracts(paper.open.side, paper.open.entry, mark, openRemainingContracts, btcPer);
  }, [paper.open, mark, openRemainingContracts, btcPer]);

  const tradeFeePer = Number(paper.open?.fee_per_contract) || Number(paper.fee_per_contract) || Number(feePer) || 0;
  const openFeeIfClose = openRemainingContracts * tradeFeePer;
  const openNetIfClose = useMemo(() => {
    if (openGross == null) return null;
    return openGross - openFeeIfClose;
  }, [openGross, openFeeIfClose]);

  /** Opening (+ add) fees for one position id from trade rows. */
  const feePaidByPosId = useMemo(() => {
    /** @type {Map<string, number>} */
    const map = new Map();
    for (const t of paper.trades || []) {
      if (t.voided === true) continue;
      const id = String(t.id || '');
      if (!id) continue;
      const f = Number(t.fee_per_contract) || Number(feePer) || 0;
      if (t.status === 'opened') {
        const tot = Number(t.contracts_total) || Number(contracts) || 0;
        map.set(id, (map.get(id) || 0) + tot * f);
      } else if (t.status === 'add') {
        const n = Number(t.contracts_added ?? t.contracts_closed) || 0;
        map.set(id, (map.get(id) || 0) + n * f);
      }
    }
    return map;
  }, [paper.trades, contracts, feePer]);

  const closedMoneySum = useMemo(() => {
    const rows = periodTrades;
    const hasExits = rows.some((t) => t.status === 'closed' || t.status === 'partial');
    if (!hasExits) return Number(btcPer) > 0 ? 0 : null;
    let sum = 0;
    const openFeesDone = new Set();
    for (const t of rows) {
      if (t.voided === true) continue;
      const f = Number(t.fee_per_contract) || Number(feePer) || 0;
      if (t.status === 'opened' && !openFeesDone.has(t.id)) {
        const tot = Number(t.contracts_total) || Number(contracts) || 0;
        sum -= tot * f;
        openFeesDone.add(t.id);
      }
      if (t.status === 'add') {
        const n = Number(t.contracts_added ?? t.contracts_closed) || 0;
        sum -= n * f;
      }
    }
    for (const t of rows) {
      if (t.voided === true) continue;
      if (t.status !== 'closed' && t.status !== 'partial') continue;
      const key = exitMetaKey(t);
      const m = fill.meta.get(key);
      // Prefer trade row size. Meta rem-cap can drop same-second scale-outs to 0.
      const n = Number(t.contracts_closed) || Number(m?.contracts_closed) || 0;
      if (!(n > 0)) continue;
      const f = Number(t.fee_per_contract) || Number(feePer) || 0;
      const g = moneyFromContracts(t.side, t.entry, t.exit, n, btcPer);
      if (g != null) sum += g - n * f;
    }
    return sum;
  }, [contracts, btcPer, feePer, periodTrades, fill]);

  /** Open MTM gross only (open/add fees already in realized). */
  const openMtmGross = openGross;

  const showOpenInPeriod = journalPeriod === 'today' || journalPeriod === 'all';

  const totalMoneySum = useMemo(() => {
    if (closedMoneySum == null) return null;
    if (!showOpenInPeriod || openMtmGross == null || !Number.isFinite(openMtmGross)) {
      return closedMoneySum;
    }
    return closedMoneySum + openMtmGross;
  }, [closedMoneySum, openMtmGross, showOpenInPeriod]);

  const exposureBtc =
    Number(contracts) > 0 && Number(btcPer) > 0 ? Number(contracts) * Number(btcPer) : null;

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        padding: '12px 10px',
        borderRadius: 12,
        border: tab === id ? '1px solid #58a6ff' : '1px solid #243041',
        background: tab === id ? '#111b27' : '#0d1117',
        color: tab === id ? '#e6edf3' : '#8b949e',
        fontWeight: 800,
        fontSize: 15,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  const pnlColor = (v) => (v == null ? '#8b97a8' : v > 0 ? '#3fb950' : v < 0 ? '#ff6b6b' : '#c9d1d9');

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b1017',
        color: '#eef3f8',
        fontFamily: 'Heebo, system-ui, sans-serif',
        padding: '18px 14px 48px',
        direction: 'rtl',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>שף BTC</h1>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Link href="/logs" style={{ color: '#7cb7ff', fontSize: 13 }}>
              לוגים
            </Link>
            <Link href="/" style={{ color: '#7cb7ff', fontSize: 13 }}>
              דף ישן
            </Link>
          </div>
        </div>
        <div style={{ color: '#8b97a8', fontSize: 13, marginBottom: 14 }}>
          {err ? (
            <span style={{ color: '#ff6b6b' }}>{err}</span>
          ) : (
            <>
              מתי רץ הוק: {agoHe(data?.receivedAt) || '-'}
              {data?.receivedAt ? ` (${data.receivedAt})` : ''}
              {data?.schema ? ` · ${data.schema}` : ''}
              {` · v${APP_VERSION}`}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {tabBtn('chain', 'שרשרת')}
          {tabBtn('now', 'מצב עכשיו')}
          {tabBtn('io', 'כניסות ויציאות')}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <span style={pill}>
            מחיר {fmt(data?.price)}
            {data?.price_source === 'tws' ? ' · TWS' : ' · TV'}
          </span>
          <span style={pill}>יום% {data?.dayPct ?? '-'}</span>
          <span style={pill}>{lv.summary_he || edge.side_he || '-'}</span>
          {data?.paper?.collection_enabled ? (
            <span style={{ ...pill, borderColor: '#f2cc60', color: '#f2cc60' }}>
              איסוף 30ד פעיל
              {data?.paper?.collect_trigger
                ? ` · ${data.paper.collect_trigger.label || ''} ${data.paper.collect_trigger.px || ''}`
                : ''}
            </span>
          ) : null}
        </div>

        {data?.contract && !data.contract.trade_allowed ? (
          <div
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid #ff4d4f',
              background: 'rgba(255,77,79,0.12)',
              color: '#ff6b6b',
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            מסחר חסום · {data.contract.he}
            <div style={{ fontWeight: 500, marginTop: 6, fontSize: 13, color: '#ffb4b4' }}>
              אין כניסות חדשות עד ששם החוזה והחודש תקינים
            </div>
          </div>
        ) : data?.contract?.localSymbol ? (
          <div style={{ marginBottom: 10, color: '#3fb950', fontSize: 13 }}>
            חוזה תקין · {data.contract.localSymbol}
            {data.contract.expectedLocalSymbol
              ? ` · צפוי ${data.contract.expectedLocalSymbol}`
              : ''}
          </div>
        ) : null}

        {data?.paper?.cooldown?.he ? (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #d29922',
              background: 'rgba(210,153,34,0.12)',
              color: '#e3b341',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {data.paper.cooldown.he}
          </div>
        ) : null}

        <Card title="שליטה ידנית">
          {data?.paper?.trading_paused ? (
            <div
              style={{
                marginBottom: 10,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #ff4d4f',
                background: 'rgba(255,77,79,0.12)',
                color: '#ff6b6b',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              השף בעצירה
              {data?.paper?.trading_paused_reason
                ? ` · ${data.paper.trading_paused_reason}`
                : ''}
            </div>
          ) : (
            <div style={{ marginBottom: 10, color: '#3fb950', fontSize: 13 }}>השף פעיל</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              disabled={ctrlBusy || !data?.paper?.open}
              onClick={() => runPaperControl('flatten')}
              style={{
                ...pill,
                cursor: ctrlBusy || !data?.paper?.open ? 'not-allowed' : 'pointer',
                opacity: ctrlBusy || !data?.paper?.open ? 0.5 : 1,
                borderColor: '#ff6b6b',
                color: '#ff6b6b',
                background: 'transparent',
              }}
            >
              סגור פוזיציה
            </button>
            <button
              type="button"
              disabled={ctrlBusy}
              onClick={() => runPaperControl('flatten_and_pause')}
              style={{
                ...pill,
                cursor: ctrlBusy ? 'not-allowed' : 'pointer',
                opacity: ctrlBusy ? 0.5 : 1,
                borderColor: '#ff4d4f',
                color: '#ffb4b4',
                background: 'rgba(255,77,79,0.12)',
              }}
            >
              סגור ועצור שף
            </button>
            <button
              type="button"
              disabled={ctrlBusy || data?.paper?.trading_paused}
              onClick={() => runPaperControl('pause')}
              style={{
                ...pill,
                cursor: ctrlBusy || data?.paper?.trading_paused ? 'not-allowed' : 'pointer',
                opacity: ctrlBusy || data?.paper?.trading_paused ? 0.5 : 1,
                borderColor: '#d29922',
                color: '#e3b341',
                background: 'transparent',
              }}
            >
              עצור שף
            </button>
            <button
              type="button"
              disabled={ctrlBusy || !data?.paper?.trading_paused}
              onClick={() => runPaperControl('resume')}
              style={{
                ...pill,
                cursor: ctrlBusy || !data?.paper?.trading_paused ? 'not-allowed' : 'pointer',
                opacity: ctrlBusy || !data?.paper?.trading_paused ? 0.5 : 1,
                borderColor: '#3fb950',
                color: '#3fb950',
                background: 'transparent',
              }}
            >
              הפעל שף
            </button>
          </div>
          {ctrlMsg ? (
            <div style={{ marginTop: 10, fontSize: 13, color: '#8b97a8' }}>{ctrlMsg}</div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: '#6e7681' }}>
              בפעם הראשונה יבקש את סוד הוובהוק. נשמר רק בסשן הדפדפן.
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <span
            style={{
              ...pill,
              borderColor: data?.tws_fresh ? '#3fb950' : '#d29922',
              color: data?.tws_fresh ? '#3fb950' : '#e3b341',
            }}
          >
            TWS {data?.tws?.localSymbol || data?.tws?.symbol || 'MBT'}
            {data?.tws_fresh ? ' חי' : ' ישן'}
            {data?.tws?.asOf ? ` · ${agoHe(data.tws.asOf)}` : ' · אין'}
          </span>
          <span style={pill}>ביד {fmt(data?.tws?.bid)}</span>
          <span style={pill}>אסק {fmt(data?.tws?.ask)}</span>
          <span style={pill}>אמצע {fmt(data?.tws?.mid)}</span>
          <span style={pill}>מרווח {fmt(data?.tws?.spread, 2)}</span>
        </div>
        {!data?.tws_fresh ? (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #d29922',
              background: '#2a2008',
              color: '#e3b341',
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            TWS לא חי. אין סטופ / יציאה / כניסה לפי מחיר TradingView. מחכים לגשר בשרת.
          </div>
        ) : null}

        <Card title="חוזים ועלויות (נשמר במכשיר)">
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', maxWidth: 480 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#8b97a8', marginBottom: 6 }}>
                מספר חוזים
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={contracts}
                onChange={(e) => setContracts(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#8b97a8', marginBottom: 6 }}>
                עלות לחוזה בפתיחה/סגירה ($)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={feePer}
                onChange={(e) => setFeePer(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#8b97a8', marginBottom: 6 }}>
                ביטקוין לחוזה
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={btcPer}
                onChange={(e) => setBtcPer(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#8b97a8', marginTop: 8 }}>
            ברירת מחדל: מיקרו ביטקוין · 0.1 ביטקוין לחוזה
            {exposureBtc != null ? ` · חשיפה מלאה ${fmt(exposureBtc, 2)} ביטקוין` : ''}
            {feePer ? ` · ${fmt(feePer, 0)}$ לכל חוזה בפתיחה וגם בסגירה` : ''}
            .
            יציאה 25% מעוגלת למספר חוזים שלם (לפחות 1). נטו = גולמי פחות עמלות החוזים שנסגרו/נפתחו.
          </div>
        </Card>

        {tab === 'chain' ? (
          <Card title="לוח שרשרת (קריאה בלבד)">
            <ChainBoardView chain={data?.chain} price={data?.price} />
          </Card>
        ) : tab === 'now' ? (
          <>
            <Card title="מצב">
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{fm.mode_he || '-'}</div>
              <div style={{ fontSize: 14, color: '#c9d1d9', marginBottom: 8 }}>{edge.side_he || '-'}</div>
              {(edge.notes || []).slice(0, 6).map((n) => (
                <p key={n} style={{ margin: '0 0 6px', fontSize: 13, color: '#8b97a8' }}>
                  {n}
                </p>
              ))}
            </Card>
            <Card title="לוח אותיות">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: 6,
                }}
              >
                {(data?.board || []).map((c) => {
                  const color =
                    c.structure === 'up' ? '#3fb950' : c.structure === 'down' ? '#ff6b6b' : '#8b97a8';
                  return (
                    <div
                      key={c.tf}
                      style={{
                        borderRadius: 10,
                        padding: '8px 6px',
                        textAlign: 'center',
                        border: '1px solid #243041',
                        background: '#0f1520',
                      }}
                    >
                      <div style={{ fontSize: 11, color: '#8b97a8' }}>{c.tf}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color }}>{c.bub}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="מאבק הבא מטה">
              {(fm.fights_below || []).length ? (
                (fm.fights_below || []).map((s, i) => (
                  <LevelRow key={`dn-${i}`} item={{ side: s.role, px: s.px, why: `${s.tf} · ${s.label || ''}` }} />
                ))
              ) : (
                <div style={{ color: '#8b97a8' }}>אין</div>
              )}
            </Card>
            <Card title="מאבק הבא מעלה">
              {(fm.fights_above || []).length ? (
                (fm.fights_above || []).map((s, i) => (
                  <LevelRow key={`up-${i}`} item={{ side: s.role, px: s.px, why: `${s.tf} · ${s.label || ''}` }} />
                ))
              ) : (
                <div style={{ color: '#8b97a8' }}>אין</div>
              )}
            </Card>
          </>
        ) : (
          <>
            <Card title="יומן פייפר">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {[
                  ['today', 'היום'],
                  ['yesterday', 'אתמול'],
                  ['week', 'השבוע'],
                  ['month', 'החודש'],
                  ['all', 'הכל'],
                ].map(([id, label]) => {
                  const on = journalPeriod === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setJournalPeriod(id)}
                      style={{
                        ...pill,
                        cursor: 'pointer',
                        background: on ? '#1f6feb33' : 'transparent',
                        borderColor: on ? '#58a6ff' : '#30363d',
                        color: on ? '#58a6ff' : '#c9d1d9',
                        fontWeight: on ? 700 : 500,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: '#8b97a8', marginBottom: 10 }}>
                שעון ביטקוין 03:00–03:00 ישראל · {periodRange.label_he}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <span style={pill}>
                  שורות {periodStats.journal_rows}
                </span>
                {periodStats.voided_rows > 0 ? (
                  <span style={{ ...pill, color: '#8b97a8' }}>בוטלו {periodStats.voided_rows}</span>
                ) : null}
                <span style={pill}>נסגרו {periodStats.closed || 0}</span>
                <span style={pill}>חלקי {periodStats.partials || 0}</span>
                <span style={{ ...pill, color: '#3fb950' }}>הצלחות {periodStats.wins || 0}</span>
                <span style={{ ...pill, color: '#ff6b6b' }}>כישלונות {periodStats.losses || 0}</span>
                <span style={pill}>
                  אחוז הצלחה {periodStats.win_rate_pct != null ? `${periodStats.win_rate_pct}%` : '-'}
                </span>
                <span style={{ ...pill, color: pnlColor(periodStats.pnl_pct_sum) }}>
                  סיכום% {fmtPct(periodStats.pnl_pct_sum ?? 0)}
                </span>
                {closedMoneySum != null ? (
                  <span style={{ ...pill, color: pnlColor(closedMoneySum) }}>
                    Realized {fmtMoney(closedMoneySum)}
                  </span>
                ) : null}
                {showOpenInPeriod && openMtmGross != null && paper.open ? (
                  <span style={{ ...pill, color: pnlColor(openMtmGross) }}>
                    Unrealized {fmtMoney(openMtmGross)}
                  </span>
                ) : null}
                {totalMoneySum != null ? (
                  <span style={{ ...pill, color: pnlColor(totalMoneySum), borderColor: '#58a6ff' }}>
                    Total {fmtMoney(totalMoneySum)}
                  </span>
                ) : null}
              </div>
              {!positions.length && !paper.open ? (
                <div style={{ color: '#8b97a8', marginBottom: 10 }}>
                  אין פעולות בחלון הזה
                </div>
              ) : paper.note && showOpenInPeriod && !paper.open ? (
                <div style={{ color: '#8b97a8', marginBottom: 10 }}>{paper.note}</div>
              ) : null}

              {positions.map((pos, idx) => {
                const sideCol = pos.side === 'long' ? '#3fb950' : '#ff6b6b';
                const isLiveOpenEarly = paper.open && String(paper.open.id) === String(pos.id);
                const openFee = isLiveOpenEarly && paper.open.fee_open_usd != null
                  ? Number(paper.open.fee_open_usd)
                  : feePaidByPosId.get(String(pos.id)) || 0;
                let rem = Number(
                  (paper.trades || []).find((t) => t.id === pos.id && t.status === 'opened')?.contracts_total,
                );
                if (!(rem > 0)) rem = Number(contracts);
                const posTotalContracts = rem;
                let posNet = 0;
                let posGross = 0;
                const steps = [];
                const isLatest = idx === 0;
                const isExpanded = isLatest || Boolean(expandedIds[pos.id]);
                let leg = 1;

                for (const t of pos.exits) {
                  const key = exitMetaKey(t);
                  const m = fill.meta.get(key);
                  const nCon = m?.contracts_closed || Number(t.contracts_added || t.contracts_closed) || 0;
                  const stepFeePer = Number(t.fee_per_contract) || Number(feePer) || 0;
                  const fee = m?.fee ?? nCon * stepFeePer;

                  if (t.status === 'add') {
                    rem = m?.remaining_after != null ? m.remaining_after : Math.min(posTotalContracts, rem + nCon);
                    if (t.avg_entry != null) pos.entry = t.avg_entry;
                    leg += 1;
                    steps.push(
                      <div
                        key={key}
                        style={{
                          padding: '8px 10px',
                          marginTop: 6,
                          borderRadius: 10,
                          background: '#0f1520',
                          border: '1px solid #243041',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#58a6ff' }}>
                          הוספה חזרה · סיבוב {leg} · +{nCon} חוזים · מילוי {fmt(t.entry)}
                          {t.avg_entry != null ? ` · ממוצע ${fmt(t.avg_entry)}` : ''}
                        </div>
                        <div style={{ color: '#8b97a8', fontSize: 12, marginTop: 4 }}>
                          עמלת הוספה {fmtMoney(fee).replace('+', '')}
                          {` · שוב ${rem}/${posTotalContracts}`}
                          {t.closed_at ? ` · ${clockHe(t.closed_at)}` : ''}
                        </div>
                      </div>,
                    );
                    continue;
                  }

                  const g = moneyFromContracts(t.side, t.entry, t.exit, nCon, btcPer);
                  const net = g != null ? g - fee : null;
                  if (g != null) posGross += g;
                  if (net != null) posNet += net;
                  rem = m?.remaining_after != null ? m.remaining_after : Math.max(0, rem - nCon);

                  const targetN = t.target_index != null ? Number(t.target_index) + 1 : null;
                  const legTag = leg > 1 ? `סיבוב ${leg} · ` : '';
                  const isCollect = t.source === 'collect30' || t.exit_kind === 'collect30';
                  const title =
                    t.exit_kind === 'stop'
                      ? `${legTag}סטופ · סגרו ${nCon} חוזים`
                      : isCollect
                        ? `${legTag}איסוף חצי שעה · מקטע ${nCon} חוזים`
                        : targetN != null
                          ? `${legTag}יעד ${targetN} · סגרו ${nCon} חוזים`
                          : `${legTag}יציאה · סגרו ${nCon} חוזים`;

                  steps.push(
                    <div
                      key={key}
                      style={{
                        padding: '8px 10px',
                        marginTop: 6,
                        borderRadius: 10,
                        background: '#0f1520',
                        border: isCollect ? '1px solid #f2cc6066' : '1px solid #243041',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: pnlColor(net ?? t.pnl_pct) }}>
                        {title}
                        {t.result_he ? ` · ${t.result_he}` : ''}
                        {` · ${fmtPct(t.pnl_pct)}`}
                        {g != null ? ` · גולמי ${fmtMoney(g)}` : ''}
                        {net != null ? ` · נטו ${fmtMoney(net)}` : ''}
                      </div>
                      <div style={{ color: '#8b97a8', marginTop: 2 }}>
                        יציאה {fmt(t.exit)}
                        {fee ? ` · עמלת סגירה ${fmt(fee, 0)}$` : ''}
                        {` · נשארו ${rem} חוזים`}
                      </div>
                      {t.exit_reason ? (
                        <div style={{ color: isCollect ? '#f2cc60' : '#8b97a8', marginTop: 2, fontSize: 12 }}>
                          {t.exit_reason}
                        </div>
                      ) : null}
                      {t.closed_at ? (
                        <div style={{ color: '#7cb7ff', marginTop: 2, fontSize: 12, fontWeight: 700 }}>
                          שעון יציאה {clockHe(t.closed_at)}
                        </div>
                      ) : null}
                    </div>,
                  );
                }

                const isLiveOpen = paper.open && String(paper.open.id) === String(pos.id);
                const liveTargets = isLiveOpen
                  ? paper.open.targets || pos.targets || []
                  : pos.targets || [];
                const liveRem = isLiveOpen ? openRemainingContracts : rem;
                const liveStop = isLiveOpen && paper.open.stop != null ? paper.open.stop : pos.stop;
                const liveEntry = isLiveOpen && paper.open.entry != null ? paper.open.entry : pos.entry;
                const liveOpenedContracts =
                  isLiveOpen && paper.open.contracts_total != null
                    ? Number(paper.open.contracts_total)
                    : Number(contracts);
                const summaryNet = isLiveOpen ? openNetIfClose ?? posNet - openFee : posNet - openFee;

                return (
                  <div
                    key={pos.id}
                    style={{
                      marginTop: 14,
                      padding: 12,
                      borderRadius: 14,
                      border: `1px solid ${isLiveOpen ? '#58a6ff' : '#243041'}`,
                      background: '#121820',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isLatest) return;
                        setExpandedIds((prev) => ({ ...prev, [pos.id]: !prev[pos.id] }));
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        cursor: isLatest ? 'default' : 'pointer',
                        color: 'inherit',
                        textAlign: 'right',
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 15, color: sideCol }}>
                        {pos.side_he || pos.side}
                        {isLiveOpen ? ' · בפוזיציה' : liveRem <= 0 ? ' · נסגרה' : ''}
                        {pos.opened_at ? ` · ${clockHe(pos.opened_at)}` : ''}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: pnlColor(summaryNet) }}>
                          {fmtMoney(summaryNet)}
                        </span>
                        {!isLatest ? (
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: '1px solid #243041',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              color: '#7cb7ff',
                              background: '#0f1520',
                            }}
                          >
                            {isExpanded ? '−' : '+'}
                          </span>
                        ) : null}
                      </div>
                    </button>

                    {!isExpanded ? (
                      <div style={{ color: '#8b97a8', fontSize: 12, marginTop: 6 }}>
                        כניסה {fmt(pos.entry)} · {pos.exits.length} יציאות · לחץ לפתוח
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: '#c9d1d9', lineHeight: 1.5, marginTop: 8 }}>
                          כניסה {fmt(liveEntry)}
                          {liveStop != null ? ` · סטופ ${fmt(liveStop)}` : ''}
                          {` · נפתחו ${liveOpenedContracts} חוזים`}
                          {isLiveOpen && liveRem < liveOpenedContracts
                            ? ` · נשארו ${liveRem}`
                            : ''}
                          {openFee ? ` · עמלת פתיחה ${fmt(openFee, 0)}$` : ''}
                        </div>
                        {(() => {
                          const openRow = isLiveOpen ? paper.open : pos.opened;
                          const entryWhy =
                            (openRow && openRow.entry_why) ||
                            (pos.opened && pos.opened.entry_why) ||
                            '';
                          const stopWhy =
                            (isLiveOpen && paper.open?.stop_why) ||
                            (openRow && openRow.stop_why) ||
                            '';
                          const gateWhy =
                            (isLiveOpen && paper.open?.entry_gate_why) ||
                            (openRow && openRow.entry_gate_why) ||
                            '';
                          const source =
                            (isLiveOpen && paper.open?.source) ||
                            (openRow && openRow.source) ||
                            '';
                          const entryMode =
                            (isLiveOpen && paper.open?.entry_mode) ||
                            (openRow && openRow.entry_mode) ||
                            '';
                          if (!entryWhy && !stopWhy && !gateWhy) return null;
                          const whyOpen = Boolean(whyOpenIds[pos.id]);
                          return (
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setWhyOpenIds((prev) => ({
                                    ...prev,
                                    [pos.id]: !prev[pos.id],
                                  }))
                                }
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 8,
                                  width: '100%',
                                  padding: '6px 10px',
                                  borderRadius: 10,
                                  border: '1px solid #243041',
                                  background: '#0f1520',
                                  color: '#7cb7ff',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  fontSize: 13,
                                  textAlign: 'right',
                                }}
                              >
                                <span>סיבת כניסה</span>
                                <span
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 8,
                                    border: '1px solid #243041',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#121820',
                                    fontWeight: 800,
                                  }}
                                >
                                  {whyOpen ? '−' : '+'}
                                </span>
                              </button>
                              {whyOpen ? (
                                <div
                                  style={{
                                    marginTop: 6,
                                    padding: '8px 10px',
                                    borderRadius: 10,
                                    background: '#0d1117',
                                    border: '1px solid #243041',
                                    fontSize: 12,
                                    lineHeight: 1.55,
                                    color: '#c9d1d9',
                                  }}
                                >
                                  {entryWhy ? (
                                    <div style={{ marginBottom: gateWhy || stopWhy ? 6 : 0 }}>
                                      {entryWhy}
                                    </div>
                                  ) : null}
                                  {gateWhy ? (
                                    <div style={{ color: '#8b97a8', marginBottom: stopWhy ? 4 : 0 }}>
                                      שער תחנה: {gateWhy}
                                    </div>
                                  ) : null}
                                  {stopWhy ? (
                                    <div style={{ color: '#8b97a8', marginBottom: source || entryMode ? 4 : 0 }}>
                                      סטופ: {stopWhy}
                                    </div>
                                  ) : null}
                                  {source || entryMode ? (
                                    <div style={{ color: '#6e7681' }}>
                                      {source ? `מקור ${source}` : ''}
                                      {source && entryMode ? ' · ' : ''}
                                      {entryMode ? `מצב ${entryMode}` : ''}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                        {liveTargets.length ? (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ color: '#8b97a8', fontSize: 12, marginBottom: 6 }}>יעדים</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {(() => {
                                let hitSet;
                                if (isLiveOpen && Array.isArray(paper.open.targets_hit)) {
                                  hitSet = new Set(paper.open.targets_hit.map(Number));
                                } else {
                                  hitSet = new Set();
                                  let lastAdd = -1;
                                  for (let i = 0; i < pos.exits.length; i++) {
                                    if (pos.exits[i].status === 'add') lastAdd = i;
                                  }
                                  for (let i = lastAdd + 1; i < pos.exits.length; i++) {
                                    const x = pos.exits[i];
                                    if (
                                      (x.status === 'partial' || x.status === 'closed') &&
                                      x.exit_kind !== 'stop' &&
                                      x.target_index != null
                                    ) {
                                      hitSet.add(Number(x.target_index));
                                    }
                                  }
                                }
                                return liveTargets.map((t, i) => {
                                  const px = t.px != null ? t.px : t;
                                  const hit = hitSet.has(i);
                                  return (
                                    <span
                                      key={`tg-${i}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '4px 10px',
                                        borderRadius: 8,
                                        fontSize: hit ? 12 : 14,
                                        fontWeight: hit ? 500 : 800,
                                        letterSpacing: hit ? 0 : 0.2,
                                        color: hit ? '#6e7681' : '#e6edf3',
                                        background: hit ? '#0d1117' : '#152033',
                                        border: hit ? '1px solid #21262d' : '1px solid #58a6ff',
                                        textDecoration: hit ? 'line-through' : 'none',
                                        opacity: hit ? 0.72 : 1,
                                      }}
                                    >
                                      <span style={{ color: hit ? '#6e7681' : '#8b97a8', fontWeight: 600, fontSize: 11 }}>
                                        {i + 1}
                                      </span>
                                      {fmt(px)}
                                      {hit ? (
                                        <span style={{ fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                                          הושג
                                        </span>
                                      ) : null}
                                    </span>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        ) : null}

                        {isLiveOpen ? (
                          <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: pnlColor(openNetIfClose ?? openPct) }}>
                            על היתרה ({liveRem} חוזים) מול {fmt(mark)}: {fmtPct(openPct)}
                            {openGross != null ? ` · גולמי ${fmtMoney(openGross)}` : ''}
                            {openNetIfClose != null ? ` · נטו אם סוגרים ${fmtMoney(openNetIfClose)}` : ''}
                          </div>
                        ) : null}

                        <div style={{ marginTop: 8, fontSize: 12, color: '#8b97a8' }}>צעדי יציאה</div>
                        {steps.length ? (
                          steps
                        ) : (
                          <div style={{ color: '#8b97a8', fontSize: 13, marginTop: 6 }}>
                            עדיין בלי יציאה · מחכים ליעד או סטופ
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: '1px solid #243041',
                            fontSize: 13,
                            fontWeight: 700,
                            color: pnlColor(summaryNet),
                          }}
                        >
                          {isLiveOpen
                            ? `נשאר פתוח ${liveRem}/${contracts} · עמלת פתיחה כבר ${fmt(openFee, 0)}$`
                            : `סיכום פוזיציה · נטו ${fmtMoney(posNet - openFee)} · גולמי ${fmtMoney(posGross)}`}
                        </div>
                        {isLiveOpen && paper.note ? (
                          <div style={{ color: '#8b97a8', marginTop: 6, fontSize: 12 }}>{paper.note}</div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </Card>
            <Card title="כניסות">
              {(lv.entries || []).length ? (
                (lv.entries || []).map((e, i) => <LevelRow key={`e-${i}`} item={e} />)
              ) : (
                <div style={{ color: '#8b97a8' }}>אין כניסה עכשיו</div>
              )}
            </Card>
            <Card title="יציאות / יעדים">
              {(lv.exits || [])
                .filter((e) => String(e.side || '').includes('יציאת') || String(e.side || '').includes('יעד'))
                .map((e, i) => (
                  <LevelRow key={`x-${i}`} item={e} />
                ))}
            </Card>
            <Card title="סטופים">
              {(lv.stops || []).length ? (
                (lv.stops || []).map((e, i) => <LevelRow key={`s-${i}`} item={e} />)
              ) : (
                <div style={{ color: '#8b97a8' }}>אין</div>
              )}
            </Card>
          </>
        )}

        <p style={{ color: '#8b97a8', fontSize: 13 }}>
          פייפר בלבד · מתעדכן מטריידינג ויו בענן · רענון כל 15 שניות
        </p>
      </div>
    </main>
  );
}

const pill = {
  background: '#141b24',
  border: '1px solid #243041',
  borderRadius: 10,
  padding: '8px 12px',
  fontWeight: 700,
  fontSize: 14,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #243041',
  background: '#0f1520',
  color: '#eef3f8',
  fontSize: 16,
  fontWeight: 700,
};
