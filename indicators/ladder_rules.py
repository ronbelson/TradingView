"""4H ladder paper rules — no Claude.

Ladder:
  Week / 3D / Day = permission
  4H = trade direction
  15m / 5m = break / structure trigger
  2m = execution (no chase)
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional


LONG_BUB = {"HL", "LL"}
SHORT_BUB = {"HH", "LH"}

ACTION_ENTER_LONG = "כניסת לונג"
ACTION_ENTER_SHORT = "כניסת שורט"
ACTION_EXIT = "יציאה"
ACTION_FLAT = "חוץ"


def _tf_map(snapshot: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in snapshot.get("tfs") or []:
        name = row.get("tf")
        if name:
            out[str(name)] = row
    return out


def _board_map(snapshot: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in snapshot.get("board") or []:
        name = row.get("tf")
        bub = row.get("bub")
        if name and bub:
            out[str(name)] = str(bub)
    # fallback from tfs if board missing
    if not out:
        for name, row in _tf_map(snapshot).items():
            if row.get("bub"):
                out[name] = str(row["bub"])
    return out


def _num(v: Any) -> Optional[float]:
    if isinstance(v, (int, float)) and v == v:
        return float(v)
    return None


def side_score(row: Optional[dict], bub: Optional[str] = None) -> int:
    """Positive = long lean, negative = short lean."""
    if not row and not bub:
        return 0
    s = 0
    letter = bub or (str(row.get("bub") or "") if row else "")
    if letter in LONG_BUB:
        s += 1
    elif letter in SHORT_BUB:
        s -= 1
    if row:
        zap = str(row.get("zap") or "")
        if zap == "GREEN":
            s += 1
        elif zap == "RED":
            s -= 1
        ch = str(row.get("channel") or "")
        if ch == "up":
            s += 1
        elif ch == "down":
            s -= 1
        stk = str(row.get("stk") or "")
        if stk == "bull":
            s += 1
        elif stk == "bear":
            s -= 1
    return s


def direction_votes_4h(h4: dict) -> tuple[Optional[str], int, list[str]]:
    """Return ('long'|'short'|None, votes, reasons). Need >= 3 votes."""
    reasons: list[str] = []
    long_v = 0
    short_v = 0
    bub = str(h4.get("bub") or "")
    if bub in LONG_BUB:
        long_v += 1
        reasons.append(f"4H bub {bub}")
    elif bub in SHORT_BUB:
        short_v += 1
        reasons.append(f"4H bub {bub}")
    zap = str(h4.get("zap") or "")
    if zap == "GREEN":
        long_v += 1
        reasons.append("4H zap GREEN")
    elif zap == "RED":
        short_v += 1
        reasons.append("4H zap RED")
    ch = str(h4.get("channel") or "")
    if ch in ("up", "mid"):
        if ch == "up":
            long_v += 1
            reasons.append("4H channel up")
        else:
            # mid counts mild for whichever bub leans
            if bub in LONG_BUB:
                long_v += 1
                reasons.append("4H channel mid+bull bub")
            elif bub in SHORT_BUB:
                short_v += 1
                reasons.append("4H channel mid+bear bub")
    elif ch == "down":
        short_v += 1
        reasons.append("4H channel down")
    stk = str(h4.get("stk") or "")
    m_above = bool(h4.get("mAbove"))
    if stk == "bull":
        long_v += 1
        reasons.append("4H stack bull")
    elif stk == "bear":
        short_v += 1
        reasons.append("4H stack bear")
    elif m_above:
        long_v += 1
        reasons.append("4H macd above")
    else:
        short_v += 1
        reasons.append("4H macd below")

    if long_v >= 3 and short_v >= 3:
        return None, 0, reasons + ["mixed 4H"]
    if long_v >= 3 and long_v > short_v:
        # do not long into active HH/LH without enough overrides
        if bub in SHORT_BUB and long_v < 4:
            return None, long_v, reasons + ["blocked: 4H bub still short structure"]
        return "long", long_v, reasons
    if short_v >= 3 and short_v > long_v:
        if bub in LONG_BUB and short_v < 4:
            return None, short_v, reasons + ["blocked: 4H bub still long structure"]
        return "short", short_v, reasons
    return None, max(long_v, short_v), reasons


def permission(tfs: dict[str, dict], board: dict[str, str]) -> tuple[bool, bool, int, list[str]]:
    """Return allow_long, allow_short, net_score, reasons."""
    names = ("Week", "3D", "Day")
    total = 0
    reasons: list[str] = []
    for name in names:
        row = tfs.get(name)
        bub = board.get(name) if name != "Week" and name != "3D" else (row or {}).get("bub")
        if name in ("Week", "3D"):
            bub = (row or {}).get("bub")
        sc = side_score(row, str(bub) if bub else None)
        total += sc
        reasons.append(f"{name} score {sc}")
    # strong against if sum <= -3 block long; >= +3 block short
    allow_long = total >= -2
    allow_short = total <= 2
    return allow_long, allow_short, total, reasons


def trigger_break(
    tfs: dict[str, dict],
    board: dict[str, str],
    want: str,
    prev_board: Optional[dict[str, str]] = None,
) -> tuple[bool, list[str]]:
    """15 = pivot turn, 5 = structure. want = long|short."""
    reasons: list[str] = []
    b15 = board.get("15m") or str((tfs.get("15m") or {}).get("bub") or "")
    b5 = board.get("5m") or str((tfs.get("5m") or {}).get("bub") or "")
    prev15 = (prev_board or {}).get("15m")
    prev5 = (prev_board or {}).get("5m")
    r15 = tfs.get("15m") or {}
    r5 = tfs.get("5m") or {}

    if want == "long":
        turn15 = b15 in LONG_BUB
        # flip into long structure counts stronger
        if prev15 in SHORT_BUB and b15 in LONG_BUB:
            reasons.append("15m pivot turn to HL/LL")
        elif turn15:
            reasons.append(f"15m structure {b15}")
        struct5 = b5 in LONG_BUB or (
            prev5 in SHORT_BUB and b5 in LONG_BUB
        ) or str(r5.get("zap") or "") == "GREEN"
        if b5 in LONG_BUB:
            reasons.append(f"5m structure {b5}")
        elif str(r5.get("zap") or "") == "GREEN":
            reasons.append("5m zap GREEN")
        if prev5 in SHORT_BUB and b5 in LONG_BUB:
            reasons.append("5m structure break up")
        # mild path: 15 long bub + 5 not strong short
        ok = turn15 and struct5 and b5 not in SHORT_BUB
        if not ok and turn15 and str(r5.get("channel") or "") == "up":
            ok = True
            reasons.append("5m channel up confirms")
        return ok, reasons

    # short
    turn15 = b15 in SHORT_BUB
    if prev15 in LONG_BUB and b15 in SHORT_BUB:
        reasons.append("15m pivot turn to HH/LH")
    elif turn15:
        reasons.append(f"15m structure {b15}")
    struct5 = b5 in SHORT_BUB or (
        prev5 in LONG_BUB and b5 in SHORT_BUB
    ) or str(r5.get("zap") or "") == "RED"
    if b5 in SHORT_BUB:
        reasons.append(f"5m structure {b5}")
    elif str(r5.get("zap") or "") == "RED":
        reasons.append("5m zap RED")
    if prev5 in LONG_BUB and b5 in SHORT_BUB:
        reasons.append("5m structure break down")
    ok = turn15 and struct5 and b5 not in LONG_BUB
    if not ok and turn15 and str(r5.get("channel") or "") == "down":
        ok = True
        reasons.append("5m channel down confirms")
    return ok, reasons


def execution_ok(tfs: dict[str, dict], price: float, want: str, day_pct: Optional[float]) -> tuple[bool, list[str]]:
    """2m timing: near level, not chasing vertical day move."""
    reasons: list[str] = []
    r2 = tfs.get("2m") or {}
    r15 = tfs.get("15m") or {}
    bub2 = str(r2.get("bub") or "")
    if day_pct is not None:
        if want == "long" and day_pct >= 2.5:
            return False, ["dayPct too extended for long chase"]
        if want == "short" and day_pct <= -2.5:
            return False, ["dayPct too extended for short chase"]

    levels: list[float] = []
    for row in (r2, r15, tfs.get("4H") or {}):
        for k in ("mf", "ms", "srl", "srh", "rl", "rh", "bubPx"):
            v = _num(row.get(k))
            if v is not None:
                levels.append(v)
    near = False
    if levels and price:
        for lv in levels:
            if abs(price - lv) / price <= 0.0015:  # 0.15%
                near = True
                reasons.append(f"near level {lv:.2f}")
                break
    if want == "long" and bub2 in LONG_BUB:
        near = True
        reasons.append(f"2m bub {bub2}")
    if want == "short" and bub2 in SHORT_BUB:
        near = True
        reasons.append(f"2m bub {bub2}")
    # allow entry if trigger strong even if not glued to MA, but reject clear chase:
    # price stretched >0.35% above fast MA on 15 for long
    mf15 = _num(r15.get("mf"))
    if want == "long" and mf15 and price > mf15 * 1.0035:
        return False, reasons + ["chase above 15m fast MA"]
    if want == "short" and mf15 and price < mf15 * 0.9965:
        return False, reasons + ["chase below 15m fast MA"]
    if not near:
        # still allow if 2m zap agrees and not chase
        if want == "long" and str(r2.get("zap") or "") == "GREEN":
            reasons.append("2m zap GREEN timing")
            return True, reasons
        if want == "short" and str(r2.get("zap") or "") == "RED":
            reasons.append("2m zap RED timing")
            return True, reasons
        return False, reasons + ["no 2m timing"]
    return True, reasons


def levels_for_side(h4: dict, want: str, price: float) -> dict[str, Any]:
    mf = _num(h4.get("mf"))
    srl = _num(h4.get("srl"))
    srh = _num(h4.get("srh"))
    rl = _num(h4.get("rl"))
    rh = _num(h4.get("rh"))
    bub_px = _num(h4.get("bubPx"))
    bub = str(h4.get("bub") or "")
    if want == "long":
        entry_cands = [x for x in (mf, srl, rl, bub_px if bub in LONG_BUB else None) if x is not None and x <= price * 1.001]
        if not entry_cands and mf is not None:
            entry_cands = [mf]
        entry = max(entry_cands) if entry_cands else price
        stops = [x for x in (srl, rl, bub_px if bub in LONG_BUB else None) if x is not None and x < entry]
        stop = min(stops) if stops else (entry * 0.992)
        targets = [x for x in (mf if mf and mf > entry else None, srh, rh) if x is not None and x > entry]
        targets = sorted(set(round(t, 2) for t in targets))
        return {"entry": round(entry, 2), "stop": round(stop, 2), "targets": targets}
    entry_cands = [x for x in (mf, srh, rh, bub_px if bub in SHORT_BUB else None) if x is not None and x >= price * 0.999]
    if not entry_cands and mf is not None:
        entry_cands = [mf]
    entry = min(entry_cands) if entry_cands else price
    stops = [x for x in (srh, rh, bub_px if bub in SHORT_BUB else None) if x is not None and x > entry]
    stop = max(stops) if stops else (entry * 1.008)
    targets = [x for x in (mf if mf and mf < entry else None, srl, rl) if x is not None and x < entry]
    targets = sorted(set(round(t, 2) for t in targets), reverse=True)
    return {"entry": round(entry, 2), "stop": round(stop, 2), "targets": targets}


def exit_signal(
    pos: str,
    h4: dict,
    price: float,
    stop: Optional[float],
    targets: Optional[list] = None,
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    bub = str(h4.get("bub") or "")
    zap = str(h4.get("zap") or "")
    ch = str(h4.get("channel") or "")
    mf = _num(h4.get("mf"))
    stk = str(h4.get("stk") or "")
    tpxs = []
    for t in targets or []:
        if isinstance(t, (int, float)):
            tpxs.append(float(t))
        elif isinstance(t, dict) and t.get("px") is not None:
            try:
                tpxs.append(float(t["px"]))
            except (TypeError, ValueError):
                pass
    if pos == "long":
        if stop is not None and price <= stop:
            return True, ["hit stop"]
        for tpx in tpxs:
            if price >= tpx:
                return True, [f"hit target {tpx}"]
        # need real reverse, not a single leftover letter
        if bub in SHORT_BUB and zap == "RED" and ch == "down":
            return True, [f"4H reverse {bub} + red tape"]
        if zap == "RED" and ch == "down" and stk == "bear":
            return True, ["4H tape fully red"]
        if mf is not None and price < mf * 0.998 and zap == "RED":
            return True, ["broke 4H fast MA with RED"]
    if pos == "short":
        if stop is not None and price >= stop:
            return True, ["hit stop"]
        for tpx in tpxs:
            if price <= tpx:
                return True, [f"hit target {tpx}"]
        if bub in LONG_BUB and zap == "GREEN" and ch == "up":
            return True, [f"4H reverse {bub} + green tape"]
        if zap == "GREEN" and ch == "up" and stk == "bull":
            return True, ["4H tape fully green"]
        if mf is not None and price > mf * 1.002 and zap == "GREEN":
            return True, ["broke 4H fast MA with GREEN"]
    return False, reasons


@dataclass
class Decision:
    action: str
    price: float
    reason: str
    detail: dict

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PaperState:
    position: str = "flat"  # flat|long|short
    entry: Optional[float] = None
    stop: Optional[float] = None
    targets: Optional[list] = None
    opened_at: Optional[str] = None


def decide(
    snapshot: dict,
    state: PaperState,
    prev_board: Optional[dict[str, str]] = None,
) -> Decision:
    price = _num(snapshot.get("price")) or 0.0
    day_pct = _num(snapshot.get("dayPct"))
    tfs = _tf_map(snapshot)
    board = _board_map(snapshot)
    h4 = tfs.get("4H") or {}
    reasons: list[str] = []

    # Manage open position first
    if state.position in ("long", "short"):
        do_exit, exit_rs = exit_signal(state.position, h4, price, state.stop, state.targets)
        if do_exit:
            pnl = None
            if state.entry:
                if state.position == "long":
                    pnl = round((price - state.entry) / state.entry * 100, 3)
                else:
                    pnl = round((state.entry - price) / state.entry * 100, 3)
            return Decision(
                ACTION_EXIT,
                price,
                "; ".join(exit_rs),
                {
                    "was": state.position,
                    "entry": state.entry,
                    "pnl_pct": pnl,
                    "board": board,
                },
            )
        return Decision(
            ACTION_FLAT,
            price,
            "in position — hold",
            {"position": state.position, "entry": state.entry, "stop": state.stop, "targets": state.targets},
        )

    allow_long, allow_short, perm_score, perm_rs = permission(tfs, board)
    reasons.extend(perm_rs)
    want, votes, dir_rs = direction_votes_4h(h4)
    reasons.extend(dir_rs)

    if want is None:
        return Decision(ACTION_FLAT, price, "no 4H direction", {"votes": votes, "permission": perm_score, "board": board})

    if want == "long" and not allow_long:
        return Decision(ACTION_FLAT, price, "higher TF blocks long", {"permission": perm_score, "board": board})
    if want == "short" and not allow_short:
        return Decision(ACTION_FLAT, price, "higher TF blocks short", {"permission": perm_score, "board": board})

    trig_ok, trig_rs = trigger_break(tfs, board, want, prev_board)
    reasons.extend(trig_rs)
    if not trig_ok:
        return Decision(ACTION_FLAT, price, "no 15/5 trigger", {"want": want, "board": board, "why": reasons})

    exec_ok, exec_rs = execution_ok(tfs, price, want, day_pct)
    reasons.extend(exec_rs)
    if not exec_ok:
        return Decision(ACTION_FLAT, price, "no 2m execution", {"want": want, "board": board, "why": reasons})

    lv = levels_for_side(h4, want, price)
    action = ACTION_ENTER_LONG if want == "long" else ACTION_ENTER_SHORT
    return Decision(
        action,
        price,
        "; ".join(reasons[-8:]),
        {
            "want": want,
            "votes": votes,
            "permission": perm_score,
            "levels": lv,
            "dayPct": day_pct,
            "board": board,
            "trigger": snapshot.get("trigger"),
        },
    )


def apply_decision(state: PaperState, decision: Decision, ts: str) -> PaperState:
    if decision.action == ACTION_ENTER_LONG:
        lv = (decision.detail or {}).get("levels") or {}
        return PaperState(
            position="long",
            entry=lv.get("entry") or decision.price,
            stop=lv.get("stop"),
            targets=lv.get("targets"),
            opened_at=ts,
        )
    if decision.action == ACTION_ENTER_SHORT:
        lv = (decision.detail or {}).get("levels") or {}
        return PaperState(
            position="short",
            entry=lv.get("entry") or decision.price,
            stop=lv.get("stop"),
            targets=lv.get("targets"),
            opened_at=ts,
        )
    if decision.action == ACTION_EXIT:
        return PaperState()
    return state
