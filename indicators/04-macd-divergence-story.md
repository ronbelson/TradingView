# 04 MACD Divergence Detection — story

## Role for the meter
Momentum truth / early warning. Answers: is MACD confirming price, or is price lying (divergence). Who leads: MACD or price.

## BTC auto lengths by TF
| TF | Fast,Slow,Signal |
|----|------------------|
| 1M/1W/3D/1D | 12,26,9 |
| 12H | 10,24,8 |
| 6H | 10,22,8 |
| 4H | 8,21,5 |
| 3H | 8,20,5 |
| 2H | 8,18,5 |
| 1H | 8,17,5 |
| 30m | 6,15,5 |
| 15m | 5,13,4 |
| 5m | 4,10,3 |
| 1m | 3,8,3 |

## Strict divergence (all three must agree)
Bearish div (warning up move is weak):
- price rising
- signal falling
- MACD falling

Bullish div (warning down move is weak):
- price falling
- signal rising
- MACD rising

Lookback default = 3 bars.

## Ratio line (who leads)
Normalize MACD and price over 50 bars → ratioDiff = macdNorm - priceNorm
- Positive: MACD leads
- Negative: price leads (often bearish-div flavor)

Cross bubbles: MACD crosses ratio line with strength % (breakout angle).

## Histogram
Above zero = bullish momentum zone tint
Below zero = bearish zone tint
Color intensity = expanding vs fading hist

## Score hints for combined meter (draft)
Bullish lean:
- bullishDiv active
- hist > 0 and rising
- MACD + signal rising with price (aligned, no div)
- crossUp bubble high %

Bearish lean:
- bearishDiv active
- hist < 0 and falling
- MACD + signal falling with price
- crossDown bubble high %

Caution / dampen:
- divergence against the current trade direction (fade conviction of surge)
- ratioDiff strongly negative while price rising = don't trust the rally alone

## Relation to other indicators
- Softens Pink Surge when bearishDiv during pink
- Softens shorts when bullishDiv during gray/bear structure
- Confirms MA ribbon expand when hist + MACD align with ribbon side
