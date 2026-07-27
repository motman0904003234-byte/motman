from datetime import datetime, timedelta, timezone

import pytest

from app.domain.enums import QuoteKind, Rail, Side, SourceStatus
from app.domain.models import Quote, QuoteRequest
from app.pricing.engine import PricingEngine
from app.providers.mock_corpus import build_completed_trades, build_rich_order_book, completed_to_quotes


def test_rich_book_executable_large_size():
    engine = PricingEngine(build_rich_order_book() + completed_to_quotes(build_completed_trades(40, 8)))
    for amount in (100_000, 500_000, 1_000_000):
        res = engine.quote(
            QuoteRequest(
                amount=amount,
                from_rail=Rail.BANKAK_SDG,
                to_rail=Rail.MTN_MOMO_RWF,
                from_payment="Bankak",
                to_payment="MTN Mobile Money",
            )
        )
        assert res.label.value in {"EXECUTABLE", "ESTIMATED_NON_EXECUTABLE", "NO_EXECUTABLE_LIQUIDITY"}
        if res.label.value == "EXECUTABLE":
            assert res.executable_range is not None
            assert res.fair_rate is not None
            assert res.fair_rate > amount * 0.5  # total RWF, not unit rate


def test_stale_status_when_quotes_old():
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    quotes = [
        Quote(
            provider="x",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.BANKAK_SDG,
            side=Side.SELL,
            price=600,
            amount_base=500,
            available_amount_base=500,
            payment_method="Bankak",
            trader_anon_id="a",
            completion_rate=0.95,
            rating=4.8,
            observed_at=old,
            is_synthetic=True,
        ),
        Quote(
            provider="x",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.MTN_MOMO_RWF,
            side=Side.BUY,
            price=1535,
            amount_base=500,
            available_amount_base=500,
            payment_method="MTN Mobile Money",
            trader_anon_id="b",
            completion_rate=0.95,
            rating=4.8,
            observed_at=old,
            is_synthetic=True,
        ),
    ]
    res = PricingEngine(quotes).quote(
        QuoteRequest(
            amount=50_000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            from_payment="Bankak",
            to_payment="MTN Mobile Money",
        )
    )
    assert res.source_status in {SourceStatus.STALE, SourceStatus.DOWN}


def test_provider_down_empty_book():
    res = PricingEngine([]).quote(
        QuoteRequest(
            amount=100_000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            from_payment="Bankak",
            to_payment="MTN Mobile Money",
        )
    )
    assert res.label.value in {"NO_EXECUTABLE_LIQUIDITY", "ESTIMATED_NON_EXECUTABLE"}


def test_cash_and_bank_rails_not_merged_into_bankak():
    now = datetime.now(timezone.utc)
    quotes = [
        Quote(
            provider="x",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.CASH_SDG,
            side=Side.SELL,
            price=700,
            amount_base=500,
            available_amount_base=500,
            payment_method="Cash",
            trader_anon_id="c1",
            completion_rate=0.9,
            rating=4.5,
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
            amount_base=500,
            available_amount_base=500,
            payment_method="MTN Mobile Money",
            trader_anon_id="r1",
            completion_rate=0.9,
            rating=4.5,
            observed_at=now,
            is_synthetic=True,
        ),
    ]
    # Request Bankak specifically — cash quotes must not silently fill Bankak path
    res = PricingEngine(quotes).quote(
        QuoteRequest(
            amount=20_000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            from_payment="Bankak",
            to_payment="MTN Mobile Money",
        )
    )
    assert res.label.value != "EXECUTABLE" or res.details.get("ask_sdg_usdt") is None
    # stronger: without Bankak ads, should not be executable
    assert res.label.value in {"NO_EXECUTABLE_LIQUIDITY", "ESTIMATED_NON_EXECUTABLE"}


@pytest.mark.asyncio
async def test_mock_corpus_export_and_accuracy_gate():
    from app.providers.mock_corpus import build_accuracy_samples

    samples, meta = build_accuracy_samples(80, 10)
    assert len(samples) >= 20
    assert meta["overall"]["claim_live_accuracy"] is False
    assert meta["overall"]["mape"] is not None