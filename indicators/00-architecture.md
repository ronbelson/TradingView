# Architecture — multi-TF + single-TF meter (Ron)

## Principle
Each timeframe analyzes its own trend alone.
Afterwards there is a relationship between timeframes (rollup later).

## Five TF families
1. Minutes: 5, 15, 30
2. Hours: 1, 2, 3, 4, 6
3. Days: 1, 3
4. Week: 1
5. Month: 1

## Build order
Start **single TF only**: 4H.
Multi-TF correlation later.

## 4H defaults (editable)
- Large pivot lines: length **12**
- Small pivot lines: length **2**
- Market regime input: **Bear default** (manual Bull / Bear)
  - Bear → weight / score vs **slow bear** MA (regime slow line)
  - Bull → weight / score vs **slow bull** MA

## Decision stack (priority)
1. Slow regime line
2. Bubble vs distance
3. Large pivots
4. Small pivots
5. MACD vs Signal
6. RSI
7. Pink Surge
8. **Zap** — tape color + upper/lower touch points

## Zap
Upper = most-touched high near/above price (resistance)
Lower = most-touched low near/below price (support)
Tape: green / red / purple / gray

## Output
Day % · State · Rec · layers including Zap upper/lower
Always uses **chart timeframe** for the main stack panel (not locked).

## Multi-TF compare table
Bottom-left table (toggle in settings):
- Minutes 5/15/30 → **TURN** (entries / rotations)
- Hours 1/2/3/4/6 → **SETUP**
- Day / 3D / Week / Month → **BIAS** (longer decision)

Columns per TF: State · Rail (aim lower/upper) · Bubble · MACD · Lean
## Webhook (facts only)
Fire when any TF bubble changes: HH / LH / HL / LL.
Payload includes yearly regime (bull/bear manual) + chart levels + all TF rows.
No long/short decision fields by default.

Receiver app (separate from IB dashboard):
`server/` in this repo
- POST `/api/tv/webhook` stores facts
- GET `/api/tv/latest` + `/api/tv/events`
- Local store: `.data/*.json`
- Vercel store: Upstash Redis (`TV_STORE=kv`)
IB dashboard stays local; can poll `latest` from Vercel URL.


## How the five indicators map into this stack
| Stack step | Main source |
|------------|-------------|
| Slow regime line | 02 MA+Ribbon (slow MA for TF + isBull/isBear) |
| Distance + bubble HIGH/LOW | 01 Trading Line + 02 distance |
| Large pivots | 01/03 trend lines (override length 12 on 4H) |
| Small pivots | 01 entry lines (override length 2 on 4H) |
| MACD vs Signal | 04 MACD Div |
| RSI | 05 RSI (+ optional div) |
| Pink green/red/gray | 03 Pink Surge (isUp pink / gray + channel / meter) |

## Also on the panel: day % (always shown)
How much the price is up or down **today** vs day open (rent day / UTC day — confirm window).
- Above 0 → day is green / up
- Below 0 → day is red / down
- Exact % magnitude (e.g. +1.8% or −2.3%)

This is a live context row next to the stack decision — not a sixth indicator, but a required meter input: where we stand on the day relative to zero.

## Output (right side)
1. Day % vs 0 (up/down today)
2. Stack **current state** for this TF: up % / down % / flat (gray) + layer detail rows
3. **Recommendation** row (separate from state):
   - Derived from the same stack, not free text
   - Examples of labels: HOLD · WAIT · LONG lean · SHORT lean · TAKE PROFIT lean · DO NOT CHASE
   - Rules draft (tune while building 4H):
     - Strong aligned up (slow ok + pivots + MACD above + RSI ok + pink green) → LONG lean
     - Strong aligned down → SHORT lean
     - Divergence / gray pink / squeeze / mid pivots → WAIT
     - Day already extreme vs slow line + late RSI → DO NOT CHASE / TAKE PROFIT lean
     - Conflict between layers → HOLD / WAIT with reason tag (e.g. MACD veto)

Later: same per TF, then family rollup, then all-families relationship.

## Confirmed next build
4H-only Pine panel implementing this stack.
Weights / distance scales TBD while building.

## MACD flip rule (Ron)
MACD approaching / equal / cross vs Signal = direction reversal (sure on cross/equal, near-sure on approach).
Priority over other wait logic in recommendation.
