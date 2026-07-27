import { MAX_TRADER_WEIGHT, SOURCE_WEIGHTS, type SourceKind } from "@motman/shared";

export interface WeightedPoint {
  value: number;
  weight: number;
  traderAnonId?: string;
  sourceKind?: SourceKind;
  linkedGroupId?: string;
}

/**
 * Weighted median with per-trader (or linked-group) cap of MAX_TRADER_WEIGHT (10%).
 * Caps are applied iteratively so no group exceeds 10% of the *current* total weight.
 */
export function weightedMedian(points: WeightedPoint[]): number | null {
  if (points.length === 0) return null;

  const enriched = points
    .filter((p) => Number.isFinite(p.value) && p.weight > 0)
    .map((p) => {
      const kindWeight = p.sourceKind ? SOURCE_WEIGHTS[p.sourceKind] : 1;
      return {
        value: p.value,
        weight: p.weight * kindWeight,
        group: p.linkedGroupId ?? p.traderAnonId ?? `anon-${Math.random()}`,
      };
    })
    .filter((p) => p.weight > 0);

  if (enriched.length === 0) return null;

  // Aggregate by group first for capping.
  const groupValueBuckets = new Map<string, { valueWeight: Map<number, number>; total: number }>();
  for (const p of enriched) {
    const bucket = groupValueBuckets.get(p.group) ?? { valueWeight: new Map(), total: 0 };
    bucket.valueWeight.set(p.value, (bucket.valueWeight.get(p.value) ?? 0) + p.weight);
    bucket.total += p.weight;
    groupValueBuckets.set(p.group, bucket);
  }

  let groupWeights = new Map<string, number>(
    [...groupValueBuckets.entries()].map(([g, b]) => [g, b.total]),
  );

  for (let iter = 0; iter < 20; iter++) {
    const total = [...groupWeights.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    const cap = total * MAX_TRADER_WEIGHT;
    let changed = false;
    const next = new Map<string, number>();
    for (const [g, w] of groupWeights) {
      if (w > cap + 1e-12) {
        next.set(g, cap);
        changed = true;
      } else {
        next.set(g, w);
      }
    }
    groupWeights = next;
    if (!changed) break;
  }

  const capped: { value: number; weight: number }[] = [];
  for (const [g, cappedTotal] of groupWeights) {
    const bucket = groupValueBuckets.get(g)!;
    const scale = bucket.total > 0 ? cappedTotal / bucket.total : 0;
    for (const [value, w] of bucket.valueWeight) {
      capped.push({ value, weight: w * scale });
    }
  }

  capped.sort((a, b) => a.value - b.value);
  const total = capped.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return null;

  let cumulative = 0;
  for (const p of capped) {
    cumulative += p.weight;
    if (cumulative >= total / 2) return p.value;
  }
  return capped[capped.length - 1]?.value ?? null;
}

/** Simple outlier filter using robust MAD around median. */
export function filterOutliers(
  values: number[],
  madMultiplier = 3.5,
): number[] {
  if (values.length < 4) return [...values];
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  const deviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad =
    deviations.length % 2 === 0
      ? (deviations[mid - 1]! + deviations[mid]!) / 2
      : deviations[mid]!;
  if (mad === 0) return sorted;
  const threshold = madMultiplier * mad * 1.4826;
  return values.filter((v) => Math.abs(v - median) <= threshold);
}
