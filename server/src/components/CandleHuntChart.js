'use client';

import { useEffect, useMemo, useState } from 'react';
import { pointLabel, t, translateAdviceText } from '@/lib/i18n';

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function labelPoint(locale, m) {
  const kind = m.kind === 'mine' ? 'your_entry' : m.kind;
  const isFinal =
    kind === 'target' ||
    (typeof m.kindHe === 'string' && (m.kindHe.includes('סופי') || m.kindHe.includes('סופית')));
  return pointLabel(locale, kind, {
    exitNo: m.exitNo,
    side: m.side,
    final: isFinal,
  });
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function cleanName(s) {
  return String(s || '').replace(' · 4H', '').trim();
}

function exitsFromRoute(entry) {
  if (!entry?.route?.length) return [];
  return entry.route
    .filter((r) => r && (r.role === 'step' || r.role === 'target') && r.px != null)
    .map((r, i, arr) => ({
      px: Number(r.px),
      name: cleanName(r.name),
      kind: r.role === 'target' || i === arr.length - 1 ? 'target' : 'exit',
      rewardPct: r.rewardPct ?? null,
      rr: r.rr ?? null,
    }))
    .filter((r) => Number.isFinite(r.px));
}

/**
 * Future waypoints: now → entry → יציאה 1..N → יציאה סופית.
 * Also keep opposite-side exits (שורט/לונג ראשון שני) as side markers.
 */
function buildWaypoints(path, price, longEntry, shortEntry) {
  if (!path || (path.hunt !== 'long' && path.hunt !== 'short')) return null;
  const hunt = path.hunt;
  const steps = Array.isArray(path.steps) ? path.steps : [];
  const nowPx = price != null ? Number(price) : Number(steps.find((s) => s.kind === 'now')?.px);
  if (!Number.isFinite(nowPx)) return null;

  const huntEntry = hunt === 'long' ? longEntry : shortEntry;
  const otherEntry = hunt === 'long' ? shortEntry : longEntry;

  const entryPx =
    (huntEntry?.px != null ? Number(huntEntry.px) : null) ??
    (path.entryPx != null ? Number(path.entryPx) : null) ??
    Number(steps.find((s) => s.kind === 'entry')?.px);
  const stopPx =
    (huntEntry?.stopPx != null ? Number(huntEntry.stopPx) : null) ??
    (path.stopPx != null ? Number(path.stopPx) : null) ??
    Number(steps.find((s) => s.kind === 'stop')?.px);
  const entryName = cleanName(
    huntEntry?.name || path.entryName || steps.find((s) => s.kind === 'entry')?.name || 'כניסה',
  );

  let levels = exitsFromRoute(huntEntry);
  if (!levels.length) {
    levels = steps
      .filter((s) => s.kind === 'step' || s.kind === 'target')
      .map((s) => ({
        px: Number(s.px),
        name: cleanName(s.name),
        kind: s.kind === 'target' ? 'target' : 'exit',
        rewardPct: s.rewardPct ?? null,
        rr: s.rr ?? null,
      }))
      .filter((s) => Number.isFinite(s.px));
  }
  if (!levels.length && path.targetPx != null) {
    levels.push({
      px: Number(path.targetPx),
      name: 'יעד',
      kind: 'target',
      rewardPct: null,
      rr: path.rr ?? null,
    });
  }
  if (!levels.length) return null;

  const extremePx =
    hunt === 'long' ? Math.max(...levels.map((l) => l.px)) : Math.min(...levels.map((l) => l.px));

  const base = Number.isFinite(entryPx) ? entryPx : nowPx;
  const toward =
    hunt === 'long'
      ? [...levels].sort((a, b) => a.px - b.px).filter((l) => l.px >= base * 0.999)
      : [...levels].sort((a, b) => b.px - a.px).filter((l) => l.px <= base * 1.001);

  const cleaned = [];
  for (const l of toward) {
    const last = cleaned[cleaned.length - 1];
    if (last && Math.abs(last.px - l.px) < 1) {
      if (l.kind === 'target') cleaned[cleaned.length - 1] = l;
      continue;
    }
    cleaned.push(l);
  }
  if (!cleaned.length || Math.abs(cleaned[cleaned.length - 1].px - extremePx) > 1) {
    const hit = levels.find((l) => Math.abs(l.px - extremePx) < 1) || {
      px: extremePx,
      name: hunt === 'long' ? 'נקודה גבוהה' : 'נקודה נמוכה',
      kind: 'target',
    };
    cleaned.push({ ...hit, kind: 'target' });
  }

  // Numbered exits: יציאה 1..n-1, יציאה סופית
  const exitPoints = cleaned.map((l, i) => {
    const last = i === cleaned.length - 1;
    const n = i + 1;
    return {
      key: `exit-${l.px}-${i}`,
      kind: last ? 'target' : 'exit',
      kindHe: last ? 'יציאה סופית' : `יציאה ${n}`,
      exitNo: last ? cleaned.length : n,
      name: l.name,
      px: l.px,
      rewardPct: l.rewardPct,
      rr: l.rr,
    };
  });

  const waypoints = [{ key: 'now', kind: 'now', kindHe: 'עכשיו', name: 'מחיר', px: nowPx, exitNo: null }];
  if (Number.isFinite(entryPx)) {
    waypoints.push({
      key: 'entry',
      kind: 'entry',
      kindHe: 'כניסה',
      name: entryName,
      px: entryPx,
      exitNo: null,
    });
  }
  waypoints.push(...exitPoints);

  const out = [];
  for (const w of waypoints) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.px - w.px) / Math.max(Math.abs(w.px), 1) < 0.0003) {
      out[out.length - 1] = { ...last, ...w };
      continue;
    }
    out.push(w);
  }

  // Opposite side exits: שורט 1 / לונג 1 ...
  const otherExits = exitsFromRoute(otherEntry).map((l, i, arr) => {
    const last = i === arr.length - 1;
    const n = i + 1;
    const label = hunt === 'long' ? (last ? 'שורט סופי' : `שורט ${n}`) : last ? 'לונג סופי' : `לונג ${n}`;
    return {
      key: `other-${l.px}-${i}`,
      kind: 'other_exit',
      kindHe: label,
      exitNo: n,
      name: l.name,
      px: l.px,
      side: hunt === 'long' ? 'short' : 'long',
    };
  });

  return {
    hunt,
    waypoints: out,
    otherExits,
    extremePx,
    stopPx: Number.isFinite(stopPx) ? stopPx : null,
    rr: huntEntry?.rr ?? path.rr ?? null,
    blockHe: huntEntry?.blockHe || path.blockHe || null,
    huntHe: path.huntHe,
  };
}

