"""Structure station report — multi-TF board + next stop down/up.

Uses meter board letters:
  HH / HL = מבנה עולה
  LH / LL = מבנה יורד

Focus: after mid-TF structure breaks, find next station under 4H
and whether price may retest the break or continue.
"""

from __future__ import annotations

from typing import Any, Optional
from datetime import datetime, timezone

from ladder_rules import (
    PaperState,
    decide,
    _board_map,
    _num,
    _tf_map,
)

UP_STRUCT = {"HH", "HL"}
DN_STRUCT = {"LH", "LL"}

BOARD_ORDER = [
    "2m",
    "5m",
    "10m",
    "15m",
    "30m",
    "1H",
    "2H",
    "3H",
    "4H",
    "6H",
    "12H",
    "Day",
]

STATION_TFS = ["4H", "1H", "30m", "15m", "5m", "2m", "Day", "12H", "6H"]
BIG_TFS = ["4H", "6H", "12H", "Day", "3D", "Week"]
EDGE_CONFIRM_TFS = ["1H", "30m", "15m", "5m"]


def _struct_side(bub: str) -> str:
    if bub in UP_STRUCT:
        return "up"
    if bub in DN_STRUCT:
        return "down"
    return "none"


def _struct_he(side: str) -> str:
    if side == "up":
        return "מבנה עולה"
    if side == "down":
        return "מבנה יורד"
    return "אין"


def _level_points(row: dict, tf: str) -> list[dict]:
    """Labeled levels from one TF row."""
    bub = str(row.get("bub") or "")
    out: list[dict] = []
    mapping = [
        ("mf", "ממוצע מהיר"),
        ("mm", "ממוצע אמצע"),
        ("ms", "ממוצע איטי"),
        ("srl", "פיווט קטן תחתון"),
        ("srh", "פיווט קטן עליון"),
        ("rl", "מסילה תחתונה"),
        ("rh", "מסילה עליונה"),
        ("pl", "פיווט גדול תחתון"),
        ("ph", "פיווט גדול עליון"),
        ("pl2", "פיווט גדול תחתון קודם"),
        ("ph2", "פיווט גדול עליון קודם"),
        ("poc", "נקודת נפח"),
    ]
    for key, label in mapping:
        px = _num(row.get(key))
        if px is None:
            continue
        out.append({"tf": tf, "kind": key, "label": label, "px": round(px, 2), "bub": bub})
    bub_px = _num(row.get("bubPx"))
    if bub_px is not None and bub:
        role = "תמיכת בועה" if bub in ("LL", "HL") else "תקרת בועה" if bub in ("HH", "LH") else "מחיר בועה"
        out.append({"tf": tf, "kind": "bubPx", "label": f"{role} {bub}", "px": round(bub_px, 2), "bub": bub})
    opp = _num(row.get("oppPx"))
    if opp is not None:
        out.append({"tf": tf, "kind": "oppPx", "label": "צד נגדי לבועה", "px": round(opp, 2), "bub": bub})
    return out


def _tf_rank(tf: str) -> int:
    try:
        return STATION_TFS.index(tf)
    except ValueError:
        return 99


def _dedupe_stations(rows: list[dict], tol_pct: float = 0.08) -> list[dict]:
    """Merge nearly equal prices; keep nearest sources."""
    rows = sorted(rows, key=lambda r: r["px"])
    merged: list[dict] = []
    for r in rows:
        if not merged:
            merged.append({**r, "sources": [f"{r['tf']}:{r['label']}"]})
            continue
        prev = merged[-1]
        if prev["px"] and abs(r["px"] - prev["px"]) / prev["px"] * 100 <= tol_pct:
            prev["sources"].append(f"{r['tf']}:{r['label']}")
            if _tf_rank(r["tf"]) < _tf_rank(prev["tf"]):
                prev["tf"] = r["tf"]
                prev["label"] = r["label"]
                if "kind" in r:
                    prev["kind"] = r["kind"]
                prev["bub"] = r.get("bub")
        else:
            merged.append({**r, "sources": [f"{r['tf']}:{r['label']}"]})
    return merged


def build_board(snapshot: dict) -> list[dict]:
    tfs = _tf_map(snapshot)
    board = _board_map(snapshot)
    rows = []
    for tf in BOARD_ORDER:
        row = tfs.get(tf) or {}
        bub = board.get(tf) or str(row.get("bub") or "-")
        side = _struct_side(bub)
        rows.append(
            {
                "tf": tf,
                "bub": bub,
                "structure": side,
                "structure_he": _struct_he(side),
                "zap": row.get("zap") or "-",
                "pink": row.get("pink") or "-",
                "channel": row.get("channel") or "-",
                "stk": row.get("stk") or "-",
                "bubPx": _num(row.get("bubPx")),
                "mAbove": row.get("mAbove"),
            }
        )
    return rows


