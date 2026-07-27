"""Generate clearly-labeled synthetic accuracy samples for software tests only."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.domain.enums import Rail
from app.domain.models import AccuracySample, QuoteRequest
from app.pricing.accuracy import evaluate_accuracy
from app.pricing.engine import PricingEngine
from app.providers.demo_market import build_demo_market


def main() -> None:
    now = datetime.now(timezone.utc)
    engine = PricingEngine(build_demo_market(now))
    samples: list[AccuracySample] = []
    for i, amount in enumerate([100_000, 100_000, 500_000, 500_000, 1_000_000] * 20):
        # Predict from engine at t0; "actual" = predict * (1 + small noise)
        # This validates metric plumbing — NOT live market accuracy.
        req = QuoteRequest(
            amount=amount,
            from_rail=Rail.BANKAK_SDG,
            to_rail=Rail.MTN_MOMO_RWF,
            from_payment="Bankak",
            to_payment="MTN Mobile Money",
        )
        pred = engine.quote(req)
        if not pred.executable_range:
            continue
        predicted = sum(pred.executable_range) / 2
        noise = 1 + ((i % 7) - 3) * 0.002
        samples.append(
            AccuracySample(
                predicted_price=predicted,
                actual_completed_price=predicted * noise,
                amount=amount,
                from_rail=Rail.BANKAK_SDG,
                to_rail=Rail.MTN_MOMO_RWF,
                payment_method="Bankak",
                traded_at=now + timedelta(minutes=i),
                is_synthetic=True,
            )
        )
    report = evaluate_accuracy(samples, allow_live_claim=True)
    out = {
        "disclaimer": "SYNTHETIC SOFTWARE TEST ONLY — not a live accuracy claim",
        "n": len(samples),
        "report": json.loads(report.model_dump_json()),
    }
    path = Path(__file__).resolve().parents[1] / "data" / "seed" / "synthetic_accuracy_report.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(path)
    print("claim_live_accuracy=", report.claim_live_accuracy)


if __name__ == "__main__":
    main()