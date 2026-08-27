#!/usr/bin/env python3
"""Paper trade book — entry + target + adverse stop. Local only.

Rule:
  - Open only when structure levels say entry is ready.
  - Always store stop = next fight against our side.
  - Always store targets = next exits with our side.
  - Each tick: hit stop → close loss; hit target → close win.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
STATE_PATH = HERE / "paper_state.json"
JOURNAL_PATH = HERE / "paper_trades.jsonl"

TOUCH_PCT = 0.0008  # ~0.08% touch zone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _num(v: Any) -> Optional[float]:
    if isinstance(v, (int, float)) and v == v:
        return float(v)
    return None


def _load_state() -> dict:
    if not STATE_PATH.exists():
        return {"open": None}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"open": None}


def _save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _append_trade(row: dict) -> None:
    with JOURNAL_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_trades(limit: int = 40) -> list[dict]:
    if not JOURNAL_PATH.exists():
        return []
    rows: list[dict] = []
    with JOURNAL_PATH.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return rows[-limit:]


def summarize(trades: list[dict]) -> dict:
    closed = [t for t in trades if t.get("status") == "closed"]
    pnls = [t["pnl_pct"] for t in closed if t.get("pnl_pct") is not None]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    return {
        "closed": len(closed),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": round(100 * len(wins) / len(pnls), 1) if pnls else None,
        "pnl_pct_sum": round(sum(pnls), 3) if pnls else 0.0,
        "avg_pnl_pct": round(sum(pnls) / len(pnls), 3) if pnls else None,
    }


def _near(price: float, level: float) -> bool:
    return abs(price - level) / level <= TOUCH_PCT


def _pick_entry(levels: dict) -> Optional[dict]:
    for e in levels.get("entries") or []:
        side = e.get("side")
        if side not in ("לונג", "שורט"):
            continue
        if e.get("status") != "מוכן":
            continue
        px = _num(e.get("px"))
        if px is None:
            continue
        return {"side": "long" if side == "לונג" else "short", "px": px, "why": e.get("why") or ""}
    return None


def _stop_for(side: str, entry: float, levels: dict, fights: dict) -> tuple[Optional[float], str]:
    want = "סטופ לונג" if side == "long" else "סטופ שורט"
    for s in levels.get("stops") or []:
        if s.get("side") == want:
            px = _num(s.get("px"))
            if px is None:
                continue
            if side == "long" and px < entry:
                return round(px, 2), s.get("why") or "סטופ"
            if side == "short" and px > entry:
                return round(px, 2), s.get("why") or "סטופ"
    # fallback: next fight against us
    if side == "long":
        nf = (fights or {}).get("next_fight_below")
        px = _num((nf or {}).get("px"))
        if px is not None and px < entry:
            return round(px, 2), f"מאבק מטה · {(nf or {}).get('tf','')}"
        return round(entry * 0.992, 2), "סטופ חירום 0.8%"
    nf = (fights or {}).get("next_fight_above")
    px = _num((nf or {}).get("px"))
    if px is not None and px > entry:
        return round(px, 2), f"מאבק מעלה · {(nf or {}).get('tf','')}"
    return round(entry * 1.008, 2), "סטופ חירום 0.8%"


def _targets_for(side: str, entry: float, levels: dict) -> list[dict]:
    out: list[dict] = []
    for x in levels.get("exits") or []:
        label = x.get("side") or ""
        px = _num(x.get("px"))
        if px is None:
            continue
        if side == "long" and ("יציאת לונג" in label or label == "יעד מעלה") and px > entry:
            out.append({"px": round(px, 2), "why": x.get("why") or label})
        if side == "short" and ("יציאת שורט" in label or label == "יעד מטה") and px < entry:
            out.append({"px": round(px, 2), "why": x.get("why") or label})
    # unique by px, keep order
    seen = set()
    uniq = []
    for t in out:
        if t["px"] in seen:
            continue
        seen.add(t["px"])
        uniq.append(t)
    return uniq[:4]


def _pnl(side: str, entry: float, exit_px: float) -> float:
    if side == "long":
        return round((exit_px - entry) / entry * 100, 3)
    return round((entry - exit_px) / entry * 100, 3)


def _close(open_trade: dict, exit_px: float, reason: str, kind: str, ts: str) -> dict:
    side = open_trade["side"]
    entry = float(open_trade["entry"])
    pnl = _pnl(side, entry, exit_px)
    row = {
        "id": open_trade["id"],
        "status": "closed",
        "side": side,
        "side_he": "לונג" if side == "long" else "שורט",
        "entry": entry,
        "stop": open_trade.get("stop"),
        "targets": open_trade.get("targets") or [],
        "exit": round(exit_px, 2),
        "exit_kind": kind,  # target | stop | reverse
        "exit_reason": reason,
        "pnl_pct": pnl,
        "result_he": "הצלחה" if pnl > 0 else "כישלון",
        "opened_at": open_trade.get("opened_at"),
        "closed_at": ts,
        "entry_why": open_trade.get("entry_why"),
        "stop_why": open_trade.get("stop_why"),
    }
    _append_trade(row)
    return row


def tick(report: dict) -> dict:
    """Advance paper book from a structure report. Idempotent per open trade."""
    price = _num(report.get("price"))
    if price is None:
        return {"error": "no price", "open": None, "last_closed": None, "stats": summarize(load_trades())}

    levels = report.get("levels") or {}
    fights = report.get("fights") or {}
    ts = report.get("receivedAt") or _now()
    state = _load_state()
    open_trade = state.get("open")
    last_closed = None
    note = ""

    # manage open first
    if open_trade:
        side = open_trade["side"]
        stop = _num(open_trade.get("stop"))
        targets = open_trade.get("targets") or []

        # stop first (priority over target if both somehow near)
        if side == "long" and stop is not None and price <= stop:
            last_closed = _close(open_trade, stop, open_trade.get("stop_why") or "סטופ", "stop", ts)
            open_trade = None
            note = "יציאה בסטופ"
        elif side == "short" and stop is not None and price >= stop:
            last_closed = _close(open_trade, stop, open_trade.get("stop_why") or "סטופ", "stop", ts)
            open_trade = None
            note = "יציאה בסטופ"
        else:
            hit_t = None
            for t in targets:
                tpx = _num(t.get("px") if isinstance(t, dict) else t)
                if tpx is None:
                    continue
                if side == "long" and price >= tpx:
                    hit_t = (tpx, (t.get("why") if isinstance(t, dict) else None) or "יעד")
                    break
                if side == "short" and price <= tpx:
                    hit_t = (tpx, (t.get("why") if isinstance(t, dict) else None) or "יעד")
                    break
            if hit_t:
                last_closed = _close(open_trade, hit_t[0], hit_t[1], "target", ts)
                open_trade = None
                note = "יציאה ביעד"
            else:
                note = "בפוזיציה · מחכים ליעד או סטופ"

    # open new only when flat
    if open_trade is None and last_closed is None:
        # allow open on same tick only if we did not just close (avoid flip-chop)
        cand = _pick_entry(levels)
        if cand and (_near(price, cand["px"]) or (cand["side"] == "long" and price <= cand["px"] * (1 + TOUCH_PCT)) or (cand["side"] == "short" and price >= cand["px"] * (1 - TOUCH_PCT))):
            stop, stop_why = _stop_for(cand["side"], cand["px"], levels, fights)
            targets = _targets_for(cand["side"], cand["px"], levels)
            if stop is None:
                note = "אין כניסה · חסר סטופ"
            else:
                open_trade = {
                    "id": str(uuid.uuid4())[:8],
                    "side": cand["side"],
                    "side_he": "לונג" if cand["side"] == "long" else "שורט",
                    "entry": round(cand["px"], 2),
                    "stop": stop,
                    "stop_why": stop_why,
                    "targets": targets,
                    "entry_why": cand["why"],
                    "opened_at": ts,
                    "opened_price_mark": round(price, 2),
                }
                _append_trade(
                    {
                        "id": open_trade["id"],
                        "status": "opened",
                        "side": open_trade["side"],
                        "side_he": open_trade["side_he"],
                        "entry": open_trade["entry"],
                        "stop": stop,
                        "targets": targets,
                        "entry_why": cand["why"],
                        "stop_why": stop_why,
                        "opened_at": ts,
                        "mark": round(price, 2),
                    }
                )
                note = "נפתחה עסקת פייפר"

    if open_trade is None and not note:
        note = "אין פוזיציה · מחכים לכניסה מוכנה"

    state = {"open": open_trade, "updated_at": _now(), "note": note}
    _save_state(state)
    trades = load_trades(50)
    return {
        "open": open_trade,
        "last_closed": last_closed,
        "note": note,
        "trades": trades[-20:],
        "stats": summarize([t for t in trades if t.get("status") == "closed"]),
        "paper_only": True,
    }


def book_snapshot(report: Optional[dict] = None) -> dict:
    """Read current book; if report given, tick first."""
    if report and not report.get("error"):
        return tick(report)
    state = _load_state()
    trades = load_trades(50)
    return {
        "open": state.get("open"),
        "last_closed": None,
        "note": state.get("note") or "",
        "trades": trades[-20:],
        "stats": summarize([t for t in trades if t.get("status") == "closed"]),
        "paper_only": True,
    }
