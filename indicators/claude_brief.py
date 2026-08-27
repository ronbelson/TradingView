#!/usr/bin/env python3
"""Ask Claude (Haiku) to write short Hebrew from locked facts. Local only."""

from __future__ import annotations

import json
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SOUL_ENV = Path("/Users/ronbelson/Projects/soulmatch/.env.local")
CACHE_PATH = ROOT / ".claude-brief-cache.json"
MODEL = "claude-haiku-4-5-20251001"

SYSTEM = """אתה כותב מסך קצר לסוחר ביטקוין בעברית פשוטה.
רק מהעובדות ב-JSON.
אסור להמציא מחיר.
אסור אנגלית באמצע משפט עברי.
משפטים קצרים.
מחירים רק במספרים שלמים. בלי נקודה עשרונית.

יש שדה trade_tf_he: פס הזמן שבו הסוחר באמת נכנס.
חובה לכתוב מסקנות לפס הזה.
עדיין לקרוא את האבות מלמעלה (שבוע / 3 ימים / יום / 4 שעות) כהקשר.

חוק צד חובה:
1. אם vs_gray_pink = below: אסור להציג כניסת לונג פעילה. אפשר רק המתנה ללונג או שורט פעיל.
2. אם pink ב־4 שעות = GRAY: אין אישור עלייה ורוד.
3. בועת LH / שיא נמוך יותר ליד מחיר גבוה = לחץ ירידה או תקרת שורט בפסים הקצרים.
4. בפסים 15 דקות / 30 דקות / שעה: אם מתחת לאפור ורוד ויש בועת LH או זאפ אדום בקצרים, הצד הפעיל הוא שורט או המתנה בשורט. לא לונג.
5. לונג רק אחרי מעבר והחזקה מעל האפור הוורוד או מעל confirm_px לפי הקלט.
6. אם bias_hint_he קיים בקלט: חייב להתיישר איתו. לא לסתור.
7. אין פס 5 דקות בהוק. אל תמציא אותו. הקרוב הוא 15 דקות.

מסלול אחרי נקודת שורט חובה:
אם missed_short_entry = true:
א. ב־missed_path_he: לכתוב שפיספסנו או שעברנו את נקודת הכניסה לשורט, עם המחיר מהקלט.
ב. ב־now_path_he: מה עכשיו בלבד. אחת מאלה לפי העובדות, בלי לרדוף סתם:
   - כבר בפנים מהנקודה שעברה
   - לחכות לנסיגה למעלה שתידחה מתחת לקו אישור/אפור
   - לחכות לשבירה הבאה מתחת לתחתית/בועת LL אם יש מחיר בקלט
   - בלי כניסה חדשה עכשיו כי המחיר רחוק מדי מהנקודה
ג. ב־story_he: משפט 1 = מה פיספסנו. משפט 2 = מה עושים עכשיו.
ד. אסור להציג כניסת שורט כאילו הנקודה עדיין חיה אם המחיר כבר עבר אותה למטה.
אם missed_short_entry = false והצד שורט:
כתוב איפה נכנסים עכשיו או למה עוד מחכים, עם מחיר מהקלט.

אם trade_tf הוא 15 דקות או 30 דקות או שעה: תזמון לפי הקצרים מול האבות.
אם trade_tf הוא 4 שעות: מסגרת רחבה. הקצרים רק לאישור תזמון.

חובה להסיק מכל העובדות יחד:
הסתברויות, מרחק מקו הפריצה, כמה נדחה אחרי חיתוך, צבעי הזמנים, מקאד ו־RSI אם יש.
ב־why_he לפחות מסקנה אחת על פס הסחר, ומסקנה אחת על הצד הפעיל עכשיו (שורט או לונג או המתנה).
אם יש path_hint_he בקלט: להתיישר איתו.
אל תכתוב רק רשימת מחירים.

אם המחיר קרוב מאוד לקו הפריצה אבל נדחה כמה פעמים:
כתוב במפורש שנגיעה זה לא אישור.
צריך מעבר והחזקה.

confirm_px חייב להיות מהקלט בלבד.
cancel_px חייב להיות מהקלט בלבד.
confirm_px = תנאי לונג ממבנה 4 שעות (צהוב אמצע). לא נקודת שורט.
cancel_px = נקודת שורט / תמיכה ממבנה 4 שעות (פיווט נמוך). לא תנאי לונג.
ב־why_confirm_he: להסביר רק את confirm_px כתנאי לונג ממבנה 4 שעות.
אסור לערבב ב־why_confirm_he את cancel_px או נקודת שורט.
אם trade_tf אינו 4 שעות: התזמון והמסקנות לפס הסחר, אבל קווי המבנה (confirm/cancel/אפור ורוד) נשארים מ־4 שעות. לציין את זה בבירור ב־why או ב־story כשצריך.

אפור על הגרף = פס ורוד אמצע (pm). צהוב אמצע = mm. לא לערבב.

גאפי נפח / איזון (חובה אם יש בקלט):
nearest_gap ו־gaps_board מגיעים מההוק.
גאפ למעלה מושך למעלה. גאפ למטה מושך למטה.
חובה לציין איזה גאפ יותר קרוב למחיר, באיזה פס, ואם המחיר עולה או יורד אליו.
zv = אזור בלי נפח. fvg = פער נרות. לא להמציא גאפ בלי מחיר בקלט.

החזר JSON בלבד:
{
  "side_he": "שורט פעיל / לונג פעיל / המתנה ללונג / המתנה לשורט",
  "missed_path_he": "מה פיספסנו או איזה נקודה כבר עברה. או מחרוזת ריקה",
  "now_path_he": "מה עושים עכשיו אחרי הנקודה שעברה או לפני הכניסה",
  "do_he": "משפט קצר מה לעשות עכשיו בפס הסחר שנבחר",
  "why_he": ["מסקנה 1 לפס הסחר עם מחיר שלם", "מסקנה 2 על הצד הפעיל או המסלול שפוספס", "מסקנה 3 מהאבות", "מסקנה 4 אופציונלי"],
  "wait_for_he": "למה מחכים בפס הסחר. עם מחיר שלם מהקלט",
  "confirm_px": מספר שלם מהקלט או null,
  "cancel_px": מספר שלם מהקלט או null,
  "why_confirm_he": "למה confirm_px הוא תנאי לונג ממבנה 4 שעות. בלי לערבב עם נקודת שורט",
  "story_he": "2 משפטים: מה היה / מה עכשיו"
}
"""

