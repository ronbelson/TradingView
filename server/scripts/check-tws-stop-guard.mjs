/** Quick guard: stale TWS must not stop on TV spike. */
import { tickPaper } from '../src/lib/paper-book.js';

const open = {
  id: 't1',
  side: 'short',
  side_he: 'שורט',
  entry: 65150,
  stop: 65280.3,
  contracts_total: 14,
  contracts_remaining: 14,
  remaining_pct: 100,
  targets: [],
  targets_hit: [],
  opened_at: '2026-08-07T19:24:04.607Z',
};

const spike = tickPaper(
  {
    price: 65550,
    high: 65550,
    low: 65230,
    receivedAt: '2026-08-07T21:02:05.803Z',
    tws_fresh: false,
    price_source: 'tv',
    h4: { structure: 'up', bub: 'HH' },
    levels: {},
  },
  { open, trades: [] },
);

if (spike.open == null) {
  console.error('FAIL: closed on TV spike without TWS');
  process.exit(1);
}
if (!String(spike.note || '').includes('TWS ישן')) {
  console.error('FAIL: expected stale note', spike.note);
  process.exit(1);
}

const live = tickPaper(
  {
    price: 65290,
    high: 65290,
    low: 65200,
    bid: 65280,
    ask: 65295,
    mid: 65287.5,
    receivedAt: '2026-08-07T21:03:00.000Z',
    tws_fresh: true,
    price_source: 'tws',
    h4: { structure: 'up', bub: 'HH' },
    levels: {},
  },
  { open, trades: [] },
);

if (live.open != null) {
  console.error('FAIL: should stop on live TWS ask above stop', live.note);
  process.exit(1);
}
if (live.lastClosed?.exit !== 65295) {
  console.error('FAIL: expected ask fill 65295 got', live.lastClosed?.exit);
  process.exit(1);
}

console.log('ok · stale TV ignored · live TWS stop at ask');