def thin_reclaim(snapshot: dict, price: float) -> dict:
    """Lows start change. Broke thin MAs down → climb back = reclaim attempt to next check."""
    tfs = _tf_map(snapshot)
    notes: list[str] = []
    checks: list[dict] = []

    def mas_from(row: dict) -> list[dict]:
        out = []
        for k, lab in (("mf", "ממוצע מהיר"), ("mm", "ממוצע אמצע"), ("ms", "ממוצע איטי")):
            px = _num(row.get(k))
            if px is not None:
                out.append({"kind": k, "label": lab, "px": round(px, 2)})
        return out

    for tf in ("5m", "2m", "15m", "30m"):
        row = tfs.get(tf) or {}
        bub = str(row.get("bub") or "")
        bub_px = _num(row.get("bubPx"))
        mases = mas_from(row)
        proxy = None
        if tf in ("5m", "2m") and not mases:
            # until hook sends lean MAs; chart thin lines ≈ short-TF ribbon near 15m pack
            prox_row = tfs.get("15m") or tfs.get("30m") or {}
            mases = mas_from(prox_row)
            proxy = "15m" if tfs.get("15m") else ("30m" if tfs.get("30m") else None)
        if not mases:
            continue
        above = sorted([m for m in mases if m["px"] > price], key=lambda m: m["px"])
        below = [m for m in mases if m["px"] < price]
        low_led = bub in ("LL", "HL")
        bounced = bub_px is not None and price >= bub_px * 0.999
        under_thin = any(m["kind"] in ("mf", "mm") and m["px"] > price for m in mases)
        reclaim = low_led and bounced and under_thin and len(above) > 0
        # next check prefers thin fast/mid, then any MA above
        thin_above = [m for m in above if m["kind"] in ("mf", "mm")]
        next_check = thin_above[0] if thin_above else (above[0] if above else None)
        item = {
            "tf": tf,
            "bub": bub,
            "bubPx": bub_px,
            "low_led": low_led,
            "under_thin": under_thin,
            "reclaim_attempt": reclaim,
            "mas": mases,
            "mas_proxy_tf": proxy,
            "next_check": next_check,
            "thin_above": above[:3],
            "thin_below": below[-3:],
        }
        checks.append(item)
        proxy_txt = f" (קווים מ־{proxy})" if proxy else ""
        if reclaim and next_check:
            notes.append(
                f"{tf}{proxy_txt}: נמוך {bub} ב־{bub_px} התחיל שינוי. "
                f"נשברו פסים דקים בירידה. עכשיו ניסיון פריצה חזרה עד נקודת בדיקה "
                f"{next_check['px']} ({next_check['label']})"
            )
        elif low_led and not under_thin:
            notes.append(f"{tf}{proxy_txt}: הנמוך {bub} כבר מעל או דרך הפסים הדקים")
        elif low_led and under_thin:
            notes.append(f"{tf}{proxy_txt}: נמוך {bub} ועדיין מתחת לקווים הדקים")

    primary = next((c for c in checks if c["tf"] == "5m" and c.get("reclaim_attempt")), None)
    if primary is None:
        primary = next((c for c in checks if c.get("reclaim_attempt")), None)
    if primary is None:
        primary = next((c for c in checks if c["tf"] == "5m"), None) or (checks[0] if checks else None)
    active = bool(primary and primary.get("reclaim_attempt"))
    return {
        "active": active,
        "primary": primary,
        "checks": checks,
        "notes": notes,
        "path": "reclaim_thin" if active else "none",
        "path_he": "ניסיון פריצה חזרה לקווים הדקים" if active else "אין ניסיון פריצה חזרה",
    }


