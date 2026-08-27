#!/usr/bin/env node
/**
 * Read-only MBT top-of-book bridge: TWS → BTC CHEF.
 * NEVER places, cancels, or modifies orders.
 *
 * Canonical path (git):
 *   scripts/tws-bridge/mbt-quote-bridge.mjs
 *
 * Prefer install-mac.sh + watchdog. Manual:
 *   CHEF_QUOTE_URL=https://tv-stack-listener.vercel.app/api/tws/quote \
 *   CHEF_SECRET=... \
 *   node mbt-quote-bridge.mjs
 */
import { IBApi, EventName } from '@stoqey/ib';

const HOST = process.env.IB_HOST || '127.0.0.1';
const PORT = Number(process.env.IB_PORT || 7496);
const CLIENT_ID = Number(process.env.IB_CLIENT_ID || 8801);
const INTERVAL_MS = Number(process.env.QUOTE_INTERVAL_MS || 3000);
const CHEF_URL = process.env.CHEF_QUOTE_URL || 'https://tv-stack-listener.vercel.app/api/tws/quote';
const CHEF_SECRET = process.env.CHEF_SECRET || process.env.TV_WEBHOOK_SECRET || '';
/** Pin month e.g. MBTQ6 — if set, only that contract; mismatch/expired still reported. */
const PINNED_LOCAL = (process.env.MBT_LOCAL_SYMBOL || '').trim().toUpperCase() || null;

if (!CHEF_SECRET) {
  console.error('Missing CHEF_SECRET (or TV_WEBHOOK_SECRET)');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createIb() {
  return new IBApi({ host: HOST, port: PORT, clientId: CLIENT_ID });
}

function disconnect(ib) {
  try {
    ib?.disconnect();
  } catch {
    // ignore
  }
}

/** Resolve front-month CME Micro Bitcoin (MBT). */
function resolveMbtContract(ib) {
  return new Promise((resolve, reject) => {
    const reqId = Math.floor(Math.random() * 9000) + 1000;
    /** @type {any[]} */
    const rows = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('contractDetails timeout'));
    }, 12000);

    const onDetails = (id, contract) => {
      if (id !== reqId) return;
      rows.push(contract);
    };
    const onEnd = (id) => {
      if (id !== reqId) return;
      cleanup();
      if (!rows.length) {
        reject(new Error('no MBT contracts'));
        return;
      }
      const sorted = [...rows].sort((a, b) =>
        String(a.contract?.lastTradeDateOrContractMonth || '').localeCompare(
          String(b.contract?.lastTradeDateOrContractMonth || ''),
        ),
      );
      if (PINNED_LOCAL) {
        const pinned = sorted.find(
          (r) => String(r.contract?.localSymbol || '').toUpperCase() === PINNED_LOCAL,
        );
        if (!pinned) {
          reject(new Error(`pinned ${PINNED_LOCAL} not found among MBT contracts`));
          return;
        }
        resolve(pinned.contract);
        return;
      }
      const now = new Date();
      const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const front =
        sorted.find((r) => String(r.contract?.lastTradeDateOrContractMonth || '') >= yyyymm) ||
        sorted[0];
      resolve(front.contract);
    };
    const onErr = (id, code, msg) => {
      if (id !== reqId && id !== -1) return;
      if (code >= 2100 && code <= 2199) return;
      cleanup();
      reject(new Error(`IB error ${code}: ${msg}`));
    };
    function cleanup() {
      clearTimeout(timer);
      ib.off(EventName.contractDetails, onDetails);
      ib.off(EventName.contractDetailsEnd, onEnd);
      ib.off(EventName.error, onErr);
    }

    ib.on(EventName.contractDetails, onDetails);
    ib.on(EventName.contractDetailsEnd, onEnd);
    ib.on(EventName.error, onErr);
    ib.reqContractDetails(reqId, {
      symbol: 'MBT',
      secType: 'FUT',
      exchange: 'CME',
      currency: 'USD',
    });
  });
}

function fetchTopOfBook(ib, contract) {
  return new Promise((resolve) => {
    const tickerId = Math.floor(Math.random() * 9000) + 1000;
    let bid = null;
    let ask = null;
    let last = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ib.cancelMktData(tickerId);
      } catch {
        // ignore
      }
      ib.off(EventName.tickPrice, onTick);
      const mid =
        bid != null && ask != null ? (bid + ask) / 2 : last ?? bid ?? ask ?? null;
      resolve({ bid, ask, last, mid });
    };

    const timer = setTimeout(finish, 8000);
    const onTick = (id, field, price) => {
      if (id !== tickerId || !price || price <= 0) return;
      if (field === 1) bid = price;
      if (field === 2) ask = price;
      if (field === 4) last = price;
      if (bid != null && ask != null) finish();
    };

    ib.on(EventName.tickPrice, onTick);
    // snapshot=true · never placeOrder
    ib.reqMktData(
      tickerId,
      {
        conId: contract.conId,
        symbol: contract.symbol,
        secType: contract.secType || 'FUT',
        exchange: 'CME',
        currency: contract.currency || 'USD',
        localSymbol: contract.localSymbol,
        lastTradeDateOrContractMonth: contract.lastTradeDateOrContractMonth,
      },
      '',
      true,
      false,
      [],
    );
  });
}

async function pushQuote(payload) {
  const url = new URL(CHEF_URL);
  url.searchParams.set('secret', CHEF_SECRET);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tv-secret': CHEF_SECRET,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`chef ${res.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function once(ib, contract) {
  const q = await fetchTopOfBook(ib, contract);
  if (q.mid == null) {
    console.warn(new Date().toISOString(), 'no quote yet', q);
    return;
  }

  await pushQuote({
    symbol: 'MBT',
    localSymbol: contract.localSymbol || null,
    conId: contract.conId,
    expiry: contract.lastTradeDateOrContractMonth || null,
    lastTradeDateOrContractMonth: contract.lastTradeDateOrContractMonth || null,
    bid: q.bid,
    ask: q.ask,
    last: q.last,
    mid: q.mid,
    asOf: new Date().toISOString(),
    read_only: true,
  });
  console.log(
    new Date().toISOString(),
    contract.localSymbol || 'MBT',
    'exp',
    contract.lastTradeDateOrContractMonth,
    'bid',
    q.bid,
    'ask',
    q.ask,
    'mid',
    q.mid,
  );
}

async function main() {
  console.log('MBT quote bridge · READ ONLY · no orders');
  console.log(`TWS ${HOST}:${PORT} clientId=${CLIENT_ID}`);
  console.log(`→ ${CHEF_URL}`);
  if (PINNED_LOCAL) console.log(`pinned ${PINNED_LOCAL}`);

  const ib = createIb();
  await ib.connect();
  const contract = await resolveMbtContract(ib);
  console.log(
    'contract',
    contract.localSymbol,
    contract.lastTradeDateOrContractMonth,
    'conId',
    contract.conId,
  );

  const stop = async () => {
    console.log('stopping…');
    disconnect(ib);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (true) {
    try {
      await once(ib, contract);
    } catch (e) {
      console.error('tick error', e?.message || e);
    }
    await sleep(INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
