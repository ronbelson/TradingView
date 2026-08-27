# 05 Relative Strength Index — story

## Role for the meter
Fuel / exhaustion gauge. Answers: is momentum overheated, washed out, or mid-range. Optional regular RSI divergence as secondary veto/boost.

## Core (TradingView standard)
RSI length 14 on close (default).
Bands: 70 overbought · 50 mid · 30 oversold.

Zones for scoring:
- >70 = overbought (rally stretched; fade-long / short-lean unless strong trend ride)
- <30 = oversold (sell stretched; bounce / long-lean unless strong dump)
- 50+ rising = bullish bias mid
- 50− falling = bearish bias mid

## Optional smoothing
MA on RSI (SMA/EMA/RMA/WMA/VWMA) or SMA + Bollinger.
Useful: RSI vs its MA (same idea as Trading Line arrow filter).

## Regular divergence (off by default)
Pivot lookback L/R = 5, range between pivots 5–60 bars.

Bullish div:
- price lower low
- RSI higher low

Bearish div:
- price higher high
- RSI lower high

## Relation to indicator 01 (Trading Line)
01 uses RSI 7 and 70/30 for swing bubbles (faster).
05 is RSI 14 classic pane — slower confirmation of the same fuel.
Do not double-count the same bubble events; 05 scores continuous RSI level + optional pivot div.

## Score hints for combined meter (draft)
Map RSI to −100..+100 with context:
- Trend-follow mode (when MA ribbon expand / pink on): RSI 55–75 = up fuel OK; >80 = still up but late; <45 = up weakening
- Mean-revert mode (squeeze / sideways): >70 = down lean; <30 = up lean
- bullCond = boost up / dampen down
- bearCond = boost down / dampen up

## Note
Default `calculateDivergence = false` — for the master meter we should compute div internally (or force on) so the vote always has the signal.
