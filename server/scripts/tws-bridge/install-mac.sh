#!/usr/bin/env bash
# Mandatory on every Mac that feeds TWS marks into BTC CHEF.
# Usage:
#   bash scripts/tws-bridge/install-mac.sh
#   bash scripts/tws-bridge/install-mac.sh --target vercel
#   bash scripts/tws-bridge/install-mac.sh --target local
#   bash scripts/tws-bridge/install-mac.sh --target https://my-vps.example.com/api/tws/quote
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CHEF_ROOT="$(cd "$ROOT/../.." && pwd)"
LABEL="com.ronbelson.mbt-quote-bridge"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SECRET_FILE="${CHEF_SECRET_FILE:-$CHEF_ROOT/WEBHOOK_URL.txt}"
MBT_LOCAL_SYMBOL="${MBT_LOCAL_SYMBOL:-MBTQ6}"
IB_PORT="${IB_PORT:-7496}"
TARGET="vercel"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --secret-file)
      SECRET_FILE="${2:-}"
      shift 2
      ;;
    --symbol)
      MBT_LOCAL_SYMBOL="${2:-}"
      shift 2
      ;;
    --port)
      IB_PORT="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '1,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

case "$TARGET" in
  vercel|prod|production)
    CHEF_QUOTE_URL="https://tv-stack-listener.vercel.app/api/tws/quote"
    ;;
  local|localhost|dev)
    CHEF_QUOTE_URL="http://127.0.0.1:3010/api/tws/quote"
    ;;
  http://*|https://*)
    CHEF_QUOTE_URL="$TARGET"
    ;;
  *)
    echo "Bad --target. Use: vercel | local | full URL to /api/tws/quote" >&2
    exit 1
    ;;
esac

if [[ ! -f "$SECRET_FILE" ]]; then
  echo "Missing secret file: $SECRET_FILE" >&2
  echo "Put WEBHOOK_URL.txt (with secret=…) or pass --secret-file" >&2
  exit 1
fi

echo "Install TWS → CHEF bridge"
echo "  bridge dir: $ROOT"
echo "  target:     $CHEF_QUOTE_URL"
echo "  symbol:     $MBT_LOCAL_SYMBOL"
echo "  TWS port:   $IB_PORT"
echo "  secret:     $SECRET_FILE"

mkdir -p "$ROOT/logs" "$HOME/Library/LaunchAgents"
cd "$ROOT"
npm install --omit=dev

TMP_PLIST="$(mktemp)"
sed \
  -e "s|__WATCH_SH__|$ROOT/mbt-quote-bridge-watch.sh|g" \
  -e "s|__BRIDGE_DIR__|$ROOT|g" \
  -e "s|__CHEF_QUOTE_URL__|$CHEF_QUOTE_URL|g" \
  -e "s|__SECRET_FILE__|$SECRET_FILE|g" \
  -e "s|__MBT_LOCAL_SYMBOL__|$MBT_LOCAL_SYMBOL|g" \
  -e "s|__IB_PORT__|$IB_PORT|g" \
  "$ROOT/com.ronbelson.mbt-quote-bridge.plist.template" >"$TMP_PLIST"

chmod +x "$ROOT/mbt-quote-bridge-watch.sh" "$ROOT/install-mac.sh"
UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
pkill -f 'mbt-quote-bridge.mjs' 2>/dev/null || true
cp "$TMP_PLIST" "$PLIST_DST"
rm -f "$TMP_PLIST"

launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}"

echo
echo "OK. LaunchAgent running: $LABEL"
echo "Check:"
echo "  launchctl print gui/\$(id -u)/$LABEL | head -30"
echo "  tail -20 $ROOT/logs/mbt-quote-bridge-watch.log"
echo "  curl -sS ${CHEF_QUOTE_URL} | python3 -m json.tool | head -25"
echo
echo "TWS must be open with API enabled on port $IB_PORT."
