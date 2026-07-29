"""Generate labeled synthetic market + completed-trade corpora for software tests.

SYNTHETIC ONLY — never claim live market accuracy from this module.
"""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.domain.enums import City, QuoteKind, Rail, Side
from app.domain.models import AccuracySample, CompletedTrade, Quote, QuoteRequest
from app.pricing.accuracy import evaluate_accuracy, walk_forward_splits
from app.pricing.engine import PricingEngine


RNG = random.Random(42)


def _ts(base: datetime, minutes: int) -> datetime:
    return base + timedelta(minutes=minutes)


def build_rich_order_book(now: datetime | None = None) -> list[Quote]:
    now = now or datetime.now(timezone.utc)
    quotes: list[Quote] = []

    # SDG asks deep enough for 1M+ SDG
    for i in range(40):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG,
                side=Side.SELL,
                price=598 + i * 0.35 + RNG.uniform(-0.1, 0.1),
                amount_base=80 + i * 3,
                available_amount_base=80 + i * 3,
                payment_method="Bankak",
                city=City.KHARTOUM,
                trader_anon_id=f"sdg-ask-{i % 12}",
                completion_rate=0.96 - (i % 10) * 0.01,
                rating=4.9 - (i % 8) * 0.05,
                observed_at=now - timedelta(seconds=i),
                is_synthetic=True,
                raw_ref=f"rich-sdg-ask-{i}",
            )
        )
    # One-sided pressure: many bids
    for i in range(120):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG,
                side=Side.BUY,
                price=592 - i * 0.05,
                amount_base=30 + (i % 20),
                available_amount_base=30 + (i % 20),
                payment_method="Bankak",
                city=City.KHARTOUM,
                trader_anon_id=f"sdg-bid-{i % 25}",
                completion_rate=0.9,
                rating=4.5,
                observed_at=now - timedelta(seconds=2 + i),
                is_synthetic=True,
                raw_ref=f"rich-sdg-bid-{i}",
            )
        )
    # Cash-SDG separate rail quotes
    for i in range(15):
        quotes.append(
            Quote(
                provider="parallel_sdg",
                kind=QuoteKind.PARALLEL_MARKET,
                base_rail=Rail.USDT,
                quote_rail=Rail.CASH_SDG,
                side=Side.SELL,
                price=605 + i * 0.4,
                amount_base=40,
                available_amount_base=40,
                payment_method="Cash",
                city=City.KHARTOUM,
                trader_anon_id=f"cash-{i % 5}",
                completion_rate=0.85,
                rating=4.2,
                observed_at=now - timedelta(seconds=20 + i),
                is_synthetic=True,
                raw_ref=f"cash-ask-{i}",
            )
        )
    # RWF MoMo bids/asks
    for i in range(35):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.MTN_MOMO_RWF,
                side=Side.BUY,
                price=1542 - i * 0.25,
                amount_base=90 + i * 2,
                available_amount_base=90 + i * 2,
                payment_method="MTN Mobile Money",
                city=City.KIGALI,
                trader_anon_id=f"rwf-bid-{i % 10}",
                completion_rate=0.97,
                rating=4.8,
                observed_at=now - timedelta(seconds=i),
                is_synthetic=True,
                raw_ref=f"rich-rwf-bid-{i}",
            )
        )
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.MTN_MOMO_RWF,
                side=Side.SELL,
                price=1544 + i * 0.3,
                amount_base=70 + i,
                available_amount_base=70 + i,
                payment_method="MTN Mobile Money",
                city=City.KIGALI,
                trader_anon_id=f"rwf-ask-{i % 8}",
                completion_rate=0.95,
                rating=4.7,
                observed_at=now - timedelta(seconds=3 + i),
                is_synthetic=True,
                raw_ref=f"rich-rwf-ask-{i}",
            )
        )
    # Bank-RWF distinct payment path
    for i in range(12):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANK_RWF,
                side=Side.BUY,
                price=1538 - i * 0.2,
                amount_base=60,
                available_amount_base=60,
                payment_method="Bank Transfer",
                city=City.KIGALI,
                trader_anon_id=f"bank-rwf-{i % 4}",
                completion_rate=0.94,
                rating=4.6,
                observed_at=now - timedelta(seconds=5 + i),
                is_synthetic=True,
                raw_ref=f"bank-rwf-bid-{i}",
            )
        )
    # Manipulation / wash-like noise
    quotes.append(
        Quote(
            provider="binance_p2p",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.BANKAK_SDG,
            side=Side.SELL,
            price=480.0,
            amount_base=9999,
            available_amount_base=9999,
            payment_method="Bankak",
            trader_anon_id="wash-1",
            completion_rate=0.2,
            rating=1.5,
            observed_at=now,
            is_synthetic=True,
            raw_ref="wash-outlier",
        )
    )
    # Binding RFQs
    for i in range(8):
        quotes.append(
            Quote(
                provider="trader_rfq",
                kind=QuoteKind.BINDING_RFQ,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG if i % 2 == 0 else Rail.MTN_MOMO_RWF,
                side=Side.SELL if i % 2 == 0 else Side.BUY,
                price=(599.2 + i * 0.1) if i % 2 == 0 else (1537.5 - i * 0.1),
                amount_base=150,
                available_amount_base=150,
                payment_method="Bankak" if i % 2 == 0 else "MTN Mobile Money",
                city=City.KHARTOUM if i % 2 == 0 else City.KIGALI,
                trader_anon_id=f"rfq-{i}",
                completion_rate=0.98,
                rating=4.95,
                observed_at=now - timedelta(seconds=1),
                is_synthetic=True,
                raw_ref=f"rfq-rich-{i}",
            )
        )
    return quotes


