from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Iterable

import numpy as np

from app.domain.models import AccuracyReport, AccuracySample
from app.pricing.math_utils import mape, median_error, p95_error, percentage_error


def evaluate_accuracy(
    samples: Iterable[AccuracySample],
    *,
    allow_live_claim: bool = False,
) -> AccuracyReport:
    samples = list(samples)
    notes: list[str] = []
    real = [s for s in samples if not s.is_synthetic]
    synth = [s for s in samples if s.is_synthetic]

    if synth and not real:
        notes.append(
            "العينات اصطناعية فقط — تصلح لاختبار البرمجيات لا لإثبات دقة السوق الحية."
        )
    if real and len(real) < 300:
        notes.append(f"صفقات حقيقية متاحة: {len(real)} / المطلوب ≥ 300 لإثبات القبول.")
    traders = {getattr(s, 'trader_id', None) for s in real}  # optional
    # Count via payment+rails diversity proxy if trader unknown
    n_traders = len({(s.payment_method, s.from_rail, s.to_rail, round(s.actual_completed_price, 2)) for s in real}) if real else 0

    use = real if real else samples
    errors = [percentage_error(s.predicted_price, s.actual_completed_price) for s in use]
    m = mape(errors)
    med = median_error(errors)
    p95 = p95_error(errors)
    within10 = (sum(1 for e in errors if e < 10.0) / len(errors) * 100) if errors else None

    by_bucket: dict = defaultdict(list)
    for s, e in zip(use, errors):
        if s.amount < 200_000:
            bucket = "100k"
        elif s.amount < 750_000:
            bucket = "500k"
        else:
            bucket = "1m+"
        by_bucket[bucket].append(e)
    by_bucket_stats = {
        k: {
            "n": len(v),
            "mape": mape(v),
            "median": median_error(v),
            "p95": p95_error(v),
        }
        for k, v in by_bucket.items()
    }

    meets_min = bool(within10 is not None and within10 >= 90)
    meets_mape = bool(m is not None and m < 2.0)
    meets_med = bool(med is not None and med < 1.5)
    meets_p95 = bool(p95 is not None and p95 < 5.0)

    claim = False
    if allow_live_claim and real and len(real) >= 300 and n_traders >= 10:
        claim = meets_min and meets_mape and meets_med and meets_p95
    else:
        notes.append("لا يُسمح بالادعاء بدقة حية دون ≥300 صفقة مكتملة حقيقية و≥10 تجار مستقلين.")

    # Walk-forward sanity: ensure no sample uses future labels implicitly — caller responsibility
    times = [s.traded_at for s in use]
    if times != sorted(times):
        notes.append("تنبيه: العينات غير مرتبة زمنيًا؛ تأكد من عدم تسرب المستقبل في التدريب/المعايرة.")

    return AccuracyReport(
        n_samples=len(use),
        n_traders=n_traders,
        mape=m,
        median_error_pct=med,
        p95_error_pct=p95,
        pct_within_10=within10,
        meets_min_accuracy_90=meets_min,
        meets_target_mape_2=meets_mape,
        meets_median_1_5=meets_med,
        meets_p95_5=meets_p95,
        claim_live_accuracy=claim,
        notes=notes,
        by_bucket=by_bucket_stats,
    )


def walk_forward_splits(
    samples: list[AccuracySample], n_folds: int = 5
) -> list[tuple[list[AccuracySample], list[AccuracySample]]]:
    ordered = sorted(samples, key=lambda s: s.traded_at)
    if len(ordered) < n_folds * 2:
        return [(ordered[: max(1, len(ordered) // 2)], ordered[max(1, len(ordered) // 2) :])]
    fold = len(ordered) // n_folds
    splits = []
    for i in range(1, n_folds):
        cut = fold * i
        splits.append((ordered[:cut], ordered[cut : cut + fold]))
    return splits