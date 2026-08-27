# TradingView

אינדיקטורי Pine, שרת webhook, פייפר, וגשר TWS לביטקוין.

פרויקט נפרד. לא קשור ל-SoulMatch.

## מבנה

| תיקייה | תוכן |
|--------|------|
| `indicators/` | סקריפטי Pine, מסמכי לוגיקה, כלי Python מקומיים |
| `server/` | Next.js: webhook, פייפר, דשבורד, גשר TWS |

## אינדיקטורים

קבצי `-PASTE.pine` מיועדים להדבקה ב-TradingView.

התחלה: [indicators/00-architecture.md](indicators/00-architecture.md)

## שרת

מדריך מלא: [server/README.md](server/README.md)

גשר TWS: [server/docs/INSTALL-TWS-BRIDGE.md](server/docs/INSTALL-TWS-BRIDGE.md)

פרודקשן (Vercel):

- https://tv-stack-listener.vercel.app
- https://tv-stack-listener.vercel.app/report

אחרי מעבר הריפו: לחבר מחדש את Vercel לתיקייה `server/` בריפו הזה.

```bash
cd server
npm install
npm run dev
```

## היסטוריה

- אינדיקטורים: לשעבר ב-`soulmatch/.tmp/btc-indicators`
- שרת: לשעבר ב-`github.com/ronbelson/tv-stack-listener`
