#!/usr/bin/env python3
"""Count break/cut attempts of a price line from webhook event history.

Local only. No deploy.
"""

from __future__ import annotations

import json
from typing import Any


def _rel(price: float, level: float, eps: float = 0.0003) -> str:
    if price > level * (1.0 + eps):
        return "above"
    if price < level * (1.0 - eps):
        return "below"
    return "at"


def _near(price: float, level: float, pct: float = 0.12) -> bool:
    if level == 0:
        return False
    return abs(price - level) / level * 100.0 <= pct


def extract_series(
    events: list[dict[str, Any]],
    *,
    tf: str = "4H",
    field: str = "mm",
) -> list[dict[str, Any]]:
    """Oldest → newest rows of price vs target line."""
    rows: list[dict[str, Any]] = []
    for e in reversed(events or []):
        p = e.get("payload") or e
        price = p.get("price")
        t = e.get("receivedAt") or p.get("time") or p.get("receivedAt")
        tfs = p.get("tfs") or []
        pack = next((x for x in tfs if x.get("tf") == tf), None)
        if pack is None or price is None:
            continue
        level = pack.get(field)
        if level is None:
            continue
        try:
            price_f = float(price)
            level_f = float(level)
        except (TypeError, ValueError):
            continue
        rows.append(
            {
                "t": t,
                "price": price_f,
                "level": level_f,
                "rel": _rel(price_f, level_f),
                "tf": tf,
                "field": field,
                "bub": pack.get("bub"),
                "zap": pack.get("zap"),
                "channel": pack.get("channel"),
            }
        )
    return rows


def cluster_attempts(
    rows: list[dict[str, Any]],
    *,
    approach_pct: float = 0.12,
    reject_pct: float = 0.08,
) -> list[dict[str, Any]]:
    """Cluster touches/crosses from below into attempts with reject or open."""
    attempts: list[dict[str, Any]] = []
    i = 0
    n = len(rows)
    while i < n:
        r = rows[i]
        price = r["price"]
        level = r["level"]
        if not (_near(price, level, approach_pct) or r["rel"] in ("at", "above")):
            i += 1
            continue

        start_t = r["t"]
        start_px = price
        peak = price
        peak_t = r["t"]
        crossed = price > level
        reject_t = None
        reject_px = None
        open_attempt = True
        j = i

        while j < n:
            cur = rows[j]
            pj = cur["price"]
            lj = cur["level"]
            if pj >= peak:
                peak = pj
                peak_t = cur["t"]
            if pj > lj:
                crossed = True
            # Rejected: back clearly below after having touched/crossed
            if (
                cur["rel"] == "below"
                and not _near(pj, lj, reject_pct)
                and peak >= lj * 0.999
            ):
                reject_t = cur["t"]
                reject_px = pj
                open_attempt = False
                break
            j += 1

        attempts.append(
            {
                "start_t": start_t,
                "start_px": round(start_px, 2),
                "peak_px": round(peak, 2),
                "peak_t": peak_t,
                "reject_t": reject_t,
                "reject_px": None if reject_px is None else round(reject_px, 2),
                "level_px": round(level, 2),
                "crossed": crossed,
                "open": open_attempt,
                "result": "open" if open_attempt else ("reject_after_cross" if crossed else "reject_no_cross"),
            }
        )
        if open_attempt:
            break
        i = max(j, i + 1)
    return attempts


def summarize_attempts(
    attempts: list[dict[str, Any]],
    *,
    tf: str,
    field: str,
    label_he: str,
) -> dict[str, Any]:
    closed = [a for a in attempts if not a.get("open")]
    rejected = [a for a in closed if str(a.get("result", "")).startswith("reject")]
    crossed_then_reject = [a for a in rejected if a.get("crossed")]
    open_ones = [a for a in attempts if a.get("open")]
    open_a = open_ones[-1] if open_ones else None

    he_parts = [
        f"{label_he}.",
        f"ניסיונות סגורים: {len(closed)}.",
        f"נדחו אחרי חיתוך: {len(crossed_then_reject)}.",
        f"נדחו בלי חיתוך מלא: {len(rejected) - len(crossed_then_reject)}.",
    ]
    if open_a:
        he_parts.append("יש ניסיון פתוח עכשיו.")
        if open_a.get("crossed"):
            he_parts.append("כבר מעל הקו. מחכים שיחזיק.")
        else:
            he_parts.append("עדיין מתחת. מתקרב.")
    else:
        he_parts.append("אין ניסיון פתוח.")

    return {
        "tf": tf,
        "field": field,
        "label_he": label_he,
        "level_px": attempts[-1]["level_px"] if attempts else None,
        "closed_count": len(closed),
        "reject_count": len(rejected),
        "reject_after_cross_count": len(crossed_then_reject),
        "open": open_a,
        "attempts": attempts,
        "summary_he": " ".join(he_parts),
        "read_he": (
            "הרבה דחיות עד עכשיו. פריצה חזקה רק אם יחתוך ויישאר מעל."
            if len(crossed_then_reject) >= 2
            else "מעט ניסיונות. עדיין מוקדם לדבר על פריצה חזקה."
        ),
    }


FIELD_LABELS_HE = {
    ("4H", "mm"): "צהוב אמצע ב־4 שעות",
    ("4H", "pm"): "אפור ורוד אמצע ב־4 שעות",
    ("4H", "mf"): "פס מהיר ב־4 שעות",
    ("4H", "ms"): "פס איטי ב־4 שעות",
    ("4H", "srh"): "פיווט קטן עליון ב־4 שעות",
    ("Day", "mf"): "פס מהיר ביום",
    ("Day", "mm"): "צהוב אמצע ביום",
    ("Day", "pm"): "אפור ורוד אמצע ביום",
    ("Day", "ms"): "פס איטי ביום",
}


def analyze_line(
    events: list[dict[str, Any]],
    *,
    tf: str = "4H",
    field: str = "mm",
) -> dict[str, Any]:
    rows = extract_series(events, tf=tf, field=field)
    attempts = cluster_attempts(rows)
    label = FIELD_LABELS_HE.get((tf, field), f"{tf} {field}")
    out = summarize_attempts(attempts, tf=tf, field=field, label_he=label)
    out["samples"] = len(rows)
    return out


DEFAULT_LINES = [
    ("4H", "mm"),
    ("4H", "pm"),
    ("4H", "srh"),
    ("Day", "mf"),
    ("Day", "ms"),
]


def analyze_default_lines(events: list[dict[str, Any]]) -> dict[str, Any]:
    lines = [analyze_line(events, tf=tf, field=field) for tf, field in DEFAULT_LINES]
    primary = lines[0] if lines else None
    return {
        "primary": primary,
        "lines": lines,
        "ui_he": (primary or {}).get("summary_he"),
        "read_he": (primary or {}).get("read_he"),
    }


def events_from_api_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        evs = payload.get("events")
        if isinstance(evs, list):
            return evs
    if isinstance(payload, list):
        return payload
    return []


if __name__ == "__main__":
    import subprocess
    import sys

    raw = subprocess.check_output(
        ["curl", "-sS", "https://tv-stack-listener.vercel.app/api/tv/events?limit=200"],
        timeout=60,
    )
    data = json.loads(raw.decode())
    report = analyze_default_lines(events_from_api_payload(data))
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
    print()