def edge_plan(snapshot: dict, price: float, reclaim: dict) -> dict:
    """4H edge entry + bigger-TF exits if the move continues. Avoid mid-move."""
    tfs = _tf_map(snapshot)
    board = _board_map(snapshot)
    h4 = tfs.get("4H") or {}
    bub4 = board.get("4H") or str(h4.get("bub") or "")

    upper_levels = []
    lower_levels = []
    for key, label in (
        ("srh", "פיווט קטן עליון"),
        ("rh", "מסילה עליונה / קו ירוק"),
        ("ph", "פיווט גדול עליון"),
        ("ph2", "פיווט עליון קודם"),
        ("ms", "ממוצע איטי"),
        ("bubPx", f"מחיר בועה {bub4}"),
    ):
        px = _num(h4.get(key))
        if px is not None and px >= price * 0.995:
            upper_levels.append(
                {
                    "kind": key,
                    "label": label,
                    "px": round(px, 2),
                    "dist_pct": round(abs(px - price) / price * 100, 3),
                }
            )
    for key, label in (
        ("srl", "פיווט קטן תחתון"),
        ("rl", "מסילה תחתונה"),
        ("pl", "פיווט גדול תחתון"),
        ("pl2", "פיווט תחתון קודם"),
        ("mf", "ממוצע מהיר"),
        ("bubPx", f"מחיר בועה {bub4}"),
    ):
        px = _num(h4.get(key))
        if px is not None and px <= price * 1.005:
            lower_levels.append(
                {
                    "kind": key,
                    "label": label,
                    "px": round(px, 2),
                    "dist_pct": round(abs(price - px) / price * 100, 3),
                }
            )

    upper_levels.sort(key=lambda x: x["dist_pct"])
    lower_levels.sort(key=lambda x: x["dist_pct"])
    nearest_up = upper_levels[0] if upper_levels else None
    nearest_dn = lower_levels[0] if lower_levels else None

    near_up_count = sum(1 for u in upper_levels if u["dist_pct"] <= 0.55)
    at_upper_edge = nearest_up is not None and nearest_up["dist_pct"] <= 0.45 and (
        bub4 in ("HH", "LH") or near_up_count >= 2 or str(h4.get("zap") or "") == "RED"
    )
    at_lower_edge = nearest_dn is not None and nearest_dn["dist_pct"] <= 0.55 and (
        bub4 in ("LL", "HL")
        or str(h4.get("zap") or "") == "GREEN"
        or bool((reclaim or {}).get("active"))
    )
    mid_move = not at_upper_edge and not at_lower_edge

    ltf_retest = []
    for tf in EDGE_CONFIRM_TFS:
        row = tfs.get(tf) or {}
        bub = board.get(tf) or str(row.get("bub") or "")
        if at_upper_edge and bub in ("HH", "LH", "HL"):
            ltf_retest.append({"tf": tf, "bub": bub, "role": "בדיקת קצה עליון"})
        if at_lower_edge and bub in ("LL", "HL", "LH"):
            ltf_retest.append({"tf": tf, "bub": bub, "role": "בדיקת קצה תחתון"})
        if at_lower_edge and tf == "5m" and (reclaim or {}).get("active"):
            ltf_retest.append({"tf": "5m", "bub": bub, "role": "פריצה חזרה מהנמוך"})

    seen = set()
    ltf_clean = []
    for x in ltf_retest:
        k = (x["tf"], x["role"])
        if k in seen:
            continue
        seen.add(k)
        ltf_clean.append(x)

    side = None
    if at_upper_edge and ltf_clean:
        side = "short_edge"
    elif at_lower_edge and ltf_clean:
        side = "long_edge"
    elif at_upper_edge:
        side = "short_watch"
    elif at_lower_edge:
        side = "long_watch"

    continue_up: list[dict] = []
    continue_down: list[dict] = []
    for tf in BIG_TFS:
        row = tfs.get(tf) or {}
        bub = board.get(tf) or str(row.get("bub") or "")
        for key, label in (
            ("srh", "פיווט קטן עליון"),
            ("rh", "מסילה עליונה"),
            ("ph", "פיווט גדול עליון"),
            ("bubPx", f"בועה {bub}"),
            ("ms", "ממוצע איטי"),
            ("mf", "ממוצע מהיר"),
            ("srl", "פיווט קטן תחתון"),
            ("rl", "מסילה תחתונה"),
            ("pl", "פיווט גדול תחתון"),
        ):
            px = _num(row.get(key))
            if px is None:
                continue
            if px > price * 1.0005:
                continue_up.append(
                    {
                        "tf": tf,
                        "label": label,
                        "px": round(px, 2),
                        "dist_pct": round((px - price) / price * 100, 3),
                        "bub": bub,
                    }
                )
            if px < price * 0.9995:
                continue_down.append(
                    {
                        "tf": tf,
                        "label": label,
                        "px": round(px, 2),
                        "dist_pct": round((price - px) / price * 100, 3),
                        "bub": bub,
                    }
                )
    continue_up = _dedupe_stations(continue_up)
    continue_down = _dedupe_stations(continue_down)
    continue_up.sort(key=lambda x: x["dist_pct"])
    continue_down.sort(key=lambda x: x["dist_pct"])
    continue_up = continue_up[:6]
    continue_down = continue_down[:6]

    notes: list[str] = []
    if mid_move:
        notes.append("לא בקצה 4 שעות. באמצע המסע. לא כניסה לפי כלל הקצה")
    if at_upper_edge and nearest_up:
        notes.append(
            f"קצה עליון ב־4 שעות ליד {nearest_up['px']} ({nearest_up['label']}). ניסיונות קרובים סביב הקו: {near_up_count}"
        )
        notes.append("מטרה: שורט בהתחלת הדחייה אחרי שהקצרים חוזרים לבדוק. לא אחרי שכבר ירדו חזק")
    if at_lower_edge and nearest_dn:
        notes.append(f"קצה תחתון ב־4 שעות ליד {nearest_dn['px']} ({nearest_dn['label']})")
        notes.append("מטרה: לונג בהתחלת הסיבוב מהנמוך אחרי שהקצרים חוזרים לבדוק")
    if ltf_clean:
        notes.append(
            "אישור קצרים: " + ", ".join(f"{x['tf']} {x['bub']} ({x['role']})" for x in ltf_clean[:5])
        )
    elif at_upper_edge or at_lower_edge:
        notes.append("יש קצה ב־4 שעות אבל עדיין אין אישור חזרה מהקצרים")

    if side in ("long_edge", "long_watch") and continue_up:
        n1 = continue_up[0]
        notes.append(f"אם ממשיך למעלה: יציאה / יעד ראשון {n1['px']} ({n1['tf']} {n1['label']})")
        if len(continue_up) > 1:
            n2 = continue_up[1]
            notes.append(f"אם ממשיך עוד: נקודה הבאה {n2['px']} ({n2['tf']} {n2['label']})")
    if side in ("short_edge", "short_watch") and continue_down:
        n1 = continue_down[0]
        notes.append(f"אם ממשיך למטה: יציאה / יעד ראשון {n1['px']} ({n1['tf']} {n1['label']})")
        if len(continue_down) > 1:
            n2 = continue_down[1]
            notes.append(f"אם ממשיך עוד: נקודה הבאה {n2['px']} ({n2['tf']} {n2['label']})")

    day = tfs.get("Day") or {}
    week = tfs.get("Week") or {}
    notes.append(
        f"גדולים: יום {board.get('Day') or day.get('bub')} · 12ש {board.get('12H') or '-'} · שבוע {board.get('Week') or week.get('bub')}"
    )

    side_he = {
        "short_edge": "קצה עליון מוכן לשורט",
        "long_edge": "קצה תחתון מוכן ללונג",
        "short_watch": "קצה עליון ממתין לאישור קצרים",
        "long_watch": "קצה תחתון ממתין לאישור קצרים",
        None: "אין כניסת קצה עכשיו",
    }.get(side, "אין כניסת קצה עכשיו")

    return {
        "side": side,
        "side_he": side_he,
        "mid_move": mid_move,
        "at_upper_edge": at_upper_edge,
        "at_lower_edge": at_lower_edge,
        "near_up_attempts": near_up_count,
        "nearest_upper": nearest_up,
        "nearest_lower": nearest_dn,
        "ltf_retest": ltf_clean,
        "continue_up": continue_up,
        "continue_down": continue_down,
        "bub4": bub4,
        "notes": notes,
    }


