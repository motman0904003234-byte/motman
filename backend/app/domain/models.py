from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from app.domain.enums import City, QuoteKind, Rail, RateLabel, Side, SourceStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Quote(BaseModel):
    """Atomic market observation for a specific rail pair and payment path."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    provider: str
    kind: QuoteKind
    base_rail: Rail
    quote_rail: Rail
    side: Side
    price: float
    amount_base: float
    amount_quote: float | None = None
    available_amount_base: float | None = None
    payment_method: str
    city: City = City.UNKNOWN
    trader_anon_id: str | None = None
    fees: float = 0.0
    completion_rate: float | None = None
    rating: float | None = None
    observed_at: datetime = Field(default_factory=utcnow)
    raw_ref: str | None = None
    is_synthetic: bool = False

    @field_validator("price", "amount_base")
    @classmethod
    def positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("price and amount must be > 0")
        return v


class CompletedTrade(BaseModel):
    """Anonymized completed P2P trade. No PII, no secrets."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    provider: str = "binance_c2c_local"
    traded_at: datetime
    base_asset: str
    quote_asset: str
    side: Side
    quantity: float
    price: float
    total_amount: float
    payment_method: str
    fees: float = 0.0
    status: str = "COMPLETED"
    trader_anon_id: str
    city: City = City.UNKNOWN
    is_synthetic: bool = False

    @field_validator("status")
    @classmethod
    def completed_only(cls, v: str) -> str:
        if v.upper() != "COMPLETED":
            raise ValueError("only COMPLETED trades accepted")
        return "COMPLETED"


class BindingRFQ(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    trader_anon_id: str
    base_rail: Rail
    quote_rail: Rail
    side: Side
    price: float
    amount_base: float
    payment_method: str
    city: City = City.UNKNOWN
    valid_until: datetime
    created_at: datetime = Field(default_factory=utcnow)


class QuoteRequest(BaseModel):
    amount: float = Field(gt=0)
    from_rail: Rail
    to_rail: Rail
    from_payment: str | None = None
    to_payment: str | None = None
    city: City | None = None
    side: Side | None = None


class PathLeg(BaseModel):
    base_rail: Rail
    quote_rail: Rail
    side: Side
    executable_price: float | None
    depth_used: float
    sources: int


class QuoteResult(BaseModel):
    request: QuoteRequest
    label: RateLabel
    fair_rate: float | None
    executable_bid: float | None = None
    executable_ask: float | None = None
    executable_range: tuple[float, float] | None = None
    theoretical_rate: float | None = None
    trader_expected_rate: float | None = None
    last_completed_price: float | None = None
    spread: float | None = None
    gross_dealer_margin: float | None = None
    net_dealer_margin: float | None = None
    net_margin_is_estimate: bool = True
    available_liquidity_base: float = 0.0
    independent_traders: int = 0
    confidence: float = 0.0
    source_status: SourceStatus = SourceStatus.DOWN
    last_update: datetime | None = None
    methodology: str
    legs: list[PathLeg] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    calibration_note: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class AccuracySample(BaseModel):
    predicted_price: float
    actual_completed_price: float
    amount: float
    from_rail: Rail
    to_rail: Rail
    payment_method: str
    traded_at: datetime
    is_synthetic: bool = False


class AccuracyReport(BaseModel):
    n_samples: int
    n_traders: int
    mape: float | None
    median_error_pct: float | None
    p95_error_pct: float | None
    pct_within_10: float | None
    meets_min_accuracy_90: bool
    meets_target_mape_2: bool
    meets_median_1_5: bool
    meets_p95_5: bool
    claim_live_accuracy: bool
    notes: list[str] = Field(default_factory=list)
    by_bucket: dict[str, Any] = Field(default_factory=dict)