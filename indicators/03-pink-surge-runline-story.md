# 03 Pink Surge Runline — story

## Role for the meter
Live surge / trend strength. Already has an internal multi-factor % meter. Answers: is the runline pink (surge on) or gray (off), and how strong is bull/bear/sideways right now.

## Core: pink vs gray (isUp)
Pink (surge ON) when ALL true:
1. SMA20 > SMA50 > SMA100
2. All three SMAs rising vs prior bar
3. MACD line > signal
4. Day % from session open ≥ threshold (default 7%; 0 = ignore)

Gray = surge OFF. Trade model: enter on pink, exit on gray (session-scoped P/L optional).

## Layers
1. Runline = price colored pink/gray
2. SMA + SMA200 with distance fill (green above / red below, intensity by %)
3. SMMA channel (high/low length 33) + OHLC4 average
   - avg above high band = green channel
   - avg below low band = red channel
   - else gray
4. Pivot trend lines (same idea as indicator 01 outer lines)
   - above both lines → BULL
   - below both → BEAR
   - inside → SIDEWAYS (+ both lines up/down → SIDEWAYS BULL/BEAR)

## Built-in Trend Meter (prototype for the combined meter)
Averages 6–7 scores 0..1 → percent:
- Runline pink (1) / gray (0)
- Dist to SMA20 (bear side weighted heavier)
- Channel position (above/mid/below)
- Dist to SMA200 (bear side weighted heavier)
- Bar price move %
- Volume vs avg (down bars weighted heavier)
- Trend-line position if lines exist

Display: BULL / BEAR / SIDEWAYS + strength %
Direction label comes from pivot channel state; strength from the score blend.
Color dot by score bands (90→white … low→maroon).

## Score hints for combined meter (draft)
This indicator already is a mini-meter. For the master panel:
- Reuse `trendPercent` / `meterStrength` / `meterLabel` as the surge vote
- Pink + high % = strong up contribution
- Gray + low % / BEAR label = down contribution
- SIDEWAYS = dampen conviction even if pink flickers

## Note for BTC daily rent
Session / premarket / after-hours / day% threshold are equity-session oriented.
On crypto 24/7, day session + day% may need remap (UTC day or rent-day window) when building the master meter.
