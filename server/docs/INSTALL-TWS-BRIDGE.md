# התקנת גשר TWS → BTC CHEF (חובה)

חובה בכל מחשב חדש שממנו בודקים או מריצים פייפר מול
BTC CHEF.

בלי הגשר:
המסך יכול להראות «חוזה תקין»
אבל המחיר יהיה «TWS ישן»
והמילויים יעברו למחיר TradingView במקום ספר חי.

## מה חייב לרוץ על המחשב

1. Interactive Brokers
TWS
(או Gateway) עם API פתוח
2. גשר הקריאה בלבד
`mbt-quote-bridge.mjs`
3. גוב שמפקח ומריץ מחדש
`mbt-quote-bridge-watch.sh`
דרך
LaunchAgent

הגשר רק קורא bid/ask. לא שולח פקודות.

## קבצים בגיט

בפרויקט
tv-stack-listener:

```
scripts/tws-bridge/
  install-mac.sh
  mbt-quote-bridge.mjs
  mbt-quote-bridge-watch.sh
  com.ronbelson.mbt-quote-bridge.plist.template
  package.json
```

סוד הוובהוק:

```
WEBHOOK_URL.txt
```

(לא להעלות סוד ציבורי. בקלונים פרטיים / מקומי בלבד.)

תיעוד מקביל ב־soulmatch:

```
.tmp/btc-indicators/14-tws-bridge-watchdog.md
.tmp/btc-indicators/13-btc-chef-rules.md
```
סעיף 0.2

## התקנה על מק חדש

```bash
cd /path/to/tv-stack-listener
# ודא שיש WEBHOOK_URL.txt עם secret=…
bash scripts/tws-bridge/install-mac.sh --target vercel
```

אחרי התקנה בדוק:

```bash
launchctl print gui/$(id -u)/com.ronbelson.mbt-quote-bridge | head -30
tail -20 scripts/tws-bridge/logs/mbt-quote-bridge-watch.log
curl -sS https://tv-stack-listener.vercel.app/api/tws/quote | python3 -m json.tool | head -25
```

במסך הדוח אמור להופיע
TWS חי
לא ישן.

## יעדים: פרודקשן / לוקאל / VPS

אותו גשר. משנים רק כתובת היעד.

### פרודקשן Vercel (ברירת מחדל)

```bash
bash scripts/tws-bridge/install-mac.sh --target vercel
```

כתובת:

```
https://tv-stack-listener.vercel.app/api/tws/quote
```

### CHEF לוקאלי על המק

קודם:

```bash
npm run dev
```

אחר כך:

```bash
bash scripts/tws-bridge/install-mac.sh --target local
```

כתובת:

```
http://127.0.0.1:3010/api/tws/quote
```

### שרת אחר / VPS

```bash
bash scripts/tws-bridge/install-mac.sh --target 'https://YOUR-HOST/api/tws/quote'
```

אותו
secret
שמוגדר בשרת כי
TV_WEBHOOK_SECRET
חייב להתאים.

### מלאי שרת Hetzner (גשר תמיד דולק)

נועד להריץ שער אינטרקטיב + גשר מחיר בלי המק הביתי.

| שדה | ערך |
|-----|-----|
| ספק | Hetzner Cloud |
| שם | ubuntu-4gb-hel1-1 |
| סוג | CX23 |
| מערכת | Ubuntu |
| מעבד | 2 vCPU |
| זיכרון | 4 GB |
| דיסק | 40 GB |
| מיקום | Helsinki · eu-central |
| מחיר | כ־6.49 € לחודש |
| IP | 46.62.145.112 |
| גיבויים | כבוי כרגע |
| סטטוס פתיחה | Server started · 2026-08-07 |

הערה:
הלסינקי בסדר להתחלה.
אם יהיו בעיות השהייה מול אינטרקטיב /
CME
אפשר להעביר לאשבורן בהמשך.

כניסה מהמק:

```bash
ssh root@46.62.145.112
```

מפתח מקומי מומלץ להוסיף בקונסולה:

```
~/.ssh/id_ed25519.pub
```

התקנת שער + גשר על השרת: עדיין פתוח.
אחרי כניסת
SSH
עובדת.

### החלפת חוזה / פורט

```bash
bash scripts/tws-bridge/install-mac.sh --target vercel --symbol MBTQ6 --port 7496
```

Paper TWS לרוב 7497. Live/שער לפי ההגדרה אצלך.

## הגדרות TWS חובה

- Enable ActiveX and Socket Clients
- פורט תואם ל־
IB_PORT
- Trusted IPs כולל
127.0.0.1
- נתוני שוק ל־
CME
MBT

## מה הגוב בודק

כל 15 שניות:
גיל המחיר בשרת היעד.

אם מעל 45 שניות, או שהתהליך מת, או שאין תשובה:
הורג ומפעיל מחדש את הגשר.

## עצירה

```bash
launchctl bootout gui/$(id -u)/com.ronbelson.mbt-quote-bridge
pkill -f mbt-quote-bridge 2>/dev/null || true
```

## טעויות נפוצות

| מסך | משמעות |
|-----|--------|
| חוזה תקין + TWS ישן | TWS פתוח אצלך, הגשר/גוב לא דוחפים לשרת |
| אין מחיר מ־TWS | אין הצעת מחיר בשרת בכלל |
| חוזה לא צפוי | עדכן expected או `--symbol` |

## זרימת נתונים

```
TWS (מקומי)
  → gish mbt-quote-bridge (מקומי, קריאה בלבד)
    → POST /api/tws/quote (Vercel / לוקאל / VPS)
      → BTC CHEF paper mark + UI «חי»
```

TradingView Hook נפרד.
הוא לא מחליף את גשר
TWS.
