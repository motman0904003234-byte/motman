#!/usr/bin/env bash
# Keep Motman API + Cloudflare tunnel alive for phone fieldwork.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR=/tmp/motman-keepalive
mkdir -p "$LOG_DIR" "$ROOT/frontend/public/downloads"
cp -f /opt/cursor/artifacts/motman-debug.apk "$ROOT/frontend/public/downloads/motman.apk" 2>/dev/null || true

ensure_api() {
  if curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null; then
    return 0
  fi
  echo "$(date -Is) restarting API" >>"$LOG_DIR/keepalive.log"
  cd "$ROOT/frontend" && npm run build >>"$LOG_DIR/build.log" 2>&1 || true
  cd "$ROOT/backend"
  PYTHONPATH=. nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
    >>"$LOG_DIR/api.log" 2>&1 &
  echo $! >"$LOG_DIR/api.pid"
  sleep 2
}

ensure_tunnel() {
  if pgrep -f 'cloudflared tunnel --url' >/dev/null; then
    return 0
  fi
  echo "$(date -Is) restarting tunnel" >>"$LOG_DIR/keepalive.log"
  if [ ! -x /tmp/cloudflared ]; then
    curl -fsSL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x /tmp/cloudflared
  fi
  nohup /tmp/cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate \
    >>"$LOG_DIR/tunnel.log" 2>&1 &
  echo $! >"$LOG_DIR/tunnel.pid"
  sleep 3
  grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | tail -1 \
    > /opt/cursor/artifacts/PUBLIC_URL.txt || true
}

while true; do
  ensure_api
  ensure_tunnel
  sleep 20
done