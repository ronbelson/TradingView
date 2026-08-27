#!/usr/bin/env python3
"""Short decision from locked Hebrew templates + live numbers only. Local."""

from __future__ import annotations

from typing import Any

from story_ladder import build_ladder, _num


def _fmt(px: float | None) -> str:
    if px is None:
        return ""
    return f"{px:,.0f}"


def _zone_mid(lo: float | None, hi: float | None) -> float | None:
    if lo is None and hi is None:
        return None
    if lo is None:
        return hi
    if hi is None:
        return lo
    return (lo + hi) / 2.0


def _gap_side(price: float | None, mid: float | None) -> str | None:
    if price is None or mid is None:
        return None
    if mid > price * 1.0003:
        return "up"
    if mid < price * 0.9997:
        return "down"
    return "at"


def _tf_gaps(t: dict[str, Any], price: float | None) -> dict[str, Any]:
    """Nearest FVG + zero-volume magnets for one TF."""
    ga_lo = _num(t.get("gapAboveLo"))
    ga_hi = _num(t.get("gapAboveHi"))
    gb_lo = _num(t.get("gapBelowLo"))
    gb_hi = _num(t.get("gapBelowHi"))
    zv_a_lo = _num(t.get("zvAboveLo"))
    zv_a_hi = _num(t.get("zvAboveHi"))
    zv_b_lo = _num(t.get("zvBelowLo"))
    zv_b_hi = _num(t.get("zvBelowHi"))

    fvg_up = _zone_mid(ga_lo, ga_hi)
    fvg_dn = _zone_mid(gb_lo, gb_hi)
    zv_up = _zone_mid(zv_a_lo, zv_a_hi)
    zv_dn = _zone_mid(zv_b_lo, zv_b_hi)

    cands: list[dict[str, Any]] = []
    for kind, mid, lo, hi in (
        ("fvg_up", fvg_up, ga_lo, ga_hi),
        ("fvg_dn", fvg_dn, gb_lo, gb_hi),
        ("zv_up", zv_up, zv_a_lo, zv_a_hi),
        ("zv_dn", zv_dn, zv_b_lo, zv_b_hi),
    ):
        if mid is None or price is None:
            continue
        dist = abs(mid - price)
        side = _gap_side(price, mid)
        cands.append(
            {
                "kind": kind,
                "mid_px": round(mid, 2),
                "lo": None if lo is None else round(lo, 2),
                "hi": None if hi is None else round(hi, 2),
                "side": side,
                "dist_usd": round(dist, 2),
                "pull_he": (
                    "מושך למעלה"
                    if side == "up"
                    else "מושך למטה"
                    if side == "down"
                    else "ליד המחיר"
                ),
            }
        )
    cands.sort(key=lambda x: x["dist_usd"])
    nearest = cands[0] if cands else None
    return {
        "gapAboveLo": ga_lo,
        "gapAboveHi": ga_hi,
        "gapBelowLo": gb_lo,
        "gapBelowHi": gb_hi,
        "zvAboveLo": zv_a_lo,
        "zvAboveHi": zv_a_hi,
        "zvBelowLo": zv_b_lo,
        "zvBelowHi": zv_b_hi,
        "poc": _num(t.get("poc")),
        "nearest": nearest,
        "nearest_he": (
            None
            if not nearest
            else (
                f"{nearest['pull_he']} לג {nearest['kind']} · {_fmt(nearest['mid_px'])} "
                f"(מרחק {_fmt(nearest['dist_usd'])})"
            )
        ),
    }


def _tf_color(t: dict[str, Any]) -> str:
    zap = (t.get("zap") or "").upper()
    ch = (t.get("channel") or "").lower()
    if zap == "GREEN" and ch != "down":
        return "green"
    if zap == "RED" and ch != "up":
        return "red"
    if ch == "up":
        return "green"
    if ch == "down":
        return "red"
    return "yellow"


def _tf_text(t: dict[str, Any]) -> str:
    ch = (t.get("channel") or "").lower()
    bub = t.get("bub") or ""
    if ch == "up":
        base = "עלייה"
    elif ch == "down":
        base = "ירידה"
    else:
        base = "אמצע"
    bub_he = {
        "HH": "שיא חדש",
        "HL": "תחתית גבוהה",
        "LH": "שיא נמוך",
        "LL": "תחתית חדשה",
    }.get(str(bub), "")
    return f"{base}. {bub_he}" if bub_he else base


