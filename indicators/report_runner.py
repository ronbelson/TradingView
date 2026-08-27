#!/usr/bin/env python3
"""Print / dump structure station report from live webhook."""

from __future__ import annotations

import argparse
import json
import os
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

from structure_report import build_report_with_text

DEFAULT_BASE = os.environ.get("TV_LISTENER", "https://tv-stack-listener.vercel.app")
HERE = Path(__file__).resolve().parent
_SSL = ssl._create_unverified_context() if os.environ.get("TV_SSL_INSECURE", "1") == "1" else ssl.create_default_context()


def fetch_latest(base: str) -> dict:
    url = f"{base.rstrip('/')}/api/tv/latest"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "structure-report/1"})
        with urllib.request.urlopen(req, timeout=30, context=_SSL) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        data = json.loads(subprocess.check_output(["curl", "-sS", url], timeout=30).decode())
    return data.get("latest") or data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out", type=Path, default=None, help="write JSON report")
    args = ap.parse_args()
    snap = fetch_latest(args.base)
    rep = build_report_with_text(snap)
    if args.out:
        args.out.write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {args.out}")
    if args.json:
        print(json.dumps(rep, ensure_ascii=False, indent=2))
    else:
        print(rep["text_he"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
