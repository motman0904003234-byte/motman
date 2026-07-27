from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.domain.enums import City, QuoteKind, Rail, Side
from app.domain.models import Quote


def build_demo_market(now: datetime | None = None) -> list[Quote]:
    """Realistic *synthetic* market for software tests — clearly labeled.

    NOT for claiming live accuracy.
    """
    now = now or datetime.now(timezone.utc)
    quotes: list[Quote] = []

    # SDG asks (sell USDT) around 600, with depth for 100k+ SDG
    sdg_asks = [598.5, 599.0, 600.0, 601.2, 603.0, 605.5]
    sdg_ask_sizes = [50, 80, 120, 90, 70, 60]
    for i, (p, sz) in enumerate(zip(sdg_asks, sdg_ask_sizes)):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG,
                side=Side.SELL,
                price=p,
                amount_base=sz,
                available_amount_base=sz,
                payment_method="Bankak",
                city=City.KHARTOUM,
                trader_anon_id=f"sdg-seller-{i%7}",
                completion_rate=0.92 - (i * 0.01),
                rating=4.7,
                observed_at=now - timedelta(seconds=10 + i),
                is_synthetic=True,
                raw_ref=f"syn-sdg-ask-{i}",
            )
        )

    # Many SDG bids (buy USDT) — mirrors the calibration note of one-sided liquidity
    for i in range(18):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG,
                side=Side.BUY,
                price=590 - i * 0.3,
                amount_base=40 + i,
                available_amount_base=40 + i,
                payment_method="Bankak",
                city=City.KHARTOUM,
                trader_anon_id=f"sdg-buyer-{i%11}",
                completion_rate=0.88,
                rating=4.5,
                observed_at=now - timedelta(seconds=5 + i),
                is_synthetic=True,
                raw_ref=f"syn-sdg-bid-{i}",
            )
        )

    # RWF bids (buy USDT / user sells USDT) around 1530-1540
    rwf_bids = [1540.0, 1538.0, 1535.5, 1533.0, 1530.0, 1528.0]
    rwf_bid_sizes = [60, 90, 110, 80, 70, 50]
    for i, (p, sz) in enumerate(zip(rwf_bids, rwf_bid_sizes)):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.MTN_MOMO_RWF,
                side=Side.BUY,
                price=p,
                amount_base=sz,
                available_amount_base=sz,
                payment_method="MTN Mobile Money",
                city=City.KIGALI,
                trader_anon_id=f"rwf-buyer-{i%6}",
                completion_rate=0.95,
                rating=4.8,
                observed_at=now - timedelta(seconds=8 + i),
                is_synthetic=True,
                raw_ref=f"syn-rwf-bid-{i}",
            )
        )

    # RWF asks
    for i, p in enumerate([1542.0, 1545.0, 1548.0, 1552.0]):
        quotes.append(
            Quote(
                provider="binance_p2p",
                kind=QuoteKind.PUBLIC_AD,
                base_rail=Rail.USDT,
                quote_rail=Rail.MTN_MOMO_RWF,
                side=Side.SELL,
                price=p,
                amount_base=70,
                available_amount_base=70,
                payment_method="MTN Mobile Money",
                city=City.KIGALI,
                trader_anon_id=f"rwf-seller-{i}",
                completion_rate=0.93,
                rating=4.6,
                observed_at=now - timedelta(seconds=12 + i),
                is_synthetic=True,
                raw_ref=f"syn-rwf-ask-{i}",
            )
        )

    # Binding RFQs
    quotes.append(
        Quote(
            provider="trader_rfq",
            kind=QuoteKind.BINDING_RFQ,
            base_rail=Rail.USDT,
            quote_rail=Rail.BANKAK_SDG,
            side=Side.SELL,
            price=599.5,
            amount_base=200,
            available_amount_base=200,
            payment_method="Bankak",
            city=City.KHARTOUM,
            trader_anon_id="rfq-sdg-1",
            completion_rate=0.97,
            rating=4.9,
            observed_at=now - timedelta(seconds=3),
            is_synthetic=True,
            raw_ref="rfq-1",
        )
    )
    quotes.append(
        Quote(
            provider="trader_rfq",
            kind=QuoteKind.BINDING_RFQ,
            base_rail=Rail.USDT,
            quote_rail=Rail.MTN_MOMO_RWF,
            side=Side.BUY,
            price=1536.0,
            amount_base=200,
            available_amount_base=200,
            payment_method="MTN Mobile Money",
            city=City.KIGALI,
            trader_anon_id="rfq-rwf-1",
            completion_rate=0.97,
            rating=4.9,
            observed_at=now - timedelta(seconds=3),
            is_synthetic=True,
            raw_ref="rfq-2",
        )
    )

    # Completed trades (anonymized)
    for i in range(12):
        quotes.append(
            Quote(
                provider="trader_completed",
                kind=QuoteKind.COMPLETED_TRADE,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG,
                side=Side.SELL,
                price=599.0 + (i % 5) * 0.4,
                amount_base=20 + i,
                available_amount_base=20 + i,
                payment_method="Bankak",
                city=City.KHARTOUM,
                trader_anon_id=f"trader-{i%10}",
                fees=0.1,
                observed_at=now - timedelta(minutes=30 + i),
                is_synthetic=True,
                raw_ref=f"cmp-sdg-{i}",
            )
        )
        quotes.append(
            Quote(
                provider="trader_completed",
                kind=QuoteKind.COMPLETED_TRADE,
                base_rail=Rail.USDT,
                quote_rail=Rail.MTN_MOMO_RWF,
                side=Side.BUY,
                price=1534.0 + (i % 4) * 0.8,
                amount_base=20 + i,
                available_amount_base=20 + i,
                payment_method="MTN Mobile Money",
                city=City.KIGALI,
                trader_anon_id=f"trader-{i%10}",
                fees=0.1,
                observed_at=now - timedelta(minutes=25 + i),
                is_synthetic=True,
                raw_ref=f"cmp-rwf-{i}",
            )
        )

    # Manipulation samples: duplicate ads + wash-looking extreme
    quotes.append(
        Quote(
            provider="binance_p2p",
            kind=QuoteKind.PUBLIC_AD,
            base_rail=Rail.USDT,
            quote_rail=Rail.BANKAK_SDG,
            side=Side.SELL,
            price=520.0,  # outlier
            amount_base=5,
            available_amount_base=5,
            payment_method="Bankak",
            trader_anon_id="manip-1",
            completion_rate=0.4,
            rating=2.0,
            observed_at=now,
            is_synthetic=True,
            raw_ref="outlier-1",
        )
    )

    return quotes


def write_seed_file(path: Path) -> None:
    quotes = build_demo_market()
    payload = [json.loads(q.model_dump_json()) for q in quotes]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")