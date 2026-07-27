/**
 * PercentageError = abs(Predicted - Actual) / Actual × 100
 * Never use the word "Accuracy" without this definition.
 */
export function percentageError(predicted: number, actual: number): number {
  if (!Number.isFinite(predicted) || !Number.isFinite(actual) || actual === 0) {
    return Number.NaN;
  }
  return (Math.abs(predicted - actual) / Math.abs(actual)) * 100;
}

export function median(values: number[]): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  if (v.length % 2 === 0) return (v[mid - 1]! + v[mid]!) / 2;
  return v[mid]!;
}

export function percentile(values: number[], p: number): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[idx]!;
}

export function mape(predicted: number[], actual: number[]): number | null {
  if (predicted.length !== actual.length || predicted.length === 0) return null;
  const errors: number[] = [];
  for (let i = 0; i < predicted.length; i++) {
    const e = percentageError(predicted[i]!, actual[i]!);
    if (Number.isFinite(e)) errors.push(e);
  }
  if (errors.length === 0) return null;
  return errors.reduce((a, b) => a + b, 0) / errors.length;
}
