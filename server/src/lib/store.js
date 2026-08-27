import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { put, get } from '@vercel/blob';

const MAX_EVENTS = Number(process.env.TV_EVENTS_MAX || 200);
/** Soft cap only. Journal is append/merge — never wipe older rows on a short save. */
const MAX_PAPER_TRADES = Number(process.env.TV_PAPER_TRADES_MAX || 5000);
const LATEST_PATH = 'tv/latest.json';
const EVENTS_PATH = 'tv/events.json';
const PAPER_STATE_PATH = 'tv/paper_state.json';
const PAPER_TRADES_PATH = 'tv/paper_trades.json';
const TWS_QUOTE_PATH = 'tv/tws_quote.json';
const TWS_EXPECTED_PATH = 'tv/tws_expected.json';
const HEALTH_LOG_PATH = 'tv/health_log.json';
const HEALTH_STATE_PATH = 'tv/health_state.json';
const MAX_HEALTH_LOG = Number(process.env.TV_HEALTH_LOG_MAX || 300);

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function useKv() {
  return (
    !useBlob() &&
    process.env.TV_STORE === 'kv' &&
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

// Local only when no Blob/Redis
function dataDir() {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), 'tv-stack-listener');
  }
  return path.join(process.cwd(), '.data');
}

function latestFile() {
  return path.join(dataDir(), 'latest.json');
}

function eventsFile() {
  return path.join(dataDir(), 'events.json');
}

async function kv(command, args = []) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command, ...args]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash ${command} failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.result;
}

async function ensureDataDir() {
  await fs.mkdir(dataDir(), { recursive: true });
}

