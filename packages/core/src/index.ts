import { createHash } from "node:crypto";
import type {
  AnonymizedTrade,
  Corridor,
  MarketQuote,
  PaymentMethod,
  PricingResult,
  QuoteRequest,
  RateComponents,
  RateLabel,
  SourceStatus,
  AccuracyReport,
  AccuracySample,
} from "@motman/shared";
import { SOURCE_STALE_MS } from "@motman/shared";
import { mape, median, percentageError, percentile } from "./accuracy.js";
import { dedupeAds, filterLowQuality, filterOutliers } from "./cleaning.js";
import {
  estimatedNonExecutableRate,
  executableCrossRate,
  executableVwap,
} from "./executableDepth.js";
import { KIND_WEIGHTS, weightedMedian, type WeightedObservation } from "./weightedMedian.js";

export interface PricingEngineInput {
  request: QuoteRequest;
  /** Quotes priced as quote-currency per 1 USDT (SDG/USDT or RWF/USDT) */
  sdgUsdtQuotes: MarketQuote[];
  rwfUsdtQuotes: MarketQuote[];
  completedTrades: AnonymizedTrade[];
  now?: Date;
  shadowRatePerSdg?: number;
  dynamicDealerMargin?: number;
  /** Observed field total RWF for this ticket — never invented */
  traderExpectedTotalRwf?: number | null;
  /** Dated calibration theoretical total — not a live force */
  calibrationTheoreticalTotal?: number | null;
}

function paymentFor(c: Corridor): PaymentMethod {
  switch (c) {
    case "Bankak-SDG":
      return "BANKAK";
    case "Cash-SDG":
      return "CASH_SDG";
    case "MTN-MoMo-RWF":
      return "MTN_MOMO";
    case "Bank-RWF":
      return "BANK_RWF";
  }
}

function prepare(quotes: MarketQuote[], payment: PaymentMethod): MarketQuote[] {
  let q = quotes.filter(
    (x) =>
      x.paymentMethod === payment &&
      x.kind !== "CALIBRATION_SAMPLE" &&
      x.kind !== "SYNTHETIC_TEST"
  );
  q = dedupeAds(q);
  q = filterLowQuality(q);
  q = filterOutliers(q);
  return q;
}

function statusOf(quotes: MarketQuote[], now: Date): SourceStatus {
  if (quotes.length === 0) return "DOWN";
  const latest = Math.max(...quotes.map((q) => +new Date(q.observedAt)));
  const age = now.getTime() - latest;
  const limit = SOURCE_STALE_MS.binance_p2p ?? 5 * 60 * 1000;
  if (age > limit * 6) return "DOWN";
  if (age > limit) return "STALE";
  return "LIVE";
}

