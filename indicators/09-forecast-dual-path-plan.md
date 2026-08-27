# Forecast dual-path model (logic-only)

## Goal
One map from current price with **both** directions always visible.
Not a one-sided bubble guess. Bias is a hint. Levels are the product.

## Layers (every TF we care about)
Core path TFs: `30m`, `1H`, `2H`, `3H`, `4H`, `Day`, `3D`, `Week`

Per TF collect every price node:
1. EMA / SMA exact: fast, mid, slow, extra
2. Small pivot rail up / down (intersection now)
3. Large pivot rail up / down (intersection now)
4. Large anchors: last high `ph`, last low `pl` (and slope via ph/ph2, pl/pl2)
5. Volume FVG corridor mid (+ band lo/hi)
6. Bubble price when relevant

Special labels:
- **קו אדום דובי** = large upper rail when highs slope down (`hiAim=down`) OR zap RED ceiling at large upper / ph
- **קו ירוק שורי** = large lower rail when lows slope up (`loAim=up`)

## Outputs
- `up[]` ordered nearest → farther (obstacles if price rises)
- `down[]` ordered nearest → farther (obstacles if price falls)
- `chart` dual polyline: down steps ← price → up steps
- `bias` from 4H bub + channel + zap + MACD + RSI, tempered by Day / 3D / Week
- `tfs[]` card per TF: bub, paint, MACD, RSI, nearest up, nearest down
- `helpers` 30m/1H surrender points (small/large pivots + fast EMA)
- Hebrew `lines` summarizing both paths + higher-TF MACD

## What Claude is NOT needed for
Listing, sorting, weighting, dual chart, TF comparison cards.

## What Claude could add later
Prose brief when signals conflict. Optional. Not blocking.
