# Master meter — draft (5 indicators)

## Goal
One right-side panel: where price is going, as % up or % down.
Built from 5 indicators, per chart TF (later multi-TF rollup for daily BTC rent).

## The five votes

### 1 Trading Line Entry — timing / structure
Swing bubbles, reversal arrows, outer + entry trend lines.
Fast RSI(7) driven.

### 2 MA + Ribbon by TF — trend / regime
TF-specific MAs + ribbon squeeze/expand/twist.
Manual bull/bear regime switch.

### 3 Pink Surge Runline — surge strength
Pink vs gray + built-in multi-factor % meter + pivot channel state.

### 4 MACD Divergence — momentum truth
BTC auto lengths, strict price+signal+MACD div, ratio lead, hist zone.

### 5 RSI (14) — fuel / exhaustion
Level vs 30/50/70 + optional regular pivot divergence.
Slower twin to the RSI inside indicator 01 — score level continuously, do not re-score the same bubble.

## Combine (proposal)
Each vote → S in −100..+100
```
score = w1*S1 + w2*S2 + w3*S3 + w4*S4 + w5*S5
if score > 0 → UP score%
if score < 0 → DOWN abs(score)%
else → FLAT 0%
```

Suggested start weights:
- MA/Ribbon 0.25
- Pink meter 0.25
- MACD 0.20
- RSI 0.15
- Trading Line 0.15

## UI (right side)
- Big UP / DOWN %
- Five mini rows: Line · MA · Pink · MACD · RSI
- Optional multi-TF rollup row later

## Open questions
1. Weights OK?
2. RSI: trend-follow vs mean-revert scoring rule OK?
3. Force RSI divergence on inside master meter?
4. BTC rent-day window for Pink session/day%?
5. First build: single-TF panel only, or multi-TF from day one?