def mid_breaks(board_rows: list[dict]) -> dict:
    """15 / 30 / 1H structure picture."""
    focus = {r["tf"]: r for r in board_rows if r["tf"] in ("15m", "30m", "1H", "5m", "2m", "4H")}
    down = [tf for tf in ("15m", "30m", "1H") if focus.get(tf, {}).get("structure") == "down"]
    up = [tf for tf in ("15m", "30m", "1H") if focus.get(tf, {}).get("structure") == "up"]
    fight = []
    # fight: e.g. 30m HL (up) while 1H HH or while tape wants down
    r30 = focus.get("30m") or {}
    r1 = focus.get("1H") or {}
    r15 = focus.get("15m") or {}
    r4 = focus.get("4H") or {}
    if r30.get("structure") == "up" and r1.get("structure") == "up" and r4.get("zap") == "RED":
        fight.append("30 דקות / שעה במבנה עולה מול זאפ אדום ב־4 שעות. מאבק / תיקון אפשרי")
    if r30.get("bub") == "HL" and r15.get("structure") == "down":
        fight.append("30 דקות HL מול 15 יורד. בדיקת פריצה או עצירה ב־30")
    if r30.get("bub") == "HL" and r1.get("zap") == "RED":
        fight.append("30 דקות HL מול שעה אדומה. תחנת מאבק")
    if r15.get("structure") == "up" and r1.get("structure") == "down":
        fight.append("15 עולה מול שעה יורדת. מפנה או מלכודת")
    return {
        "down_tfs": down,
        "up_tfs": up,
        "cascade_down": len(down) >= 2,
        "cascade_up": len(up) >= 2,
        "fight_notes": fight,
        "focus": {k: {"bub": v.get("bub"), "structure": v.get("structure"), "zap": v.get("zap")} for k, v in focus.items()},
    }


