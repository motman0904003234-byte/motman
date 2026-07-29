from datetime import datetime, timedelta, timezone

from app.domain.enums import Rail
from app.domain.models import AccuracySample
from app.pricing.accuracy import evaluate_accuracy


def test_accuracy_refuses_live_claim_on_synthetic():
    now = datetime.now(timezone.utc)
    samples = [
        AccuracySample(
            predicted_price=25200,
            actual_completed_price=25200 + i,
            amount=100000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            payment_method="Bankak",
            traded_at=now + timedelta(minutes=i),
            is_synthetic=True,
        )
        for i in range(50)
    ]
    report = evaluate_accuracy(samples, allow_live_claim=True)
    assert report.claim_live_accuracy is False
    assert any("اصطناعية" in n or "حية" in n for n in report.notes)


def test_accuracy_metrics_compute():
    now = datetime.now(timezone.utc)
    samples = [
        AccuracySample(
            predicted_price=100,
            actual_completed_price=100,
            amount=100000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            payment_method="Bankak",
            traded_at=now,
            is_synthetic=True,
        ),
        AccuracySample(
            predicted_price=102,
            actual_completed_price=100,
            amount=500000,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            payment_method="Bankak",
            traded_at=now,
            is_synthetic=True,
        ),
    ]
    report = evaluate_accuracy(samples)
    assert report.mape == 1.0
    assert report.median_error_pct == 1.0