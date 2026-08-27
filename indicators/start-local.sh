#!/bin/zsh
cd /Users/ronbelson/Projects/soulmatch/.tmp/btc-indicators || exit 1
pkill -f "serve-simple-local.py" 2>/dev/null
sleep 0.3
nohup /usr/bin/python3 -u serve-simple-local.py > /tmp/btc-simple-local.log 2>&1 &
echo $! > /tmp/btc-simple-local.pid
sleep 0.5
echo "pid=$(cat /tmp/btc-simple-local.pid)"
echo "open http://127.0.0.1:8765/"
lsof -iTCP:8765 -sTCP:LISTEN || echo "FAILED"
