'use client';

import { LOCALES } from '@/lib/i18n';

/**
 * Square language toggles for the decision header.
 */
export default function LangSquares({ locale, onChange, label }) {
  return (
    <div style={{ direction: 'ltr' }}>
      {label ? (
        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6, letterSpacing: '0.04em' }}>
          {label}
        </div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(40px, 1fr))',
          gap: 6,
          maxWidth: 320,
        }}
      >
        {LOCALES.map((l) => {
          const on = locale === l.id;
          return (
            <button
              key={l.id}
              type="button"
              title={l.name}
              aria-label={l.name}
              aria-pressed={on}
              onClick={() => onChange(l.id)}
              style={{
                aspectRatio: '1',
                borderRadius: 10,
                border: on ? '1px solid #58a6ff' : '1px solid #30363d',
                background: on
                  ? 'linear-gradient(160deg, #1a2740 0%, #111b27 100%)'
                  : 'linear-gradient(160deg, #161b22 0%, #0d1117 100%)',
                color: on ? '#58a6ff' : '#c9d1d9',
                boxShadow: on ? '0 0 0 1px #58a6ff33 inset' : 'none',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '0.02em',
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                transition: 'border-color 120ms ease, color 120ms ease, background 120ms ease',
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