TRADE_TF_HE = {
    "15m": "15 דקות",
    "30m": "30 דקות",
    "1H": "שעה",
    "4H": "4 שעות",
}
ALLOWED_TRADE_TF = set(TRADE_TF_HE)


def normalize_trade_tf(raw: str | None) -> str:
    v = (raw or "4H").strip()
    if v in ("15", "15m", "15M"):
        return "15m"
    if v in ("30", "30m", "30M"):
        return "30m"
    if v in ("1H", "1h", "60", "1"):
        return "1H"
    if v in ("4H", "4h", "240", "4"):
        return "4H"
    return "4H" if v not in ALLOWED_TRADE_TF else v


def _load_api_key() -> str:
    if not SOUL_ENV.exists():
        raise RuntimeError("missing .env.local")
    for line in SOUL_ENV.read_text().splitlines():
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("missing ANTHROPIC_API_KEY")


def _facts_for_claude(brief: dict[str, Any]) -> dict[str, Any]:
    primary = brief.get("cuts") or {}
    now = brief.get("now_px")
    conf = brief.get("confirm_px")
    dist = None
    if isinstance(now, (int, float)) and isinstance(conf, (int, float)):
        dist = round(float(conf) - float(now), 2)
    trade_tf = normalize_trade_tf(brief.get("trade_tf"))
    tf_progress = brief.get("tf_progress") or []
    signals = brief.get("signals") or []
    trade_row = next((x for x in tf_progress if x.get("tf") == trade_tf), None)
    trade_sig = next((x for x in signals if x.get("tf") == trade_tf), None)
    h4_sig = next((x for x in signals if x.get("tf") == "4H"), None) or {}
    gray = brief.get("gray_pink_px")
    vs_pink = None
    if isinstance(now, (int, float)) and isinstance(gray, (int, float)):
        if now < gray * 0.9997:
            vs_pink = "below"
        elif now > gray * 1.0003:
            vs_pink = "above"
        else:
            vs_pink = "at"
    bub = (trade_sig or {}).get("bub") or h4_sig.get("bub")
    bub_px = (trade_sig or {}).get("bubPx")
    if bub_px is None:
        bub_px = h4_sig.get("bubPx")
    bub_he = {
        "LH": "שיא נמוך יותר. לחץ ירידה או תקרה",
        "HH": "שיא גבוה יותר. המשך עלייה אפשרי",
        "HL": "תחתית גבוהה. תמיכה עולה",
        "LL": "תחתית נמוכה יותר. לחץ ירידה",
    }.get(str(bub or ""), None)
    under_lh_cap = (
        isinstance(now, (int, float))
        and isinstance(bub_px, (int, float))
        and str(bub or "") == "LH"
        and now < float(bub_px)
    )
    short_lean = trade_tf in ("15m", "30m", "1H") and (
        vs_pink == "below"
        or under_lh_cap
        or (h4_sig.get("pink") == "GRAY" and str(bub or "") in ("LH", "LL"))
    )
    if short_lean:
        bias_hint = (
            "בפסים הקצרים הצד הפעיל הוא שורט או המתנה בשורט. "
            "ורוד אפור או מתחת/מתחת לבועת שיא נמוך. "
            "אפשר לחכות ללונג רק כתנאי עתידי. לא להציג לונג פעיל עכשיו."
        )
    elif vs_pink == "below":
        bias_hint = "מתחת לאפור ורוד. אין לונג פעיל. רק המתנה ללונג או שורט."
    else:
        bias_hint = None

    cancel = brief.get("cancel_px")
    short_entry_px = (
        int(round(float(cancel))) if isinstance(cancel, (int, float)) else None
    )
    next_low_px = None
    if isinstance(bub_px, (int, float)) and str(bub or "") == "LL":
        next_low_px = int(round(float(bub_px)))
    missed_short = bool(
        short_lean
        and isinstance(now, (int, float))
        and isinstance(short_entry_px, int)
        and float(now) < short_entry_px * 0.9995
    )
    dist_below_short = None
    if missed_short and isinstance(now, (int, float)) and short_entry_px is not None:
        dist_below_short = int(round(short_entry_px - float(now)))
    if missed_short:
        path_hint = (
            f"נקודת שורט סביב {short_entry_px} כבר עברה. "
            f"המחיר נמוך ממנה בכ־{dist_below_short}. "
            "חובה לספר שפיספסנו את הנגיעה, ואז מה עושים עכשיו: "
            "כבר בפנים, או המתנה לנסיגה שנדחית, או שבירה הבאה לתחתית אם יש מחיר, "
            "בלי לרדוף סתם."
        )
        if next_low_px is not None:
            path_hint += f" תחתית/בועת LL בקלט: {next_low_px}."
    elif short_lean and short_entry_px is not None:
        path_hint = (
            f"נקודת שורט חיה סביב {short_entry_px}. "
            "עדיין לא עברו אותה. לחכות לנגיעה או לדחייה משם."
        )
    else:
        path_hint = None

    return {
        "trade_tf": trade_tf,
        "trade_tf_he": TRADE_TF_HE.get(trade_tf, trade_tf),
        "trade_tf_state": trade_row,
        "trade_tf_signals": trade_sig,
        "now_px": int(round(float(now))) if isinstance(now, (int, float)) else now,
        "odds": brief.get("odds"),
        "confirm_px": int(round(float(conf))) if isinstance(conf, (int, float)) else conf,
        "cancel_px": short_entry_px,
        "confirm_source_he": brief.get("confirm_source_he")
        or "צהוב אמצע ב־4 שעות מההוק",
        "cancel_source_he": brief.get("cancel_source_he") or "פיווט נמוך ב־4 שעות מההוק",
        "gray_pink_px": int(round(float(gray))) if isinstance(gray, (int, float)) else gray,
        "gray_pink_source_he": brief.get("gray_pink_source_he"),
        "vs_gray_pink": vs_pink,
        "h4_pink": h4_sig.get("pink"),
        "bubble_letter": bub,
        "bubble_px": int(round(float(bub_px))) if isinstance(bub_px, (int, float)) else bub_px,
        "bubble_decode_he": bub_he,
        "bias_hint_he": bias_hint,
        "short_entry_px": short_entry_px,
        "short_entry_source_he": brief.get("cancel_source_he") or "פיווט נמוך ב־4 שעות",
        "missed_short_entry": missed_short,
        "distance_below_short_entry_usd": dist_below_short,
        "next_low_px": next_low_px,
        "path_hint_he": path_hint,
        "no_5m_he": "אין פס 5 דקות בהוק. הקרוב הוא 15 דקות.",
        "distance_to_break_usd": None if dist is None else int(round(dist)),
        "on_or_below_break": None if dist is None else dist >= 0,
        "nearest_gap": brief.get("nearest_gap"),
        "gaps_board": brief.get("gaps_board") or [],
        "gaps_rule_he": (
            "גאפ קרוב מושך את המחיר. למעלה = משיכה למעלה. למטה = משיכה למטה. "
            "ציין פס + סוג (zv או fvg) + מחיר + מרחק מהקלט בלבד."
        ),
        "cut_line_px": (
            int(round(float(primary.get("level_px"))))
            if isinstance(primary.get("level_px"), (int, float))
            else primary.get("level_px")
        ),
        "reject_after_cross": primary.get("reject_after_cross_count"),
        "reject_total_closed": primary.get("reject_count"),
        "attempt_open": primary.get("open"),
        "key_levels": [
            {
                "px": int(round(float(x.get("px")))) if isinstance(x.get("px"), (int, float)) else x.get("px"),
                "name_he": x.get("name_he"),
                "tag_he": x.get("tag_he"),
                "side": x.get("side"),
            }
            for x in (brief.get("tiny_ladder") or [])
        ],
        "tf_progress": tf_progress,
        "signals": signals,
        "read_rule_he": "נגיעה בקו אחרי דחיות אינה כניסה. צריך מעבר והחזקה מעל קו האישור.",
    }