def build_completed_trades(n: int = 320, traders: int = 12, base: datetime | None = None) -> list[CompletedTrade]:
    base = base or datetime(2026, 7, 1, tzinfo=timezone.utc)
    trades: list[CompletedTrade] = []
    amounts = [100_000, 100_000, 500_000, 500_000, 1_000_000, 1_200_000]
    for i in range(n):
        trader = f"t_mock_{i % traders:02d}"
        # Alternate SDG sell USDT and RWF buy USDT legs
        if i % 2 == 0:
            price = 598.5 + (i % 9) * 0.25 + RNG.uniform(-0.15, 0.15)
            qty = 15 + (i % 40)
            trades.append(
                CompletedTrade(
                    id=f"syn-cmp-sdg-{i}",
                    traded_at=_ts(base, i * 7),
                    base_asset="USDT",
                    quote_asset="SDG",
                    side=Side.SELL,
                    quantity=qty,
                    price=round(price, 4),
                    total_amount=round(qty * price, 4),
                    payment_method="Bankak",
                    fees=0.1,
                    status="COMPLETED",
                    trader_anon_id=trader,
                    city=City.KHARTOUM,
                    is_synthetic=True,
                )
            )
        else:
            price = 1540 - (i % 11) * 0.2 + RNG.uniform(-0.2, 0.2)
            qty = 15 + (i % 40)
            trades.append(
                CompletedTrade(
                    id=f"syn-cmp-rwf-{i}",
                    traded_at=_ts(base, i * 7 + 1),
                    base_asset="USDT",
                    quote_asset="RWF",
                    side=Side.BUY,
                    quantity=qty,
                    price=round(price, 4),
                    total_amount=round(qty * price, 4),
                    payment_method="MTN Mobile Money",
                    fees=0.1,
                    status="COMPLETED",
                    trader_anon_id=trader,
                    city=City.KIGALI,
                    is_synthetic=True,
                )
            )
    return trades


