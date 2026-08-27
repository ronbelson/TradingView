# Hook facts_v3 — full story fields

Paste updated `06-btc-stack-hook.pine` and recreate the alert.

## New per-TF fields
| Field | Meaning |
|-------|---------|
| bubPx | Price of active bubble extreme |
| ph / ph2 | Last + previous large pivot high anchors |
| pl / pl2 | Last + previous large pivot low anchors |
| srh / srl | Small-pivot rail up / down now |

## Already enough for magnets (computed in listener)
From mf/mm/ms/mx vs c → nearest EMA/SMA above and below, ordered targets.

## Listener
`src/lib/enrich-story.js` → `story_pack_v1` for Claude.