def _hook_sig(facts: dict[str, Any]) -> str:
    """Fingerprint of latest hook facts only. Shared across trade timeframes."""
    return json.dumps(
        {
            "now": facts.get("now_px"),
            "odds": facts.get("odds"),
            "cut": facts.get("cut_line_px"),
            "rej": facts.get("reject_after_cross"),
            "open": bool((facts.get("attempt_open") or {}).get("open")),
            "levels": [(x.get("px"), x.get("tag_he")) for x in (facts.get("key_levels") or [])],
            "pink": facts.get("gray_pink_px"),
            "vs_pink": facts.get("vs_gray_pink"),
            "bub": facts.get("bubble_letter"),
            "h4_pink": facts.get("h4_pink"),
            "missed_short": facts.get("missed_short_entry"),
            "short_entry": facts.get("short_entry_px"),
            "gap": (
                ((facts.get("nearest_gap") or {}).get("nearest") or {}).get("mid_px"),
                ((facts.get("nearest_gap") or {}).get("nearest") or {}).get("kind"),
                (facts.get("nearest_gap") or {}).get("tf"),
            ),
        },
        sort_keys=True,
        ensure_ascii=False,
    )


def _sig(facts: dict[str, Any]) -> str:
    return json.dumps(
        {"trade_tf": facts.get("trade_tf"), "hook": _hook_sig(facts)},
        sort_keys=True,
        ensure_ascii=False,
    )