def completed_to_quotes(trades: list[CompletedTrade]) -> list[Quote]:
    out: list[Quote] = []
    for t in trades:
        quote_rail = Rail.BANKAK_SDG if "Bankak" in t.payment_method else Rail.MTN_MOMO_RWF
        out.append(
            Quote(
                provider="trader_completed",
                kind=QuoteKind.COMPLETED_TRADE,
                base_rail=Rail.USDT,
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
                is_synthetic=True,
            )
        )
    return out


def build_accuracy_samples(
    n: int = 320,
    traders: int = 12,
) -> tuple[list[AccuracySample], dict]:
    """Walk-forward style samples: predict from past book, compare to synthetic actual.

    Actuals are synthetic perturbations of executable mid — software validation only.
    """
    base = datetime(2026, 7, 1, tzinfo=timezone.utc)
    book = build_rich_order_book(base + timedelta(days=20))
    completed = build_completed_trades(n=n, traders=traders, base=base)
    engine = PricingEngine(book + completed_to_quotes(completed))

    samples: list[AccuracySample] = []
    buckets = [100_000, 500_000, 1_000_000]
    i = 0
    guard = 0
    while len(samples) < n and guard < n * 4:
        guard += 1
        amount = buckets[i % len(buckets)]
        # Use only quotes observed before sample time (no future leakage)
        cutoff = base + timedelta(minutes=i * 7)
        past = [q for q in engine.quotes if q.observed_at <= cutoff]
        if len(past) < 20:
            past = engine.quotes
        local = PricingEngine(past)
        result = local.quote(
            QuoteRequest(
                amount=amount,
                from_rail=Rail.BANKAK_SDG,
                to_rail=Rail.MTN_MOMO_RWF,
                from_payment="Bankak",
                to_payment="MTN Mobile Money",
            )
        )
        i += 1
        if not result.executable_range:
            continue
        predicted = sum(result.executable_range) / 2
        # Dealer field noise ~ N(0, 0.8%) clipped
        shock = max(-0.025, min(0.025, RNG.gauss(0.004, 0.008)))
        actual = predicted * (1 - shock)
        samples.append(
            AccuracySample(
                predicted_price=predicted,
                actual_completed_price=actual,
                amount=amount,
                from_rail=Rail.BANKAK_SDG,
                to_rail=Rail.MTN_MOMO_RWF,
                payment_method="Bankak",
                traded_at=cutoff,
                is_synthetic=True,
            )
        )

    report = evaluate_accuracy(samples, allow_live_claim=True)
    folds = []
    for train, test in walk_forward_splits(samples, n_folds=5):
        if not test:
            continue
        folds.append(
            {
                "train_n": len(train),
                "test_n": len(test),
                "report": json.loads(evaluate_accuracy(test, allow_live_claim=False).model_dump_json()),
            }
        )
    meta = {
        "disclaimer": "SYNTHETIC SOFTWARE VALIDATION ONLY — claim_live_accuracy must remain false",
        "n_samples": len(samples),
        "n_traders_requested": traders,
        "overall": json.loads(report.model_dump_json()),
        "walk_forward_folds": folds,
    }
    return samples, meta


def export_all(root: Path) -> dict:
    root.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    book = build_rich_order_book(now)
    trades = build_completed_trades(320, 12)
    samples, meta = build_accuracy_samples(320, 12)

    (root / "rich_order_book.json").write_text(
        json.dumps([json.loads(q.model_dump_json()) for q in book], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (root / "completed_trades_320.json").write_text(
        json.dumps([json.loads(t.model_dump_json()) for t in trades], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (root / "accuracy_samples_synthetic.json").write_text(
        json.dumps([json.loads(s.model_dump_json()) for s in samples], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (root / "accuracy_report_synthetic.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "book": len(book),
        "trades": len(trades),
        "samples": len(samples),
        "claim_live_accuracy": meta["overall"]["claim_live_accuracy"],
        "mape": meta["overall"]["mape"],
    }


if __name__ == "__main__":
    out = export_all(Path(__file__).resolve().parents[3] / "data" / "seed")
    print(json.dumps(out, indent=2))