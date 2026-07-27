from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.domain.enums import City, Rail, Side
from app.domain.models import AccuracySample, BindingRFQ, CompletedTrade, QuoteRequest
from app.pricing.accuracy import evaluate_accuracy
from app.services.market import market_service

router = APIRouter()


class QuoteIn(BaseModel):
    amount: float = Field(gt=0, examples=[100000])
    from_rail: Rail = Rail.BANKAK_SDG
    to_rail: Rail = Rail.MTN_MOMO_RWF
    from_payment: str | None = "Bankak"
    to_payment: str | None = "MTN Mobile Money"
    city: City | None = None
    side: Side | None = None


class RFQIn(BaseModel):
    trader_anon_id: str
    base_rail: Rail
    quote_rail: Rail
    side: Side
    price: float
    amount_base: float
    payment_method: str
    city: City = City.UNKNOWN
    valid_minutes: int = 15


class CompletedBatchIn(BaseModel):
    trades: list[CompletedTrade]


class AccuracyIn(BaseModel):
    samples: list[AccuracySample]
    allow_live_claim: bool = False


@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
        "phase": "data_and_alerts_only",
        "custody": False,
        "execution": False,
        "sources": market_service.health(),
    }


@router.get("/rails")
async def rails() -> dict[str, list[str]]:
    return {
        "rails": market_service.rails(),
        "note": "لا تُدمج هذه المسارات في سعر واحد مضلل",
    }


@router.post("/refresh")
async def refresh() -> dict[str, Any]:
    health = await market_service.refresh()
    return {"sources": health}


@router.post("/quote")
async def quote(body: QuoteIn) -> dict[str, Any]:
    req = QuoteRequest(**body.model_dump())
    result = await market_service.get_quote(req)
    # Presentation helpers for PWA
    amount_out = None
    fair = result.fair_rate
    exec_text = None
    if result.executable_range:
        lo, hi = result.executable_range
        exec_text = f"{lo:,.0f}–{hi:,.0f}"
        amount_out = (lo + hi) / 2
    elif result.label.value == "NO_EXECUTABLE_LIQUIDITY":
        exec_text = "لا يوجد سعر تنفيذي حاليًا"
    elif result.trader_expected_rate is not None:
        exec_text = f"تقديري غير قابل للتنفيذ: {result.trader_expected_rate:,.0f}"

    return {
        "label": result.label.value,
        "display": {
            "title": f"{body.amount:,.0f} {body.from_rail.value}",
            "fair": None if fair is None else round(fair, 2),
            "executable": exec_text,
            "margin": None
            if result.gross_dealer_margin is None
            else f"{result.gross_dealer_margin:.2f}%",
            "confidence": result.confidence,
            "independent_sources": result.independent_traders,
            "last_update": result.last_update,
            "source_status": result.source_status.value,
        },
        "result": result.model_dump(mode="json"),
    }


@router.post("/traders/rfq")
async def submit_rfq(body: RFQIn) -> dict[str, Any]:
    from datetime import timedelta

    rfq = BindingRFQ(
        trader_anon_id=body.trader_anon_id,
        base_rail=body.base_rail,
        quote_rail=body.quote_rail,
        side=body.side,
        price=body.price,
        amount_base=body.amount_base,
        payment_method=body.payment_method,
        city=body.city,
        valid_until=datetime.now(timezone.utc) + timedelta(minutes=body.valid_minutes),
    )
    q = market_service.submit_rfq(rfq)
    return {"ok": True, "quote_id": q.id}


@router.post("/traders/completed")
async def ingest_completed(body: CompletedBatchIn) -> dict[str, Any]:
    # Reject any payload that looks like secrets
    for t in body.trades:
        blob = t.model_dump_json().lower()
        for banned in ("password", "pin", "otp", "secret", "private_key", "api_secret"):
            if banned in blob:
                raise HTTPException(400, detail=f"forbidden field content: {banned}")
    return market_service.ingest_completed(body.trades)


@router.get("/history")
async def history(limit: int = Query(100, ge=1, le=1000)) -> dict[str, Any]:
    return {"items": market_service.history(limit)}


@router.get("/audit")
async def audit(limit: int = Query(200, ge=1, le=2000)) -> dict[str, Any]:
    return {"items": market_service.audit_log(limit)}


@router.get("/methodology")
async def methodology() -> dict[str, Any]:
    return {
        "index_name": "Motman Path-Aware FX Reference",
        "non_merging_rule": "Bankak-SDG / Cash-SDG / MTN-MoMo-RWF / Bank-RWF remain separate rails",
        "executable_formula": "ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT",
        "depth_rule": "VWAP across book depth until full amount fills; top-of-book alone is insufficient",
        "aggregation": "Weighted median with per-trader weight cap 10%",
        "priority": [
            "COMPLETED_TRADE",
            "BINDING_RFQ",
            "PUBLIC_AD",
            "PARALLEL_MARKET",
            "OFFICIAL (anomaly only)",
        ],
        "estimated_formula": "EstimatedRate = ShadowRate × (1 - DynamicDealerMargin)",
        "estimated_label": "سعر تقديري غير قابل للتنفيذ",
        "paid_ranking": False,
        "phase": "data_and_alerts_only",
    }


@router.post("/accuracy/evaluate")
async def accuracy_evaluate(body: AccuracyIn) -> dict[str, Any]:
    report = evaluate_accuracy(body.samples, allow_live_claim=body.allow_live_claim)
    return report.model_dump(mode="json")


@router.get("/business")
async def business() -> dict[str, Any]:
    return {
        "free": ["basic_rates", "pwa", "telegram_basic"],
        "pro": ["alerts", "analytics", "trader_desk"],
        "api": ["metered_company_api"],
        "data": ["historical_exports", "reports", "widgets"],
        "forbidden": ["paid_influence_on_index_weight_or_ranking"],
    }