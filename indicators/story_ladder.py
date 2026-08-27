#!/usr/bin/env python3
"""Build a vertical story ladder from live hook levels. Local only."""

from __future__ import annotations

from typing import Any


# Hebrew labels for hook fields. Price always shown beside name in UI.
FIELD_HE = {
    "mf": "פס מהיר",
    "mm": "צהוב אמצע",
    "ms": "פס איטי",
    "mx": "פס קיצון",
    "pf": "אפור ורוד מהיר",
    "pm": "אפור ורוד אמצע",
    "ps": "אפור ורוד איטי",
    "rh": "מסילה עליונה",
    "rl": "מסילה תחתונה",
    "ph": "פיווט גבוה",
    "pl": "פיווט נמוך",
    "ph2": "פיווט גבוה רחוק",
    "pl2": "פיווט נמוך רחוק",
    "srh": "פיווט קטן עליון",
    "srl": "פיווט קטן תחתון",
    "bubPx": "בועה",
    "poc": "נפח",
}

TF_HE = {
    "15m": "15 דקות",
    "30m": "30 דקות",
    "1H": "שעה",
    "2H": "שעתיים",
    "4H": "4 שעות",
    "Day": "יום",
    "3D": "3 ימים",
    "Week": "שבוע",
}

# Priority: prefer parent / structural levels when merging close prices
FIELD_WEIGHT = {
    "mm": 90,
    "pm": 92,
    "pf": 78,
    "ps": 76,
    "ms": 88,
    "mf": 80,
    "ph": 85,
    "pl": 85,
    "ph2": 70,
    "pl2": 70,
    "srh": 60,
    "srl": 60,
    "bubPx": 75,
    "poc": 55,
    "rh": 50,
    "rl": 50,
    "mx": 40,
}

TF_WEIGHT = {
    "4H": 100,
    "Day": 95,
    "3D": 90,
    "Week": 85,
    "2H": 70,
    "1H": 65,
    "30m": 55,
    "15m": 50,
}

# Far parent levels can be noisy (rails to 144k). Cap distance for story realism.
MAX_UP_PCT = 12.0
MAX_DN_PCT = 12.0
MERGE_PCT = 0.08


def _num(v: Any) -> float | None:
    try:
        if v is None:
            return None
        x = float(v)
        if x != x:
            return None
        return x
    except (TypeError, ValueError):
        return None


def collect_raw(latest: dict[str, Any]) -> tuple[float | None, list[dict[str, Any]]]:
    price = _num(latest.get("price"))
    rows: list[dict[str, Any]] = []
    for t in latest.get("tfs") or []:
        tf = t.get("tf")
        if not tf:
            continue
        for field, label in FIELD_HE.items():
            px = _num(t.get(field))
            if px is None or px <= 0:
                continue
            if price is not None:
                dist = (px - price) / price * 100.0
                if dist > MAX_UP_PCT or dist < -MAX_DN_PCT:
                    continue
            score = FIELD_WEIGHT.get(field, 30) + TF_WEIGHT.get(tf, 20)
            # Prefer structural 4H/Day for story anchors
            if tf in ("4H", "Day", "3D", "Week") and field in ("mm", "pm", "ms", "mf", "ph", "pl", "ph2", "pl2", "bubPx"):
                score += 15
            rows.append(
                {
                    "px": round(px, 2),
                    "tf": tf,
                    "tf_he": TF_HE.get(tf, tf),
                    "field": field,
                    "kind_he": label,
                    "label_he": f"{label} · {TF_HE.get(tf, tf)}",
                    "score": score,
                    "dist_pct": None if price is None else round((px - price) / price * 100.0, 3),
                }
            )
    return price, rows


