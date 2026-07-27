from __future__ import annotations

import math
from collections import defaultdict
from statistics import median
from typing import Iterable, Sequence

import numpy as np


def percentage_error(predicted: float, actual: float) -> float:
    if actual == 0:
        raise ValueError("actual price cannot be 0")
    return abs(predicted - actual) / actual * 100.0


def mape(errors: Sequence[float]) -> float | None:
    if not errors:
        return None
    return float(sum(errors) / len(errors))


def median_error(errors: Sequence[float]) -> float | None:
    if not errors:
        return None
    return float(median(errors))


def p95_error(errors: Sequence[float]) -> float | None:
    if not errors:
        return None
    return float(np.percentile(np.asarray(errors, dtype=float), 95))


def weighted_median(values: Sequence[float], weights: Sequence[float]) -> float | None:
    if not values:
        return None
    if len(values) != len(weights):
        raise ValueError("values/weights length mismatch")
    arr = sorted(zip(values, weights), key=lambda x: x[0])
    total = sum(max(w, 0.0) for _, w in arr)
    if total <= 0:
        return float(median([v for v, _ in arr]))
    cutoff = total / 2.0
    running = 0.0
    for value, weight in arr:
        running += max(weight, 0.0)
        if running >= cutoff:
            return float(value)
    return float(arr[-1][0])


def cap_entity_weights(
    entity_ids: Sequence[str | None],
    raw_weights: Sequence[float],
    max_share: float = 0.10,
) -> list[float]:
    """Prevent any single trader/entity from exceeding max_share of total weight.

    Caps against the original total and does not redistribute leftover mass.
    This intentionally reduces an over-concentrated trader's influence without
    inventing weight for others.
    """
    if not raw_weights:
        return []
    weights = [max(float(w), 0.0) for w in raw_weights]
    ids = [e or f"anon-{i}" for i, e in enumerate(entity_ids)]
    total = sum(weights)
    if total <= 0:
        return weights

    by_entity: dict[str, float] = defaultdict(float)
    for eid, w in zip(ids, weights):
        by_entity[eid] += w

    scales = {
        eid: min(1.0, (total * max_share) / entity_sum) if entity_sum > 0 else 0.0
        for eid, entity_sum in by_entity.items()
    }
    return [w * scales[eid] for eid, w in zip(ids, weights)]


def kind_base_weight(kind: str) -> float:
    table = {
        "COMPLETED_TRADE": 1.00,
        "BINDING_RFQ": 0.70,
        "PUBLIC_AD": 0.25,
        "PARALLEL_MARKET": 0.20,
        "OFFICIAL": 0.05,
        "CALIBRATION_SEED": 0.01,
        "SYNTHETIC_TEST": 0.0,
    }
    return table.get(kind, 0.05)


def quality_multiplier(completion_rate: float | None, rating: float | None) -> float:
    comp = 1.0 if completion_rate is None else max(0.0, min(completion_rate, 1.0))
    rate = 1.0 if rating is None else max(0.0, min(rating / 5.0, 1.0))
    # Harshly downweight poor counterparties.
    if completion_rate is not None and completion_rate < 0.70:
        return 0.0
    if rating is not None and rating < 3.5:
        return 0.05
    return 0.4 + 0.3 * comp + 0.3 * rate


def executable_vwap(
    levels: Iterable[tuple[float, float]],
    amount: float,
    side: str,
) -> tuple[float | None, float]:
    """Walk the book until `amount` is filled.

    levels: sequence of (price, available_amount)
    For BUY side we take ascending asks; for SELL descending bids.
    Returns (vwap, filled_amount).
    """
    cleaned = [(float(p), float(a)) for p, a in levels if p > 0 and a > 0]
    if side.upper() == "BUY":
        cleaned.sort(key=lambda x: x[0])
    else:
        cleaned.sort(key=lambda x: x[0], reverse=True)

    remaining = float(amount)
    cost = 0.0
    filled = 0.0
    for price, avail in cleaned:
        take = min(remaining, avail)
        cost += take * price
        filled += take
        remaining -= take
        if remaining <= 1e-12:
            break
    if filled + 1e-12 < amount:
        return None, filled
    return cost / filled, filled


def mad_outlier_mask(values: Sequence[float], z: float = 3.5) -> list[bool]:
    if len(values) < 3:
        return [True] * len(values)
    arr = np.asarray(values, dtype=float)
    med = np.median(arr)
    mad = np.median(np.abs(arr - med))
    if mad == 0:
        return [True] * len(values)
    scores = 0.6745 * (arr - med) / mad
    return [bool(abs(s) <= z) for s in scores]


def confidence_score(
    *,
    n_independent_traders: int,
    n_completed: int,
    n_binding: int,
    liquidity_ratio: float,
    source_fresh_seconds: float,
    stale_after_seconds: float,
    spread_pct: float | None,
    label_executable: bool,
) -> float:
    score = 0.0
    score += min(n_independent_traders, 20) / 20 * 25
    score += min(n_completed, 50) / 50 * 30
    score += min(n_binding, 20) / 20 * 15
    score += min(max(liquidity_ratio, 0.0), 1.0) * 15
    freshness = 1.0 - min(max(source_fresh_seconds, 0.0), stale_after_seconds) / stale_after_seconds
    score += freshness * 10
    if spread_pct is not None:
        score += max(0.0, 5.0 - min(spread_pct, 5.0))
    if not label_executable:
        score *= 0.55
    return float(max(0.0, min(100.0, round(score, 1))))


def dynamic_dealer_margin(
    *,
    inventory_pressure: float,
    dispute_rate: float,
    cash_out_premium: float,
    base: float = 0.015,
) -> float:
    """Margin used only for clearly labeled estimated non-executable rates."""
    pressure = max(0.0, min(inventory_pressure, 1.0))
    dispute = max(0.0, min(dispute_rate, 1.0))
    premium = max(0.0, cash_out_premium)
    return float(base + 0.02 * pressure + 0.03 * dispute + premium)


def safe_div(n: float, d: float) -> float | None:
    if d == 0 or math.isclose(d, 0.0):
        return None
    return n / d