def stations(snapshot: dict, price: float) -> dict:
    tfs = _tf_map(snapshot)
    below: list[dict] = []
    above: list[dict] = []
    for tf in STATION_TFS:
        row = tfs.get(tf)
        if not row:
            continue
        for pt in _level_points(row, tf):
            px = pt["px"]
            if px < price:
                d = (price - px) / price * 100
                below.append({**pt, "dist_pct": round(d, 3), "side": "below"})
            elif px > price:
                d = (px - price) / price * 100
                above.append({**pt, "dist_pct": round(d, 3), "side": "above"})
    below_m = _dedupe_stations(below)
    above_m = _dedupe_stations(above)
    # sort by distance
    below_m.sort(key=lambda r: r["dist_pct"])
    above_m.sort(key=lambda r: r["dist_pct"])
    return {
        "below": below_m[:8],
        "above": above_m[:8],
        "next_below": below_m[0] if below_m else None,
        "next_above": above_m[0] if above_m else None,
    }


def hypothesis(board_rows: list[dict], breaks: dict, st: dict, price: float, reclaim: Optional[dict] = None) -> dict:
    h4 = next((r for r in board_rows if r["tf"] == "4H"), {})
    day = next((r for r in board_rows if r["tf"] == "Day"), {})
    nxt = st.get("next_below")
    notes = []
    path = "wait"
    reclaim = reclaim or {}

    # Lows start change → thin-line reclaim is first-class
    if reclaim.get("active"):
        path = "reclaim_thin"
        notes.extend(reclaim.get("notes") or [])
        prim = reclaim.get("primary") or {}
        nc = prim.get("next_check")
        if nc:
            notes.append(f"נקודת בדיקה הבאה: {nc['px']} ({prim.get('tf')} {nc['label']})")
        notes.append("אם נעצרים בקו הדק: בדיקת פריצה / דחייה")
        notes.append("אם נפרץ הקו הדק מעלה: המשך לנקודת בדיקה הבאה מעל")
        if breaks.get("fight_notes"):
            notes.extend(breaks["fight_notes"])
    elif breaks.get("cascade_down") or len(breaks.get("down_tfs") or []) >= 2:
        notes.append("יש שבר / מבנה יורד בכמה פסים אמצעיים")
        if nxt:
            notes.append(
                f"תחנה הבאה מטה: {nxt['px']} ({nxt['tf']} {nxt['label']}) במרחק {nxt['dist_pct']}%"
            )
            if breaks.get("fight_notes"):
                path = "retest_or_hold"
                notes.extend(breaks["fight_notes"])
                notes.append("תרחיש א: נעצרים בתחנה ומסתובבים לבדוק פריצה")
                notes.append("תרחיש ב: שוברים את התחנה וממשיכים מטה")
            elif h4.get("zap") == "RED" and h4.get("channel") == "down":
                path = "continue_down"
                notes.append("4 שעות אדום וערוץ למטה. המשך מטה עד התחנה סביר יותר מברירת מחדל")
            else:
                path = "station_check"
                notes.append("בודקים איך מגיבים על התחנה הבאה")
        else:
            path = "open_air"
            notes.append("אין תחנה קרובה בנתונים מתחת למחיר")
    elif breaks.get("cascade_up"):
        path = "up_structure"
        notes.append("מבנה עולה בפסים האמצעיים")
        if reclaim.get("notes"):
            notes.extend(reclaim["notes"])
        nxt_up = st.get("next_above")
        if nxt_up:
            notes.append(f"תחנה הבאה מעלה: {nxt_up['px']} ({nxt_up['tf']} {nxt_up['label']})")
    else:
        path = "mixed"
        notes.append("אין מפל יורד ברור ב־15 / 30 / שעה")
        if reclaim.get("notes"):
            notes.extend(reclaim["notes"])
        if breaks.get("fight_notes"):
            notes.extend(breaks["fight_notes"])

    if day.get("structure") == "down":
        notes.append("יום במבנה יורד. שאיפות מטה מקבלות רשות גבוהה יותר")
    elif day.get("structure") == "up":
        notes.append("יום במבנה עולה. ירידה עלולה להיות תיקון לתחנה ולא מפולת")

    path_he = {
        "continue_down": "המשך מטה לתחנה",
        "retest_or_hold": "עצירה / בדיקת פריצה מול המשך",
        "station_check": "בדיקת תחנה",
        "open_air": "אוויר מתחת",
        "up_structure": "מבנה מעלה",
        "reclaim_thin": "ניסיון פריצה חזרה לקווים הדקים",
        "mixed": "מעורב",
        "wait": "המתנה",
    }.get(path, path)

    return {
        "path": path,
        "path_he": path_he,
        "notes": notes,
        "price": price,
        "anchor_4h": {"bub": h4.get("bub"), "zap": h4.get("zap"), "channel": h4.get("channel")},
    }


