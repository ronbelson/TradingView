'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '@/lib/version';
import CandleHuntChart from '@/components/CandleHuntChart';
import LangSquares from '@/components/LangSquares';
import {
  DEFAULT_LOCALE,
  formatAgo,
  leanLabel,
  localeMeta,
  pointLabel,
  resolveInitialLocale,
  t,
  translateAdviceText,
  writeLocale,
} from '@/lib/i18n';
import { layerSideHe, layerTone } from '@/lib/tf-tone';
const REFRESH_MS = 5000;

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Notional = margin * leverage. Stop risk $ = notional * stop distance %. */
function sizeFromMargin(bankroll, marginX, riskPct) {
  const cap = Number(bankroll);
  const x = Number(marginX);
  const rp = Number(riskPct);
  if (!(cap > 0) || !(x > 0)) return null;
  const sizeUsd = cap * x;
  const riskUsd = rp > 0 ? (sizeUsd * rp) / 100 : null;
  return { sizeUsd, riskUsd, marginUsd: cap, marginX: x };
}

function formatAgoHe(raw, nowMs = Date.now()) {
  if (raw == null || raw === '') return '';
  let t = null;
  if (typeof raw === 'number') t = raw < 1e12 ? raw * 1000 : raw;
  else {
    const parsed = Date.parse(String(raw));
    t = Number.isFinite(parsed) ? parsed : null;
  }
  if (t == null || !Number.isFinite(t)) return '';
  let sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 20) return 'לפני רגע';
  if (sec < 60) return 'לפני פחות מדקה';
  const mins = Math.floor(sec / 60);
  if (mins === 1) return 'לפני דקה';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours === 1 && remMins === 0) return 'לפני שעה';
  if (hours === 1) return `לפני שעה ו${remMins} דקות`;
  if (hours === 2 && remMins === 0) return 'לפני שעתיים';
  if (hours < 24 && remMins === 0) return `לפני ${hours} שעות`;
  if (hours < 24) return `לפני ${hours} שעות ו${remMins} דקות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'לפני יום';
  return `לפני ${days} ימים`;
}

function leanColor(lean) {
  if (lean === 'long') return '#3fb950';
  if (lean === 'short') return '#ff7b72';
  return '#8b949e';
}

function TargetPathChart({ path, locale = 'en' }) {
  if (!path?.steps?.length) return null;
  const color = path.hunt === 'long' ? '#3fb950' : '#ff7b72';
  const tr = (key) => t(locale, key);
  const tx = (s) => translateAdviceText(locale, s);
  return (
    <section style={{ ...box, borderColor: `${color}66` }}>
      <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>{tr('pathDetail')}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginBottom: 6 }}>{tx(path.huntHe)}</div>
      <div style={{ fontSize: 13, color: '#c9d1d9', marginBottom: 12 }}>
        {tr('entry')} {fmt(path.entryPx)}
        {path.targetPx != null ? ` · ${tr('target')} ${fmt(path.targetPx)}` : ''}
        {path.stopPx != null ? ` · ${tr('stop')} ${fmt(path.stopPx)}` : ''}
        {path.rr != null ? ` · ${tr('rr')}${path.rr.toFixed(2)}` : ''}
      </div>
      {path.blockHe ? (
        <div style={{ fontSize: 12, color: '#ff7b72', marginBottom: 10 }}>{tx(path.blockHe)}</div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gap: 6,
          direction: uiDir(locale),
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 8,
            bottom: 8,
            insetInlineStart: 16,
            width: 2,
            background: `linear-gradient(180deg, ${color}66, #58a6ff66, ${color}33)`,
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
        {path.steps.map((s, i) => {
          const isNow = s.kind === 'now';
          const isEntry = s.kind === 'entry';
          const isStop = s.kind === 'stop';
          const isTarget = s.kind === 'target';
          const c = isNow
            ? '#58a6ff'
            : isStop
              ? '#ff7b72'
              : isTarget || isEntry
                ? color
                : s.dir === 'up'
                  ? '#3fb950'
                  : s.dir === 'down'
                    ? '#ff7b72'
                    : '#8b949e';
          const kindShow = pointLabel(locale, s.kind, { final: isTarget }) || tx(s.kindHe);
          const dirShow = s.dirHe ? tx(s.dirHe) : '';
          return (
            <div
              key={`${s.kind}-${s.px}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr auto',
                gap: 8,
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 10,
                background: isNow || isEntry ? '#111b27' : '#0d1117',
                border: `1px solid ${c}44`,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: c,
                  boxShadow: `0 0 0 3px ${c}22`,
                }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c }}>
                  {kindShow}
                  {dirShow ? ` · ${dirShow}` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{tx(s.name)}</div>
                {s.rewardPct != null ? (
                  <div style={{ fontSize: 11, color: '#3fb950', marginTop: 2 }}>
                    {tx('רווח ')}
                    {s.rewardPct.toFixed(2)}%
                    {s.rr != null ? ` · ${tr('rr')}${s.rr.toFixed(2)}` : ''}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{fmt(s.px)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TfStatesRow({ items, locale = 'en' }) {
  if (!items?.length) return null;
  const tx = (s) => translateAdviceText(locale, s);
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14,
        direction: uiDir(locale),
      }}
    >
      {items.map((row) => {
        const color =
          row.side === 'long' ? '#3fb950' : row.side === 'short' ? '#ff7b72' : '#8b949e';
        const roleColor =
          row.role === 'pullback' || row.role === 'bounce'
            ? '#f2cc60'
            : row.role === 'continuation_up' || row.role === 'continuation_dn'
              ? color
              : '#8b949e';
        return (
          <div
            key={row.tf}
            style={{
              background: '#0d1117',
              border: `1px solid ${color}55`,
              borderRadius: 10,
              padding: '8px 10px',
              fontSize: 12,
              minWidth: 88,
              maxWidth: 200,
            }}
          >
            <div style={{ fontWeight: 800, color }}>{row.tf}</div>
            <div style={{ color: '#c9d1d9', marginTop: 2 }}>{tx(row.sideHe)}</div>
            <div style={{ color: '#8b949e', marginTop: 2, fontSize: 11 }}>
              {row.bub} · {row.zap}
              {row.macdPhaseHe ? ` · ${tx(row.macdPhaseHe)}` : ''}
            </div>
            {row.rsi != null ? (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color:
                    row.rsiZone === 'turbo_up'
                      ? '#3fb950'
                      : row.rsiZone === 'turbo_dn'
                        ? '#ff7b72'
                        : '#8b949e',
                }}
              >
                RSI {Number(row.rsi).toFixed(0)}
                {row.rsiZoneHe ? ` · ${tx(row.rsiZoneHe)}` : ''}
              </div>
            ) : null}
            {row.pivotStackHe ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  lineHeight: 1.35,
                  color:
                    row.pivotStack?.id === 'stretch_up' || row.pivotStack?.id === 'stretch_dn'
                      ? '#f2cc60'
                      : '#8b949e',
                }}
              >
                {tx(row.pivotStackHe)}
                {row.pivotStack?.up?.distPct != null
                  ? ` · ↑${row.pivotStack.up.distPct.toFixed(2)}%`
                  : ''}
                {row.pivotStack?.dn?.distPct != null
                  ? ` · ↓${row.pivotStack.dn.distPct.toFixed(2)}%`
                  : ''}
              </div>
            ) : null}
            {row.roleHe && row.role !== 'root' ? (
              <div style={{ color: roleColor, marginTop: 4, fontSize: 10, lineHeight: 1.35 }}>
                {row.parentTf ? `${tx('מול')} ${row.parentTf}: ` : ''}
                {tx(row.roleHe)}
                {row.historyHe ? ` · ${tx(row.historyHe)}` : ''}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DualChart({ chart, myEntry, mySide, bankroll, marginX, longEntry, shortEntry, locale = 'en' }) {
  if (!chart || chart.length < 2) return null;
  const longSize = sizeFromMargin(bankroll, marginX, longEntry?.riskPct);
  const shortSize = sizeFromMargin(bankroll, marginX, shortEntry?.riskPct);

  const extra = [];
  if (myEntry != null && Number.isFinite(myEntry) && (mySide === 'long' || mySide === 'short')) {
    extra.push({
      side: 'mine',
      px: myEntry,
      label: 'הכניסה שלך',
      name: 'הכניסה שלך',
      hint: mySide === 'long' ? 'פוזיציית לונג' : 'פוזיציית שורט',
      long: null,
      short: null,
    });
  }
  const merged = [...chart, ...extra];
  const sorted = [...merged]
    .sort((a, b) => b.px - a.px)
    .reduce((acc, p) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last.px - p.px) / Math.abs(p.px) < 0.0005) {
        if (p.side === 'now' || p.side === 'mine') {
          acc[acc.length - 1] = {
            ...last,
            ...p,
            long: p.long || last.long,
            short: p.short || last.short,
            name: last.name || p.name,
            label: last.label || p.label,
          };
        } else {
          acc[acc.length - 1] = {
            ...last,
            long: last.long || p.long,
            short: last.short || p.short,
            name: last.name || p.name,
          };
        }
        return acc;
      }
      acc.push(p);
      return acc;
    }, []);

  const tx = (s) => translateAdviceText(locale, s);
  const trLoc = (key) => t(locale, key);

  function SideLine({ tag, meta, color, size }) {
    if (!meta) return null;
    const bits = [tx(meta.roleHe) || (tag === 'long' ? trLoc('long') : trLoc('short'))];
    if (meta.riskPct != null && (meta.role === 'stop' || meta.role === 'protect' || meta.role === 'entry')) {
      bits.push(`${tx('סיכון ')}${meta.riskPct.toFixed(2)}%`);
    }
    if (meta.rewardPct != null && (meta.role === 'step' || meta.role === 'target')) {
      bits.push(`${tx('רווח ')}${meta.rewardPct.toFixed(2)}%`);
    }
    if (meta.rr != null && (meta.role === 'step' || meta.role === 'target')) {
      bits.push(`${tx('1 ל-')}${meta.rr.toFixed(2)}`);
    }
    let money = null;
    if (size && meta.role === 'entry') money = `${tx('נכנס ')}${fmtMoney(size.sizeUsd)}`;
    if (size?.riskUsd != null && meta.role === 'stop') money = `${tx('יציאה ')}${fmtMoney(size.riskUsd)}`;
    if (size && meta.rewardPct != null && (meta.role === 'step' || meta.role === 'target')) {
      money = `${tx('רווח ')}${fmtMoney((size.sizeUsd * meta.rewardPct) / 100)}`;
    }
    return (
      <div style={{ fontSize: 11, color, marginTop: 3, lineHeight: 1.35 }}>
        <span style={{ fontWeight: 700 }}>{tag === 'long' ? trLoc('long') : trLoc('short')}</span>
        {' · '}
        {bits.join(' · ')}
        {money ? ` · ${money}` : ''}
      </div>
    );
  }

  const d = uiDir(locale);
  return (
    <div style={{ display: 'grid', gap: 0, direction: d, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          bottom: 12,
          insetInlineStart: 18,
          width: 2,
          background: 'linear-gradient(180deg, #3fb95055, #58a6ff55, #ff7b7255)',
          borderRadius: 2,
          pointerEvents: 'none',
        }}
      />
      {sorted.map((p, idx) => {
        const isNow = p.side === 'now';
        const isMine = p.side === 'mine';
        const isLongEntry = p.long?.role === 'entry';
        const isShortEntry = p.short?.role === 'entry';
        const color = isNow
          ? '#58a6ff'
          : isMine
            ? '#f2cc60'
            : isLongEntry
              ? '#3fb950'
              : isShortEntry
                ? '#ff7b72'
                : p.side === 'up'
                  ? '#3fb950'
                  : '#ff7b72';
        const bg = isNow ? '#111b27' : isMine ? '#221f12' : isLongEntry || isShortEntry ? '#121a14' : '#0d1117';
        return (
          <div
            key={`${p.side}-${p.px}-${idx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr auto',
              gap: 10,
              alignItems: 'start',
              background: bg,
              border: `1px solid ${color}44`,
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: color,
                boxShadow: `0 0 0 3px ${color}22`,
                marginTop: 4,
              }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>
                {tx(p.name || p.label)}
              </div>
              {isNow || isMine ? (
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3 }}>
                  {tx(p.hint || (isNow ? 'מחיר נוכחי' : 'הפוזיציה שלך'))}
                </div>
              ) : (
                <>
                  <SideLine tag="long" meta={p.long} color="#3fb950" size={longSize} />
                  <SideLine tag="short" meta={p.short} color="#ff7b72" size={shortSize} />
                  {!p.long && !p.short ? (
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3 }}>{tx('רמה')}</div>
                  ) : null}
                </>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.02em' }}>
              {fmt(p.px)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TfStrip({ items, locale = 'en' }) {
  if (!items?.length) return null;
  const tx = (s) => translateAdviceText(locale, s);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, direction: uiDir(locale) }}>
      {items.map((row) => {
        const color =
          row.tone === 'long' ? '#3fb950' : row.tone === 'short' ? '#ff7b72' : '#8b949e';
        return (
          <div
            key={row.tf}
            style={{
              background: '#0d1117',
              border: `1px solid ${color}55`,
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 700, color }}>{row.tf}</span>
            {row.roleHe ? <span style={{ color: '#8b949e' }}> · {tx(row.roleHe)}</span> : null}
            <span style={{ color: '#c9d1d9' }}> · {tx(row.text)}</span>
          </div>
        );
      })}
    </div>
  );
}

function tfTone(t) {
  return layerTone(t);
}

function tfRoleHe(tf, role) {
  if (tf === '15m') return 'תזמון מהיר';
  if (tf === '30m') return 'תזמון';
  if (tf === '1H' || tf === '2H') return 'סטאפ';
  if (tf === '4H') return 'מרכז';
  if (role === 'wide') return 'הטייה';
  return role === 'near' ? 'קרוב' : 'רחב';
}

/** Visual TF ladder — same lean as chips (layerTone). */
function TfChartBoard({ tfs, price, locale = 'en', relations = null }) {
  // Top-down: Week first, then children (parent above child)
  const order = ['Week', '3D', 'Day', '4H', '2H', '1H', '30m', '15m'];
  const rows = order
    .map((name) => (tfs || []).find((row) => row.tf === name))
    .filter(Boolean);
  if (!rows.length) return null;

  const d = uiDir(locale);
  const tx = (s) => translateAdviceText(locale, s);
  const relByTf = Object.fromEntries((relations?.rows || []).map((r) => [r.tf, r]));
  return (
    <div style={{ display: 'grid', gap: 8, direction: d, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 10,
          bottom: 10,
          insetInlineStart: 18,
          width: 2,
          background: 'linear-gradient(180deg, #58a6ff55, #3fb95055, #ff7b7255)',
          borderRadius: 2,
          pointerEvents: 'none',
        }}
      />
      {rows.map((row) => {
        const tone = layerTone(row);
        const rel = relByTf[row.tf];
        const color =
          row.tf === '4H'
            ? '#58a6ff'
            : row.tf === '15m'
              ? '#f2cc60'
              : tone === 'long'
                ? '#3fb950'
                : tone === 'short'
                  ? '#ff7b72'
                  : '#8b949e';
        const isCenter = row.tf === '4H';
        const isFast = row.tf === '15m';
        const macdHe = row.macdPhaseHe || null;
        return (
          <div
            key={row.tf}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr auto',
              gap: 10,
              alignItems: 'start',
              background: isCenter ? '#111b27' : isFast ? '#1a1810' : '#0d1117',
              border: `1px solid ${color}55`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: color,
                boxShadow: `0 0 0 3px ${color}22`,
                marginTop: 4,
              }}
            />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color }}>
                {row.tf}
                <span style={{ color: '#8b949e', fontWeight: 600, fontSize: 12 }}>
                  {' '}
                  · {tx(tfRoleHe(row.tf, row.role))}
                </span>
              </div>
              {rel?.roleHe && rel.role !== 'root' ? (
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    color:
                      rel.role === 'pullback' || rel.role === 'bounce' ? '#f2cc60' : '#c9d1d9',
                    lineHeight: 1.4,
                  }}
                >
                  {rel.parentTf ? `${tx('מול')} ${rel.parentTf} · ` : ''}
                  {tx(rel.roleHe)}
                  {rel.historyHe ? ` · ${tx(rel.historyHe)}` : ''}
                </div>
              ) : null}
              <div style={{ fontSize: 13, color: '#c9d1d9', marginTop: 4, lineHeight: 1.45 }}>
                {tx('בועה')} {tx(row.bubHe) || row.bub}
                {row.bubPx != null ? ` ${fmt(row.bubPx)}` : ''}
                {row.oppPx != null ? ` · ${tx('מסע מ')}${fmt(row.oppPx)}` : ''}
                {row.swingPct != null ? ` · ${row.swingPct.toFixed(2)}%` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                {tx('צבע')} {row.channel || '-'} · {tx('זאפ')} {row.zap || '-'} · {tx('ממוצעים')}{' '}
                {row.stack || '-'}
                {macdHe ? ` · ${tx(macdHe)}` : ''}
                {row.rsi != null
                  ? ` · RSI ${Number(row.rsi).toFixed(0)}${row.rsiZoneHe ? ` ${tx(row.rsiZoneHe)}` : ''}`
                  : ''}
              </div>
              {row.pivotStack?.he ? (
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    color:
                      row.pivotStack.id === 'stretch_up' || row.pivotStack.id === 'stretch_dn'
                        ? '#f2cc60'
                        : '#c9d1d9',
                    lineHeight: 1.4,
                  }}
                >
                  {tx(row.pivotStack.he)}
                  {row.pivotStack.up
                    ? ` · ${tx('מעלה')} ${row.pivotStack.up.distPct.toFixed(2)}%`
                    : ''}
                  {row.pivotStack.dn
                    ? ` · ${tx('מטה')} ${row.pivotStack.dn.distPct.toFixed(2)}%`
                    : ''}
                  {row.pivotStack.swingPct != null
                    ? ` · ${tx('מסע')} ${row.pivotStack.swingPct.toFixed(2)}%`
                    : ''}
                </div>
              ) : null}
              {(row.up?.px != null || row.down?.px != null) && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {row.up?.px != null ? (
                    <span style={{ color: '#3fb950' }}>
                      {tx('מעלה')} {fmt(row.up.px)}
                    </span>
                  ) : null}
                  {row.up?.px != null && row.down?.px != null ? (
                    <span style={{ color: '#8b949e' }}> · </span>
                  ) : null}
                  {row.down?.px != null ? (
                    <span style={{ color: '#ff7b72' }}>
                      {tx('מטה')} {fmt(row.down.px)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'end' }}>
              <div style={{ fontSize: 11, color, fontWeight: 700 }}>{tx(layerSideHe(tone))}</div>
              {price != null && row.bubPx != null ? (
                <div style={{ fontSize: 12, color: '#c9d1d9', marginTop: 4 }}>
                  {(((price - row.bubPx) / row.bubPx) * 100).toFixed(2)}% {tx('מבועה')}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MarginSizeBox({ bankroll, setBankroll, marginX, setMarginX, locale = 'en' }) {
  const tr = (key) => t(locale, key);
  const tx = (s) => translateAdviceText(locale, s);
  const x = Math.min(10, Math.max(1, Number(marginX) || 2));
  const cap = Number(bankroll);
  const sizeUsd = Number.isFinite(cap) && cap > 0 ? cap * x : null;
  return (
    <section style={boxDir(locale)}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{tr('size')}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <span style={{ color: '#8b949e', width: 90 }}>{tr('margin')}</span>
          <input
            type="number"
            min={0}
            step={100}
            value={bankroll}
            onChange={(e) => setBankroll(e.target.value)}
            placeholder="10000"
            style={{
              flex: 1,
              background: '#0d1117',
              border: '1px solid #30363d',
              color: '#e6edf3',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 16,
            }}
          />
        </label>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              fontSize: 14,
            }}
          >
            <span style={{ color: '#8b949e' }}>{tr('leverage')}</span>
            <span style={{ fontWeight: 800, color: '#f2cc60' }}>×{x}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={x}
            onChange={(e) => setMarginX(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#8b949e',
              marginTop: 4,
            }}
          >
            <span>1</span>
            <span>10</span>
          </div>
        </div>
        {sizeUsd != null ? (
          <div style={{ fontSize: 13, color: '#c9d1d9' }}>
            {tx('נכנסים בפוזיציה ')}{fmtMoney(sizeUsd)}
            <span style={{ color: '#8b949e' }}> · {tx('מרגין ')}{fmtMoney(cap)} × {x}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#8b949e' }}>{tx('הזן מרגין כדי לחשב כמה כסף נכנסים')}</div>
        )}
      </div>
    </section>
  );
}

function PositionBox({ locale = 'en', price, advice, side, setSide, entry, setEntry }) {
  const tx = (s) => translateAdviceText(locale, s);
  const tr = (key) => t(locale, key);
  const entryPx = Number(entry);
  const hasPos = (side === 'long' || side === 'short') && Number.isFinite(entryPx) && entryPx > 0;
  const plan = side === 'long' ? advice?.longEntry : side === 'short' ? advice?.shortEntry : null;

  let pnlPct = null;
  if (hasPos && price != null) {
    pnlPct =
      side === 'long'
        ? ((price - entryPx) / entryPx) * 100
        : ((entryPx - price) / entryPx) * 100;
  }

  let toStopPct = null;
  let toTargetPct = null;
  if (hasPos && plan?.stopPx != null) {
    toStopPct =
      side === 'long'
        ? ((entryPx - plan.stopPx) / entryPx) * 100
        : ((plan.stopPx - entryPx) / entryPx) * 100;
  }
  if (hasPos && plan?.targetPx != null) {
    toTargetPct =
      side === 'long'
        ? ((plan.targetPx - entryPx) / entryPx) * 100
        : ((entryPx - plan.targetPx) / entryPx) * 100;
  }

  const pnlColor = pnlPct == null ? '#8b949e' : pnlPct >= 0 ? '#3fb950' : '#ff7b72';
  const boxLocal = boxDir(locale);

  return (
    <section style={boxLocal}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{tr('yourPosition')}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'none', label: tr('none') },
            { id: 'long', label: tr('long') },
            { id: 'short', label: tr('short') },
          ].map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSide(b.id)}
              style={{
                border: `1px solid ${side === b.id ? '#58a6ff' : '#30363d'}`,
                background: side === b.id ? '#111b27' : '#0d1117',
                color: '#e6edf3',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <span style={{ color: '#8b949e', width: 90 }}>{tr('entry')}</span>
          <input
            type="number"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="e.g. 64400"
            style={{
              flex: 1,
              background: '#0d1117',
              border: '1px solid #30363d',
              color: '#e6edf3',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 16,
            }}
          />
        </label>

        {hasPos ? (
          <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
              <span style={{ color: '#8b949e' }}>{tx('מצב מול כניסה')}</span>
              <span style={{ fontWeight: 800, color: pnlColor }}>
                {pnlPct >= 0 ? '+' : ''}
                {pnlPct.toFixed(2)}%
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#c9d1d9' }}>
              {tx('נכנסת ב־')}{fmt(entryPx)}{tx(' · עכשיו ')}{fmt(price)}
            </div>
            {plan?.stopPx != null ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8b949e' }}>{tx('עד סטופ מומלץ ')}{fmt(plan.stopPx)}</span>
                <span style={{ color: '#ff7b72' }}>
                  {toStopPct != null ? `${toStopPct.toFixed(2)}%` : '-'}
                </span>
              </div>
            ) : null}
            {plan?.targetPx != null ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8b949e' }}>{tx('עד יעד מומלץ ')}{fmt(plan.targetPx)}</span>
                <span style={{ color: '#3fb950' }}>
                  {toTargetPct != null ? `${toTargetPct.toFixed(2)}%` : '-'}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#8b949e' }}>
            {tx('בחר לונג או שורט והזן מחיר כניסה כדי לראות איפה אתה ביחס להמשך')}
          </div>
        )}
      </div>
    </section>
  );
}

function EntryCard({ title, color, entry, preferred, bankroll, marginX, locale = 'en' }) {
  const tx = (s) => translateAdviceText(locale, s);
  const blocked = entry?.executable === false;
  const rrOk = entry?.rr != null && entry.rr >= 1.5;
  const j = entry?.journey;
  const entrySize = sizeFromMargin(bankroll, marginX, entry?.riskPct);
  const mx = Number(marginX) || 2;
  return (
    <div
      style={{
        background: preferred && !blocked ? '#121a14' : '#0d1117',
        border: `1px solid ${blocked ? '#ff7b7255' : preferred ? color : '#30363d'}`,
        borderRadius: 14,
        padding: 16,
        opacity: blocked ? 0.7 : preferred ? 1 : 0.85,
      }}
    >
      <div style={{ fontSize: 14, color: blocked ? '#ff7b72' : color, fontWeight: 700, marginBottom: 8 }}>
        {title}
        {blocked ? tx(' · פסול') : ''}
      </div>
      {entry?.px != null ? (
        <>
          {blocked && entry.blockHe ? (
            <div
              style={{
                fontSize: 12,
                color: '#ff7b72',
                marginBottom: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: '#1a1010',
                border: '1px solid #ff7b7233',
              }}
            >
              {tx(entry.blockHe)}
            </div>
          ) : null}
          {j?.fromPx != null ? (
            <div
              style={{
                fontSize: 12,
                color: '#8b949e',
                marginBottom: 10,
                lineHeight: 1.45,
                borderBottom: '1px solid #21262d',
                paddingBottom: 8,
              }}
            >
              {tx('מסע בועה ')}{tx(j.bubHe) || j.bub}
              {j.fromPx != null ? ` · from ${fmt(j.fromPx)}` : ''}
              {j.swingPct != null ? ` · ${j.swingPct.toFixed(2)}%` : ''}
              {j.bubPx != null ? ` · ${tx('בועה ')}${fmt(j.bubPx)}` : ''}
            </div>
          ) : null}

          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color }}>{fmt(entry.px)}</div>
          <div style={{ fontSize: 13, color: '#c9d1d9', marginTop: 6 }}>{tx(entry.name)}</div>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>{tx(entry.statusHe)}</div>
          {entrySize ? (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 10,
                background: '#111b27',
                border: `1px solid ${color}44`,
                fontSize: 13,
              }}
            >
              <div style={{ color: '#8b949e', marginBottom: 4 }}>{tx('נכנס בכסף')}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmtMoney(entrySize.sizeUsd)}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#8b949e' }}>
                {tx('מרגין ')}{fmtMoney(entrySize.marginUsd)} × {mx}
              </div>
              {entrySize.riskUsd != null ? (
                <div style={{ marginTop: 4, color: '#ff7b72', fontSize: 12 }}>
                  {tx('יציאה בסטופ ')}{fmtMoney(entrySize.riskUsd)}{tx(' · רמה ראשונה למטה')}
                </div>
              ) : null}
            </div>
          ) : null}

          {entry.riskPct != null ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 6,
                marginTop: 10,
                fontSize: 11,
              }}
            >
              <div>
                <div style={{ color: '#8b949e' }}>{tx('סיכון')}</div>
                <div style={{ color: '#ff7b72', fontWeight: 700 }}>{entry.riskPct.toFixed(2)}%</div>
              </div>
              <div>
                <div style={{ color: '#8b949e' }}>{tx('רווח ראשון')}</div>
                <div style={{ color: '#3fb950', fontWeight: 700 }}>
                  {entry.rewardPct != null ? `${entry.rewardPct.toFixed(2)}%` : '-'}
                </div>
              </div>
              <div>
                <div style={{ color: '#8b949e' }}>{tx('יחס')}</div>
                <div style={{ color: rrOk ? '#3fb950' : '#e6edf3', fontWeight: 700 }}>
                  {entry.rr != null ? `${tx('1 ל-')}${entry.rr.toFixed(2)}` : '-'}
                </div>
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 8, fontSize: 11, color: '#8b949e' }}>
            {tx('המסלול המלא בסולם הרמות למעלה')}
          </div>
        </>
      ) : (
        <div style={{ color: '#8b949e' }}>{tx('אין אזור ברור')}</div>
      )}
    </div>
  );
}