function tfRhythm(tfStates, hunt) {
  const order = ['15m', '30m', '1H', '2H', '4H'];
  const map = Object.fromEntries((tfStates || []).map((t) => [t.tf, t]));
  const beats = [];
  for (const tf of order) {
    const t = map[tf];
    if (!t) continue;
    let dir = 0;
    if (t.side === 'long') dir = 1;
    if (t.side === 'short') dir = -1;
    if (hunt === 'short') dir *= -1;
    beats.push({ tf, dir, sideHe: t.sideHe });
  }
  if (!beats.length) beats.push({ tf: '4H', dir: 1, sideHe: 'לונג' });
  return beats;
}

function buildFutureCandles(plan, tfStates) {
  if (!plan?.waypoints?.length) return null;
  const hunt = plan.hunt;
  const sign = hunt === 'long' ? 1 : -1;
  const beats = tfRhythm(tfStates, hunt);
  const waypoints = plan.waypoints;
  const future = [];
  let px = waypoints[0].px;
  let t = Date.now();
  const barMs = 4 * 60 * 60 * 1000;
  const markers = [{ ...waypoints[0], barIndex: 0 }];

  for (let wi = 0; wi < waypoints.length - 1; wi++) {
    const a = waypoints[wi];
    const b = waypoints[wi + 1];
    const dist = b.px - a.px;
    const absDist = Math.abs(dist);
    const bars = clamp(Math.round(absDist / Math.max(Math.abs(a.px) * 0.0018, 25)), 3, 10);

    for (let i = 1; i <= bars; i++) {
      const prog = i / bars;
      const spine = a.px + dist * prog;
      const beat = beats[(wi + i) % beats.length];
      const wiggleAmp = absDist * 0.12 * (beat.dir < 0 ? 1 : 0.35);
      const wiggle = -sign * (beat.dir < 0 ? 1 : -0.25) * wiggleAmp * Math.sin(prog * Math.PI);
      const o = px;
      let c = spine + wiggle;
      if (i === bars) c = b.px;
      if (hunt === 'long') c = Math.max(Math.min(c, b.px + absDist * 0.02), Math.min(o, a.px) - absDist * 0.08);
      else c = Math.min(Math.max(c, b.px - absDist * 0.02), Math.max(o, a.px) + absDist * 0.08);

      const wick = Math.max(Math.abs(c - o) * 0.45, Math.abs(a.px) * 0.00025);
      const h = Math.max(o, c) + wick * (0.3 + (i % 3) * 0.15);
      const l = Math.min(o, c) - wick * (0.3 + ((i + 1) % 3) * 0.12);
      t += barMs;
      future.push({ t, o, h, l, c, future: true, beatTf: beat.tf, beatDir: beat.dir });
      px = c;
    }
    markers.push({ ...b, barIndex: future.length });
  }

  return { future, markers, beats };
}