def _allowed_prices(facts: dict[str, Any]) -> set[float]:
    out: set[float] = set()
    for k in ("now_px", "confirm_px", "cancel_px", "cut_line_px"):
        v = facts.get(k)
        if isinstance(v, (int, float)):
            out.add(round(float(v), 2))
    for x in facts.get("key_levels") or []:
        v = x.get("px")
        if isinstance(v, (int, float)):
            out.add(round(float(v), 2))
    ng = facts.get("nearest_gap") or {}
    n = ng.get("nearest") or {}
    for k in ("mid_px", "lo", "hi"):
        v = n.get(k)
        if isinstance(v, (int, float)):
            out.add(round(float(v), 2))
    for row in facts.get("gaps_board") or []:
        nn = row.get("nearest") or {}
        for k in ("mid_px", "lo", "hi"):
            v = nn.get(k)
            if isinstance(v, (int, float)):
                out.add(round(float(v), 2))
    open_a = facts.get("attempt_open") or {}
    for k in ("peak_px", "level_px", "start_px", "reject_px"):
        v = open_a.get(k)
        if isinstance(v, (int, float)):
            out.add(round(float(v), 2))
    return out


def _price_ok(px: Any, allowed: set[float]) -> bool:
    if px is None:
        return True
    try:
        v = round(float(px), 2)
    except (TypeError, ValueError):
        return False
    if v in allowed:
        return True
    # allow 1 dollar rounding drift
    return any(abs(v - a) <= 1.0 for a in allowed)