def compute_odds(
    *,
    price: float | None,
    mm: float | None,
    rejects: int,
    day: dict[str, Any],
    m30: dict[str, Any],
    h1: dict[str, Any],
    h4: dict[str, Any],
) -> dict[str, int]:
    up, down, wait = 42, 33, 25

    if (m30.get("channel") or "") == "up" or (m30.get("zap") or "") == "GREEN":
        up += 12
        down -= 7
        wait -= 5
    if (h1.get("channel") or "") in ("up", "mid") and (h1.get("zap") or "") == "GREEN":
        up += 6
        down -= 4
        wait -= 2
    if (day.get("channel") or "") == "down" or (day.get("zap") or "") == "RED":
        up -= 14
        down += 10
        wait += 4
    if (h4.get("channel") or "") == "mid":
        wait += 4
        up -= 2
        down -= 2
    if rejects >= 3:
        wait += 8
        up -= 4
        down -= 4
    elif rejects >= 1:
        wait += 4
        up -= 2
        down -= 2
    if price is not None and mm is not None:
        if price < mm * 0.9997:
            wait += 6
            up -= 4
            down -= 2
        elif price > mm * 1.0003:
            up += 6
            wait -= 3
            down -= 3
    r30 = _num(m30.get("r14"))
    r1 = _num(h1.get("r14"))
    if r30 is not None and r1 is not None and r30 >= 60 and r1 < 68:
        wait += 4
        down += 2
        up -= 6

    up = max(5, up)
    down = max(5, down)
    wait = max(5, wait)
    total = up + down + wait
    up = round(100 * up / total)
    down = round(100 * down / total)
    wait = 100 - up - down
    return {"up": up, "down": down, "wait": wait}


# Locked phrases. Only {n} / {px} may change. No free prose.
TEMPLATES = {
    "do_wait": "אל תיכנס עכשיו",
    "do_short_wait": "צד שורט. בלי כניסה חדשה עכשיו",
    "do_long_wait": "צד לונג רק אחרי מעבר והחזקה. עדיין לא",
    "pos_below": "מתחת לקו {px}",
    "pos_above": "מעל לקו {px}",
    "pos_at": "על הקו {px}",
    "rejects": "נדחה {n} פעמים",
    "day_res": "התנגדות יום {px}",
    "support": "תמיכה {px}",
    "wait_hold": "לחכות למעבר מעל {px} ולהחזקה",
    "wait_keep": "לחכות שיחזיק מעל {px}",
    "wait_long_only": "תנאי לונג בלבד: מעבר והחזקה מעל {px}. עד אז לא לונג",
    "wait_short_retest": "לשורט: נסיגה שתידחה מתחת ל־{px}, או המשך מטה. לא לרדוף",
    "wait_short_next": "לשורט: שבירה הבאה מתחת ל־{px}. ביטול שורט מעל {long_px}",
    "day_down": "היום בירידה",
    "side_short": "המתנה לשורט",
    "side_long_wait": "המתנה ללונג",
    "side_flat": "המתנה",
}


