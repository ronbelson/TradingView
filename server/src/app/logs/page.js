'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_VERSION } from '@/lib/version';

const REFRESH_MS = 15000;

function clockHe(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function kindHe(kind) {
  if (kind === 'down') return 'למטה';
  if (kind === 'up') return 'חזר';
  return kind || '-';
}

export default function LogsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/health/log?limit=100', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.statusText);
      setData(j);
      setErr('');
    } catch (e) {
      setErr(e?.message || 'שגיאה');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const fresh = data?.tws_fresh === true;
  const rows = data?.log || [];

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
          <h1 style={{ margin: 0, fontSize: 20 }}>לוגים · TWS</h1>
          <Link href="/report" style={{ color: '#7cb7ff', fontSize: 13 }}>
            חזרה לשף
          </Link>
        </div>
        <div style={{ color: '#8b97a8', fontSize: 13, marginBottom: 14 }}>
          גרסה {APP_VERSION}
          {err ? ` · ${err}` : ''}
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 14,
            border: `1px solid ${fresh ? '#3fb95066' : '#d2992266'}`,
            background: '#121820',
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 800, color: fresh ? '#3fb950' : '#e3b341', fontSize: 16 }}>
            {fresh ? 'TWS חי' : 'TWS למטה / ישן'}
          </div>
          <div style={{ color: '#8b97a8', fontSize: 13, marginTop: 6 }}>
            גיל ציטוט:{' '}
            {data?.age_sec == null ? 'אין' : `${data.age_sec} שנ׳`}
            {data?.quote_asOf ? ` · asOf ${clockHe(data.quote_asOf)}` : ''}
          </div>
          {data?.state?.since ? (
            <div style={{ color: '#8b97a8', fontSize: 13, marginTop: 4 }}>
              סטטוס נוכחי מאז {clockHe(data.state.since)}
            </div>
          ) : null}
        </div>

        <div style={{ color: '#8b97a8', fontSize: 13, marginBottom: 10 }}>
          מעברים למטה / חזר (מייל + SMS בשינוי מצב)
        </div>

        {!rows.length ? (
          <div style={{ color: '#8b97a8' }}>עדיין אין רשומות. אחרי שהקרון רץ יופיעו כאן.</div>
        ) : (
          rows.map((r, i) => {
            const down = r.kind === 'down';
            return (
              <div
                key={`${r.at}-${i}`}
                style={{
                  marginBottom: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${down ? '#ff6b6b55' : '#3fb95055'}`,
                  background: '#121820',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 800, color: down ? '#ff6b6b' : '#3fb950' }}>
                    {kindHe(r.kind)}
                  </span>
                  <span style={{ color: '#7cb7ff', fontSize: 12 }}>{clockHe(r.at)}</span>
                </div>
                <div style={{ color: '#c9d1d9', fontSize: 13, marginTop: 6 }}>
                  {r.note || ''}
                </div>
                <div style={{ color: '#8b97a8', fontSize: 12, marginTop: 4 }}>
                  {r.age_sec != null ? `גיל ${r.age_sec}שנ׳` : ''}
                  {r.symbol ? ` · ${r.symbol}` : ''}
                  {r.quote_asOf ? ` · asOf ${clockHe(r.quote_asOf)}` : ''}
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