def fight_map(price: float, edge: dict, reclaim: dict, stations: dict, board_rows: list[dict]) -> dict:
    """Continuous fight ladder: next struggles below/above by TF. Not a one-way ride."""
    below = []
    above = []
    # structural stations
    for s in stations.get("below") or []:
        below.append(
            {
                "px": s["px"],
                "dist_pct": s["dist_pct"],
                "tf": s["tf"],
                "label": s["label"],
                "role": "מאבק מטה / בדיקה אפשרית בחזרה",
            }
        )
    for s in stations.get("above") or []:
        above.append(
            {
                "px": s["px"],
                "dist_pct": s["dist_pct"],
                "tf": s["tf"],
                "label": s["label"],
                "role": "מאבק מעלה / בדיקה או יעד",
            }
        )
    # add edge + reclaim explicit fights
    if edge.get("nearest_lower"):
        d = edge["nearest_lower"]
        below.insert(
            0,
            {
                "px": d["px"],
                "dist_pct": d["dist_pct"],
                "tf": "4H",
                "label": d["label"],
                "role": "קצה תחתון 4ש",
            },
        )
    if edge.get("nearest_upper"):
        u = edge["nearest_upper"]
        above.insert(
            0,
            {
                "px": u["px"],
                "dist_pct": u["dist_pct"],
                "tf": "4H",
                "label": u["label"],
                "role": "קצה עליון 4ש / קו דחייה",
            },
        )
    prim = (reclaim or {}).get("primary") or {}
    if prim.get("next_check"):
        nc = prim["next_check"]
        dist = round(abs(nc["px"] - price) / price * 100, 3) if price else None
        item = {
            "px": nc["px"],
            "dist_pct": dist,
            "tf": prim.get("tf") or "5m",
            "label": nc["label"],
            "role": "קו דק / חצי שעה מול 5 · בדיקה חיה",
        }
        if nc["px"] >= price:
            above.insert(0, item)
        else:
            below.insert(0, item)

    # sort + light dedupe by price
    def dedupe(rows: list[dict]) -> list[dict]:
        rows = sorted(rows, key=lambda r: r.get("dist_pct") if r.get("dist_pct") is not None else 999)
        out = []
        for r in rows:
            if out and out[-1]["px"] and abs(r["px"] - out[-1]["px"]) / out[-1]["px"] * 100 < 0.06:
                out[-1]["role"] = out[-1]["role"] + " · " + r["role"]
                out[-1]["label"] = f"{out[-1]['label']} / {r['label']}"
                continue
            out.append(r)
        return out[:7]

    below = dedupe(below)
    above = dedupe(above)

    board = {r["tf"]: r for r in board_rows}
    h4 = board.get("4H") or {}
    day = board.get("Day") or {}
    mode = "נדנוד / בדיקות"
    if h4.get("bub") in ("HH", "LH") and h4.get("zap") == "GREEN" and h4.get("channel") == "up":
        mode = "שינוי מגמה מעלה ב־4ש אפשרי"
    elif h4.get("bub") in ("LL", "LH") and h4.get("zap") == "RED" and h4.get("channel") == "down":
        mode = "המשך / מגמה מטה ב־4ש"
    elif (reclaim or {}).get("active"):
        mode = "בדיקת פריצה חזרה מהנמוכים"

    notes = [
        "המחיר עולה ויורד כל הזמן. כל תחנה היא מאבק לפי פס",
        "אם יש כניסה: תמיד יש מאבק הבא מתחת, ומאבק הבא מעל",
        "חזרה לבדוק 5 / 30 / 15 / שעה זה נורמלי. לא סוף המסע",
        f"מצב עכשיו: {mode}",
        f"4ש {h4.get('bub')} · יום {day.get('bub')}",
    ]
    if below:
        b0 = below[0]
        notes.append(f"המאבק הבא מטה: {b0['px']} · {b0['tf']} · {b0['role']}")
    if above:
        a0 = above[0]
        notes.append(f"המאבק הבא מעלה: {a0['px']} · {a0['tf']} · {a0['role']}")

    return {
        "mode_he": mode,
        "next_fight_below": below[0] if below else None,
        "next_fight_above": above[0] if above else None,
        "fights_below": below,
        "fights_above": above,
        "notes": notes,
    }


