import type { AccuracyReport, AccuracySample } from "@motman/shared";
import { percentageError } from "./metrics.js";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

/**
 * Accuracy harness. Never claims live accuracy without real completed trades.
 * Synthetic samples are allowed only for software tests and must be flagged.
 */
export function evaluateAccuracy(samples: AccuracySample[]): AccuracyReport {
  const usable = samples.filter((s) => !s.usedFutureData);
  const excludedFutureLeakage = samples.length - usable.length;
  const syntheticOnly = usable.length > 0 && usable.every((s) => s.isSynthetic);

  const errors = usable.map((s) =>
    percentageError(s.predictedPrice, s.actualCompletedPrice),
  );
  const sorted = [...errors].sort((a, b) => a - b);
  const mape =
    errors.length === 0
      ? null
      : errors.reduce((a, b) => a + b, 0) / errors.length;
  const medianErrorPct =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
        : sorted[Math.floor(sorted.length / 2)]!;
  const p95ErrorPct = percentile(sorted, 95);
  const within10PctRate =
    errors.length === 0
      ? null
      : errors.filter((e) => e < 10).length / errors.length;

  const traders = new Set(usable.map((s) => s.traderAnonId));

  const acceptance = {
    minAccuracy90: within10PctRate == null ? null : within10PctRate >= 0.9,
    mapeUnder2: mape == null ? null : mape < 2,
    medianUnder1_5: medianErrorPct == null ? null : medianErrorPct < 1.5,
    p95Under5: p95ErrorPct == null ? null : p95ErrorPct < 5,
  };

  let disclaimer: string;
  if (usable.length === 0) {
    disclaimer =
      "لا توجد عينات صفقات مكتملة صالحة لتقييم الدقة. لم يُعلن أي رقم Accuracy.";
  } else if (syntheticOnly) {
    disclaimer =
      "التقرير يعتمد على بيانات اصطناعية لاختبار البرمجيات فقط — ليست إثباتاً لدقة السوق الحية.";
  } else if (usable.length < 300 || traders.size < 10) {
    disclaimer = `عينة غير كافية لمعايير القبول (صفقات=${usable.length}/300، تجار=${traders.size}/10). لا يُدعى تحقيق الدقة التشغيلية.`;
  } else {
    disclaimer = "تقرير دقة على صفقات مكتملة حقيقية ضمن تقسيم زمني بدون تسريب مستقبلي.";
  }

  return {
    sampleCount: usable.length,
    independentTraders: traders.size,
    mape,
    medianErrorPct,
    p95ErrorPct,
    within10PctRate,
    acceptance,
    disclaimer,
    excludedFutureLeakage,
    syntheticOnly,
  };
}
