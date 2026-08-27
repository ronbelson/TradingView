#!/usr/bin/env python3
"""Local simple viewer. Proxies live webhook. No Vercel deploy needed."""

from __future__ import annotations

import json
import subprocess
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cut_attempts import analyze_default_lines, events_from_api_payload
from story_ladder import build_ladder
from brief_view import build_brief
from claude_brief import enrich_brief_with_claude
from structure_report import build_report_with_text
from paper_book import book_snapshot

ROOT = Path(__file__).resolve().parent
PORT = 8765
LIVE = "https://tv-stack-listener.vercel.app"
_cuts_cache: dict = {"ts": 0.0, "data": None}
_CUTS_TTL = 12.0


def fetch_live(path: str) -> bytes:
    url = f"{LIVE}{path}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.read()
    except Exception:
        return subprocess.check_output(["curl", "-sS", url], timeout=30)


def load_story() -> dict:
    for name in ("haiku-story-trial5.json", "haiku-story-trial4.json", "haiku-story-trial3.json"):
        fp = ROOT / name
        if fp.exists():
            return json.loads(fp.read_text())
    return {"ui": {}}


def load_cuts() -> dict:
    import time

    now = time.time()
    if _cuts_cache["data"] is not None and (now - float(_cuts_cache["ts"])) < _CUTS_TTL:
        return _cuts_cache["data"]
    try:
        raw = fetch_live("/api/tv/events?limit=200")
        data = json.loads(raw.decode())
        out = analyze_default_lines(events_from_api_payload(data))
        _cuts_cache["ts"] = now
        _cuts_cache["data"] = out
        return out
    except Exception as e:
        return {"error": str(e), "primary": None, "lines": []}


def load_ladder() -> dict:
    try:
        latest = json.loads(fetch_live("/api/tv/latest").decode())
        cuts = load_cuts()
        return build_ladder(latest, cuts)
    except Exception as e:
        return {"error": str(e), "ladder": {"up": [], "down": []}, "story_he": ""}


def load_brief(force_claude: bool = False, trade_tf: str | None = None) -> dict:
    try:
        import time

        latest = json.loads(fetch_live("/api/tv/latest").decode())
        cuts = load_cuts()
        base = build_brief(latest, cuts)
        out = enrich_brief_with_claude(base, force=force_claude, trade_tf=trade_tf)
        out["data_fetched_at"] = time.time()
        return out
    except Exception as e:
        return {"error": str(e)}


def load_structure() -> dict:
    try:
        latest = json.loads(fetch_live("/api/tv/latest").decode())
        report = build_report_with_text(latest)
        if not report.get("error"):
            report["paper"] = book_snapshot(report)
        return report
    except Exception as e:
        return {"error": str(e)}


def load_paper() -> dict:
    try:
        latest = json.loads(fetch_live("/api/tv/latest").decode())
        report = build_report_with_text(latest)
        return book_snapshot(report if not report.get("error") else None)
    except Exception as e:
        return {"error": str(e), "paper_only": True}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html", "/simple"):
            html = (ROOT / "simple-local.html").read_bytes()
            return self._send(200, html, "text/html; charset=utf-8")
        if path in ("/report", "/structure"):
            html = (ROOT / "structure-report.html").read_bytes()
            return self._send(200, html, "text/html; charset=utf-8")
        if path == "/api/live/latest":
            try:
                return self._send(200, fetch_live("/api/tv/latest"), "application/json")
            except Exception as e:
                return self._send(502, json.dumps({"error": str(e)}).encode(), "application/json")
        if path == "/api/structure":
            body = json.dumps(load_structure(), ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if path == "/api/paper":
            body = json.dumps(load_paper(), ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if path == "/api/cuts":
            body = json.dumps(load_cuts(), ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if path == "/api/ladder":
            body = json.dumps(load_ladder(), ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if path == "/api/brief":
            from urllib.parse import parse_qs

            qs = ""
            if "?" in self.path:
                qs = self.path.split("?", 1)[1]
            q = parse_qs(qs)
            force = "force=1" in qs or (q.get("force") or [""])[0] == "1"
            trade_tf = (q.get("trade_tf") or [None])[0]
            body = json.dumps(
                load_brief(force_claude=force, trade_tf=trade_tf),
                ensure_ascii=False,
            ).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if path == "/api/story":
            return self._send(
                200,
                json.dumps(load_story(), ensure_ascii=False).encode(),
                "application/json; charset=utf-8",
            )
        if path == "/api/story/meta":
            meta = ROOT / "haiku-story-trial5.meta.json"
            if not meta.exists():
                meta = ROOT / "haiku-story-trial4.meta.json"
            body = meta.read_bytes() if meta.exists() else b"{}"
            return self._send(200, body, "application/json")
        rel = path.lstrip("/")
        fp = (ROOT / rel).resolve()
        if str(fp).startswith(str(ROOT)) and fp.is_file():
            ctype = "text/plain"
            if fp.suffix == ".html":
                ctype = "text/html; charset=utf-8"
            elif fp.suffix == ".json":
                ctype = "application/json; charset=utf-8"
            elif fp.suffix == ".css":
                ctype = "text/css"
            elif fp.suffix == ".js":
                ctype = "application/javascript"
            elif fp.suffix == ".svg":
                ctype = "image/svg+xml"
            elif fp.suffix == ".png":
                ctype = "image/png"
            elif fp.suffix in (".jpg", ".jpeg"):
                ctype = "image/jpeg"
            return self._send(200, fp.read_bytes(), ctype)
        self._send(404, b"not found", "text/plain")


def main():
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Local simple view: http://127.0.0.1:{PORT}/")
    print(f"Structure report: http://127.0.0.1:{PORT}/report")
    print("Live data from:", LIVE)
    print("APIs: /api/structure /api/paper /api/brief /api/cuts /api/ladder")
    print("Force Claude refresh: /api/brief?force=1&trade_tf=30m")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