async function readJsonFile(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file, value) {
  await ensureDataDir();
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function blobPutJson(pathname, value) {
  await put(pathname, JSON.stringify(value), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

async function blobGetJson(pathname, fallback) {
  try {
    const result = await get(pathname, {
      access: 'private',
      useCache: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || !result.stream) return fallback;
    const text = await new Response(result.stream).text();
    if (!text) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * Persist one TradingView bubble snapshot.
 * Prefer Vercel Blob (durable) · else Upstash · else local/tmp file
 */
export async function saveTvSnapshot(payload) {
  const receivedAt = new Date().toISOString();
  const record = {
    receivedAt,
    ...payload,
  };

  if (useBlob()) {
    await blobPutJson(LATEST_PATH, record);
    const events = await blobGetJson(EVENTS_PATH, []);
    const next = [record, ...(Array.isArray(events) ? events : [])].slice(0, MAX_EVENTS);
    await blobPutJson(EVENTS_PATH, next);
    return record;
  }

  if (useKv()) {
    await kv('SET', ['tv:latest', JSON.stringify(record)]);
    await kv('LPUSH', ['tv:events', JSON.stringify(record)]);
    await kv('LTRIM', ['tv:events', 0, MAX_EVENTS - 1]);
    return record;
  }

  await writeJsonFile(latestFile(), record);
  const events = await readJsonFile(eventsFile(), []);
  events.unshift(record);
  await writeJsonFile(eventsFile(), events.slice(0, MAX_EVENTS));
  return record;
}

export async function getLatest() {
  if (useBlob()) {
    return blobGetJson(LATEST_PATH, null);
  }
  if (useKv()) {
    const raw = await kv('GET', ['tv:latest']);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return readJsonFile(latestFile(), null);
}

export async function getEvents(limit = 50) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_EVENTS);
  if (useBlob()) {
    const events = await blobGetJson(EVENTS_PATH, []);
    return (Array.isArray(events) ? events : []).slice(0, n);
  }
  if (useKv()) {
    const rows = (await kv('LRANGE', ['tv:events', 0, n - 1])) || [];
    return rows.map((row) => (typeof row === 'string' ? JSON.parse(row) : row));
  }
  const events = await readJsonFile(eventsFile(), []);
  return events.slice(0, n);
}

export function assertWebhookSecret(req) {
  const expected = process.env.TV_WEBHOOK_SECRET;
  if (!expected || expected === 'change-me') {
    return { ok: true, weak: true };
  }
  const url = new URL(req.url);
  const q = url.searchParams.get('secret');
  const h = req.headers.get('x-tv-secret');
  const ok = q === expected || h === expected;
  return { ok, weak: false };
}

function paperStateFile() {
  return path.join(dataDir(), 'paper_state.json');
}

export async function getPaperState() {
  if (useBlob()) {
    return blobGetJson(PAPER_STATE_PATH, { open: null });
  }
  if (useKv()) {
    const raw = await kv('GET', ['tv:paper_state']);
    if (!raw) return { open: null };
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return readJsonFile(paperStateFile(), { open: null });
}

export async function savePaperState(state) {
  const next = state && typeof state === 'object' ? state : { open: null };
  if (useBlob()) {
    await blobPutJson(PAPER_STATE_PATH, next);
    return next;
  }
  if (useKv()) {
    await kv('SET', ['tv:paper_state', JSON.stringify(next)]);
    return next;
  }
  await writeJsonFile(paperStateFile(), next);
  return next;
}

function paperTradesFile() {
  return path.join(dataDir(), 'paper_trades.json');
}

/**
 * Stable identity for one journal action (open / add / partial / closed).
 * Used so saves merge instead of truncating history.
 * @param {Record<string, unknown>} t
 */
export function paperJournalKey(t) {
  if (!t || typeof t !== 'object') return '';
  return [
    t.id ?? '',
    t.status ?? '',
    t.closed_at ?? '',
    t.opened_at ?? '',
    t.exit_kind ?? '',
    t.source ?? '',
    t.contracts_closed ?? '',
    t.contracts_added ?? '',
    t.exit ?? '',
    t.entry ?? '',
    t.add_count ?? '',
    t.leg ?? '',
    t.pnl_pct ?? '',
    t.remaining_pct ?? '',
  ].join('|');
}

/** Load full paper journal (up to soft cap). */
export async function getPaperTrades(limit = MAX_PAPER_TRADES) {
  const n = Math.min(Math.max(Number(limit) || MAX_PAPER_TRADES, 1), MAX_PAPER_TRADES);
  let trades = [];
  if (useBlob()) {
    trades = await blobGetJson(PAPER_TRADES_PATH, []);
    return (Array.isArray(trades) ? trades : []).slice(-n);
  }
  if (useKv()) {
    const rows = (await kv('LRANGE', ['tv:paper_trades', 0, n - 1])) || [];
    // stored newest-first via LPUSH → reverse to chronological
    return rows
      .map((row) => (typeof row === 'string' ? JSON.parse(row) : row))
      .reverse();
  }
  trades = await readJsonFile(paperTradesFile(), []);
  return (Array.isArray(trades) ? trades : []).slice(-n);
}

/**
 * Merge-append journal. Never drops existing keys just because `trades` is a short window.
 * Updates matching keys (e.g. voided flag). Soft-caps at MAX_PAPER_TRADES from the end.
 * @param {Array<Record<string, unknown>>} trades
 */
export async function savePaperTrades(trades) {
  const incoming = Array.isArray(trades) ? trades : [];
  const prev = await getPaperTrades(MAX_PAPER_TRADES);
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();
  let maxSeq = 0;
  for (const t of prev) {
    if (!t || typeof t !== 'object') continue;
    const k = paperJournalKey(t);
    if (!k) continue;
    byKey.set(k, t);
    const seq = Number(t.journal_seq);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  for (const t of incoming) {
    if (!t || typeof t !== 'object') continue;
    const k = paperJournalKey(t);
    if (!k) continue;
    const old = byKey.get(k);
    if (old) {
      byKey.set(k, {
        ...old,
        ...t,
        journal_seq: old.journal_seq ?? t.journal_seq,
        journal_at: old.journal_at || t.journal_at || null,
      });
    } else {
      maxSeq += 1;
      byKey.set(k, {
        ...t,
        journal_seq: t.journal_seq ?? maxSeq,
        journal_at: t.journal_at || new Date().toISOString(),
      });
    }
  }

  // Preserve chronological order: previous order, then brand-new keys in incoming order.
  /** @type {Array<Record<string, unknown>>} */
  const next = [];
  const seen = new Set();
  for (const t of prev) {
    const k = paperJournalKey(t);
    if (!k || seen.has(k)) continue;
    next.push(byKey.get(k) || t);
    seen.add(k);
  }
  for (const t of incoming) {
    const k = paperJournalKey(t);
    if (!k || seen.has(k)) continue;
    next.push(byKey.get(k) || t);
    seen.add(k);
  }

  const capped = next.slice(-MAX_PAPER_TRADES);
  if (useBlob()) {
    await blobPutJson(PAPER_TRADES_PATH, capped);
    return capped;
  }
  if (useKv()) {
    await kv('DEL', ['tv:paper_trades']);
    for (const row of [...capped].reverse()) {
      await kv('LPUSH', ['tv:paper_trades', JSON.stringify(row)]);
    }
    await kv('LTRIM', ['tv:paper_trades', 0, MAX_PAPER_TRADES - 1]);
    return capped;
  }
  await writeJsonFile(paperTradesFile(), capped);
  return capped;
}

/**
 * Mark matching rows voided instead of deleting (audit trail).
 * @param {(t: Record<string, unknown>) => boolean} pred
 * @param {string} reason
 */
export async function voidPaperTrades(pred, reason) {
  const trades = await getPaperTrades(MAX_PAPER_TRADES);
  const at = new Date().toISOString();
  let n = 0;
  const next = trades.map((t) => {
    if (!pred(t) || t.voided === true) return t;
    n += 1;
    return {
      ...t,
      voided: true,
      void_reason: reason,
      voided_at: at,
    };
  });
  if (n) await savePaperTrades(next);
  return { voided: n, trades: next };
}

function twsQuoteFile() {
  return path.join(dataDir(), 'tws_quote.json');
}

/** Read-only TWS top-of-book snapshot (bid/ask/last). Never places orders. */
export async function getTwsQuote() {
  if (useBlob()) {
    return blobGetJson(TWS_QUOTE_PATH, null);
  }
  if (useKv()) {
    const raw = await kv('GET', ['tv:tws_quote']);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return readJsonFile(twsQuoteFile(), null);
}

export async function saveTwsQuote(quote) {
  const next =
    quote && typeof quote === 'object'
      ? { ...quote, savedAt: new Date().toISOString() }
      : null;
  if (!next) return null;
  if (useBlob()) {
    await blobPutJson(TWS_QUOTE_PATH, next);
    return next;
  }
  if (useKv()) {
    await kv('SET', ['tv:tws_quote', JSON.stringify(next)]);
    return next;
  }
  await writeJsonFile(twsQuoteFile(), next);
  return next;
}

function twsExpectedFile() {
  return path.join(dataDir(), 'tws_expected.json');
}

/** Expected MBT local symbol (e.g. MBTQ6). Set after asking which month to run. */
export async function getTwsExpected() {
  if (useBlob()) {
    return blobGetJson(TWS_EXPECTED_PATH, null);
  }
  if (useKv()) {
    const raw = await kv('GET', ['tv:tws_expected']);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return readJsonFile(twsExpectedFile(), null);
}

export async function saveTwsExpected(cfg) {
  const localSymbol = cfg?.localSymbol ? String(cfg.localSymbol).trim().toUpperCase() : null;
  const next = {
    localSymbol,
    updatedAt: new Date().toISOString(),
    note: cfg?.note ? String(cfg.note) : null,
  };
  if (useBlob()) {
    await blobPutJson(TWS_EXPECTED_PATH, next);
    return next;
  }
  if (useKv()) {
    await kv('SET', ['tv:tws_expected', JSON.stringify(next)]);
    return next;
  }
  await writeJsonFile(twsExpectedFile(), next);
  return next;
}

function healthLogFile() {
  return path.join(dataDir(), 'health_log.json');
}

function healthStateFile() {
  return path.join(dataDir(), 'health_state.json');
}

/** @returns {Promise<Array<Record<string, unknown>>>} */
export async function getHealthLog(limit = 100) {
  const n = Math.min(Math.max(Number(limit) || 100, 1), MAX_HEALTH_LOG);
  let rows = [];
  if (useBlob()) {
    rows = await blobGetJson(HEALTH_LOG_PATH, []);
  } else if (useKv()) {
    const raw = (await kv('LRANGE', ['tv:health_log', 0, n - 1])) || [];
    return raw
      .map((row) => (typeof row === 'string' ? JSON.parse(row) : row))
      .reverse();
  } else {
    rows = await readJsonFile(healthLogFile(), []);
  }
  return (Array.isArray(rows) ? rows : []).slice(-n);
}

/** @param {Record<string, unknown>} entry */
export async function appendHealthLog(entry) {
  const row = {
    ...entry,
    at: entry?.at || new Date().toISOString(),
  };
  if (useKv()) {
    await kv('LPUSH', ['tv:health_log', JSON.stringify(row)]);
    await kv('LTRIM', ['tv:health_log', 0, MAX_HEALTH_LOG - 1]);
    return row;
  }
  const prev = await getHealthLog(MAX_HEALTH_LOG);
  const next = [...prev, row].slice(-MAX_HEALTH_LOG);
  if (useBlob()) {
    await blobPutJson(HEALTH_LOG_PATH, next);
  } else {
    await writeJsonFile(healthLogFile(), next);
  }
  return row;
}

/** @returns {Promise<Record<string, unknown>|null>} */
export async function getHealthState() {
  if (useBlob()) return blobGetJson(HEALTH_STATE_PATH, null);
  if (useKv()) {
    const raw = await kv('GET', ['tv:health_state']);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return readJsonFile(healthStateFile(), null);
}

/** @param {Record<string, unknown>} state */
export async function saveHealthState(state) {
  const next = state && typeof state === 'object' ? { ...state, updated_at: new Date().toISOString() } : null;
  if (!next) return null;
  if (useBlob()) {
    await blobPutJson(HEALTH_STATE_PATH, next);
    return next;
  }
  if (useKv()) {
    await kv('SET', ['tv:health_state', JSON.stringify(next)]);
    return next;
  }
  await writeJsonFile(healthStateFile(), next);
  return next;
}
