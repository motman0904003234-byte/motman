#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
PYTHONPATH=. python3 -m pytest -q
PYTHONPATH=. python3 - <<'PY'
import asyncio
from app.services.market import MarketService
from app.domain.models import QuoteRequest
from app.domain.enums import Rail

async def main():
    svc = MarketService(use_demo=True)
    await svc.refresh()
    res = await svc.get_quote(QuoteRequest(
        amount=100000,
        from_rail=Rail.BANKAK_SDG,
        to_rail=Rail.MTN_MOMO_RWF,
        from_payment='Bankak',
        to_payment='MTN Mobile Money',
    ))
    print('LABEL', res.label.value)
    print('CONF', res.confidence)
    print('EXEC', res.executable_range)
    print('WARN', res.warnings[:2])

asyncio.run(main())
PY
echo "OK"