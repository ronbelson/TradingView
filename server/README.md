# TV Stack Listener (BTC CHEF)

חלק מריפו [TradingView](../README.md) (תיקיית `server/`).

מאזין לבועות TradingView + יומן פייפר + סימן מחיר מ־TWS.

## דפים

- דשבורד ישן: https://tv-stack-listener.vercel.app
- שף: https://tv-stack-listener.vercel.app/report

## חובה במחשב חדש: גשר TWS

בלי גשר מקומי המחיר בשרת נהיה «ישן» גם אם TWS פתוח אצלך.

מדריך מלא:

[docs/INSTALL-TWS-BRIDGE.md](docs/INSTALL-TWS-BRIDGE.md)

התקנה:

```bash
bash scripts/tws-bridge/install-mac.sh --target vercel
# או --target local
# או --target 'https://YOUR-VPS/api/tws/quote'
```

קבצים:

```
scripts/tws-bridge/
```

## מה זה שומר

כל POST מטריידינג ויו נשמר פעמיים:

1. `latest` — הסנאפשוט האחרון
2. `events` — היסטוריה קצרה

אחרי השמירה רצה גם עסקת פייפר ל־Blob.
יומן הפעולות מצטבר (עד כ־5000 שורות), בלי מחיקת היסטוריה.

מילוי פייפר מעדיף bid/ask מ־TWS רק כשהציטוט טרי (גשר חי).
אחרת נופלים למחיר מההוק.

### Vercel

Uses **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set.

Env בפרודקשן:
- `TV_WEBHOOK_SECRET`
- `BLOB_READ_WRITE_TOKEN`

קריאה:
- GET `/api/tv/latest`
- GET `/api/structure`
- GET `/api/paper`
- GET `/api/tws/quote`

## חשוב

- פייפר בלבד ביומן
- Hook של TradingView מעיר את השרת
- סימן TWS דורש גשר+גוב על המחשב (או VPS שמחובר ל־TWS)