const box = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: 14,
  padding: 16,
  marginBottom: 14,
};

function uiDir(locale) {
  return localeMeta(locale)?.dir || 'ltr';
}

function boxDir(locale) {
  return { ...box, direction: uiDir(locale) };
}

function thStyle(locale) {
  return { padding: '8px 6px', fontWeight: 600, color: '#8b949e', textAlign: 'start' };
}
const td = { padding: '8px 6px', color: '#e6edf3' };

function Fold({ title, open, onToggle, children, locale = 'en' }) {
  return (
    <section style={{ ...boxDir(locale), padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          background: 'transparent',
          border: 0,
          color: '#e6edf3',
          cursor: 'pointer',
          padding: '14px 16px',
          fontSize: 15,
          fontWeight: 700,
          direction: uiDir(locale),
        }}
      >
        <span>{title}</span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid #30363d',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8b949e',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? <div style={{ padding: '0 16px 16px' }}>{children}</div> : null}
    </section>
  );
}

function TfTable({ tfs, locale = 'en' }) {
  const th = thStyle(locale);
  return (
    <div style={{ overflowX: 'auto', direction: uiDir(locale) }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
        <thead>
          <tr>
            <th style={th}>TF</th>
            <th style={th}>{translateAdviceText(locale, 'תפקיד')}</th>
            <th style={th}>{translateAdviceText(locale, 'בועה')}</th>
            <th style={th}>{translateAdviceText(locale, 'מסע מ')}</th>
            <th style={th}>%</th>
            <th style={th}>{translateAdviceText(locale, 'צבע')}</th>
            <th style={th}>{translateAdviceText(locale, 'זאפ')}</th>
            <th style={th}>{translateAdviceText(locale, 'ממוצעים')}</th>
            <th style={th}>{translateAdviceText(locale, 'מעלה')}</th>
            <th style={th}>{translateAdviceText(locale, 'מטה')}</th>
            <th style={th}>POC</th>
          </tr>
        </thead>
        <tbody>
          {(tfs || []).map((t) => (
            <tr
              key={t.tf}
              style={{
                borderTop: '1px solid #21262d',
                background: t.role === 'center' ? '#1a2330' : 'transparent',
              }}
            >
              <td style={td}>{t.tf}</td>
              <td style={td}>{translateAdviceText(locale, t.role === 'center' ? 'מרכז' : t.role === 'near' ? 'קרוב' : 'רחב')}</td>
              <td style={td}>
                {t.bub} {t.bubPx != null ? fmt(t.bubPx) : ''}
              </td>
              <td style={td}>{fmt(t.oppPx)}</td>
              <td style={td}>{t.swingPct != null ? t.swingPct.toFixed(2) : '-'}</td>
              <td style={td}>{t.channel}</td>
              <td style={td}>{t.zap}</td>
              <td style={td}>{t.stack}</td>
              <td style={{ ...td, color: '#3fb950' }}>{fmt(t.up?.px)}</td>
              <td style={{ ...td, color: '#ff7b72' }}>{fmt(t.down?.px)}</td>
              <td style={td}>{fmt(t.poc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HomePage() {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [langReady, setLangReady] = useState(false);
  const [scene, setScene] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [showMap, setShowMap] = useState(true);
  const [showTfs, setShowTfs] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [posSide, setPosSide] = useState('none');
  const [posEntry, setPosEntry] = useState('');
  const [bankroll, setBankroll] = useState('10000');
  const [marginX, setMarginX] = useState(2);
  const [posReady, setPosReady] = useState(false);

  const dir = localeMeta(locale).dir;
  const tr = useMemo(() => (key) => t(locale, key), [locale]);

  useEffect(() => {
    const initial = resolveInitialLocale();
    setLocale(initial);
    writeLocale(initial);
    setLangReady(true);
  }, []);

  function changeLocale(next) {
    setLocale(next);
    writeLocale(next);
  }

  useEffect(() => {
    try {
      const s = localStorage.getItem('btc_pos_side');
      const e = localStorage.getItem('btc_pos_entry');
      const b = localStorage.getItem('btc_bankroll');
      const r = localStorage.getItem('btc_margin_x') || localStorage.getItem('btc_risk_scale');
      if (s === 'long' || s === 'short' || s === 'none') setPosSide(s);
      if (e != null) setPosEntry(e);
      if (b != null && b !== '') setBankroll(b);
      const rn = Number(r);
      if (Number.isFinite(rn) && rn >= 1 && rn <= 10) setMarginX(rn);
    } catch {
      // ignore
    }
    setPosReady(true);
  }, []);

  useEffect(() => {
    if (!posReady) return;
    try {
      localStorage.setItem('btc_pos_side', posSide);
      localStorage.setItem('btc_pos_entry', posEntry);
      localStorage.setItem('btc_bankroll', bankroll);
      localStorage.setItem('btc_margin_x', String(marginX));
    } catch {
      // ignore
    }
  }, [posSide, posEntry, bankroll, marginX, posReady]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tv/latest', { cache: 'no-store' });
      const data = await res.json();
      if (!data?.ok) throw new Error('bad');
      setScene(data.scene || null);
      setErr('');
      setNow(Date.now());
    } catch {
      setErr('loadError');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const ago = formatAgo(locale, scene?.asOf, now);
  const advice = scene?.advice;
  const col = leanColor(advice?.lean);
  const myEntryPx = Number(posEntry);
  const myHasPos =
    (posSide === 'long' || posSide === 'short') && Number.isFinite(myEntryPx) && myEntryPx > 0;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
        padding: '20px 16px 40px',
        direction: dir,
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <header
          style={{
            direction: dir,
            marginBottom: 16,
            padding: '12px 14px',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            <img
              src="/icon.svg"
              alt=""
              width={28}
              height={28}
              style={{ borderRadius: 8, border: '1px solid #30363d' }}
            />
            BTC CHEF - {tr('version')} {APP_VERSION}
          </div>
          <div style={{ marginTop: 8 }}>
            <a href="/report" style={{ color: '#58a6ff', fontWeight: 700, fontSize: 14 }}>
              מצב עכשיו · כניסות ויציאות
            </a>
          </div>
          <div
            style={{
              marginTop: 6,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: '6px 12px',
              fontSize: 15,
            }}
          >
            {scene?.price != null ? (
              <span style={{ fontWeight: 700, color: '#58a6ff' }}>{fmt(scene.price)}</span>
            ) : (
              <span style={{ color: '#8b949e' }}>{tr('noPrice')}</span>
            )}
            {ago ? (
              <span style={{ color: '#8b949e' }}>
                {tr('updated')} {ago}
              </span>
            ) : null}
            {err ? <span style={{ color: '#ff7b72' }}>{tr(err) === err ? tr('loadError') : tr(err)}</span> : null}
          </div>
        </header>

        {!scene?.ok ? (
          <section style={boxDir(locale)}>
            <div style={{ color: '#8b949e' }}>{tr('waitingHook')}</div>
          </section>
        ) : (
          <>
            <section
              style={{
                ...box,
                background: 'linear-gradient(180deg, #141b24 0%, #161b22 100%)',
                borderColor: `${col}66`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 14,
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 13, color: '#8b949e' }}>{tr('recommendNow')}</div>
                {langReady ? (
                  <LangSquares locale={locale} onChange={changeLocale} label={tr('lang')} />
                ) : null}
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: col, letterSpacing: '-0.03em' }}>
                {leanLabel(locale, advice?.lean, advice?.leanHe)}
              </div>
              <div style={{ fontSize: 16, marginTop: 8, color: '#e6edf3' }}>
                {translateAdviceText(locale, advice?.headline)}
              </div>
              {advice?.huntHe ? (
                <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: '#f2cc60' }}>
                  {translateAdviceText(locale, advice.huntHe)}
                </div>
              ) : null}
              {advice?.wave?.feedbackHe || advice?.wave?.biasZoneHe ? (
                <div style={{ marginTop: 8, fontSize: 13, color: '#f2cc60' }}>
                  {translateAdviceText(locale, advice.wave.feedbackHe || advice.wave.biasZoneHe)}
                </div>
              ) : null}
              {advice?.wave?.holdHe ? (
                <div style={{ marginTop: 6, fontSize: 13, color: '#c9d1d9' }}>
                  {translateAdviceText(locale, advice.wave.holdHe)}
                </div>
              ) : null}
              {advice?.wave?.exitHe ? (
                <div style={{ marginTop: 4, fontSize: 12, color: '#8b949e' }}>
                  {translateAdviceText(locale, advice.wave.exitHe)}
                </div>
              ) : null}
            </section>

            <TfStatesRow items={advice?.tfStates} locale={locale} />

            <section style={boxDir(locale)}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{tr('tfChart')}</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>
                {translateAdviceText(
                  locale,
                  '15 דקות = תזמון מהיר · 30 = תזמון · 4H = מרכז · צהוב מדגיש 15',
                )}
              </div>
              <TfChartBoard
                tfs={scene.tfs}
                relations={scene.tfRelations}
                price={scene.price}
                locale={locale}
              />
            </section>

            <CandleHuntChart
              path={advice?.targetPath}
              tfStates={advice?.tfStates}
              price={scene?.price}
              symbol={scene?.symbol || 'BTCUSDT'}
              longEntry={advice?.longEntry}
              shortEntry={advice?.shortEntry}
              mySide={myHasPos ? posSide : null}
              myEntry={myHasPos ? myEntryPx : null}
              bankroll={bankroll}
              marginX={marginX}
              locale={locale}
            />

            <TargetPathChart path={advice?.targetPath} locale={locale} />

            <MarginSizeBox
              bankroll={bankroll}
              setBankroll={setBankroll}
              marginX={marginX}
              setMarginX={setMarginX}
              locale={locale}
            />

            <TfStrip items={advice?.tfStrip} locale={locale} />

            <Fold title={tr('levelLadder')} open={showMap} onToggle={() => setShowMap((v) => !v)} locale={locale}>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>
                {translateAdviceText(
                  locale,
                  'כל רמה עם תפקיד לונג ותפקיד שורט בנפרד · כחול עכשיו · צהוב הכניסה שלך',
                )}
              </div>
              <DualChart
                chart={scene.chart}
                myEntry={myHasPos ? myEntryPx : null}
                mySide={myHasPos ? posSide : null}
                bankroll={bankroll}
                marginX={marginX}
                longEntry={advice?.longEntry}
                shortEntry={advice?.shortEntry}
                locale={locale}
              />
            </Fold>

            <section
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 14,
                direction: dir,
              }}
            >
              <EntryCard
                title={tr('longEntry')}
                color="#3fb950"
                entry={advice?.longEntry}
                preferred={advice?.lean === 'long' && advice?.longEntry?.executable !== false}
                bankroll={bankroll}
                marginX={marginX}
                locale={locale}
              />
              <EntryCard
                title={tr('shortEntry')}
                color="#ff7b72"
                entry={advice?.shortEntry}
                preferred={advice?.lean === 'short' && advice?.shortEntry?.executable !== false}
                bankroll={bankroll}
                marginX={marginX}
                locale={locale}
              />
            </section>

            <PositionBox
              locale={locale}
              price={scene.price}
              advice={advice}
              side={posSide}
              setSide={setPosSide}
              entry={posEntry}
              setEntry={setPosEntry}
            />

            {(advice?.scenarios || []).length ? (
              <section style={boxDir(locale)}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{translateAdviceText(locale, 'שבירות פעילות')}</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {advice.scenarios.map((s) => {
                    const tone =
                      s.tone === 'long'
                        ? '#3fb950'
                        : s.tone === 'short' || s.tone === 'danger'
                          ? '#ff7b72'
                          : '#8b949e';
                    return (
                      <div
                        key={s.id}
                        style={{
                          border: `1px solid ${tone}55`,
                          borderRadius: 10,
                          padding: '10px 12px',
                          background: '#0d1117',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: tone, marginBottom: 4 }}>{translateAdviceText(locale, s.title)}</div>
                        <div style={{ fontSize: 13, color: '#c9d1d9' }}>{translateAdviceText(locale, s.detail)}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}


            <Fold title={tr('allTfs')} open={showTfs} onToggle={() => setShowTfs((v) => !v)} locale={locale}>
              <TfTable tfs={scene.tfs} locale={locale} />
            </Fold>

            <Fold title={tr('brief')} open={showBrief} onToggle={() => setShowBrief((v) => !v)} locale={locale}>
              <div style={{ display: 'grid', gap: 8 }}>
                {(scene.lines || []).map((line) => (
                  <p
                    key={translateAdviceText(locale, line)}
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.5,
                      borderBottom: '1px solid #21262d',
                      paddingBottom: 6,
                      color: '#c9d1d9',
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </Fold>
          </>
        )}
      </div>
    </main>
  );
}
