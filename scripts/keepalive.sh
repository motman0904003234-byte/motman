# Keep Motman API + Cloudflare tunnel alive for phone fieldwork.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR=/tmp/motman-keepalive
mkdir -p "$LOG_DIR" "$ROOT/frontend/public/downloads" /opt/cursor/artifacts
cp -f /opt/cursor/artifacts/motman-debug.apk "$ROOT/frontend/public/downloads/motman.apk" 2>/dev/null || true

refresh_public_assets() {
  local url=""
  if [ -f /opt/cursor/artifacts/PUBLIC_URL.txt ]; then
    url="$(tr -d '[:space:]' </opt/cursor/artifacts/PUBLIC_URL.txt)"
  fi
  if [ -z "$url" ]; then
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" 2>/dev/null | tail -1 || true)"
  fi
  [ -z "$url" ] && return 0
  echo "$url" >/opt/cursor/artifacts/PUBLIC_URL.txt
  mkdir -p "$ROOT/frontend/dist" "$ROOT/frontend/public/downloads" "$ROOT/frontend/dist/downloads"
  printf '{"apiBase":"%s/api/v1"}\n' "$url" >"$ROOT/frontend/dist/runtime-config.json"
  printf '{"apiBase":"%s/api/v1"}\n' "$url" >"$ROOT/frontend/public/runtime-config.json"
  if command -v python3 >/dev/null; then
    python3 - <<'PY'
import urllib.parse
import urllib.request
from pathlib import Path

url = Path("/opt/cursor/artifacts/PUBLIC_URL.txt").read_text().strip()
apk = f"{url}/downloads/motman.apk"
for name, target in [("motman-qr.png", url), ("motman-apk-qr.png", apk)]:
    q = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + urllib.parse.quote(target, safe="")
    data = urllib.request.urlopen(q, timeout=20).read()
    for base in [
        Path("/workspace/frontend/public/downloads"),
        Path("/workspace/frontend/dist/downloads"),
        Path("/opt/cursor/artifacts"),
    ]:
        base.mkdir(parents=True, exist_ok=True)
        (base / name).write_bytes(data)
print("QR refreshed for", url)
PY
  fi
  cat >/opt/cursor/artifacts/MOBILE_URLS.txt <<EOF
Motman مستمر

WEB: $url
APK: $url/downloads/motman.apk
CSV: $url/api/v1/mobile/traders.csv
STATS: $url/api/v1/mobile/stats
HEALTH: $url/healthz

محلي APK: /opt/cursor/artifacts/motman-debug.apk
PR: https://github.com/motman0904003234-byte/motman/pull/1
EOF
  # Export for API process restarts
  export PUBLIC_BASE_URL="$url"
}

ensure_api() {
  if curl -sf http://127.0.0.1:8000/healthz >/dev/null || curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null; then
    return 0
  fi
  echo "$(date -Is) restarting API" >>"$LOG_DIR/keepalive.log"
  # Stop any stale uvicorn on :8000 without broad pkill
  for pid in $(pgrep -f 'python3 -m uvicorn app.main:app' || true); do
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
  cd "$ROOT/frontend" && npm run build >>"$LOG_DIR/build.log" 2>&1 || true
  mkdir -p "$ROOT/frontend/dist/downloads"
  cp -f "$ROOT/frontend/public/downloads/"* "$ROOT/frontend/dist/downloads/" 2>/dev/null || true
  refresh_public_assets || true
  cd "$ROOT/backend"
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$(cat /opt/cursor/artifacts/PUBLIC_URL.txt 2>/dev/null || true)}" \
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
  : >"$LOG_DIR/tunnel.log"
  nohup /tmp/cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate \
    >>"$LOG_DIR/tunnel.log" 2>&1 &
  echo $! >"$LOG_DIR/tunnel.pid"
  sleep 4
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | tail -1 \
    >/opt/cursor/artifacts/PUBLIC_URL.txt || true
  refresh_public_assets || true
}

# Refresh QR periodically even when already up
n=0
while true; do
  ensure_api
  ensure_tunnel
  n=$((n + 1))
  if [ $((n % 15)) -eq 1 ]; then
    refresh_public_assets || true
  fi
  sleep 20
done