def _call_haiku(facts: dict[str, Any]) -> dict[str, Any]:
    key = _load_api_key()
    user = (
        "<facts>\n"
        + json.dumps(facts, ensure_ascii=False)
        + "\n</facts>\n"
        + "<task>כתוב את שדות המסך הקצר לפי SYSTEM. JSON בלבד. בלי מרכאות בתוך ערכי הטקסט. משפטים קצרים.</task>"
    )
    body = {
        "model": MODEL,
        "max_tokens": 1100,
        "temperature": 0.1,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = json.loads(r.read().decode())
    except Exception:
        raw = json.loads(
            subprocess.check_output(
                [
                    "curl",
                    "-sS",
                    "https://api.anthropic.com/v1/messages",
                    "-H",
                    "content-type: application/json",
                    "-H",
                    f"x-api-key: {key}",
                    "-H",
                    "anthropic-version: 2023-06-01",
                    "-d",
                    json.dumps(body),
                ],
                timeout=90,
            ).decode()
        )
    if raw.get("error"):
        raise RuntimeError(str(raw["error"]))
    text = "".join(b.get("text", "") for b in (raw.get("content") or []) if b.get("type") == "text").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
        text = text.strip()
    parsed = json.loads(text)
    return {"parsed": parsed, "usage": raw.get("usage"), "model": MODEL}


def _read_cache() -> dict[str, Any]:
    if not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text())
    except Exception:
        return {}


