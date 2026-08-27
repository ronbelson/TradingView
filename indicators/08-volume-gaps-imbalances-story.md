# Volume Gaps & Imbalances (Zeiierman) — study notes

License: CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike).
Do not republish as own product. Derivative must keep license + credit Zeiierman.

## What it does (plain)
Builds a volume profile over the last N bars (default 200).
Splits the high-low range into price rows (default 50).

Per row:
- Bull volume = volume from green candles whose price source falls in that row
- Bear volume = volume from red candles in that row
- Zero-volume row = gap / imbalance zone (no volume in that price bin)

Draws:
1. Horizontal volume bars to the right of price (bull vs bear split)
2. Navy/zero-volume zones across the lookback where no volume traded
3. Delta summary panel: sections of (bull-bear)/total as %

## Important limits for Hook
- Runs only on `barstate.islast` (heavy box drawing)
- Buy/sell is candle color proxy (`close > open`), not true bid/ask delta
- Multi-TF via `request.security` would be expensive (boxes + arrays)
- For facts webhook we should extract **numbers only**, not boxes:
  - POC / max-volume row price
  - Nearest zero-volume gap above / below close
  - Gap top/bottom
  - Delta % near price (section containing close)
  - HVN / LVN candidates

## Useful facts candidates for BTC Stack
| Field | Meaning |
|-------|---------|
| vpHi / vpLo | Profile range high/low |
| poc | Price of max volume row |
| gapAboveLo / gapAboveHi | Nearest zero-vol zone above |
| gapBelowLo / gapBelowHi | Nearest zero-vol zone below |
| nearDeltaPct | Delta % of section containing price |
| maxVolRowBullShare | Bull share at POC |

## Fit with current stack
Complement to MA magnets + pivot rails:
- Rails = structure geometry
- Volume gaps = where price may travel fast / fill
- Delta near price = local buy/sell pressure proxy
