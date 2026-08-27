# Hook facts_v7_gaps — paste + alert

File: `06-btc-stack-hook.pine`

## Fix
Volume / FVG gaps were computed but **not** in JSON. Now they are sent.

## New JSON fields (every TF)
- `gapAboveLo` / `gapAboveHi` — candle FVG above
- `gapBelowLo` / `gapBelowHi` — candle FVG below
- `zvAboveLo` / `zvAboveHi` — zero-volume zone above (Zeiierman-inspired facts)
- `zvBelowLo` / `zvBelowHi` — zero-volume zone below
- `poc` · `volRatio` · `deltaPct`

Volume profile rows: **15m / 30m / 1H / 4H** only (memory).
FVG corridors: all TFs.

Schema: `facts_v7_gaps`

## You must
1. Paste Hook into TradingView (replace old)
2. Save
3. Recreate alert · Any alert() · Once Per Bar Close · webhook from `WEBHOOK_URL.txt`
4. Wait for next fire

Local Claude brief now receives `nearest_gap` + `gaps_board` (closer magnet, pull up/down).

## Credit
Volume-gap idea: Zeiierman Volume Gaps (CC BY-NC-SA). Facts only, not their boxes.