def levels_plan(price: float, edge: dict, reclaim: dict, stations: dict, fights: Optional[dict] = None) -> dict:
    """Entry + exit points, plus next fights below/above. No position state."""
    entries: list[dict] = []
    exits: list[dict] = []
    fights = fights or {}

    side = edge.get("side")
    if side in ("long_edge", "long_watch") and edge.get("nearest_lower"):
        lv = edge["nearest_lower"]
        ready = side == "long_edge"
        entries.append(
            {
                "side": "לונג",
                "px": lv["px"],
                "status": "מוכן" if ready else "ממתין לאישור קצרים",
                "why": f"קצה תחתון 4ש · {lv['label']}",
            }
        )
        for i, t in enumerate((edge.get("continue_up") or [])[:4]):
            exits.append(
                {
                    "side": "יציאת לונג / יעד",
                    "px": t["px"],
                    "order": i + 1,
                    "why": f"אם ממשיך מעלה · {t['tf']} {t['label']}",
                }
            )
    if side in ("short_edge", "short_watch") and edge.get("nearest_upper"):
        lv = edge["nearest_upper"]
        ready = side == "short_edge"
        entries.append(
            {
                "side": "שורט",
                "px": lv["px"],
                "status": "מוכן" if ready else "ממתין לאישור קצרים",
                "why": f"קצה עליון 4ש · {lv['label']} · ניסיונות~{edge.get('near_up_attempts')}",
            }
        )
        for i, t in enumerate((edge.get("continue_down") or [])[:4]):
            exits.append(
                {
                    "side": "יציאת שורט / יעד",
                    "px": t["px"],
                    "order": i + 1,
                    "why": f"אם ממשיך מטה · {t['tf']} {t['label']}",
                }
            )

    prim = (reclaim or {}).get("primary") or {}
    if (reclaim or {}).get("active") and prim.get("next_check"):
        nc = prim["next_check"]
        entries.append(
            {
                "side": "בדיקת כניסה קצרה",
                "px": nc["px"],
                "status": "ניסיון פריצה חזרה",
                "why": f"{prim.get('tf')} מהנמוך {prim.get('bub')} עד הקו הדק / צהוב",
            }
        )

    # always surface next fight below when we have / want long bias or any entry
    nf_dn = fights.get("next_fight_below")
    nf_up = fights.get("next_fight_above")
    if nf_dn:
        exits.append(
            {
                "side": "מאבק הבא מטה",
                "px": nf_dn["px"],
                "order": 0,
                "why": f"{nf_dn['tf']} · {nf_dn['role']} · {nf_dn.get('label','')}",
            }
        )
    if nf_up:
        exits.append(
            {
                "side": "מאבק הבא מעלה",
                "px": nf_up["px"],
                "order": 0,
                "why": f"{nf_up['tf']} · {nf_up['role']} · {nf_up.get('label','')}",
            }
        )

    if not any(e["side"].startswith("יציאת") for e in exits):
        for i, t in enumerate((stations.get("above") or [])[:3]):
            exits.append({"side": "יעד מעלה", "px": t["px"], "order": i + 1, "why": f"{t['tf']} {t['label']}"})
        for i, t in enumerate((stations.get("below") or [])[:3]):
            exits.append({"side": "יעד מטה", "px": t["px"], "order": i + 1, "why": f"{t['tf']} {t['label']}"})

    stops: list[dict] = []
    for e in entries:
        if e["side"] == "לונג":
            cands = [x for x in (edge.get("continue_down") or []) if x.get("px") is not None and x["px"] < e["px"] * 0.999]
            if not cands:
                cands = [x for x in (stations.get("below") or []) if x.get("px") is not None and x["px"] < e["px"] * 0.999]
            # prefer next fight below entry
            if nf_dn and nf_dn["px"] < e["px"] * 0.999:
                cands = [{"px": nf_dn["px"], "tf": nf_dn["tf"], "label": nf_dn.get("label", "")}] + cands
            if cands:
                dn = cands[0]
                stops.append(
                    {
                        "side": "סטופ לונג",
                        "px": dn["px"],
                        "why": f"מתחת לכניסה / מאבק מטה · {dn.get('tf', '')} {dn.get('label', '')}",
                    }
                )
        if e["side"] == "שורט":
            cands = [x for x in (edge.get("continue_up") or []) if x.get("px") is not None and x["px"] > e["px"] * 1.001]
            if not cands:
                cands = [x for x in (stations.get("above") or []) if x.get("px") is not None and x["px"] > e["px"] * 1.001]
            if nf_up and nf_up["px"] > e["px"] * 1.001:
                cands = [{"px": nf_up["px"], "tf": nf_up["tf"], "label": nf_up.get("label", "")}] + cands
            if cands:
                up = cands[0]
                stops.append(
                    {
                        "side": "סטופ שורט",
                        "px": up["px"],
                        "why": f"מעל הכניסה / מאבק מעלה · {up.get('tf', '')} {up.get('label', '')}",
                    }
                )

    return {
        "price": price,
        "entries": entries,
        "exits": exits,
        "stops": stops,
        "mid_move": bool(edge.get("mid_move")),
        "mode_he": fights.get("mode_he"),
        "summary_he": (
            " · ".join(
                [
                    fights.get("mode_he") or "",
                    (
                        " · ".join(f"{e['side']} {e['px']} ({e['status']})" for e in entries)
                        if entries
                        else "אין כניסה מוכנה"
                    ),
                ]
            ).strip(" ·")
        ),
    }


