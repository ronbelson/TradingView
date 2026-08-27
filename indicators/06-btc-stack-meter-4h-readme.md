# 06 BTC Stack Meter 4H — usage

## File
`06-btc-stack-meter-4h.pine`

## Load
1. TradingView → Pine Editor → paste file
2. Add to chart on **BTC 4H**
3. Panel appears middle-right

## Defaults
- Regime: Bear (toggle Bull)
- Slow bear: SMA 200 · Slow bull: EMA 50
- Large pivot: 12 · Small pivot: 2
- MACD: 8 / 21 / 5 (BTC 4H table)
- Day %: daily open of chart exchange/UTC day

## Panel rows
1. Regime BULL/BEAR
2. DAY % vs 0 (UP/DOWN)
3. STATE UP/DOWN/FLAT + strength %
4. REC + why
5. Layers 1→6 detail

## Tune next
- Weights group
- near/far slow %
- Recommendation thresholds
- Day window if rent-day ≠ calendar day
