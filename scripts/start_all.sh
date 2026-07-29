#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pkill -f 'uvicorn app.main:app' >/dev/null 2>&1 || true
pkill -f 'vite' >/dev/null 2>&1 || true
sleep 1

cd "$ROOT/backend"
python3 -m pip install -q -r requirements.txt
PYTHONPATH=. python3 -m app.providers.mock_corpus || true
PYTHONPATH=. python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!

cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then npm install; fi
npm run dev -- --host 0.0.0.0 --port 5173 &
WEB_PID=$!

echo "API PID=$API_PID WEB PID=$WEB_PID"
echo "API http://127.0.0.1:8000/docs"
echo "WEB http://127.0.0.1:5173/"
wait