def _ago_he(iso: Optional[str]) -> str:
    if not iso:
        return "-"
    try:
        raw = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        sec = int((datetime.now(timezone.utc) - dt).total_seconds())
        if sec < 0:
            sec = 0
        if sec < 60:
            return "לפני רגע"
        if sec < 3600:
            return f"לפני {sec // 60} דקות"
        if sec < 86400:
            h = sec // 3600
            m = (sec % 3600) // 60
            return f"לפני {h} שעות" + (f" ו־{m} דקות" if m else "")
        d = sec // 86400
        return f"לפני {d} ימים"
    except Exception:
        return "-"


def render_text(report: dict) -> str:
    lines: list[str] = []
    lines.append(f"מתי רץ לאחרונה: {_ago_he(report.get('receivedAt'))} ({report.get('receivedAt') or '-'})")
    lines.append(f"סכמה: {report.get('schema') or '-'}")
    lines.append(f"מחיר {report.get('price')}")
    if report.get("dayPct") is not None:
        lines.append(f"אחוז יומי {report['dayPct']}")
    lp = report.get("levels") or {}
    lines.append("")
    lines.append("=== כניסות ===")
    if not lp.get("entries"):
        lines.append("  אין")
    for e in lp.get("entries") or []:
        lines.append(f"  {e['side']}  {e['px']}  {e['status']}  · {e['why']}")
    lines.append("=== יציאות / יעדים / מאבקים ===")
    if not lp.get("exits"):
        lines.append("  אין")
    for e in lp.get("exits") or []:
        lines.append(f"  {e['side']}  {e['px']}  · {e['why']}")
    lines.append("=== סטופים ===")
    if not lp.get("stops"):
        lines.append("  אין")
    for e in lp.get("stops") or []:
        lines.append(f"  {e['side']}  {e['px']}  · {e['why']}")
    fm = report.get("fights") or {}
    lines.append("")
    lines.append(f"מצב: {fm.get('mode_he')}")
    lines.append("מאבקים מטה")
    for s in (fm.get("fights_below") or [])[:5]:
        lines.append(f"  {s['px']}  {s.get('dist_pct')}%  {s['tf']}  {s['role']}  {s.get('label','')}")
    lines.append("מאבקים מעלה")
    for s in (fm.get("fights_above") or [])[:5]:
        lines.append(f"  {s['px']}  {s.get('dist_pct')}%  {s['tf']}  {s['role']}  {s.get('label','')}")
    lines.append("")
    lines.append(f"סיכום: {lp.get('summary_he')}")
    lines.append("")
    lines.append("לוח אותיות")
    for r in report.get("board") or []:
        lines.append(f"{r['tf']:>4}  {r['bub']:<2}  zap={r['zap']:<6}  ch={r['channel']}")
    return "\n".join(lines)


def build_report(snapshot: dict) -> dict:
    # unwrap {latest: ...} if needed
    if snapshot.get("latest") and not snapshot.get("tfs"):
        snapshot = snapshot["latest"]
    price = _num(snapshot.get("price")) or 0.0
    day_pct = _num(snapshot.get("dayPct"))
    board_rows = build_board(snapshot)
    br = mid_breaks(board_rows)
    st = stations(snapshot, price)
    reclaim = thin_reclaim(snapshot, price)
    edge = edge_plan(snapshot, price, reclaim)
    fights = fight_map(price, edge, reclaim, st, board_rows)
    hyp = hypothesis(board_rows, br, st, price, reclaim)
    if edge.get("notes"):
        hyp = {
            **hyp,
            "notes": list(edge.get("notes") or []) + list(hyp.get("notes") or []),
            "edge_side_he": edge.get("side_he"),
        }
        if edge.get("side") in ("short_edge", "long_edge") and not edge.get("mid_move"):
            hyp["path"] = edge["side"]
            hyp["path_he"] = edge["side_he"]
    levels = levels_plan(price, edge, reclaim, st, fights)
    return {
        "schema": snapshot.get("schema"),
        "receivedAt": snapshot.get("receivedAt"),
        "price": price,
        "dayPct": day_pct,
        "trigger": snapshot.get("trigger"),
        "board": board_rows,
        "breaks": br,
        "stations": st,
        "reclaim": reclaim,
        "edge": edge,
        "fights": fights,
        "hypothesis": hyp,
        "levels": levels,
        "text_he": "",
    }


def build_report_with_text(snapshot: dict) -> dict:
    rep = build_report(snapshot)
    rep["text_he"] = render_text(rep)
    return rep
