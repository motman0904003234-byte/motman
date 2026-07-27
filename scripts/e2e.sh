#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

echo "== pytest =="
PYTHONPATH=. python3 -m pytest -q

echo "== export mock corpus =="
PYTHONPATH=. python3 -m app.providers.mock_corpus

echo "== API e2e =="
pkill -f 'uvicorn app.main:app' >/dev/null 2>&1 || true
sleep 1
PYTHONPATH=. python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >/tmp/motman-api.log 2>&1 &
API_PID=$!
trap 'kill $API_PID >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null; then break; fi
  sleep 0.3
done

curl -sf http://127.0.0.1:8000/api/v1/health | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["custody"] is False'
curl -sf -X POST http://127.0.0.1:8000/api/v1/refresh >/dev/null
curl -sf http://127.0.0.1:8000/api/v1/stats | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d); assert d["n_quotes"]>0'
curl -sf -X POST http://127.0.0.1:8000/api/v1/quote -H 'Content-Type: application/json' \
  -d '{"amount":100000,"from_rail":"Bankak-SDG","to_rail":"MTN-MoMo-RWF","from_payment":"Bankak","to_payment":"MTN Mobile Money"}' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["label"] in ("EXECUTABLE","ESTIMATED_NON_EXECUTABLE","NO_EXECUTABLE_LIQUIDITY"); assert "display" in d; print("QUOTE_OK", d["label"], d["display"]["fair"])'

# one-sided / huge size should not invent silently if insufficient — still returns labeled result
curl -sf -X POST http://127.0.0.1:8000/api/v1/quote -H 'Content-Type: application/json' \
  -d '{"amount":50000000,"from_rail":"Bankak-SDG","to_rail":"MTN-MoMo-RWF","from_payment":"Bankak","to_payment":"MTN Mobile Money"}' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("HUGE", d["label"]); assert d["label"] in ("EXECUTABLE","ESTIMATED_NON_EXECUTABLE","NO_EXECUTABLE_LIQUIDITY")'

curl -sf -X POST http://127.0.0.1:8000/api/v1/accuracy/run-synthetic \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["report"]["overall"]["claim_live_accuracy"] is False; print("SYN_ACC_OK", d["n_samples"], d["report"]["overall"]["mape"])'

curl -sf http://127.0.0.1:8000/api/v1/widget.js | head -c 40 >/dev/null
curl -sf http://127.0.0.1:8000/api/v1/history?limit=5 >/dev/null
curl -sf http://127.0.0.1:8000/api/v1/audit?limit=5 >/dev/null

python3 "$ROOT/connector/local_c2c_connector.py" --fixture "$ROOT/data/seed/completed_fixture.json" \
  --api-url http://127.0.0.1:8000/api/v1/traders/completed | tail -n 1

MOTMAN_API=http://127.0.0.1:8000/api/v1 python3 "$ROOT/bot/telegram_bot.py" | head -n 5

echo "== frontend build =="
cd "$ROOT/frontend"
npm run build >/tmp/motman-web-build.log 2>&1
echo "ALL_E2E_OK"