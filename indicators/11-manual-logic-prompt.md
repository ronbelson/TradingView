# ניסוי ידני: פרומפט לוגיקה מלאה (scene_v1)

העתק את **SYSTEM** ואז את **USER** (כולל ה־JSON המצורף) למודל.

שני חלקים חובה:
1. שחזור מדויק של לוגיקת המנוע על הנתונים (בלי לשנות משקלים).
2. אחרי זה: הצעת לוגיקה טובה יותר + בחינה עצמית של ההצעה על אותו JSON.

---

## SYSTEM

אתה מנוע החלטות מסחר לביטקוין לפי לוגיקת SoulMatch Stack Scene (`scene_v1`).
בחלק הראשון אתה לא סוחר חופשי: מריץ את הכללים למטה על ה־JSON בלבד.
אסור להמציא מחירים, רמות, או אותות שלא בנתונים.
בחלק השני מותר להציע שיפורי לוגיקה, אבל כל טענה חייבת להיבדק מול אותו snapshot.

### מסגרת
- גרף דקה = פעימת webhook בלבד (`trigger`). לא מחליטים לפי הדקה.
- מרכז ההחלטה = `center` של 4H.
- תמיד בונים שני מסלולים: לונג ושורט. לא מוחקים צד.
- תצוגה עיקרית = סולם רמות (`chart`): כל מחיר ממסלול לונג/שורט, עם תפקיד נפרד לכל צד.
- מרגין × הכפלה (1–10, ברירת מחדל 2) קובע גודל פוזיציה: `size = margin * x`.
- סטופ = הרמה הראשונה נגד הכיוון לפי הנתונים (לא אחוז סיכון מההון).
- יציאה בכסף בסטופ = `size * riskPct/100` כש־`riskPct` = מרחק כניסה→סטופ.

### שלב A: ציון כיוון (רק מ־`center` + תיקון 1H)

התחל מ־`score = 0`. הוסף/חסר:

| אות | תנאי | נקודות |
|-----|------|--------|
| בועה 4H | HL או LL | +1.6 |
| בועה 4H | HH או LH | −1.6 |
| זאפ | GREEN | +1.1 |
| זאפ | RED | −1.1 |
| צבע/channel | up | +1.2 |
| צבע/channel | down | −1.2 |
| ממוצעים/stack | bull | +0.8 |
| ממוצעים/stack | bear | −0.8 |
| מקאד | macdAbove true | +0.5 |
| מקאד | macdAbove false | −0.5 |
| מתחת לפיבוט גדול תחתון | price < railDn * 0.999 | −1.5 |
| מתחת לפיבוט קטן תחתון | price < pivotSmallDn * 0.999 | −0.8 |
| מעל לפיבוט גדול עליון | price > railUp * 1.001 | +1.5 |
| מעל לפיבוט קטן עליון | price > pivotSmallUp * 1.001 | +0.8 |
| 1H תומך לונג | zap GREEN או bub HL/LL | +0.4 |
| 1H תומך שורט | zap RED או bub HH/LH | −0.4 |

סף lean ראשוני:
- `score >= 1.2` → lean = long
- `score <= −1.2` → lean = short
- אחרת → wait

דריסת רדיפה (חובה אחרי הסף):
- אם lean=long ו־`price > emaFast * 1.002` → lean=wait, כותרת: לונג רק ליד ממוצע מהיר 4H, לא לרדוף.
- אם lean=wait ו־score>0 ו־price מעל emaFast → כותרת המתנה לממוצע מהיר מלמעלה.
- אם lean=wait ו־score<0 ו־price מתחת emaFast → כותרת המתנה לממוצע מהיר מלמטה.

שמור את רשימת הסיבות (`reasons`) לפי האותות שבאמת תרמו.

### שלב B: בחירת כניסה (`pickEntry`)

מועמדים ללונג (העדפה גבוהה קודם): emaFast(3), pivotSmallDn(2.8), emaMid(2.5), railDn(2.2), pivotLo(2), bubPx אם HL/LL(1.8), emaSlow(1.5), ועוד רמות path.down מתחת למחיר.
מועמדים לשורט: emaFast(3), pivotSmallUp(2.8), emaMid(2.5), oppPx מקור מסע(2.4), railUp(2.2), pivotHi(2), bubPx אם HH/LH(1.8), ועוד path.up מעל המחיר.

