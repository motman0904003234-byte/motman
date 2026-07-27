#!/usr/bin/env bash
set -euo pipefail
API="${MOTMAN_API_BASE:-http://127.0.0.1:8787}"

echo "== health =="
curl -sf "$API/health" | tee /tmp/motman-health.json
echo

echo "== quote =="
curl -sf "$API/v1/quote" -H 'content-type: application/json' -d '{
  "amount": 100000,
  "fromAsset": "BANKAK_SDG",
  "toAsset": "MTN_MOMO_RWF",
  "fromRail": "BANKAK",
  "toRail": "MTN_MOMO"
}' | tee /tmp/motman-quote.json
echo

echo "== one-sided / large amount stress =="
curl -sf "$API/v1/quote" -H 'content-type: application/json' -d '{
  "amount": 500000000,
  "fromAsset": "BANKAK_SDG",
  "toAsset": "MTN_MOMO_RWF",
  "fromRail": "BANKAK",
  "toRail": "MTN_MOMO"
}' | tee /tmp/motman-quote-thin.json
echo

echo "== calibration =="
curl -sf "$API/v1/calibration/2026-07-27" | tee /tmp/motman-calib.json
echo

echo "E2E API checks passed"
