#!/usr/bin/env bash
# Keep MBT quote bridge alive AND healthy.
# - Restarts if process exits
# - Restarts if CHEF quote age exceeds STALE_SEC
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
CHEF_ROOT="$(cd "$ROOT/../.." && pwd)"
SECRET_FILE="${CHEF_SECRET_FILE:-$CHEF_ROOT/WEBHOOK_URL.txt}"
CHEF_QUOTE_URL="${CHEF_QUOTE_URL:-https://tv-stack-listener.vercel.app/api/tws/quote}"
CHEF_QUOTE_GET_URL="${CHEF_QUOTE_GET_URL:-$CHEF_QUOTE_URL}"
IB_HOST="${IB_HOST:-127.0.0.1}"
IB_PORT="${IB_PORT:-7496}"
IB_CLIENT_ID="${IB_CLIENT_ID:-8801}"
QUOTE_INTERVAL_MS="${QUOTE_INTERVAL_MS:-3000}"
MBT_LOCAL_SYMBOL="${MBT_LOCAL_SYMBOL:-MBTQ6}"
BACKOFF_SEC="${BACKOFF_SEC:-5}"
STALE_SEC="${STALE_SEC:-45}"
HEALTH_SEC="${HEALTH_SEC:-15}"
LOG_DIR="${LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_FILE:-$LOG_DIR/mbt-quote-bridge-watch.log}"

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG_FILE"
}

if [[ -z "${CHEF_SECRET:-}" ]]; then
  if [[ ! -f "$SECRET_FILE" ]]; then
    echo "Missing CHEF_SECRET and secret file: $SECRET_FILE" >&2
    exit 1
  fi
  CHEF_SECRET="$(python3 -c "import re,sys; t=open(sys.argv[1]).read(); m=re.search(r'secret=([^\s&]+)', t); print(m.group(1) if m else '')" "$SECRET_FILE")"
fi
if [[ -z "$CHEF_SECRET" ]]; then
  echo "Could not parse CHEF_SECRET" >&2
  exit 1
fi

cd "$ROOT"
if [[ ! -d node_modules/@stoqey/ib ]]; then
  log "npm install in $ROOT"
  npm install --omit=dev
fi

log "watchdog start · TWS ${IB_HOST}:${IB_PORT} · pin ${MBT_LOCAL_SYMBOL} · target ${CHEF_QUOTE_URL} · stale>${STALE_SEC}s"

quote_age_sec() {
  python3 - "$CHEF_QUOTE_GET_URL" <<'PY' 2>/dev/null
import json, sys, urllib.request
from datetime import datetime, timezone
url = sys.argv[1]
try:
    with urllib.request.urlopen(url, timeout=8) as r:
        d = json.load(r)
except Exception:
    print(-1)
    raise SystemExit
q = (d or {}).get("quote") or {}
asof = q.get("asOf") or q.get("savedAt") or ""
if not asof:
    print(-1)
    raise SystemExit
try:
    t = datetime.fromisoformat(asof.replace("Z", "+00:00"))
except Exception:
    print(-1)
    raise SystemExit
print(int((datetime.now(timezone.utc) - t).total_seconds()))
PY
}

kill_bridge_tree() {
  local pid="${1:-}"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
  pkill -f 'mbt-quote-bridge.mjs' 2>/dev/null || true
}

while true; do
  log "starting bridge…"
  CHEF_QUOTE_URL="$CHEF_QUOTE_URL" \
  CHEF_SECRET="$CHEF_SECRET" \
  IB_HOST="$IB_HOST" \
  IB_PORT="$IB_PORT" \
  IB_CLIENT_ID="$IB_CLIENT_ID" \
  QUOTE_INTERVAL_MS="$QUOTE_INTERVAL_MS" \
  MBT_LOCAL_SYMBOL="$MBT_LOCAL_SYMBOL" \
  node mbt-quote-bridge.mjs >>"$LOG_FILE" 2>&1 &
  BRIDGE_PID=$!
  log "bridge pid=${BRIDGE_PID}"

  while kill -0 "$BRIDGE_PID" 2>/dev/null; do
    sleep "$HEALTH_SEC"
    age="$(quote_age_sec || echo -1)"
    if [[ "$age" == "-1" ]]; then
      log "health · cannot read CHEF quote · restart"
      kill_bridge_tree "$BRIDGE_PID"
      break
    fi
    if (( age > STALE_SEC )); then
      log "health · quote age ${age}s > ${STALE_SEC}s · restart"
      kill_bridge_tree "$BRIDGE_PID"
      break
    fi
    log "health · ok · age ${age}s · pid ${BRIDGE_PID}"
  done

  wait "$BRIDGE_PID" 2>/dev/null || true
  code=$?
  log "bridge exited code=${code} · restart in ${BACKOFF_SEC}s"
  sleep "$BACKOFF_SEC"
done