בחירת לונג:
- אם המחיר מעל emaFast ב־>0.1% → הכניסה = emaFast (מחכים לירידה), גם אם יש רמה קרובה יותר מתחת.
- אחרת: העדף רמה ב־/מתחת למחיר לפי pref ואז גובה.

בחירת שורט:
- אל תבחר EMA מתחת למחיר כהתנגדות.
- אם המחיר מתחת emaFast → אפשר emaFast כהמתנה לעלייה.
- אחרת: העדף התנגדות ב־/מעל המחיר לפי pref.

סטטוס כניסה:
- |price−entry|/entry ≤ 0.0006 → now
- לונג ומחיר מעל הכניסה → wait ירידה
- לונג ומחיר מתחת → missed / לבדוק שבירה
- שורט ומחיר מתחת לכניסה → wait עלייה
- שורט ומחיר מעל → missed

### שלב C: סטופ / יעד / מסלול / יחס

לונג:
- סטופ = הרמה הקרובה ביותר מתחת לכניסה מתוך רמות המרכז+path
- יעד = הרמה הקרובה ביותר מעל לכניסה
שורט:
- סטופ = הקרובה ביותר מעל לכניסה
- יעד = הקרובה ביותר מתחת לכניסה

`riskPct = |entry−stop|/entry * 100`
`rewardPct = |entry−target|/entry * 100`
`rr = rewardPct / riskPct`

מסלול מלא:
- מאחורי הכניסה עד ~3 רמות (הגנה/סטופ)
- הכניסה
- לפנים עד ~4 רמות (שלב/יעד)
לכל שלב קדימה: אותו riskPct לסטופ הראשי, rewardPct עד השלב, rr של השלב.

פסילת צד מעשית:
- אם rr של הכניסה המוצעת < 1.0 (במיוחד שורט עם סטופ רחוק ויעד קרוב) → הצד פסול לביצוע עכשיו גם אם lean מצביע עליו.
- יחס טוב לביצוע: בערך ≥ 1.5

### שלב D: שבירות פעילות

רק אם כבר נשבר:
- price < pivotSmallDn*0.999 → לונג חלש
- price < railDn*0.999 → שורט מבני
- price > pivotSmallUp*1.001 → שורט חלש
- price > railUp*1.001 → לונג מבני

### שלב E: טיימפרמים קרובים (30m / 1H / Day)

לכל TF: score מקומי מבועה/זאפ/channel כמו בטבלה הקטנה בקוד. tone = long / short / watch.
משמשים כהקשר, לא דורסים את מרכז 4H לבד.

### פלט חובה

#### חלק 1: שחזור המנוע (בלי לשנות כללים)

1. ציון מחושב + פירוק נקודות (כל שורה עם הערך שחישבת). חשוב: בתיקון 1H שני התנאים יכולים לקרות יחד (+0.4 וגם −0.4).
2. lean אחרי דריסת רדיפה.
3. כניסת לונג: מחיר, שם, סטטוס, סטופ, יעד ראשון, risk%, reward%, rr.
4. **מסלול לונג מלא**: כל שורה מ־`advice.longEntry.route` לפי הסדר. לכל שורה: roleHe, name, px, riskPct, rewardPct, rr. בלי לקצר ל־3 שלבים.
5. כניסת שורט: אותו מבנה כמו לונג.
6. **מסלול שורט מלא**: כל שורה מ־`advice.shortEntry.route` באותו פירוט.
7. סולם `chart`: לכל רמה name + px + תפקיד לונג + תפקיד שורט.
8. איזה צד בר־ביצוע עכשיו ולמה (כולל פסילה על rr).
9. מה מחכים (גע / שבירה) לפני פעולה.
10. מה מבטל את התזה.
11. האם מסכים עם `advice` שב־JSON. אם סטייה: איזה כלל נשבר.

#### חלק 2: הצעת לוגיקה טובה יותר (v2)

רק אחרי חלק 1. הצע עד 5 שינויי כלל קונקרטיים. לכל שינוי:
- מה שבור / חלש ב־v1
- הכלל החדש המוצע (מספרים ברורים)
- איך זה היה משנה את ההחלטה על ה־JSON הנוכחי
- סיכון / תופעת לוואי אפשרית

