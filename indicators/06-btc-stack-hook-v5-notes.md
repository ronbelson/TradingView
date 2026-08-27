# Hook paste notes (facts_v6 → scene_v1)

## Idea
1m chart only wakes the webhook.
Decision picture is multi-TF with **4H center**.

## Payload
- `schema`: `facts_v6`
- `centerTf`: `4H`
- `chart`: pulse only (bubble / bubPx / oppPx)
- `tfs[]`: lean rows for 15m…Week

## After paste
1. Save Hook
2. Recreate alert: Any alert() · Once Per Bar Close · webhook
Webhook URL (copy):
https://tv-stack-listener.vercel.app/api/tv/webhook?secret=E4IptaPc5lYn88SrQ3qlipTy9NCgkK6I
3. Refresh dashboard — it shows `scene_v1` only

Dashboard: https://tv-stack-listener.vercel.app
Doc: `.tmp/tv-stack-listener/WEBHOOK_URL.txt` · README § TradingView Alert
Spec: `10-scene-v1.md`
