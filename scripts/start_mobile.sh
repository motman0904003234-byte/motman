#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pkill -f 'uvicorn app.main:app' >/dev/null 2>&1 || true
pkill -f 'vite' >/dev/null 2>&1 || true
pkill -f 'localtunnel' >/dev/null 2>&1 || true
sleep 1

cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then npm install; fi
npm run build

cd "$ROOT/backend"
python3 -m pip install -q -r requirements.txt
# Serve built PWA + API on one port for phones
PYTHONPATH=. python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 >/tmp/motman-mobile-api.log 2>&1 &
API_PID=$!
sleep 2

# Public tunnel for phone internet access
npx --yes localtunnel --port 8000 >/tmp/motman-tunnel.log 2>&1 &
TUN_PID=$!
sleep 3

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "LOCAL_API=http://${LAN_IP:-127.0.0.1}:8000"
echo "TUNNEL_LOG=/tmp/motman-tunnel.log"
if grep -qo 'https://[^ ]*' /tmp/motman-tunnel.log; then
  grep -o 'https://[^ ]*' /tmp/motman-tunnel.log | head -1 | awk '{print "PUBLIC_URL="$0}'
fi
echo "API_PID=$API_PID TUN_PID=$TUN_PID"
echo "Open the PUBLIC_URL on your phone, then Add to Home Screen."
wait $API_PID