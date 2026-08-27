# scene_v1 — מבנה אחד

## רעיון
דקה = רק פעימה ששולחת.
התמונה = סצנה רחבה עם מרכז 4 שעות.

## שדות

```
schema: scene_v1
price
asOf
trigger          // pulseTf + bub  (1m only)
center           // תמיד 4H
path.up[]        // מחסומים למעלה
path.down[]      // מחסומים למטה
tfs[]            // 15m..Week מסביב
lines[]          // משפטים קצרים בעברית
```

## כל שורת TF

```
tf, role (near|center|wide)
bub, bubPx, oppPx, swingPct
stack, zap, pink, channel
rsi, macdAbove
emaFast, emaMid, emaSlow
railUp, railDn
pivotHi, pivotLo
poc (אם יש)
up, down         // מחסום קרוב אחד לכל צד
```

## מה לא במבנה
לא rules ישנים.
לא brief ישן.
לא flow4h נפרד.
לא עשרות דגלי מקאד גולמיים על המסך.
