import { MAX_MERCHANT_WEIGHT } from "@motman/shared";

export interface WeightedObservation {
  value: number;
  weight: number;
  merchantId: string;
  kindWeight: number;
}

/** Cap any single merchant at MAX_MERCHANT_WEIGHT of total weight (iterative). */
export function capMerchantWeights(
  observations: WeightedObservation[],
  maxShare = MAX_MERCHANT_WEIGHT
): WeightedObservation[] {
  if (observations.length === 0) return [];

  const merchantWeight = new Map<string, number>();
  for (const o of observations) {
    merchantWeight.set(
      o.merchantId,
      (merchantWeight.get(o.merchantId) ?? 0) + o.weight * o.kindWeight
    );
  }

  // Iteratively shrink offenders so no merchant exceeds maxShare of current total.
  for (let i = 0; i < 64; i++) {
    const total = [...merchantWeight.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let changed = false;
    const next = new Map<string, number>();
    for (const [id, w] of merchantWeight) {
      const share = w / total;
      if (share > maxShare + 1e-12) {
        next.set(id, maxShare * total);
        changed = true;
      } else {
        next.set(id, w);
      }
    }
    merchantWeight.clear();
    for (const [id, w] of next) merchantWeight.set(id, w);
    if (!changed) break;
  }

  const target = new Map(merchantWeight);
  const raw = new Map<string, number>();
  for (const o of observations) {
    raw.set(o.merchantId, (raw.get(o.merchantId) ?? 0) + o.weight * o.kindWeight);
  }

  return observations.map((o) => {
    const r = raw.get(o.merchantId) ?? 0;
    const t = target.get(o.merchantId) ?? 0;
    const scale = r > 0 ? t / r : 0;
    return { ...o, weight: o.weight * scale };
  });
}

/** Weighted median — robust central tendency for FX index. */
export function weightedMedian(observations: WeightedObservation[]): number | null {
  const capped = capMerchantWeights(observations).filter(
    (o) => o.weight * o.kindWeight > 0 && Number.isFinite(o.value)
  );
  if (capped.length === 0) return null;

  const sorted = [...capped].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, o) => s + o.weight * o.kindWeight, 0);
  if (totalWeight <= 0) return null;

  let cumulative = 0;
  const half = totalWeight / 2;
  for (const o of sorted) {
    cumulative += o.weight * o.kindWeight;
    if (cumulative >= half) return o.value;
  }
  return sorted[sorted.length - 1]!.value;
}

export const KIND_WEIGHTS = {
  COMPLETED_TRADE: 1.0,
  BINDING_RFQ: 0.7,
  ADVERTISEMENT: 0.35,
  OFFICIAL_REFERENCE: 0.15,
  PARALLEL_MARKET: 0.25,
  CALIBRATION_SAMPLE: 0.0, // never into live index
  SYNTHETIC_TEST: 0.0,
} as const;
