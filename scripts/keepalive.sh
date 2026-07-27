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
apk = f"{url}/api/v1/mobile/apk"
for name, target in [("motman-qr.png", f"{url}/?v=5"), ("motman-apk-qr.png", apk)]:
    q = "https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=" + urllib.parse.quote(target, safe="")
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

WEB: $url/?v=5
APK: $url/api/v1/mobile/apk
APK_ALT: $url/motman.apk
DOWNLOAD_PAGE: $url/download.html
HEALTH: $url/healthz

محلي APK: /opt/cursor/artifacts/motman-debug.apk
PR: https://github.com/motman0904003234-byte/motman/pull/1
EOF
  export PUBLIC_BASE_URL="$url"
  host="${url#https://}"
  host="${host%%/*}"
  if ! getent hosts "$host" >/dev/null 2>&1; then
    ip="$(python3 - <<PY
import json,urllib.request
host="$host"
req=urllib.request.Request("https://1.1.1.1/dns-query?name=%s&type=A"%host, headers={"accept":"application/dns-json"})
print(json.load(urllib.request.urlopen(req, timeout=10))["Answer"][0]["data"])
PY
)" || true
    if [ -n "${ip:-}" ]; then
      grep -q "$host" /etc/hosts 2>/dev/null || echo "$ip $host" | sudo tee -a /etc/hosts >/dev/null 2>&1 || true
    fi
  fi
}

ensure_api() {
  if curl -sf http://127.0.0.1:8000/healthz >/dev/null || curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null; then
    return 0
  fi
  echo "$(date -Is) restarting API" >>"$LOG_DIR/keepalive.log"
  python3 - <<'PY' || true
import os, signal, subprocess, time
try:
    out = subprocess.check_output(["pgrep", "-f", "python3 -m uvicorn app.main:app"], text=True)
except subprocess.CalledProcessError:
    out = ""
for line in out.splitlines():
    pid = int(line.split()[0])
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
time.sleep(1)
PY
  cd "$ROOT/frontend" && npm run build >>"$LOG_DIR/build.log" 2>&1 || true
  mkdir -p "$ROOT/frontend/dist/downloads"
  cp -f "$ROOT/frontend/public/downloads/"* "$ROOT/frontend/dist/downloads/" 2>/dev/null || true
  cp -f "$ROOT/frontend/public/download.html" "$ROOT/frontend/dist/download.html" 2>/dev/null || true
  refresh_public_assets || true
  cd "$ROOT/backend"
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$(cat /opt/cursor/artifacts/PUBLIC_URL.txt 2>/dev/null || true)}" \
    PYTHONPATH=. nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
    >>"$LOG_DIR/api.log" 2>&1 &
  echo $! >"$LOG_DIR/api.pid"
  sleep 2
}

ensure_tunnel() {
  if pgrep -x cloudflared >/dev/null || pgrep -f '/tmp/cloudflared tunnel --url' >/dev/null; then
    url="$(cat /opt/cursor/artifacts/PUBLIC_URL.txt 2>/dev/null || true)"
    if [ -n "$url" ]; then
      host="${url#https://}"; host="${host%%/*}"
      if python3 - <<PY
import json,urllib.request,sys
host="$host"
try:
  req=urllib.request.Request("https://1.1.1.1/dns-query?name=%s&type=A"%host, headers={"accept":"application/dns-json"})
  ans=json.load(urllib.request.urlopen(req, timeout=8)).get("Answer") or []
  sys.exit(0 if ans else 1)
except Exception:
  sys.exit(1)
PY
      then
        return 0
      fi
      echo "$(date -Is) stale tunnel DNS — restarting" >>"$LOG_DIR/keepalive.log"
      pkill -x cloudflared 2>/dev/null || true
      sleep 1
    else
      return 0
    fi
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
  sleep 5
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | tail -1 \
    >/opt/cursor/artifacts/PUBLIC_URL.txt || true
  refresh_public_assets || true
}

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