function ago(iso: string | null, now: Date): string {
  if (!iso) return "غير متوفر";
  const s = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 0) return "الآن";
  if (s < 60) return `منذ ${s} ثانية`;
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`;
  return `منذ ${Math.floor(s / 3600)} ساعة`;
}

function confidence(opts: {
  merchants: number;
  executable: boolean;
  completed: number;
  status: SourceStatus;
}): number {
  let score = 35;
  score += Math.min(30, opts.merchants * 2);
  if (opts.executable) score += 20;
  score += Math.min(10, opts.completed);
  if (opts.status === "LIVE") score += 10;
  else if (opts.status === "STALE") score -= 15;
  else score -= 25;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Price a specific amount + payment path.
 * Does not merge corridors into one misleading number.
 */
export function priceQuote(input: PricingEngineInput): PricingResult {
  const now = input.now ?? new Date();
  const { amount, fromCorridor, toCorridor } = input.request;
  const sdg = prepare(input.sdgUsdtQuotes, paymentFor(fromCorridor));
  const rwf = prepare(input.rwfUsdtQuotes, paymentFor(toCorridor));

  // Merchant SELL USDT = Ask (user buys USDT with SDG)
  // Merchant BUY USDT = Bid (user sells USDT for RWF)
  const askBook = sdg
    .filter((q) => q.side === "SELL")
    .filter((q) => !(q.maxAmount > 0 && amount > q.maxAmount * (q.price || 1)))
    .map((q) => ({ ...q, side: "BUY" as const }));

  const bidBook = rwf
    .filter((q) => q.side === "BUY")
    .map((q) => ({ ...q, side: "SELL" as const }));

  // Approximate USDT size from median ask
  const askPrices = sdg.filter((q) => q.side === "SELL").map((q) => q.price);
  const medianAsk =
    askPrices.length > 0
      ? askPrices.sort((a, b) => a - b)[Math.floor(askPrices.length / 2)]!
      : null;
  const usdtSize = medianAsk && medianAsk > 0 ? amount / medianAsk : 0;

  // Filter books that can fill this USDT size
  const askFillable = askBook.filter((q) => {
    if (usdtSize <= 0) return false;
    if (q.minAmount > 0 && usdtSize < q.minAmount) return false;
    if (q.maxAmount > 0 && usdtSize > q.maxAmount) return false;
    return q.availableAmount >= usdtSize || q.availableAmount > 0;
  });
  const bidFillable = bidBook.filter((q) => {
    if (usdtSize <= 0) return false;
    if (q.minAmount > 0 && usdtSize < q.minAmount) return false;
    if (q.maxAmount > 0 && usdtSize > q.maxAmount) return false;
    return q.availableAmount >= usdtSize || q.availableAmount > 0;
  });

  const askDepth = usdtSize > 0 ? executableVwap(askFillable, "BUY", usdtSize) : null;
  const bidDepth = usdtSize > 0 ? executableVwap(bidFillable, "SELL", usdtSize) : null;

  const askWm = weightedMedian(
    sdg
      .filter((q) => q.side === "SELL")
      .map(
        (q): WeightedObservation => ({
          value: q.price,
          weight: q.availableAmount,
          merchantId: q.merchantId,
          kindWeight: KIND_WEIGHTS[q.kind] ?? 0.35,
        })
      )
  );
  const bidWm = weightedMedian(
    rwf
      .filter((q) => q.side === "BUY")
      .map(
        (q): WeightedObservation => ({
          value: q.price,
          weight: q.availableAmount,
          merchantId: q.merchantId,
          kindWeight: KIND_WEIGHTS[q.kind] ?? 0.35,
        })
      )
  );

  const ask = askDepth?.vwap ?? askWm;
  const bid = bidDepth?.vwap ?? bidWm;

  let rateLabel: RateLabel = "NO_EXECUTABLE_LIQUIDITY";
  let unitRate: number | null = null;
  let fairTotal: number | null = null;
  let execLow: number | null = null;
  let execHigh: number | null = null;

  const bothDepth = askDepth != null && bidDepth != null && ask != null && bid != null;
  const bothPrices = ask != null && bid != null;

  if (bothDepth) {
    unitRate = executableCrossRate(bid!, ask!);
    fairTotal = unitRate != null ? unitRate * amount : null;
    if (fairTotal != null) {
      execLow = fairTotal * 0.997;
      execHigh = fairTotal * 1.003;
      rateLabel = "EXECUTABLE";
    }
  } else if (bothPrices) {
    unitRate = executableCrossRate(bid!, ask!);
    const shadow = input.shadowRatePerSdg ?? unitRate;
    const margin = input.dynamicDealerMargin ?? 0.0154;
    const estUnit = shadow != null ? estimatedNonExecutableRate(shadow, margin) : null;
    fairTotal = estUnit != null ? estUnit * amount : unitRate != null ? unitRate * amount : null;
    rateLabel = "ESTIMATED_NON_EXECUTABLE";
  } else if (input.shadowRatePerSdg != null) {
    const margin = input.dynamicDealerMargin ?? 0.0154;
    const estUnit = estimatedNonExecutableRate(input.shadowRatePerSdg, margin);
    unitRate = input.shadowRatePerSdg;
    fairTotal = estUnit != null ? estUnit * amount : null;
    rateLabel = "ESTIMATED_NON_EXECUTABLE";
  }

  const merchants = new Set([...sdg, ...rwf].map((q) => q.merchantId));
  const completed = input.completedTrades.filter(
    (t) => now.getTime() - +new Date(t.completedAt) < 86_400_000
  );
  const lastTrade = [...completed].sort(
    (a, b) => +new Date(b.completedAt) - +new Date(a.completedAt)
  )[0];

  const all = [...sdg, ...rwf];
  const sourceStatus = statusOf(all, now);
  const lastUpdated =
    all.length > 0
      ? new Date(Math.max(...all.map((q) => +new Date(q.observedAt)))).toISOString()
      : null;

  const traderExpected = input.traderExpectedTotalRwf ?? null;
  let spread: number | null = null;
  let grossDealerMargin: number | null = null;
  const theoreticalTotal =
    input.calibrationTheoreticalTotal ??
    (unitRate != null ? unitRate * amount : fairTotal);
  if (theoreticalTotal != null && traderExpected != null && theoreticalTotal !== 0) {
    // Field vs theoretical (calibration: 25587.78 vs 25200 → ~1.54%)
    spread = ((theoreticalTotal - traderExpected) / theoreticalTotal) * 100;
    grossDealerMargin = spread;
  }

  const conf = confidence({
    merchants: merchants.size,
    executable: rateLabel === "EXECUTABLE",
    completed: completed.length,
    status: sourceStatus,
  });

  const fairFromBooks =
    unitRate != null ? unitRate * amount : fairTotal;
  const fairPrice =
    input.calibrationTheoreticalTotal ??
    (rateLabel === "ESTIMATED_NON_EXECUTABLE" ? fairFromBooks : fairTotal);

  const components: RateComponents = {
    lastCompletedTrade: lastTrade?.price ?? null,
    bid: bid ?? null,
    ask: ask ?? null,
    theoretical: input.calibrationTheoreticalTotal ?? fairFromBooks,
    traderExpected,
    spread,
    grossDealerMargin,
    availableLiquidity: [...askFillable, ...bidFillable].reduce(
      (s, q) => s + q.availableAmount,
      0
    ),
    independentMerchants: merchants.size,
    lastUpdatedAt: lastUpdated,
    confidence: conf,
    sourceStatus,
    rateLabel,
    executableLow: execLow,
    executableHigh: execHigh,
    fairPrice,
    methodologyNote:
      rateLabel === "EXECUTABLE"
        ? "ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT (عمق كامل للمبلغ)"
        : rateLabel === "ESTIMATED_NON_EXECUTABLE"
          ? "سعر تقديري غير قابل للتنفيذ = ShadowRate × (1 - DynamicDealerMargin) — ليس سعراً نهائياً"
          : "لا يوجد سعر تنفيذي حالياً",
  };

  const auditId = createHash("sha256")
    .update(
      JSON.stringify({
        amount,
        fromCorridor,
        toCorridor,
        ask,
        bid,
        fairTotal,
        rateLabel,
        at: now.toISOString(),
      })
    )
    .digest("hex")
    .slice(0, 16);

  return {
    request: input.request,
    display: buildDisplay(amount, fromCorridor, components, now),
    components,
    auditId,
  };
}

function buildDisplay(
  amount: number,
  from: Corridor,
  c: RateComponents,
  now: Date
) {
  const fair =
    c.fairPrice != null
      ? `${Math.round(c.fairPrice).toLocaleString("en-US")} RWF`
      : "غير متوفر";

  let exec: string;
  if (c.rateLabel === "NO_EXECUTABLE_LIQUIDITY") {
    exec = "لا يوجد سعر تنفيذي حالياً";
  } else if (c.rateLabel === "ESTIMATED_NON_EXECUTABLE") {
    exec = "سعر تقديري غير قابل للتنفيذ — لا يُقدَّم كسعر نهائي";
  } else if (c.executableLow != null && c.executableHigh != null) {
    exec = `السعر التنفيذي: ${Math.round(c.executableLow).toLocaleString("en-US")}–${Math.round(c.executableHigh).toLocaleString("en-US")} RWF`;
  } else {
    exec = "لا يوجد سعر تنفيذي حالياً";
  }

  const margin =
    c.grossDealerMargin != null
      ? `${Math.max(0, Math.abs(c.grossDealerMargin) - 0.6).toFixed(1)}%–${Math.abs(c.grossDealerMargin).toFixed(1)}%`
      : "غير محسوب";

  return {
    amountLabel: `${amount.toLocaleString("en-US")} ${from}`,
    fairPriceLabel: `السعر العادل: ${fair}`,
    executableRangeLabel: exec,
    marginLabel: `الهامش: ${margin}`,
    confidenceLabel: `الثقة: ${c.confidence}/100`,
    sourcesLabel: `المصادر المستقلة: ${c.independentMerchants}`,
    lastUpdateLabel: `آخر تحديث: ${ago(c.lastUpdatedAt, now)}`,
    liquidityWarning: c.rateLabel !== "EXECUTABLE" ? c.methodologyNote : undefined,
  };
}

export function evaluateAccuracy(samples: AccuracySample[]): AccuracyReport {
  const real = samples.filter((s) => !s.isSynthetic);
  const finite = real
    .map((s) => percentageError(s.predictedPrice, s.actualCompletedPrice))
    .filter(Number.isFinite);
  const mapeVal = mape(
    real.map((s) => s.predictedPrice),
    real.map((s) => s.actualCompletedPrice)
  );
  const med = median(finite);
  const p95 = percentile(finite, 95);
  const within10 = finite.length
    ? (finite.filter((e) => e < 10).length / finite.length) * 100
    : 0;

  return {
    sampleCount: real.length,
    independentMerchants: new Set(real.map((s) => s.corridorPair)).size,
    mape: mapeVal ?? Number.NaN,
    medianError: med ?? Number.NaN,
    p95Error: p95 ?? Number.NaN,
    pctWithin10: within10,
    meetsMinimum90: within10 >= 90,
    meetsTargetMape2: (mapeVal ?? Infinity) < 2,
    meetsMedian1_5: (med ?? Infinity) < 1.5,
    meetsP95_5: (p95 ?? Infinity) < 5,
    definition:
      "PercentageError = abs(PredictedPrice - ActualCompletedPrice) / ActualCompletedPrice × 100",
    caveats: [
      "لا تُستخدم بيانات اصطناعية لإثبات الدقة",
      "التقسيم الزمني إلزامي",
      real.length < 300
        ? `عينات حقيقية: ${real.length}/300 — لا يُدَّعى تحقيق معيار الدقة`
        : "حجم العينة ≥ 300",
    ],
  };
}

export * from "./weightedMedian.js";
export * from "./accuracy.js";
export * from "./executableDepth.js";
export * from "./cleaning.js";
export * from "./margins.js";
