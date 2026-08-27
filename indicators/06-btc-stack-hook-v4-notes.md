# Hook facts_v4 — paste + alert

File: `06-btc-stack-hook.pine`

## What v4 adds (every TF)
- `zap` GREEN / RED / PURPLE / GRAY (live tape color)
- `pink` GREEN / RED / GRAY
- `channel` up / down / mid (graph tint = uptrend/downtrend paint)
- `volRatio` volume vs MA
- `gapAboveLo/Hi` · `gapBelowLo/Hi` (FVG / candle imbalance corridors)

Schema: `facts_v4`

Also fires on 4H paint change (`paint4h`), not only bubbles.

## You must
1. Paste Hook into TradingView (replace old Hook)
2. Save
3. Recreate alert: Any `alert()` · Once Per Bar Close · same webhook URL
4. Wait for next bubble or 4H color change

Until then dashboard forecast works on v3 levels (MACD/RSI/pivots/MAs) and shows “waiting for Hook v4” for paint/volume gaps.

## Credit
Volume-gap corridor idea inspired by Zeiierman Volume Gaps (CC BY-NC-SA). We send facts only, not their drawing code.
