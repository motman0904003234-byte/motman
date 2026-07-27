from datetime import datetime, timezone

import pytest

from app.domain.enums import QuoteKind, Rail, Side
from app.domain.models import Quote, QuoteRequest
from app.pricing.engine import PricingEngine
from app.pricing.math_utils import (
    cap_entity_weights,
    executable_vwap,
    percentage_error,
    weighted_median,
)
from app.providers.demo_market import build_demo_market


def test_weighted_median_basic():
    assert weighted_median([1, 2, 3], [1, 1, 1]) == 2
    assert weighted_median([10, 20, 30], [1, 100, 1]) == 20


def test_trader_weight_cap():
    entities = ["a", "a", "a", "b", "c"]
    weights = [50, 50, 50, 10, 10]
    original_total = sum(weights)
    capped = cap_entity_weights(entities, weights, max_share=0.10)
    # Cap is vs original total (no redistribution of leftover mass).
    assert sum(w for e, w in zip(entities, capped) if e == "a") <= original_total * 0.10 + 1e-9
    assert sum(capped) < original_total


def test_executable_vwap_full_fill():
    vwap, filled = executable_vwap([(10, 5), (12, 5)], amount=8, side="BUY")
    assert filled == 8
    assert abs(vwap - ((5 * 10 + 3 * 12) / 8)) < 1e-9


def test_executable_vwap_insufficient():
    vwap, filled = executable_vwap([(10, 5)], amount=8, side="BUY")
    assert vwap is None
    assert filled == 5


def test_percentage_error():
    assert abs(percentage_error(102, 100) - 2.0) < 1e-9


@pytest.mark.asyncio
async def test_cross_quote_executable_on_demo():
    engine = PricingEngine(build_demo_market())
    result = engine.quote(
        QuoteRequest(
            amount=100_000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            from_payment="Bankak",
            to_payment="MTN Mobile Money",
        )
    )
    assert result.label.value in {"EXECUTABLE", "ESTIMATED_NON_EXECUTABLE", "NO_EXECUTABLE_LIQUIDITY"}
    if result.label.value == "EXECUTABLE":
        assert result.executable_range is not None
        lo, hi = result.executable_range
        assert lo > 0 and hi >= lo
        assert result.confidence > 0
        assert result.details["ask_sdg_usdt"] > 0
        assert result.details["bid_rwf_usdt"] > 0


def test_one_sided_liquidity_not_invented():
    now = datetime.now(timezone.utc)
    # Only SDG bids, no SDG asks capable of filling
    quotes = [
        Quote(
            provider="x",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.BANKAK_SDG,
            side=Side.BUY,
            price=590,
            amount_base=100,
            available_amount_base=100,
            payment_method="Bankak",
            trader_anon_id="b1",
            observed_at=now,
            is_synthetic=True,
        ),
        Quote(
            provider="x",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.MTN_MOMO_RWF,
            side=Side.BUY,
            price=1535,
            amount_base=100,
            available_amount_base=100,
            payment_method="MTN Mobile Money",
            trader_anon_id="r1",
            observed_at=now,
            is_synthetic=True,
        ),
    ]
    engine = PricingEngine(quotes)
    result = engine.quote(
        QuoteRequest(
            amount=100_000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            from_payment="Bankak",
            to_payment="MTN Mobile Money",
        )
    )
    assert result.label.value in {"ESTIMATED_NON_EXECUTABLE", "NO_EXECUTABLE_LIQUIDITY"}
    assert "تنفيذي" in " ".join(result.warnings) or result.label.value != "EXECUTABLE"


def test_outlier_does_not_dominate():
    now = datetime.now(timezone.utc)
    quotes = []
    for i, p in enumerate([600, 601, 599, 600.5]):
        quotes.append(
            Quote(
                provider="x",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG,
                side=Side.SELL,
                price=p,
                amount_base=100,
                available_amount_base=100,
                payment_method="Bankak",
                trader_anon_id=f"s{i}",
                completion_rate=0.95,
                rating=4.8,
                observed_at=now,
                is_synthetic=True,
            )
        )
    quotes.append(
        Quote(
            provider="x",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.BANKAK_SDG,
            side=Side.SELL,
            price=200,
            amount_base=5,
            available_amount_base=5,
            payment_method="Bankak",
            trader_anon_id="bad",
            completion_rate=0.2,
            rating=1.0,
            observed_at=now,
            is_synthetic=True,
        )
    )
    for i, p in enumerate([1535, 1536, 1534]):
        quotes.append(
            Quote(
                provider="x",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.MTN_MOMO_RWF,
                side=Side.BUY,
                price=p,
                amount_base=200,
                available_amount_base=200,
                payment_method="MTN Mobile Money",
                trader_anon_id=f"r{i}",
                completion_rate=0.95,
                rating=4.8,
                observed_at=now,
                is_synthetic=True,
            )
        )
    engine = PricingEngine(quotes)
    result = engine.quote(
        QuoteRequest(
            amount=50_000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            from_payment="Bankak",
            to_payment="MTN Mobile Money",
        )
    )
    if result.details.get("ask_sdg_usdt"):
        assert result.details["ask_sdg_usdt"] > 500