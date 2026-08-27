#!/usr/bin/env python3
"""Paper runner for ladder_rules — reads TV webhook events, no Claude / no broker."""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from ladder_rules import (
    ACTION_ENTER_LONG,
    ACTION_ENTER_SHORT,
    ACTION_EXIT,
    ACTION_FLAT,
    PaperState,
    apply_decision,
    decide,
    _board_map,
)

DEFAULT_BASE = os.environ.get("TV_LISTENER", "https://tv-stack-listener.vercel.app")
HERE = Path(__file__).resolve().parent
DEFAULT_JOURNAL = HERE / "paper_journal.jsonl"
_SSL = ssl.create_default_context()
if os.environ.get("TV_SSL_INSECURE", "1") == "1":
    _SSL = ssl._create_unverified_context()


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "soulmatch-paper-runner/1"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        import subprocess

        raw = subprocess.check_output(["curl", "-sS", url], timeout=30)
        return json.loads(raw.decode("utf-8"))


def load_events(base: str, limit: int) -> list[dict]:
    data = fetch_json(f"{base.rstrip('/')}/api/tv/events?limit={limit}")
    events = list(data.get("events") or [])
    # API returns newest first → chronological for paper
    events.reverse()
    return events


def load_latest(base: str) -> dict | None:
    data = fetch_json(f"{base.rstrip('/')}/api/tv/latest")
    latest = data.get("latest")
    return latest if isinstance(latest, dict) and latest.get("price") is not None else None


def append_journal(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def summarize(trades: list[dict]) -> dict:
    closed = [t for t in trades if t.get("action") == ACTION_EXIT]
    pnls = [t["detail"]["pnl_pct"] for t in closed if t.get("detail", {}).get("pnl_pct") is not None]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    return {
        "events": len(trades),
        "entries": sum(1 for t in trades if t["action"] in (ACTION_ENTER_LONG, ACTION_ENTER_SHORT)),
        "exits": len(closed),
        "pnl_pct_sum": round(sum(pnls), 3) if pnls else 0.0,
        "wins": len(wins),
        "losses": len(losses),
        "avg_pnl_pct": round(sum(pnls) / len(pnls), 3) if pnls else None,
    }


def run_replay(events: list[dict], journal: Path | None, quiet: bool = False) -> tuple[list[dict], PaperState]:
    state = PaperState()
    prev_board = None
    rows: list[dict] = []
    if journal and journal.exists():
        # fresh replay file each full run if --fresh handled by caller
        pass

    for ev in events:
        ts = ev.get("receivedAt") or datetime.now(timezone.utc).isoformat()
        decision = decide(ev, state, prev_board)
        prev_board = _board_map(ev)
        state = apply_decision(state, decision, str(ts))
        row = {
            "ts": ts,
            "action": decision.action,
            "price": decision.price,
            "reason": decision.reason,
            "detail": decision.detail,
            "trigger": ev.get("trigger"),
            "schema": ev.get("schema"),
            "state_after": {
                "position": state.position,
                "entry": state.entry,
                "stop": state.stop,
            },
        }
        rows.append(row)
        if journal and decision.action != ACTION_FLAT:
            append_journal(journal, row)
        if not quiet and decision.action != ACTION_FLAT:
            print(f"{ts}  {decision.action}  {decision.price}  {decision.reason}")
    return rows, state


def main() -> int:
    ap = argparse.ArgumentParser(description="Paper ladder runner (4H direction · 15/5 trigger · 2m exec)")
    ap.add_argument("--base", default=DEFAULT_BASE, help="tv-stack-listener base URL")
    ap.add_argument("--limit", type=int, default=200, help="events to replay (newest N)")
    ap.add_argument("--latest-only", action="store_true", help="decide only on /api/tv/latest")
    ap.add_argument("--journal", type=Path, default=DEFAULT_JOURNAL)
    ap.add_argument("--fresh", action="store_true", help="wipe journal before replay")
    ap.add_argument("--all-actions", action="store_true", help="print חוץ too")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if args.fresh and args.journal.exists():
        args.journal.unlink()

    if args.latest_only:
        latest = load_latest(args.base)
        if not latest:
            print("no latest snapshot", file=sys.stderr)
            return 1
        state = PaperState()
        d = decide(latest, state, None)
        print(json.dumps({"action": d.action, "price": d.price, "reason": d.reason, "detail": d.detail}, ensure_ascii=False, indent=2))
        if d.action != ACTION_FLAT:
            append_journal(
                args.journal,
                {
                    "ts": latest.get("receivedAt"),
                    "action": d.action,
                    "price": d.price,
                    "reason": d.reason,
                    "detail": d.detail,
                    "trigger": latest.get("trigger"),
                    "schema": latest.get("schema"),
                },
            )
        return 0

    events = load_events(args.base, args.limit)
    if not events:
        print("no events", file=sys.stderr)
        return 1

    # for --all-actions, temporarily print flats by not filtering in run — handle here
    if args.all_actions:
        state = PaperState()
        prev_board = None
        rows = []
        for ev in events:
            ts = ev.get("receivedAt")
            d = decide(ev, state, prev_board)
            prev_board = _board_map(ev)
            state = apply_decision(state, d, str(ts))
            row = {
                "ts": ts,
                "action": d.action,
                "price": d.price,
                "reason": d.reason,
                "detail": d.detail,
            }
            rows.append(row)
            if not args.quiet:
                print(f"{ts}  {d.action}  {d.price}  {d.reason}")
            if d.action != ACTION_FLAT:
                append_journal(args.journal, {**row, "trigger": ev.get("trigger"), "schema": ev.get("schema")})
        print(json.dumps(summarize(rows), ensure_ascii=False, indent=2))
        print(f"journal: {args.journal}")
        return 0

    rows, state = run_replay(events, args.journal if not args.quiet or True else args.journal, quiet=args.quiet)
    # also append flats? only non-flat already. Summary from all decisions including flats in memory:
    # recompute summary from rows (includes flats)
    print("---")
    print(f"events_replayed: {len(events)}")
    print(f"final_position: {state.position} entry={state.entry} stop={state.stop}")
    print(json.dumps(summarize(rows), ensure_ascii=False, indent=2))
    print(f"journal: {args.journal}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