#### חלק 3: בחינת ה־v2 על אותו snapshot

- הרץ מחדש ציון + lean + כניסות לפי v2 על אותם נתונים
- השווה ל־v1: מה השתנה
- האם v2 עדיף כאן, או מסוכן יותר
- המלצה: לאמץ / לאמץ חלקית / לדחות

אל תכתוב המלצת השקעה כללית.
אל תקצר מסלולים.
ענה בעברית. בלי מקף ארוך.

---

## USER

הורץ עכשיו על ה־JSON הבא (snapshot חי).
חובה להשלים חלק 1 (כולל כל המסלול), חלק 2 וחלק 3.
אל תעצור באמצע.

```json
{
  "asOf": "2026-07-26T09:18:01.491Z",
  "price": 64545.36,
  "symbol": "BTCUSDT",
  "trigger": {
    "pulseTf": "1",
    "bub": "HH",
    "bubHe": "שיא חדש",
    "why": "chart:HH|px"
  },
  "center": {
    "tf": "4H",
    "role": "center",
    "bub": "HL",
    "bubHe": "תחתית גבוהה",
    "bubPx": 63739.75,
    "oppPx": 66956.15,
    "swingPct": 4.8,
    "stack": "mixed",
    "zap": "RED",
    "pink": "GRAY",
    "channel": "mid",
    "rsi": 46,
    "macdAbove": true,
    "emaFast": 64440.51,
    "emaMid": 64757.99,
    "emaSlow": 62946.42,
    "railUp": 68048.6,
    "railDn": 64291.05,
    "pivotHi": 66956.15,
    "pivotLo": 63100,
    "pivotSmallUp": 64977.44,
    "pivotSmallDn": 63894.3,
    "poc": 0,
    "up": {
      "name": "ממוצע אמצע · 4H",
      "px": 64757.99,
      "distPct": 0.32942724310469007,
      "tf": "4H"
    },
    "down": {
      "name": "ממוצע מהיר · 4H",
      "px": 64440.51,
      "distPct": 0.16244389991782296,
      "tf": "4H"
    }
  },
  "advice": {
    "lean": "wait",
    "leanHe": "המתן",
    "score": 1,
    "headline": "בינתיים להמתין לממוצע מהיר 4H ב־64,440.51",
    "longEntry": {
      "px": 64440.51,
      "name": "ממוצע מהיר · 4H",
      "distPct": 0.16244389991782296,
      "status": "wait",
      "statusHe": "להמתין לירידה לאזור",
      "stopPx": 64291.05,
      "stopName": "פיבוט גדול תחתון · 4H",
      "targetPx": 64757.99,
      "targetName": "ממוצע אמצע · 4H",
      "riskPct": 0.23,
      "rewardPct": 0.49,
      "rr": 2.12,
      "journey": {
        "bub": "HL",
        "bubHe": "תחתית גבוהה",
        "fromPx": 66956.15,
        "bubPx": 63739.75,
        "swingPct": 4.8
      },
      "route": [
        {
          "px": 63739.75,
          "name": "בועה HL · 4H",
          "role": "protect",
          "roleHe": "הגנה",
          "riskPct": 1.09,
          "rewardPct": null,
          "rr": null
        },
        {
          "px": 63894.3,
          "name": "פיבוט קטן תחתון · 4H",
          "role": "protect",
          "roleHe": "הגנה",
          "riskPct": 0.85,
          "rewardPct": null,
          "rr": null
        },
        {
          "px": 64291.05,
          "name": "פיבוט גדול תחתון · 4H",
          "role": "stop",
          "roleHe": "סטופ",
          "riskPct": 0.23,
          "rewardPct": null,
          "rr": null
        },
        {
          "px": 64440.51,
          "name": "ממוצע מהיר · 4H",
          "role": "entry",
          "roleHe": "כניסה",
          "riskPct": 0.23,
          "rewardPct": null,
          "rr": null
        },
        {
          "px": 64757.99,
          "name": "ממוצע אמצע · 4H",
          "role": "step",
          "roleHe": "שלב 1",
          "riskPct": 0.23,
          "rewardPct": 0.49,
          "rr": 2.12
        },
        {
          "px": 64977.44,
          "name": "פיבוט קטן עליון · 4H",
          "role": "step",
          "roleHe": "שלב 2",
          "riskPct": 0.23,
          "rewardPct": 0.83,
          "rr": 3.59
        },
        {
          "px": 66956.15,
          "name": "פיבוט גבוה · 4H",
          "role": "step",
          "roleHe": "שלב 3",
          "riskPct": 0.23,
          "rewardPct": 3.9,
          "rr": 16.83
        },
        {
          "px": 68048.6,
          "name": "פיבוט גדול עליון · 4H",
          "role": "target",
          "roleHe": "יעד",
          "riskPct": 0.23,
          "rewardPct": 5.6,
          "rr": 24.14
        }
      ]
    },
    "shortEntry": {
      "px": 64977.44,
      "name": "פיבוט קטן עליון · 4H",
      "distPct": 0.6694206988697587,
      "status": "wait",
      "statusHe": "להמתין לעלייה לאזור",
      "stopPx": 66956.15,
      "stopName": "פיבוט גבוה · 4H",
      "targetPx": 64757.99,
      "targetName": "ממוצע אמצע · 4H",
      "riskPct": 3.05,
      "rewardPct": 0.34,
      "rr": 0.11,
      "journey": {
        "bub": "HL",
        "bubHe": "תחתית גבוהה",
        "fromPx": 66956.15,
        "bubPx": 63739.75,
        "swingPct": 4.8
      },
      "route": [
        {
          "px": 66956.15,
          "name": "פיבוט גבוה · 4H",
          "role": "stop",
          "roleHe": "סטופ",
          "riskPct": 3.05,
          "rewardPct": null,
          "rr": null
        },
        {
          "px": 68048.6,
          "name": "פיבוט גדול עליון · 4H",
          "role": "protect",
          "roleHe": "הגנה",
          "riskPct": 4.73,
          "rewardPct": null,
          "rr": null
        },
        {
          "px": 64977.44,
          "name": "פיבוט קטן עליון · 4H",
          "role": "entry",
          "roleHe": "כניסה",
          "riskPct": 3.05,
          "rewardPct": null,
          "rr": null
        },
        {
          "px": 64757.99,
          "name": "ממוצע אמצע · 4H",
          "role": "step",
          "roleHe": "שלב 1",
          "riskPct": 3.05,
          "rewardPct": 0.34,
          "rr": 0.11
        },
        {
          "px": 64440.51,
          "name": "ממוצע מהיר · 4H",
          "role": "step",
          "roleHe": "שלב 2",
          "riskPct": 3.05,
          "rewardPct": 0.83,
          "rr": 0.27
        },
        {
          "px": 64291.05,
          "name": "פיבוט גדול תחתון · 4H",
          "role": "step",
          "roleHe": "שלב 3",
          "riskPct": 3.05,
          "rewardPct": 1.06,
          "rr": 0.35
        },
        {
          "px": 63894.3,
          "name": "פיבוט קטן תחתון · 4H",
          "role": "target",
          "roleHe": "יעד",
          "riskPct": 3.05,
          "rewardPct": 1.67,
          "rr": 0.55
        }
      ]
    },
    "reasons": [
      "בועת 4 שעות תחתית גבוהה",
      "זאפ אדום",
      "מקאד מעל"
    ],
    "scenarios": [],
    "tfStrip": [
      {
        "tf": "30m",
        "tone": "long",
        "text": "תחתית גבוהה · GREEN · up"
      },
      {
        "tf": "1H",
        "tone": "short",
        "text": "שיא נמוך · GREEN · down"
      },
      {
        "tf": "Day",
        "tone": "short",
        "text": "שיא נמוך · RED · down"
      }
    ]
  },
  "chart": [
    {
      "side": "down",
      "px": 63739.75,
      "label": "בועה HL",
      "name": "בועה HL",
      "long": {
        "role": "protect",
        "roleHe": "הגנה",
        "riskPct": 1.09,
        "rewardPct": null,
        "rr": null
      },
      "short": null,
      "tf": "4H",
      "kind": "level"
    },
    {
      "side": "down",
      "px": 63894.3,
      "label": "פיבוט קטן תחתון",
      "name": "פיבוט קטן תחתון",
      "long": {
        "role": "protect",
        "roleHe": "הגנה",
        "riskPct": 0.85,
        "rewardPct": null,
        "rr": null
      },
      "short": {
        "role": "target",
        "roleHe": "יעד",
        "riskPct": 3.05,
        "rewardPct": 1.67,
        "rr": 0.55
      },
      "tf": "4H",
      "kind": "level"
    },
    {
      "side": "down",
      "px": 64291.05,
      "label": "פיבוט גדול תחתון",
      "name": "פיבוט גדול תחתון",
      "long": {
        "role": "stop",
        "roleHe": "סטופ",
        "riskPct": 0.23,
        "rewardPct": null,
        "rr": null
      },
      "short": {
        "role": "step",
        "roleHe": "שלב 3",
        "riskPct": 3.05,
        "rewardPct": 1.06,
        "rr": 0.35
      },
      "tf": "4H",
      "kind": "level"
    },
    {
      "side": "down",
      "px": 64440.51,
      "label": "ממוצע מהיר",
      "name": "ממוצע מהיר",
      "long": {
        "role": "entry",
        "roleHe": "כניסה",
        "riskPct": 0.23,
        "rewardPct": null,
        "rr": null
      },
      "short": {
        "role": "step",
        "roleHe": "שלב 2",
        "riskPct": 3.05,
        "rewardPct": 0.83,
        "rr": 0.27
      },
      "tf": "4H",
      "kind": "level"
    },
    {
      "side": "now",
      "px": 64545.36,
      "label": "עכשיו",
      "name": "עכשיו",
      "hint": "מחיר נוכחי",
      "long": null,
      "short": null,
      "tf": "now",
      "kind": "now"
    },
    {
      "side": "up",
      "px": 64757.99,
      "label": "ממוצע אמצע",
      "name": "ממוצע אמצע",
      "long": {
        "role": "step",
        "roleHe": "שלב 1",
        "riskPct": 0.23,
        "rewardPct": 0.49,
        "rr": 2.12
      },
      "short": {
        "role": "step",
        "roleHe": "שלב 1",
        "riskPct": 3.05,
        "rewardPct": 0.34,
        "rr": 0.11
      },
      "tf": "4H",
      "kind": "level"
    },
    {
      "side": "up",
      "px": 64977.44,
      "label": "פיבוט קטן עליון",
      "name": "פיבוט קטן עליון",
      "long": {
        "role": "step",
        "roleHe": "שלב 2",
        "riskPct": 0.23,
        "rewardPct": 0.83,
        "rr": 3.59
      },
      "short": {
        "role": "entry",
        "roleHe": "כניסה",
        "riskPct": 3.05,
        "rewardPct": null,
        "rr": null
      },
      "tf": "4H",
      "kind": "level"
    },
    {
      "side": "up",
      "px": 66956.15,
      "label": "פיבוט גבוה",
      "name": "פיבוט גבוה",
      "long": {
        "role": "step",
        "roleHe": "שלב 3",
        "riskPct": 0.23,
        "rewardPct": 3.9,
        "rr": 16.83
      },
      "short": {
        "role": "stop",
        "roleHe": "סטופ",
        "riskPct": 3.05,
        "rewardPct": null,
        "rr": null
      },
      "tf": "4H",
      "kind": "level"
    },
    {
      "side": "up",
      "px": 68048.6,
      "label": "פיבוט גדול עליון",
      "name": "פיבוט גדול עליון",
      "long": {
        "role": "target",
        "roleHe": "יעד",
        "riskPct": 0.23,
        "rewardPct": 5.6,
        "rr": 24.14
      },
      "short": {
        "role": "protect",
        "roleHe": "הגנה",
        "riskPct": 4.73,
        "rewardPct": null,
        "rr": null
      },
      "tf": "4H",
      "kind": "level"
    }
  ],
  "tfs": [
    {
      "tf": "15m",
      "role": "near",
      "bub": "LH",
      "bubHe": "שיא נמוך",
      "bubPx": 64518,
      "oppPx": 64293.81,
      "swingPct": 0.35,
      "stack": "bull",
      "zap": "GREEN",
      "pink": "GRAY",
      "channel": "up",
      "rsi": 59.02,
      "macdAbove": true,
      "emaFast": 64451.52,
      "emaMid": 0,
      "emaSlow": 64418.61,
      "railUp": 64654.68,
      "railDn": 64304.07,
      "pivotHi": 64599.95,
      "pivotLo": 64293.81,
      "pivotSmallUp": 64390.17,
      "pivotSmallDn": 64320.05,
      "poc": 64351.21,
      "up": null,
      "down": null
    },
    {
      "tf": "30m",
      "role": "near",
      "bub": "HL",
      "bubHe": "תחתית גבוהה",
      "bubPx": 64293.81,
      "oppPx": 64582,
      "swingPct": 0.45,
      "stack": "bull",
      "zap": "GREEN",
      "pink": "GRAY",
      "channel": "up",
      "rsi": 58.5,
      "macdAbove": true,
      "emaFast": 64445.95,
      "emaMid": 0,
      "emaSlow": 64379.89,
      "railUp": 64994.8,
      "railDn": 63903.03,
      "pivotHi": 65808.59,
      "pivotLo": 63810,
      "pivotSmallUp": 64348.04,
      "pivotSmallDn": 64193.48,
      "poc": 64542.55,
      "up": {
        "name": "מקור ירידה או עלייה · 30m",
        "px": 64582,
        "distPct": 0.0567662803337055,
        "tf": "30m"
      },
      "down": {
        "name": "ממוצע מהיר · 30m",
        "px": 64445.95,
        "distPct": 0.15401571855824103,
        "tf": "30m"
      }
    },
    {
      "tf": "1H",
      "role": "near",
      "bub": "LH",
      "bubHe": "שיא נמוך",
      "bubPx": 64582,
      "oppPx": 63739.75,
      "swingPct": 1.32,
      "stack": "bear",
      "zap": "GREEN",
      "pink": "GRAY",
      "channel": "down",
      "rsi": 57.6,
      "macdAbove": false,
      "emaFast": 64456.61,
      "emaMid": 0,
      "emaSlow": 64480.06,
      "railUp": 64925.85,
      "railDn": 63907.57,
      "pivotHi": 65808.59,
      "pivotLo": 63810,
      "pivotSmallUp": 64662.28,
      "pivotSmallDn": 64304.07,
      "poc": 64391.28,
      "up": {
        "name": "בועה LH · 1H",
        "px": 64582,
        "distPct": 0.0567662803337055,
        "tf": "1H"
      },
      "down": {
        "name": "ממוצע איטי · 1H",
        "px": 64480.06,
        "distPct": 0.10116916227596053,
        "tf": "1H"
      }
    },
    {
      "tf": "2H",
      "role": "near",
      "bub": "LH",
      "bubHe": "שיא נמוך",
      "bubPx": 64582,
      "oppPx": 63739.75,
      "swingPct": 1.32,
      "stack": "bear",
      "zap": "RED",
      "pink": "GRAY",
      "channel": "down",
      "rsi": 50.83,
      "macdAbove": true,
      "emaFast": 64399.79,
      "emaMid": 64418.98,
      "emaSlow": 64704.96,
      "railUp": 68029.77,
      "railDn": 64003.18,
      "pivotHi": 66956.15,
      "pivotLo": 63739.75,
      "pivotSmallUp": 64649.82,
      "pivotSmallDn": 63903.67,
      "poc": 0,
      "up": {
        "name": "בועה LH · 2H",
        "px": 64582,
        "distPct": 0.0567662803337055,
        "tf": "2H"
      },
      "down": {
        "name": "ממוצע אמצע · 2H",
        "px": 64418.98,
        "distPct": 0.19580028680604983,
        "tf": "2H"
      }
    },
    {
      "tf": "4H",
      "role": "center",
      "bub": "HL",
      "bubHe": "תחתית גבוהה",
      "bubPx": 63739.75,
      "oppPx": 66956.15,
      "swingPct": 4.8,
      "stack": "mixed",
      "zap": "RED",
      "pink": "GRAY",
      "channel": "mid",
      "rsi": 46,
      "macdAbove": true,
      "emaFast": 64440.51,
      "emaMid": 64757.99,
      "emaSlow": 62946.42,
      "railUp": 68048.6,
      "railDn": 64291.05,
      "pivotHi": 66956.15,
      "pivotLo": 63100,
      "pivotSmallUp": 64977.44,
      "pivotSmallDn": 63894.3,
      "poc": 0,
      "up": {
        "name": "ממוצע אמצע · 4H",
        "px": 64757.99,
        "distPct": 0.32942724310469007,
        "tf": "4H"
      },
      "down": {
        "name": "ממוצע מהיר · 4H",
        "px": 64440.51,
        "distPct": 0.16244389991782296,
        "tf": "4H"
      }
    },
    {
      "tf": "Day",
      "role": "wide",
      "bub": "LH",
      "bubHe": "שיא נמוך",
      "bubPx": 66956.15,
      "oppPx": 58115.01,
      "swingPct": 15.21,
      "stack": "mixed",
      "zap": "RED",
      "pink": "GRAY",
      "channel": "down",
      "rsi": 51.28,
      "macdAbove": false,
      "emaFast": 64728.73,
      "emaMid": 64341,
      "emaSlow": 65049.59,
      "railUp": 93947,
      "railDn": 56520.65,
      "pivotHi": 82850,
      "pivotLo": 57800.19,
      "pivotSmallUp": 68086.27,
      "pivotSmallDn": 64059.63,
      "poc": 0,
      "up": {
        "name": "ממוצע מהיר · Day",
        "px": 64728.73,
        "distPct": 0.28409478233602325,
        "tf": "Day"
      },
      "down": {
        "name": "ממוצע אמצע · Day",
        "px": 64341,
        "distPct": 0.316614548280466,
        "tf": "Day"
      }
    },
    {
      "tf": "3D",
      "role": "wide",
      "bub": "LL",
      "bubHe": "תחתית חדשה",
      "bubPx": 58115.01,
      "oppPx": 82850,
      "swingPct": 29.86,
      "stack": "bear",
      "zap": "RED",
      "pink": "GRAY",
      "channel": "down",
      "rsi": 44.48,
      "macdAbove": true,
      "emaFast": 64307.5,
      "emaMid": 65744.75,
      "emaSlow": 69785.25,
      "railUp": 71849.7,
      "railDn": 15630.77,
      "pivotHi": 82850,
      "pivotLo": 60000,
      "pivotSmallUp": 56617.33,
      "pivotSmallDn": 52845.57,
      "poc": 0,
      "up": {
        "name": "ממוצע אמצע · 3D",
        "px": 65744.75,
        "distPct": 1.8582125810437797,
        "tf": "3D"
      },
      "down": {
        "name": "ממוצע מהיר · 3D",
        "px": 64307.5,
        "distPct": 0.36851603275587985,
        "tf": "3D"
      }
    },
    {
      "tf": "Week",
      "role": "wide",
      "bub": "LL",
      "bubHe": "תחתית חדשה",
      "bubPx": 58115.01,
      "oppPx": 123218,
      "swingPct": 52.84,
      "stack": "bull",
      "zap": "RED",
      "pink": "GRAY",
      "channel": "down",
      "rsi": 39.5,
      "macdAbove": true,
      "emaFast": 69983.54,
      "emaMid": 0,
      "emaSlow": 63326.08,
      "railUp": 144607.11,
      "railDn": 51902.51,
      "pivotHi": 126199.63,
      "pivotLo": 60000,
      "pivotSmallUp": 93614.29,
      "pivotSmallDn": 56802.15,
      "poc": 0,
      "up": {
        "name": "ממוצע מהיר · Week",
        "px": 69983.54,
        "distPct": 8.425361637149429,
        "tf": "Week"
      },
      "down": {
        "name": "ממוצע איטי · Week",
        "px": 63326.08,
        "distPct": 1.8890281191397784,
        "tf": "Week"
      }
    }
  ],
  "lines": [
    "בינתיים להמתין לממוצע מהיר 4H ב־64,440.51",
    "כניסת לונג: 64,440.51 · ממוצע מהיר · 4H · להמתין לירידה לאזור",
    "כניסת שורט: 64,977.44 · פיבוט קטן עליון · 4H · להמתין לעלייה לאזור",
    "עודכן מפעימת דקה HH"
  ]
}
```
