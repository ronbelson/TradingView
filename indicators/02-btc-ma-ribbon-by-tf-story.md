# 02 BTC MA + Ribbon by TF — story

## Role for the meter
Trend / structure by timeframe. Answers: are we above or below the TF averages, and is the ribbon flowing bull or bear (squeeze / expand / twist).

## Manual regime switch
- `isBull` input (default OFF = bear)
- Bull: thicker fast MAs, visual weight on momentum rides
- Bear: thicker slow MAs, visual weight on where rallies die

## MA stack by TF (auto)
| TF | Fast | Mid | Slow | Extra |
|----|------|-----|------|-------|
| W | EMA20 | — | SMA200 | SMA300 |
| 3D | EMA9 | EMA21 | SMA50 | — (ribbon off by default) |
| D | EMA9 | EMA20 | EMA50 | SMA200 + SMA300 |
| 12H | EMA9 | EMA20 | EMA50 | SMA200 + SMA300 |
| 6H | EMA9 | EMA20 | EMA50 | SMA200 + SMA300 |
| 4H | EMA10 | EMA50 | SMA100 | SMA200 + SMA300 |
| 3H | EMA9 | EMA20 | EMA50 | SMA200 + SMA300 |
| 2H | EMA9 | EMA20 | EMA50 | SMA200 + SMA300 |
| 1H | EMA9 | EMA20 | EMA50 | SMA200 + SMA300 |
| 30m+ | EMA9 | EMA20 | EMA50 | SMA200 + SMA300 |

## How to read (from tooltips)
Bull:
- ride fast MAs
- dip into ribbon / mid-slow = long zone
- weekly EMA20 = macro floor; close below = warning

Bear:
- slow MAs = resistance / rally ceiling
- spike into ribbon = short zone
- SMA200/300 = macro cap / cycle floor depending on context

## Ribbon
- Weekly: EMA 20→50 (macro floor bull / ceiling bear)
- Daily+4H: Fib 8/13/21/34/55 (swing)
- 1H+30m: 5→30 (intraday)
- 3D: off by default (noise)

States:
- Bullish ribbon = short EMA > long EMA
- Squeeze = width% ≤ 0.35 → coiled, often before move
- Expansion = width% ≥ 1.5 → strong trend, do not fade
- Twist = short crosses long → direction flip diamond

## Score hints for combined meter (draft)
Bullish lean:
- price above fast (and mid/slow stacked bull)
- ribbon bullish + expand
- twist↑
- in bull regime: bounce off ribbon / EMA20–50

Bearish lean:
- price below fast / rejected by slow
- ribbon bearish + expand
- twist↓
- in bear regime: rejection at ribbon / SMA200–300

Neutral / wait:
- squeeze
- price mid-stack, MAs tangled
- 3D used as noise filter only (confirm higher TF)
