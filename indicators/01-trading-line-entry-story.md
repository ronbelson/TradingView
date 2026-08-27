# 01 Trading Line Entry — story

## Role for the meter
Structure + swing timing. Answers: where are we in the RSI swing cycle, and is price pressing outer or entry trend lines.

## Story
1. RSI (length 7) marks overbought (>=70) and oversold (<=30).
2. While RSI stays in that zone, the bubble crawls with the extreme high/low.
3. Labels:
   - high side: SELL HIGH / SELL LOW (vs previous high bubble)
   - low side: BUY LOW / BUY HIGH (vs previous low bubble)
4. After a low bubble → green reversal triangle (filter: OB/OS and/or RSI MA).
   After a high bubble → red reversal triangle.
5. Outer trend lines: pivot 5 (white high / yellow low). Star when bubble is near the outer line.
6. Entry trend lines: pivot 9 (lime high / fuchsia low). Structure for entries (comment: 2+ swings on line → new swing on line = entry). Entry logic itself is mostly visual/structure in this paste; signals are bubbles + arrows.
7. Last Swing helper: needs 2 of 3 (divergence / extreme 20-80 / exit-reentry of RSI zone).

## State machine (for meter later)
- laststate 0 = cold start
- laststate 1 = last completed zone was overbought (waiting / tracking toward next low bubble)
- laststate 2 = last completed zone was oversold (waiting / tracking toward next high bubble)

## Live cue on latest bubble
Distance of current RSI to the threshold that starts the next bubble (Wait / START).

## Score hints for combined meter (draft, confirm with Ron)
Bullish lean:
- low bubble active or fresh (BUY LOW stronger than BUY HIGH)
- green reversal arrow fired
- price near / bouncing off yellow or fuchsia support line
- RSI climbing out of OS / next bubble waiting for OB

Bearish lean:
- high bubble active or fresh (SELL HIGH stronger than SELL LOW)
- red reversal arrow fired
- price near / rejecting white or lime resistance line
- RSI falling out of OB / next bubble waiting for OS

Neutral:
- mid RSI, no fresh bubble, price mid-channel between lines