def build_brief(latest_pack: dict[str, Any], cuts: dict[str, Any] | None = None) -> dict[str, Any]:
    ladder = build_ladder(latest_pack, cuts)
    latest = latest_pack.get("latest") or latest_pack
    price = _num(latest.get("price"))
    tfs = {t.get("tf"): t for t in (latest.get("tfs") or []) if t.get("tf")}
    h4 = tfs.get("4H") or {}
    day = tfs.get("Day") or {}
    m30 = tfs.get("30m") or {}
    h1 = tfs.get("1H") or {}

    mm = _num(h4.get("mm"))
    ms = _num(h4.get("ms"))
    pl = _num(h4.get("pl"))
    pm = _num(h4.get("pm"))  # Pink SMA mid (gray on chart)
    day_mf = _num(day.get("mf"))
    day_ms = _num(day.get("ms"))
    day_bub = _num(day.get("bubPx"))

    primary = (cuts or {}).get("primary") or {}
    rejects = int(primary.get("reject_after_cross_count") or 0)
    open_a = primary.get("open")

    facts: list[str] = []
    if price is not None and mm is not None:
        if price < mm * 0.9997:
            facts.append(TEMPLATES["pos_below"].format(px=_fmt(mm)))
        elif price > mm * 1.0003:
            facts.append(TEMPLATES["pos_above"].format(px=_fmt(mm)))
        else:
            facts.append(TEMPLATES["pos_at"].format(px=_fmt(mm)))

    if rejects > 0:
        facts.append(TEMPLATES["rejects"].format(n=rejects))
    if day_mf is not None:
        facts.append(TEMPLATES["day_res"].format(px=_fmt(day_mf)))
    if pl is not None:
        facts.append(TEMPLATES["support"].format(px=_fmt(pl)))
    if day.get("channel") == "down" or day.get("zap") == "RED":
        facts.append(TEMPLATES["day_down"])

    if mm is not None and open_a and open_a.get("crossed") and price is not None and price > mm:
        wait_for_he = TEMPLATES["wait_keep"].format(px=_fmt(mm))
    elif mm is not None:
        wait_for_he = TEMPLATES["wait_hold"].format(px=_fmt(mm))
    else:
        wait_for_he = ""

    do_he = TEMPLATES["do_wait"]
    side_he = TEMPLATES["side_flat"]
    missed_path_he = None
    now_path_he = None

    below_mm = price is not None and mm is not None and price < mm * 0.9997
    below_pl = price is not None and pl is not None and price < pl * 0.9995
    below_pm = price is not None and pm is not None and price < pm * 0.9997
    short_bias = below_pm or below_pl or (
        below_mm and (h4.get("pink") == "GRAY" or h1.get("zap") == "RED" or m30.get("zap") == "RED")
    )

    if short_bias:
        side_he = TEMPLATES["side_short"]
        do_he = TEMPLATES["do_short_wait"]
        if below_pl and pl is not None and mm is not None:
            missed_path_he = f"נקודת שורט סביב {_fmt(pl)} כבר עברה. המחיר מתחת לתמיכה."
            now_path_he = (
                f"בלי לרדוף. לשורט: נסיגה שתידחה מתחת ל־{_fmt(mm)}, "
                f"או המשך מטה. לונג רק אחרי מעבר והחזקה מעל {_fmt(mm)}."
            )
            wait_for_he = TEMPLATES["wait_short_retest"].format(px=_fmt(mm))
        elif mm is not None:
            wait_for_he = TEMPLATES["wait_long_only"].format(px=_fmt(mm))
            now_path_he = f"צד שורט או המתנה. לונג לא פעיל עד מעבר והחזקה מעל {_fmt(mm)}."
        story_parts = []
        if missed_path_he:
            story_parts.append(missed_path_he)
        if now_path_he:
            story_parts.append(now_path_he)
        if story_parts:
            story_he = " ".join(story_parts)
        else:
            story_he = ". ".join(facts[:4])
            if story_he:
                story_he += "."
    elif below_mm and mm is not None:
        side_he = TEMPLATES["side_long_wait"]
        do_he = TEMPLATES["do_long_wait"]
        wait_for_he = TEMPLATES["wait_long_only"].format(px=_fmt(mm))
        now_path_he = f"מחכים ללונג: מעבר והחזקה מעל {_fmt(mm)}. עד אז אין כניסת לונג."
        story_he = ". ".join(facts[:4])
        if story_he:
            story_he += "."
    else:
        story_he = ". ".join(facts[:4])
        if story_he:
            story_he += "."

    odds = compute_odds(
        price=price,
        mm=mm,
        rejects=rejects,
        day=day,
        m30=m30,
        h1=h1,
        h4=h4,
    )

    tiny = []
    for px, name, tag in [
        (day_bub, "בועת יום", "רחוק למעלה"),
        (day_ms, "פס יום", "התנגדות"),
        (day_mf, "פס יום קרוב", "התנגדות"),
        (pm, "אפור ורוד 4 שעות", "מדף אפור"),
        (mm, "צהוב אמצע 4 שעות", "קו פריצה"),
        (price, "עכשיו", "עכשיו"),
        (pl, "תמיכה 4 שעות", "תמיכה"),
        (ms, "פס איטי 4 שעות", "צהוב למטה"),
    ]:
        if px is None:
            continue
        side = (
            "now"
            if name == "עכשיו"
            else ("up" if price is not None and px > price else "down" if price is not None and px < price else "now")
        )
        tiny.append(
            {
                "px": round(px, 2),
                "name_he": name,
                "tag_he": tag,
                "side": side,
                "label_with_px": f"{name} · {_fmt(px)}",
            }
        )

    seen: set[int] = set()
    tiny_u = []
    for row in sorted(tiny, key=lambda r: r["px"], reverse=True):
        key = round(row["px"])
        if key in seen:
            continue
        seen.add(key)
        tiny_u.append(row)

    tf_order = ["Week", "3D", "Day", "4H", "2H", "1H", "30m", "15m"]
    tf_he_map = {
        "Week": "שבוע",
        "3D": "3 ימים",
        "Day": "יום",
        "4H": "4 שעות",
        "2H": "שעתיים",
        "1H": "שעה",
        "30m": "30 דקות",
        "15m": "15 דקות",
    }
    tf_progress = []
    signals = []
    for name in tf_order:
        t = tfs.get(name)
        if not t:
            continue
        tf_progress.append(
            {
                "tf": name,
                "tf_he": tf_he_map.get(name, name),
                "color": _tf_color(t),
                "text_he": _tf_text(t),
            }
        )
        signals.append(
            {
                "tf": name,
                "tf_he": tf_he_map.get(name, name),
                "channel": t.get("channel"),
                "zap": t.get("zap"),
                "pink": t.get("pink"),
                "bub": t.get("bub"),
                "bubPx": t.get("bubPx"),
                "mAbove": t.get("mAbove"),
                "bothHi": t.get("bothHi"),
                "bothLo": t.get("bothLo"),
                "r14": t.get("r14"),
                "ml": t.get("ml"),
                "sl": t.get("sl"),
                "poc": t.get("poc"),
                "gaps": _tf_gaps(t, price),
            }
        )

    dist = None
    if price is not None and mm is not None:
        dist = round(mm - price, 2)

    # Prefer volume-gap / FVG magnets on trade-relevant TFs (4H first)
    gap_board = []
    for name in ("4H", "1H", "30m", "15m", "Day", "2H"):
        t = tfs.get(name)
        if not t:
            continue
        g = _tf_gaps(t, price)
        if g.get("nearest"):
            gap_board.append({"tf": name, "tf_he": tf_he_map.get(name, name), **g})
    nearest_gap = None
    if gap_board:
        nearest_gap = min(
            (x for x in gap_board if x.get("nearest")),
            key=lambda x: (x["nearest"] or {}).get("dist_usd", 1e18),
            default=None,
        )

    return {
        "now_px": None if price is None else round(price, 2),
        "as_of": latest.get("time") or latest.get("receivedAt") or latest_pack.get("receivedAt"),
        "odds": odds,
        "do_he": do_he,
        "wait_for_he": wait_for_he,
        "confirm_px": None if mm is None else round(mm, 2),
        "cancel_px": None if pl is None else round(pl, 2),
        "confirm_source_he": "צהוב אמצע ב־4 שעות",
        "cancel_source_he": "פיווט נמוך ב־4 שעות",
        "gray_pink_px": None if pm is None else round(pm, 2),
        "gray_pink_source_he": "אפור ורוד אמצע ב־4 שעות",
        "distance_to_break_usd": dist,
        "why_he": facts[:4],
        "story_he": story_he,
        "side_he": side_he,
        "missed_path_he": missed_path_he,
        "now_path_he": now_path_he,
        "tf_progress": tf_progress,
        "signals": signals,
        "tiny_ladder": tiny_u,
        "full_ladder": ladder,
        "cuts": primary,
        "gaps_board": gap_board,
        "nearest_gap": nearest_gap,
        "copy_source": "template_code",
        "note_he": "המילים מתבנית קבועה. המספרים מההוק. לא קלאוד.",
    }