function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}$${Math.round(v).toLocaleString('en-US')}`;
}

function pnlFromEntry(side, entryPx, markPx) {
  if (!(entryPx > 0) || !(markPx > 0) || (side !== 'long' && side !== 'short')) return null;
  const pct = side === 'long' ? ((markPx - entryPx) / entryPx) * 100 : ((entryPx - markPx) / entryPx) * 100;
  return { pct, up: pct >= 0 };
}

/** Spread right-side labels so they do not stick. */
function deconflictLabels(items, minGap) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i].y = sorted[i - 1].y + minGap;
    }
  }
  // if pushed past bottom, compress upward
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i + 1].y - sorted[i].y < minGap) {
      sorted[i].y = sorted[i + 1].y - minGap;
    }
  }
  return sorted;
}

function ZoomBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#58a6ff' : '#30363d'}`,
        background: active ? '#111b27' : '#0d1117',
        color: active ? '#58a6ff' : '#c9d1d9',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export default function CandleHuntChart({
  path,
  tfStates,
  price,
  symbol = 'BTCUSDT',
  longEntry,
  shortEntry,
  mySide = null,
  myEntry = null,
  bankroll = null,
  marginX = null,
  locale = 'en',
}) {
  const [past, setPast] = useState([]);
  const [zoom, setZoom] = useState(1.5);
  const [wide, setWide] = useState(false);
  const dir = locale === 'he' || locale === 'ar' ? 'rtl' : 'ltr';
  const tr = (key) => t(locale, key);

  const plan = useMemo(
    () => buildWaypoints(path, price, longEntry, shortEntry),
    [path, price, longEntry, shortEntry],
  );
  const sim = useMemo(() => buildFutureCandles(plan, tfStates), [plan, tfStates]);

  const hasPos =
    (mySide === 'long' || mySide === 'short') && Number.isFinite(Number(myEntry)) && Number(myEntry) > 0;
  const markPx = price != null ? Number(price) : null;
  const livePnl = hasPos && markPx != null ? pnlFromEntry(mySide, Number(myEntry), markPx) : null;
  const sizeUsd =
    hasPos && Number(bankroll) > 0 && Number(marginX) > 0 ? Number(bankroll) * Number(marginX) : null;
  const liveMoney =
    livePnl && sizeUsd != null ? (sizeUsd * livePnl.pct) / 100 : null;

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/candles?symbol=${symbol}&interval=4h&limit=12`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!alive) return;
        if (data?.ok && Array.isArray(data.candles)) setPast(data.candles.slice(-8));
      } catch {
        // optional
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [symbol]);

  const hunt = plan?.hunt;
  const huntColor = hunt === 'long' ? '#3fb950' : hunt === 'short' ? '#ff7b72' : '#8b949e';

  const chart = useMemo(() => {
    if (!sim?.future?.length) return null;
    const pastBars = past || [];
    const all = [...pastBars.map((c) => ({ ...c, future: false })), ...sim.future];
    const levels = all.flatMap((c) => [c.h, c.l]);
    for (const m of sim.markers) levels.push(m.px);
    for (const o of plan.otherExits || []) levels.push(o.px);
    if (plan.stopPx != null) levels.push(plan.stopPx);
    if (price != null) levels.push(Number(price));
    if (hasPos) levels.push(Number(myEntry));

    let lo = Math.min(...levels);
    let hi = Math.max(...levels);
    if (!(hi > lo)) {
      lo -= 50;
      hi += 50;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const baseW = 760;
    const W = Math.round(baseW * zoom);
    // taller chart so side prices have room
    const H = Math.round(420 + (zoom - 1) * 100);
    const padL = 10;
    const padR = 132;
    const padT = 28;
    const padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const n = all.length;
    const slot = plotW / n;
    const bodyW = Math.max(2.5, slot * 0.62);
    const yOf = (px) => padT + ((hi - px) / (hi - lo)) * plotH;
    const xOf = (i) => padL + i * slot + slot / 2;

    const bodies = all.map((c, i) => {
      const up = c.c >= c.o;
      const color = c.future ? (up ? huntColor : '#ff7b72') : up ? '#3fb95088' : '#ff7b7288';
      return {
        i,
        color,
        x: xOf(i),
        yHigh: yOf(c.h),
        yLow: yOf(c.l),
        top: Math.min(yOf(c.o), yOf(c.c)),
        hBody: Math.max(1.4, Math.abs(yOf(c.c) - yOf(c.o))),
        bodyW,
        opacity: c.future ? 1 : 0.4,
      };
    });

    const markerNodes = sim.markers.map((m) => {
      let best = Math.max(0, pastBars.length - 1);
      let bestD = Infinity;
      for (let k = Math.max(0, pastBars.length - 1); k < all.length; k++) {
        const d = Math.abs(all[k].c - m.px);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      let color = '#8b949e';
      if (m.kind === 'now') color = '#58a6ff';
      else if (m.kind === 'entry') color = '#f2cc60';
      else if (m.kind === 'target' || m.kind === 'exit') color = huntColor;
      return { ...m, i: best, x: xOf(best), y: yOf(m.px), color };
    });

    if (hasPos) {
      markerNodes.push({
        key: 'my-entry',
        kind: 'your_entry',
        kindHe: 'הכניסה שלך',
        px: Number(myEntry),
        x: xOf(Math.max(0, pastBars.length - 1)),
        y: yOf(Number(myEntry)),
        color: '#f0c14a',
      });
    }

    // Price rails: one dashed line per unique price, label sits on that exact Y
    const railRaw = [];
    for (const m of markerNodes) {
      railRaw.push({
        key: m.key,
        px: m.px,
        color: m.color,
        label: labelPoint(locale, m),
        priority:
          m.kind === 'target'
            ? 5
            : m.kind === 'now'
              ? 4
              : m.kind === 'entry' || m.kind === 'your_entry'
                ? 3
                : 2,
      });
    }
    if (plan.stopPx != null) {
      railRaw.push({
        key: 'stop',
        px: plan.stopPx,
        color: '#ff7b72',
        label: pointLabel(locale, 'stop'),
        priority: 4,
      });
    }
    for (const o of plan.otherExits || []) {
      railRaw.push({
        key: o.key,
        px: o.px,
        color: o.side === 'short' ? '#ff7b72' : '#3fb950',
        label: labelPoint(locale, o),
        priority: 1,
      });
    }

    const rails = [];
    const sortedRails = [...railRaw].sort((a, b) => b.priority - a.priority || b.px - a.px);
    for (const r of sortedRails) {
      const hit = rails.find((x) => Math.abs(x.px - r.px) / Math.max(Math.abs(r.px), 1) < 0.00015);
      if (hit) {
        if (!hit.names.includes(r.label)) hit.names.push(r.label);
        if (r.priority > hit.priority) {
          hit.color = r.color;
          hit.priority = r.priority;
        }
        continue;
      }
      rails.push({
        key: r.key,
        px: r.px,
        color: r.color,
        names: [r.label],
        priority: r.priority,
      });
    }
    for (const r of rails) {
      r.y = yOf(r.px);
      r.text = `${r.names.join(' · ')} ${fmt(r.px)}`;
    }

    const padRFinal = 132;
    return {
      W,
      H,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      bodies,
      markerNodes,
      rails,
      nowX: xOf(Math.max(0, pastBars.length - 1)),
    };
  }, [sim, past, plan, huntColor, price, zoom, hasPos, myEntry, locale]);

  // projected P/L at each exit vs my entry (or plan entry)
  const exitMoneyRows = useMemo(() => {
    if (!plan?.waypoints) return [];
    const baseSide = hasPos ? mySide : plan.hunt;
    const baseEntry = hasPos
      ? Number(myEntry)
      : plan.waypoints.find((w) => w.kind === 'entry')?.px;
    if (!baseEntry || (baseSide !== 'long' && baseSide !== 'short')) return [];
    const size =
      Number(bankroll) > 0 && Number(marginX) > 0 ? Number(bankroll) * Number(marginX) : null;
    return plan.waypoints
      .filter((w) => w.kind === 'exit' || w.kind === 'target')
      .map((w) => {
        const p = pnlFromEntry(baseSide, baseEntry, w.px);
        if (!p) return { ...w, pnlPct: null, pnlUsd: null };
        return {
          ...w,
          pnlPct: p.pct,
          pnlUsd: size != null ? (size * p.pct) / 100 : null,
        };
      });
  }, [plan, hasPos, mySide, myEntry, bankroll, marginX]);

  if (!plan || !sim) {
    return (
      <section
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
        direction: dir,
      }}
    >
        <div style={{ fontSize: 13, color: '#8b949e' }}>{tr('simTitle')}</div>
        <div style={{ marginTop: 6, color: '#c9d1d9' }}>{tr('noSim')}</div>
      </section>
    );
  }

  const title = hunt === 'long' ? tr('simLong') : tr('simShort');

  return (
    <section
      style={{
        background: '#161b22',
        border: `1px solid ${huntColor}66`,
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
        direction: dir,
        ...(wide
          ? {
              position: 'relative',
              zIndex: 20,
              maxWidth: '100vw',
              width: 'calc(100vw - 24px)',
              marginRight: 'calc(50% - 50vw + 12px)',
              marginLeft: 'calc(50% - 50vw + 12px)',
            }
          : null),
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: '#8b949e' }}>{tr('simTitle')}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: huntColor, marginTop: 2 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <ZoomBtn active={zoom <= 1.01} onClick={() => setZoom(1)}>
            100%
          </ZoomBtn>
          <ZoomBtn active={Math.abs(zoom - 1.5) < 0.01} onClick={() => setZoom(1.5)}>
            150%
          </ZoomBtn>
          <ZoomBtn active={Math.abs(zoom - 2) < 0.01} onClick={() => setZoom(2)}>
            200%
          </ZoomBtn>
          <ZoomBtn active={Math.abs(zoom - 2.5) < 0.01} onClick={() => setZoom(2.5)}>
            250%
          </ZoomBtn>
          <ZoomBtn active={wide} onClick={() => setWide((v) => !v)}>
            {translateAdviceText(locale, wide ? 'חלון רגיל' : 'הגדל חלון')}
          </ZoomBtn>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>{tr('simHint')}</div>

      {plan.blockHe ? (
        <div style={{ fontSize: 12, color: '#ff7b72', marginBottom: 8 }}>
          {translateAdviceText(locale, plan.blockHe)}
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: '#c9d1d9', marginBottom: 10 }}>
        {tr('finalExit')} {fmt(plan.extremePx)}
        {plan.waypoints.find((w) => w.kind === 'entry')
          ? ` · ${tr('entry')} ${fmt(plan.waypoints.find((w) => w.kind === 'entry').px)}`
          : ''}
        {plan.stopPx != null ? ` · ${tr('stop')} ${fmt(plan.stopPx)}` : ''}
        {plan.rr != null ? ` · ${tr('rr')} ${Number(plan.rr).toFixed(2)}` : ''}
      </div>

      {hasPos && livePnl ? (
        <div
          style={{
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: livePnl.up ? '#0f2318' : '#2a1215',
            border: `1px solid ${livePnl.up ? '#3fb95066' : '#ff7b7266'}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: livePnl.up ? '#3fb950' : '#ff7b72' }}>
            {tr('openPosition')} · {mySide === 'long' ? tr('long') : tr('short')} · {tr('entry')}{' '}
            {fmt(myEntry)}
          </div>
          <div style={{ marginTop: 4, fontSize: 14, color: livePnl.up ? '#3fb950' : '#ff7b72' }}>
            {tr('now')} {livePnl.pct >= 0 ? '+' : ''}
            {livePnl.pct.toFixed(2)}%
            {liveMoney != null ? ` · ${fmtMoney(liveMoney)}` : ''}
            {sizeUsd != null ? ` · ${tr('size')} ${fmtMoney(sizeUsd).replace('+', '')}` : ''}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>{tr('noPosition')}</div>
      )}

      {chart ? (
        <div style={{ overflowX: 'auto', overflowY: 'hidden', borderRadius: 10, border: '1px solid #21262d' }}>
          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            width={chart.W}
            height={chart.H}
            style={{ display: 'block', background: '#0d1117', maxWidth: 'none' }}
          >
            {/* dashed price rails — number sits on the same Y as the line */}
            {chart.rails.map((r) => (
              <g key={r.key}>
                <line
                  x1={chart.padL}
                  x2={chart.padL + chart.plotW}
                  y1={r.y}
                  y2={r.y}
                  stroke={r.color}
                  strokeWidth={1.15}
                  strokeDasharray="5 4"
                  opacity={0.75}
                />
                <circle cx={chart.padL + chart.plotW} cy={r.y} r={2.4} fill={r.color} />
                <text
                  x={chart.padL + chart.plotW + 8}
                  y={r.y + 3}
                  fill={r.color}
                  fontSize={9}
                  fontFamily="system-ui,sans-serif"
                  fontWeight={700}
                >
                  {r.text}
                </text>
              </g>
            ))}

            <line
              x1={chart.nowX}
              x2={chart.nowX}
              y1={chart.padT}
              y2={chart.padT + chart.plotH}
              stroke="#58a6ff"
              strokeWidth={1.6}
              strokeDasharray="3 3"
            />
            <text
              x={chart.nowX + 4}
              y={chart.padT + 12}
              fill="#58a6ff"
              fontSize={10}
              fontFamily="system-ui,sans-serif"
            >
              {tr('now')}
            </text>
            <text x={chart.padL + 4} y={chart.H - 8} fill="#6e7681" fontSize={9} fontFamily="system-ui,sans-serif">
              {translateAdviceText(locale, 'עבר')}
            </text>
            <text
              x={chart.padL + chart.plotW - 36}
              y={chart.H - 8}
              fill={huntColor}
              fontSize={9}
              fontFamily="system-ui,sans-serif"
            >
              {translateAdviceText(locale, 'עתיד')}
            </text>

            {chart.bodies.map((b) => (
              <g key={b.i} opacity={b.opacity}>
                <line x1={b.x} x2={b.x} y1={b.yHigh} y2={b.yLow} stroke={b.color} strokeWidth={1.2} />
                <rect
                  x={b.x - b.bodyW / 2}
                  y={b.top}
                  width={b.bodyW}
                  height={b.hBody}
                  fill={b.color}
                  rx={0.5}
                />
              </g>
            ))}

            {chart.markerNodes.map((m) => (
              <g key={m.key}>
                <circle cx={m.x} cy={m.y} r={m.kind === 'target' || m.kind === 'mine' ? 7 : 5} fill={m.color} />
                <circle cx={m.x} cy={m.y} r={2.2} fill="#0d1117" />
              </g>
            ))}
          </svg>
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>
          {tr('exitsOnPath')} · {hasPos ? tr('vsYourEntry') : tr('vsPathEntry')}
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {plan.waypoints.map((w, i) => {
            const c =
              w.kind === 'now'
                ? '#58a6ff'
                : w.kind === 'entry'
                  ? '#f2cc60'
                  : huntColor;
            const money = exitMoneyRows.find((e) => e.key === w.key);
            return (
              <div
                key={w.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: '#0d1117',
                  border: `1px solid ${c}44`,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: `${c}22`,
                    color: c,
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{labelPoint(locale, w)}</div>
                  <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                    {translateAdviceText(locale, w.name)}
                  </div>
                  {money?.pnlPct != null ? (
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        color: money.pnlPct >= 0 ? '#3fb950' : '#ff7b72',
                      }}
                    >
                      {money.pnlPct >= 0 ? '+' : ''}
                      {money.pnlPct.toFixed(2)}%
                      {money.pnlUsd != null ? ` · ${fmtMoney(money.pnlUsd)}` : ''}
                    </div>
                  ) : null}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{fmt(w.px)}</div>
              </div>
            );
          })}
          {plan.stopPx != null ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr auto',
                gap: 8,
                alignItems: 'center',
                padding: '8px 10px',
                borderRadius: 10,
                background: '#0d1117',
                border: '1px solid #ff7b7244',
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: '#ff7b7222',
                  color: '#ff7b72',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                  {locale === 'he' || locale === 'ar' ? 'ס' : 'S'}
                </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ff7b72' }}>{tr('forcedStop')}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#ff7b72' }}>{fmt(plan.stopPx)}</div>
            </div>
          ) : null}
        </div>
      </div>

      {plan.otherExits?.length ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>
            {hunt === 'long' ? tr('otherShorts') : tr('otherLongs')}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {plan.otherExits.map((o) => {
              const c = o.side === 'short' ? '#ff7b72' : '#3fb950';
              return (
                <div
                  key={o.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: '#0d1117',
                    border: `1px dashed ${c}55`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{labelPoint(locale, o)}</div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                      {translateAdviceText(locale, o.name)}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{fmt(o.px)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
