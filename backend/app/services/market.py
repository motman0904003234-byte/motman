from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.domain.enums import QuoteKind, Rail, Side
from app.domain.models import BindingRFQ, CompletedTrade, Quote, QuoteRequest
from app.pricing.accuracy import evaluate_accuracy
from app.pricing.engine import PricingEngine
from app.providers.base import (
    BinanceP2PAdapter,
    CalibrationSeedAdapter,
    CompositeProvider,
    OfficialBankAdapter,
    ParallelMarketAdapter,
    TraderCompletedAdapter,
    TraderRFQAdapter,
)
from app.providers.demo_market import build_demo_market


class MarketService:
    def __init__(self, use_demo: bool = True, enable_live_binance: bool = False):
        self.trader_rfq = TraderRFQAdapter()
        self.trader_completed = TraderCompletedAdapter()
        self.binance = BinanceP2PAdapter(snapshot=[], enable_live=enable_live_binance)
        self.official = OfficialBankAdapter(sdg_per_usd=600.0, rwf_per_usd=1320.0)
        self.parallel = ParallelMarketAdapter([])
        self.calibration = CalibrationSeedAdapter()
        self.use_demo = use_demo
        self.engine = PricingEngine()
        self._history: list[dict[str, Any]] = []
        self._audit: list[dict[str, Any]] = []
        self._last_health: list[dict] = []
        if use_demo:
            self.binance.snapshot = [
                q for q in build_demo_market() if q.provider == "binance_p2p"
            ]
            # load completed + rfq from demo into adapters
            demo = build_demo_market()
            self.trader_completed.ingest([q for q in demo if q.kind == QuoteKind.COMPLETED_TRADE])
            self.trader_rfq.upsert([q for q in demo if q.kind == QuoteKind.BINDING_RFQ])

    def audit(self, event: str, payload: dict | None = None) -> None:
        self._audit.append(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "event": event,
                "payload": payload or {},
            }
        )

    async def refresh(self) -> list[dict]:
        composite = CompositeProvider(
            [
                self.binance,
                self.trader_rfq,
                self.trader_completed,
                self.official,
                self.parallel,
                self.calibration,
            ]
        )
        quotes, health = await composite.fetch_all()
        self.engine.set_quotes(quotes)
        self._last_health = health
        self.audit("refresh", {"n_quotes": len(quotes), "health": health})
        return health

    async def get_quote(self, req: QuoteRequest):
        if not self.engine.quotes:
            await self.refresh()
        result = self.engine.quote(req)
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "request": json.loads(req.model_dump_json()),
            "result": json.loads(result.model_dump_json()),
        }
        self._history.append(record)
        self.audit("quote", {"label": result.label.value, "confidence": result.confidence})
        return result

    def submit_rfq(self, rfq: BindingRFQ) -> Quote:
        q = Quote(
            provider="trader_rfq",
            kind=QuoteKind.BINDING_RFQ,
            base_rail=rfq.base_rail,
            quote_rail=rfq.quote_rail,
            side=rfq.side,
            price=rfq.price,
            amount_base=rfq.amount_base,
            available_amount_base=rfq.amount_base,
            payment_method=rfq.payment_method,
            city=rfq.city,
            trader_anon_id=rfq.trader_anon_id,
            observed_at=rfq.created_at,
            raw_ref=rfq.id,
        )
        self.trader_rfq.upsert([q])
        self.audit("rfq_submit", {"id": rfq.id, "trader": rfq.trader_anon_id})
        return q

    def ingest_completed(self, trades: list[CompletedTrade]) -> dict:
        quotes: list[Quote] = []
        for t in trades:
            # Map assets to rails loosely via payment method
            quote_rail = Rail.BANKAK_SDG
            pay = t.payment_method.lower()
            if "mtn" in pay or "momo" in pay:
                quote_rail = Rail.MTN_MOMO_RWF
            elif "cash" in pay:
                quote_rail = Rail.CASH_SDG
            elif "bank" in pay and "rwanda" in pay:
                quote_rail = Rail.BANK_RWF
            base = Rail.USDT
            if t.base_asset.upper() in ("USDT", "USDC", "USD"):
                base = Rail[t.base_asset.upper()] if t.base_asset.upper() != "USD" else Rail.USD
            quotes.append(
                Quote(
                    provider="trader_completed",
                    kind=QuoteKind.COMPLETED_TRADE,
                    base_rail=base,
                    quote_rail=quote_rail,
                    side=t.side,
                    price=t.price,
                    amount_base=t.quantity,
                    available_amount_base=t.quantity,
                    amount_quote=t.total_amount,
                    payment_method=t.payment_method,
                    city=t.city,
                    trader_anon_id=t.trader_anon_id,
                    fees=t.fees,
                    observed_at=t.traded_at,
                    raw_ref=t.id,
                    is_synthetic=t.is_synthetic,
                )
            )
        n = self.trader_completed.ingest(quotes)
        self.audit("completed_ingest", {"accepted": n})
        return {"accepted": n}

    def history(self, limit: int = 100) -> list[dict]:
        return self._history[-limit:]

    def audit_log(self, limit: int = 200) -> list[dict]:
        return self._audit[-limit:]

    def health(self) -> list[dict]:
        return self._last_health

    def rails(self) -> list[str]:
        return [r.value for r in Rail]


def anonymize_trader(local_secret: str, account_hint: str) -> str:
    """Create irreversible trader id. Secret never leaves local connector."""
    digest = hashlib.sha256(f"{local_secret}:{account_hint}".encode()).hexdigest()
    return f"t_{digest[:16]}"


# singleton for API
market_service = MarketService(use_demo=True, enable_live_binance=False)