# גוב מקומי: מחיר TWS → BTC CHEF

**חובה בהתקנת מחשב חדש.**

המקור בגיט והתקנה המלאה:

[INSTALL-TWS-BRIDGE.md](../tv-stack-listener/docs/INSTALL-TWS-BRIDGE.md)

בפרויקט
tv-stack-listener:

```
scripts/tws-bridge/install-mac.sh
```

## התקנה מהירה

פרודקשן:

```bash
cd .tmp/tv-stack-listener
bash scripts/tws-bridge/install-mac.sh --target vercel
```

לוקאל:

```bash
bash scripts/tws-bridge/install-mac.sh --target local
```

VPS / שרת אחר:

```bash
bash scripts/tws-bridge/install-mac.sh --target 'https://YOUR-HOST/api/tws/quote'
```

## למה חובה

בדיקת
TWS
מול לוקאל או מול שרת אחר בלי הגשר = מסך מטעה.
«חוזה תקין» לא אומר שהמחיר חי בשרת.

## עצירה

```bash
launchctl bootout gui/$(id -u)/com.ronbelson.mbt-quote-bridge
pkill -f mbt-quote-bridge 2>/dev/null || true
```