def merge_close(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    ordered = sorted(rows, key=lambda r: (-r["score"], abs(r.get("dist_pct") or 0)))
    kept: list[dict[str, Any]] = []
    for r in ordered:
        hit = None
        for k in kept:
            mid = (k["px"] + r["px"]) / 2.0
            if mid == 0:
                continue
            if abs(k["px"] - r["px"]) / mid * 100.0 <= MERGE_PCT:
                hit = k
                break
        if hit is None:
            kept.append(dict(r))
            continue
        # Keep higher score; append alt note
        alts = hit.setdefault("also", [])
        alts.append(r["label_he"])
        if r["score"] > hit["score"]:
            # swap identity but keep also
            also = alts + [hit["label_he"]]
            hit.clear()
            hit.update(r)
            hit["also"] = also
    return sorted(kept, key=lambda r: r["px"], reverse=True)


def mark_roles(
    levels: list[dict[str, Any]],
    price: float | None,
    cuts: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    primary = (cuts or {}).get("primary") if cuts else None
    key_px = _num((primary or {}).get("level_px"))
    for lv in levels:
        tags: list[str] = []
        if price is not None and abs(lv["px"] - price) / price * 100.0 <= 0.05:
            tags.append("עכשיו")
        if key_px is not None and abs(lv["px"] - key_px) / max(key_px, 1) * 100.0 <= 0.08:
            tags.append("קו ניסיונות")
            if primary:
                lv["attempts_he"] = primary.get("summary_he")
                lv["reject_after_cross"] = primary.get("reject_after_cross_count")
                open_a = primary.get("open")
                lv["attempt_open"] = bool(open_a)
        # Story anchors
        if lv["tf"] == "4H" and lv["field"] == "mm":
            tags.append("קו פריצה")
        if lv["tf"] == "4H" and lv["field"] == "pm":
            tags.append("מדף אפור")
        if lv["tf"] == "4H" and lv["field"] == "ms":
            tags.append("צהוב למטה")
        if lv["tf"] == "4H" and lv["field"] == "pl":
            tags.append("תמיכה חזקה")
        if lv["tf"] == "Day" and lv["field"] in ("ms", "bubPx"):
            tags.append("אב יום")
        if lv["tf"] == "3D" and lv["field"] == "mm":
            tags.append("אב 3 ימים")
        if abs(lv.get("dist_pct") or 0) >= 2.5:
            tags.append("רחוק")
        elif abs(lv.get("dist_pct") or 0) <= 0.4:
            tags.append("קרוב")
        lv["tags"] = tags
        side = "at"
        if price is not None:
            if lv["px"] > price * 1.0003:
                side = "up"
            elif lv["px"] < price * 0.9997:
                side = "down"
        lv["side"] = side
    return levels


def build_story_text(price: float | None, levels: list[dict[str, Any]], cuts: dict[str, Any] | None) -> str:
    parts = []
    if price is not None:
        parts.append(f"מחיר עכשיו {price:,.0f}.".replace(",", ","))
    primary = (cuts or {}).get("primary") if cuts else None
    if primary and primary.get("summary_he"):
        parts.append(primary["summary_he"])
        if primary.get("read_he"):
            parts.append(primary["read_he"])
    yellow = next((x for x in levels if "צהוב למטה" in (x.get("tags") or [])), None)
    support = next((x for x in levels if "תמיכה חזקה" in (x.get("tags") or [])), None)
    day_res = next((x for x in levels if x.get("tf") == "Day" and x.get("field") == "ms"), None)
    far_up = next((x for x in levels if x.get("tf") == "Day" and x.get("field") == "bubPx"), None)
    parts.append("תרחיש מרכזי: בדיקה למטה ואז ניסיון פריצה אחרון.")
    if support:
        parts.append(f"תמיכה חזקה {support['px']:,.0f}.".replace(",", ","))
    if yellow:
        parts.append(f"צהוב למטה {yellow['px']:,.0f}.".replace(",", ","))
    parts.append("אם מחזיק: ניסיון פריצה אחרון למעלה.")
    if day_res:
        parts.append(f"התנגדות אב ביום {day_res['px']:,.0f}.".replace(",", ","))
    if far_up:
        parts.append(f"יעד רחוק {far_up['px']:,.0f}.".replace(",", ","))
    if yellow:
        parts.append(f"אם נשבר חזק מתחת ל־{yellow['px']:,.0f}: ירידה חזקה לאבות למטה.".replace(",", ","))
    return " ".join(parts)


def build_ladder(latest_pack: dict[str, Any], cuts: dict[str, Any] | None = None) -> dict[str, Any]:
    latest = latest_pack.get("latest") or latest_pack
    price, raw = collect_raw(latest)
    merged = merge_close(raw)
    levels = mark_roles(merged, price, cuts)
    up = [x for x in levels if x["side"] == "up"]
    down = [x for x in levels if x["side"] == "down"]
    at = [x for x in levels if x["side"] == "at"]
    # Always surface key anchors even if near price
    anchors = [
        x
        for x in levels
        if any(
            t in (x.get("tags") or [])
            for t in ("קו פריצה", "קו ניסיונות", "צהוב למטה", "תמיכה חזקה", "אב יום")
        )
    ]
    up_show = up[:14]
    down_ladder = sorted(down, key=lambda r: r["px"], reverse=True)[:14]

    return {
        "now_px": None if price is None else round(price, 2),
        "story_he": build_story_text(price, levels, cuts),
        "levels": levels,
        "at": at,
        "anchors": anchors,
        "ladder": {
            "up": up_show,
            "down": down_ladder,
        },
        "key_line": (cuts or {}).get("primary"),
        "source": "hook_live",
        "note_he": "רק מחירים מההוק. קווים אלכסוניים מהגרף בלי מחיר בהוק לא נכללים.",
    }


if __name__ == "__main__":
    import json
    import subprocess
    import sys

    from cut_attempts import analyze_default_lines, events_from_api_payload

    latest = json.loads(
        subprocess.check_output(
            ["curl", "-sS", "https://tv-stack-listener.vercel.app/api/tv/latest"],
            timeout=60,
        ).decode()
    )
    events = json.loads(
        subprocess.check_output(
            ["curl", "-sS", "https://tv-stack-listener.vercel.app/api/tv/events?limit=200"],
            timeout=60,
        ).decode()
    )
    cuts = analyze_default_lines(events_from_api_payload(events))
    out = build_ladder(latest, cuts)
    json.dump(
        {
            "now_px": out["now_px"],
            "story_he": out["story_he"],
            "up": [{"px": x["px"], "label_he": x["label_he"], "tags": x["tags"]} for x in out["ladder"]["up"]],
            "down": [{"px": x["px"], "label_he": x["label_he"], "tags": x["tags"]} for x in out["ladder"]["down"]],
        },
        sys.stdout,
        ensure_ascii=False,
        indent=2,
    )
    print()
