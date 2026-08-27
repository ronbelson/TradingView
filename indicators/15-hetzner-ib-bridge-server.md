# שרת Hetzner לגשר אינטרקטיב

מטרה:
שער אינטרקטיב + גשר מחיר תמיד דולק.
לא דרך המק הביתי.

קונסולה:
https://console.hetzner.cloud

## מלאי

| שדה | ערך |
|-----|-----|
| שם | ubuntu-4gb-hel1-1 |
| סוג | CX23 |
| מערכת | Ubuntu |
| מעבד | 2 vCPU |
| זיכרון | 4 GB |
| דיסק | 40 GB |
| מיקום | Helsinki · eu-central |
| מחיר | כ־6.49 € לחודש |
| IP | 46.62.145.112 |
| גיבויים | כבוי |
| נפתח | 2026-08-07 |
| מערכת בפועל | Ubuntu 26.04 LTS |
| כניסת SSH | עובדת עם מפתח mac (id_ed25519) · אומת 2026-08-07 |
| הערה | מפתח הוזן דרך Rescue ואז Reset לאובונטו |

## ניהול ב־API / שורת פקודה

תיעוד:
https://docs.hetzner.cloud/reference/cloud#tag/servers

בסיס:
https://api.hetzner.cloud/v1

טוקן:
בקונסולה → Security → API Tokens
Read & Write לפרויקט הזה בלבד.

כותרת בכל בקשה:

```bash
Authorization: Bearer $API_TOKEN
```

חלופה נוחה:
כלי
hcloud
במקום קריאות ידניות.

### שרתים עיקר

- רשימה
`GET /servers`
- יצירה
`POST /servers`
חובה: name, server_type, image
אופציה חשובה: ssh_keys
רשימת מזהים או שמות מפתחות מהפרויקט
- שליפה
`GET /servers/{id}`
- מחיקה
`DELETE /servers/{id}`

פעולות על שרת קיים
`POST /servers/{id}/actions/...`

בין היתר:

- poweron / poweroff / reboot / reset / shutdown
- enable_rescue
אפשר להעביר ssh_keys גם כאן
- disable_rescue
- rebuild
- create_image
- change_type
- enable_backup / disable_backup

### למה נתקענו במפתח

מפתח ב
Security
לא נכנס לבד לשרת שכבר רץ.
חייבים:

1. בזמן יצירה: גוף היצירה כולל ssh_keys
או
2. enable_rescue עם ssh_keys ואז כתיבה לדיסק כמו שעשינו

דוגמת יצירה נכונה:

```bash
curl -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"chef-bridge",
    "server_type":"cx23",
    "image":"ubuntu-24.04",
    "location":"hel1",
    "ssh_keys":["mac-ron"]
  }' \
  'https://api.hetzner.cloud/v1/servers'
```

כך ביצירה הבאה לא צריך Rescue.

## זרימה מתוכננת

```
IB Gateway על Hetzner
  → mbt-quote-bridge על אותו שרת
    → POST https://tv-stack-listener.vercel.app/api/tws/quote
      → BTC CHEF חי
```

תיעוד התקנת גשר:
`../tv-stack-listener/docs/INSTALL-TWS-BRIDGE.md`