def _write_cache(obj: dict[str, Any]) -> None:
    CACHE_PATH.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def enrich_brief_with_claude(
    brief: dict[str, Any],
    *,
    force: bool = False,
    trade_tf: str | None = None,
) -> dict[str, Any]:
    """Overlay Claude copy. Cache is per trade_tf crossed with latest hook fingerprint.

    force=True means: want a story for this TF now.
    If that TF already has a cache hit for the same hook fingerprint, reuse it.
    Only call Claude when missing for this TF × hook.
    Without force: never block on Claude; reuse TF cache or last available.
    """
    out = dict(brief)
    out["trade_tf"] = normalize_trade_tf(trade_tf or brief.get("trade_tf"))
    out["trade_tf_he"] = TRADE_TF_HE.get(out["trade_tf"], out["trade_tf"])
    facts = _facts_for_claude(out)
    hook_sig = _hook_sig(facts)
    tf = out["trade_tf"]
    cache = _read_cache()
    by_tf = cache.get("by_tf") if cache.get("hook_sig") == hook_sig else None
    if not isinstance(by_tf, dict):
        by_tf = {}
    slot = by_tf.get(tf) if isinstance(by_tf.get(tf), dict) else None
    parsed = None

    def _apply_meta(src: str, slot_obj: dict[str, Any], note: str) -> None:
        nonlocal parsed
        parsed = slot_obj.get("parsed")
        out["copy_source"] = src
        out["note_he"] = note
        out["story_updated_at"] = slot_obj.get("ts")
        out["claude_usage"] = slot_obj.get("usage")
        out["cache_hit_tf"] = True

    if slot and isinstance(slot.get("parsed"), dict):
        # Same hook + same TF already computed
        if force:
            _apply_meta(
                "claude_cache",
                slot,
                f"סיפור מקלאוד במטמון ל{out['trade_tf_he']}. אותו הוק. בלי קריאה חדשה.",
            )
        else:
            _apply_meta(
                "claude_cache",
                slot,
                f"סיפור מקלאוד במטמון ל{out['trade_tf_he']}. מספרים מההוק.",
            )
    elif force:
        try:
            result = _call_haiku(facts)
            parsed = result["parsed"]
            allowed = _allowed_prices(facts)
            if not _price_ok(parsed.get("confirm_px"), allowed):
                parsed["confirm_px"] = brief.get("confirm_px")
            if not _price_ok(parsed.get("cancel_px"), allowed):
                parsed["cancel_px"] = brief.get("cancel_px")
            slot_new = {
                "ts": time.time(),
                "parsed": parsed,
                "usage": result.get("usage"),
                "model": result.get("model"),
                "sig": _sig(facts),
            }
            # Keep other TFs only if same hook
            if cache.get("hook_sig") == hook_sig and isinstance(cache.get("by_tf"), dict):
                by_tf = dict(cache["by_tf"])
            else:
                by_tf = {}
            by_tf[tf] = slot_new
            _write_cache(
                {
                    "hook_sig": hook_sig,
                    "by_tf": by_tf,
                    "updated_at": time.time(),
                }
            )
            out["copy_source"] = "claude"
            out["note_he"] = f"סיפור מקלאוד חדש ל{out['trade_tf_he']}. מספרים מההוק."
            out["claude_usage"] = result.get("usage")
            out["story_updated_at"] = slot_new["ts"]
            out["cache_hit_tf"] = False
        except Exception as e:
            out["copy_source"] = "template_code"
            out["note_he"] = f"קלאוד נכשל. תבנית קוד. {e}"
            out["cache_hit_tf"] = False
            out["bias_hint_he"] = facts.get("bias_hint_he")
            out["vs_gray_pink"] = facts.get("vs_gray_pink")
            out["missed_short_entry"] = facts.get("missed_short_entry")
            out["short_entry_px"] = facts.get("short_entry_px")
            out["path_hint_he"] = facts.get("path_hint_he")
            out["next_low_px"] = facts.get("next_low_px")
            if facts.get("missed_short_entry") and facts.get("short_entry_px") is not None:
                dist = facts.get("distance_below_short_entry_usd")
                out["missed_path_he"] = (
                    f"נקודת שורט סביב {facts.get('short_entry_px')} כבר עברה"
                    + (f". המחיר נמוך ממנה בכ־{dist}" if dist is not None else "")
                    + "."
                )
                nxt = facts.get("next_low_px")
                now_path = "בלי לרדוף. לחכות לנסיגה שתידחה, או לשבירה הבאה"
                if nxt is not None:
                    now_path += f" מתחת ל־{nxt}"
                now_path += "."
                out["now_path_he"] = now_path
                out["story_he"] = f"{out['missed_path_he']} {out['now_path_he']}"
                out["side_he"] = "המתנה לשורט"
                out["do_he"] = now_path
            return out
    else:
        # No force and no TF cache for this hook: soft-fallback to any same-hook TF, else template
        fallback = None
        if cache.get("hook_sig") == hook_sig and isinstance(cache.get("by_tf"), dict):
            for k in ("4H", "1H", "30m", "15m"):
                cand = cache["by_tf"].get(k)
                if isinstance(cand, dict) and isinstance(cand.get("parsed"), dict):
                    fallback = cand
                    break
        if fallback:
            parsed = fallback.get("parsed")
            out["copy_source"] = "claude_cache"
            out["note_he"] = "סיפור מקלאוד מפס אחר על אותו הוק. בחר פס כדי לרענן מדויק."
            out["story_updated_at"] = fallback.get("ts")
            out["claude_usage"] = fallback.get("usage")
            out["cache_hit_tf"] = False
        else:
            out["copy_source"] = "template_code"
            out["note_he"] = "מספרים מההוק. סיפור תבנית. קלאוד עוד לא רץ לפס הזה."
            out["story_updated_at"] = None
            out["cache_hit_tf"] = False
            # Keep side/path from code brief. Do not leave long-only wait text unexplained.
            out["bias_hint_he"] = facts.get("bias_hint_he")
            out["vs_gray_pink"] = facts.get("vs_gray_pink")
            out["missed_short_entry"] = facts.get("missed_short_entry")
            out["short_entry_px"] = facts.get("short_entry_px")
            out["path_hint_he"] = facts.get("path_hint_he")
            if facts.get("missed_short_entry") and facts.get("short_entry_px") is not None:
                dist = facts.get("distance_below_short_entry_usd")
                out["missed_path_he"] = (
                    f"נקודת שורט סביב {facts.get('short_entry_px')} כבר עברה"
                    + (f". המחיר נמוך ממנה בכ־{dist}" if dist is not None else "")
                    + "."
                )
                nxt = facts.get("next_low_px")
                now_path = "בלי לרדוף. לשורט: נסיגה שתידחה, או שבירה הבאה"
                if nxt is not None:
                    now_path += f" מתחת ל־{nxt}"
                now_path += "."
                if facts.get("confirm_px") is not None:
                    now_path += f" לונג רק מעל {facts.get('confirm_px')} עם החזקה."
                out["now_path_he"] = now_path
                out["side_he"] = "המתנה לשורט"
                out["do_he"] = "צד שורט. בלי כניסה חדשה עכשיו"
                out["wait_for_he"] = (
                    f"לשורט: נסיגה שתידחה או המשך מטה. "
                    f"תנאי לונג בלבד: מעבר והחזקה מעל {facts.get('confirm_px')}."
                )
                out["story_he"] = f"{out['missed_path_he']} {out['now_path_he']}"
                out["why_he"] = [
                    out["missed_path_he"],
                    out["now_path_he"],
                    *(out.get("why_he") or [])[:2],
                ]
            return out

    if not isinstance(parsed, dict):
        return out

    if isinstance(parsed.get("side_he"), str) and parsed["side_he"].strip():
        out["side_he"] = parsed["side_he"].strip()
    if isinstance(parsed.get("missed_path_he"), str) and parsed["missed_path_he"].strip():
        out["missed_path_he"] = parsed["missed_path_he"].strip()
    if isinstance(parsed.get("now_path_he"), str) and parsed["now_path_he"].strip():
        out["now_path_he"] = parsed["now_path_he"].strip()
    if isinstance(parsed.get("do_he"), str) and parsed["do_he"].strip():
        out["do_he"] = parsed["do_he"].strip()
    if isinstance(parsed.get("wait_for_he"), str) and parsed["wait_for_he"].strip():
        out["wait_for_he"] = parsed["wait_for_he"].strip()
    if isinstance(parsed.get("story_he"), str) and parsed["story_he"].strip():
        out["story_he"] = parsed["story_he"].strip()
    if isinstance(parsed.get("why_confirm_he"), str) and parsed["why_confirm_he"].strip():
        why_c = parsed["why_confirm_he"].strip()
        # Guard: never let short-entry text sit under the long-condition label
        bad = ("שורט" in why_c) and ("לונג" not in why_c)
        if bad and brief.get("confirm_source_he"):
            out["why_confirm_he"] = (
                f"תנאי לונג ממבנה 4 שעות: {brief.get('confirm_source_he')}. "
                f"התזמון הוא לפס הסחר {out.get('trade_tf_he') or ''}."
            )
        else:
            out["why_confirm_he"] = why_c
    elif brief.get("confirm_source_he"):
        out["why_confirm_he"] = (
            f"תנאי לונג ממבנה 4 שעות: {brief.get('confirm_source_he')}. "
            f"התזמון הוא לפס הסחר {out.get('trade_tf_he') or ''}."
        )
    why = parsed.get("why_he")
    if isinstance(why, list) and why:
        out["why_he"] = [str(x).strip() for x in why if str(x).strip()][:4]
    out["confirm_px"] = brief.get("confirm_px")
    out["cancel_px"] = brief.get("cancel_px")
    out["bias_hint_he"] = facts.get("bias_hint_he")
    out["vs_gray_pink"] = facts.get("vs_gray_pink")
    out["missed_short_entry"] = facts.get("missed_short_entry")
    out["short_entry_px"] = facts.get("short_entry_px")
    out["path_hint_he"] = facts.get("path_hint_he")
    out["next_low_px"] = facts.get("next_low_px")
    if not out.get("missed_path_he") and facts.get("missed_short_entry") and facts.get("short_entry_px") is not None:
        dist = facts.get("distance_below_short_entry_usd")
        out["missed_path_he"] = (
            f"נקודת שורט סביב {facts.get('short_entry_px')} כבר עברה"
            + (f". המחיר נמוך ממנה בכ־{dist}" if dist is not None else "")
            + "."
        )
    if not out.get("now_path_he") and facts.get("missed_short_entry"):
        nxt = facts.get("next_low_px")
        now_path = "בלי לרדוף. לחכות לנסיגה שתידחה, או לשבירה הבאה"
        if nxt is not None:
            now_path += f" מתחת ל־{nxt}"
        now_path += "."
        out["now_path_he"] = now_path
    if not out.get("why_confirm_he") and brief.get("confirm_source_he"):
        out["why_confirm_he"] = (
            f"תנאי לונג ממבנה 4 שעות: {brief.get('confirm_source_he')}. "
            f"התזמון הוא לפס הסחר {out.get('trade_tf_he') or ''}."
        )
    return out
