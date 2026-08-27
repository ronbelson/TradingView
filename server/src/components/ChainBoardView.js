'use client';

/**
 * Graphical multi-TF chain board (read-only).
 * Bubble strip + fight line + hold/break sentence.
 */

function fmt(n, digits = 2) {
  if (n == null || n === '') return '-';
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function bubColor(side) {
  if (side === 'up') return '#3fb950';
  if (side === 'down') return '#ff6b6b';
  return '#8b97a8';
}

function stColor(stEn) {
  if (stEn === 'touch') return '#f2cc60';
  if (stEn === 'fight') return '#ffa657';
  if (stEn === 'break_up') return '#3fb950';
  if (stEn === 'break_dn') return '#ff6b6b';
  return '#8b97a8';
}

/**
 * @param {{ chain?: Record<string, unknown> | null, price?: number | null }} props
 */
export default function ChainBoardView({ chain, price }) {
  if (!chain || !Array.isArray(chain.rows) || !chain.rows.length) {
    return (
      <div style={{ color: '#8b97a8', fontSize: 14, padding: '12px 0' }}>
        אין נתוני שרשרת עדיין. שלח וובהוק מההוק.
      </div>
    );
  }

  const rows = /** @type {Array<Record<string, unknown>>} */ (chain.rows);
  const sentence = /** @type {Record<string, string> | null} */ (chain.sentence || null);
  const collect = /** @type {Record<string, unknown> | null} */ (chain.collect || null);
  const notes = /** @type {string[]} */ (chain.notes || []);
  const px = price ?? chain.price;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {collect?.active ? (
        <section
          style={{
            borderRadius: 14,
            border: '1px solid #f2cc6066',
            background: 'linear-gradient(160deg, #1a1810, #0d1117)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 12, color: '#f2cc60', fontWeight: 700, marginBottom: 8 }}>
            {collect.mode === 'sticky'
              ? `איסוף · תקיעה קבועה · ${String(collect.tf || '')}`
              : collect.mode === 'breakout' || collect.air
                ? `איסוף · אוויר · פיווט התפרצות ${String(collect.breakout_tf || '2m')}`
                : 'איסוף · חצי שעה / שעה · פיווט וממוצעים'}
          </div>
          <div style={{ fontSize: 13, color: '#c9d1d9', marginBottom: 10, lineHeight: 1.45 }}>
            {String(collect.rule_he || '')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <span
              style={{
                border: '1px solid #30363d',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 12,
                color: bubColor(String(collect.side)),
                fontWeight: 700,
              }}
            >
              בועה {String(collect.bub || '-')} · {String(collect.side_he || '')}
            </span>
            <span
              style={{
                border: '1px solid #30363d',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 12,
                color:
                  collect.aligned_with_4h === true
                    ? '#3fb950'
                    : collect.aligned_with_4h === false
                      ? '#ff6b6b'
                      : '#8b97a8',
                fontWeight: 700,
              }}
            >
              {collect.aligned_with_4h === true
                ? 'עם ארבע שעות'
                : collect.aligned_with_4h === false
                  ? 'נגד ארבע שעות'
                  : 'אין יישור'}
            </span>
          </div>
          {Array.isArray(collect.touch_lines) && collect.touch_lines.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {collect.touch_lines.map((l) => {
                const line = /** @type {Record<string, unknown>} */ (l);
                const col = stColor(String(line.st_en));
                return (
                  <div
                    key={`${line.kind}-${line.px}`}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${col}55`,
                      background: '#0f1520',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 800, color: col }}>
                      {String(line.st)} · {String(line.label)} {fmt(line.px)}
                    </div>
                    <div style={{ fontSize: 12, color: '#8b97a8', marginTop: 4 }}>
                      {String(line.tip_he)} · {String(line.role_he)} · {fmt(line.dist_pct, 3)}%
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#8b97a8', fontSize: 13 }}>
              אין מגע עכשיו. הקו הקרוב:{' '}
              {collect.next
                ? `${/** @type {Record<string, unknown>} */ (collect.next).label} ${fmt(/** @type {Record<string, unknown>} */ (collect.next).px)} · ${/** @type {Record<string, unknown>} */ (collect.next).st}`
                : 'אין'}
            </div>
          )}
          {Array.isArray(collect.lines) && collect.lines.length ? (
            <div style={{ marginTop: 12, display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11, color: '#8b97a8', marginBottom: 2 }}>כל קווי חצי שעה</div>
              {collect.lines.map((l) => {
                const line = /** @type {Record<string, unknown>} */ (l);
                const col = stColor(String(line.st_en));
                return (
                  <div
                    key={`all-${line.kind}-${line.px}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 12,
                      color: col,
                    }}
                  >
                    <span>
                      {String(line.label)} {fmt(line.px)}
                    </span>
                    <span>
                      {String(line.st)} · {fmt(line.dist_pct, 3)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {sentence ? (
        <section
          style={{
            borderRadius: 14,
            border: '1px solid #58a6ff66',
            background: 'linear-gradient(160deg, #111b27, #0d1117)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 12, color: '#7cb7ff', fontWeight: 700, marginBottom: 8 }}>
            ארבע שעות · צעד הבא
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.5, color: '#eef3f8' }}>
            {sentence.hyp_he}
          </div>
          <div style={{ fontSize: 14, marginTop: 8, color: '#c9d1d9', lineHeight: 1.45 }}>
            {sentence.hold_he}
          </div>
          <div style={{ fontSize: 14, marginTop: 6, color: '#ffb4b4', lineHeight: 1.45 }}>
            {sentence.break_he}
          </div>
          <div style={{ fontSize: 12, color: '#8b97a8', marginTop: 10 }}>
            מחיר {fmt(px)} · נגיעה {chain.touch_pct}% · מאבק {chain.fight_pct}%
          </div>
        </section>
      ) : null}

      {/* Bubble color strip */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {rows.map((r) => {
          const col = bubColor(String(r.side));
          const focus = Boolean(r.focus);
          const collectRow = Boolean(r.collect);
          return (
            <div
              key={`strip-${r.tf}`}
              style={{
                minWidth: focus || collectRow ? 52 : 40,
                flex: focus || collectRow ? '0 0 52px' : '0 0 40px',
                borderRadius: 10,
                padding: '8px 4px',
                textAlign: 'center',
                background: focus ? '#111b27' : collectRow ? '#1a1810' : '#0f1520',
                border: focus
                  ? `2px solid ${col}`
                  : collectRow
                    ? '2px solid #f2cc60'
                    : `1px solid ${col}55`,
              }}
            >
              <div style={{ fontSize: 10, color: collectRow ? '#f2cc60' : '#8b97a8' }}>
                {String(r.tf)}
                {collectRow ? ' · איסוף' : ''}
              </div>
              <div style={{ fontSize: focus || collectRow ? 16 : 14, fontWeight: 800, color: col }}>
                {String(r.bub)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Vertical chain */}
      <div style={{ position: 'relative', display: 'grid', gap: 8 }}>
        <div
          style={{
            position: 'absolute',
            top: 12,
            bottom: 12,
            insetInlineStart: 16,
            width: 2,
            background: 'linear-gradient(180deg, #ff6b6b55, #58a6ff88, #3fb95055)',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
        {rows.map((r) => {
          const col = bubColor(String(r.side));
          const focus = Boolean(r.focus);
          const collectRow = Boolean(r.collect);
          const fight = /** @type {Record<string, unknown> | null} */ (r.fight);
          const fightCol = fight ? stColor(String(fight.st_en)) : '#8b97a8';
          return (
            <div
              key={String(r.tf)}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                gap: 10,
                alignItems: 'start',
                background: focus ? '#111b27' : collectRow ? '#14120c' : '#0d1117',
                border: focus
                  ? `1px solid ${col}`
                  : collectRow
                    ? '1px solid #f2cc6066'
                    : `1px solid ${col}33`,
                borderRadius: 12,
                padding: '12px 14px',
                boxShadow: focus ? `0 0 0 1px ${col}22` : undefined,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: collectRow ? '#f2cc60' : col,
                  boxShadow: `0 0 0 3px ${collectRow ? '#f2cc6022' : col + '22'}`,
                  marginTop: 5,
                }}
              />
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: focus ? '#58a6ff' : collectRow ? '#f2cc60' : col,
                    }}
                  >
                    {String(r.tf)}
                    <span style={{ color: '#8b97a8', fontWeight: 600, fontSize: 12 }}>
                      {' '}
                      · {String(r.side_he)}
                      {collectRow ? ' · איסוף' : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{String(r.bub)}</div>
                </div>

                {fight ? (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 99,
                        background: '#1a2330',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          insetInlineStart: 0,
                          top: 0,
                          bottom: 0,
                          width: `${Math.max(8, Math.min(100, 100 - Number(fight.dist_pct || 0) * 120))}%`,
                          background: fightCol,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 13, marginTop: 6, color: fightCol, lineHeight: 1.4 }}>
                      {String(fight.text_he)}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, marginTop: 6, color: '#8b97a8' }}>אין קו מאבק</div>
                )}

                {(focus || collectRow) && r.sentence ? (
                  <div style={{ fontSize: 12, marginTop: 8, color: '#c9d1d9', lineHeight: 1.4 }}>
                    {String(/** @type {Record<string, string>} */ (r.sentence).he)}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {notes.length ? (
        <section
          style={{
            borderRadius: 12,
            border: '1px solid #243041',
            background: '#0f1520',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: 12, color: '#8b97a8', marginBottom: 8 }}>הערות שרשרת</div>
          {notes.map((n) => (
            <p key={n} style={{ margin: '0 0 6px', fontSize: 13, color: '#c9d1d9', lineHeight: 1.45 }}>
              {n}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
