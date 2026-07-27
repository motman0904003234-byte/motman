import type {
  AssetCode,
  CorridorQuoteRequest,
  CorridorQuoteResult,
  DepthLevel,
  PaymentRail,
  PriceObservation,
  QuoteLabel,
} from "@motman/shared";
import { filterOutliers } from "./aggregation.js";
import {
  executeAgainstDepth,
  executableCrossRate,
  estimatedNonExecutableRate,
} from "./depth.js";
import {
  confidenceScore,
  detectWashTrading,
  formatRelativeArabic,
  isLowQualityTrader,
  sourceHealthFromLag,
} from "./metrics.js";

const SDG_ASSETS: AssetCode[] = ["BANKAK_SDG", "CASH_SDG"];
const RWF_ASSETS: AssetCode[] = ["MTN_MOMO_RWF", "BANK_RWF"];
const BRIDGE: AssetCode[] = ["USDT", "USDC", "USD"];

function railMatchesAsset(asset: AssetCode, rail: PaymentRail): boolean {
  if (asset === "BANKAK_SDG") return rail === "BANKAK";
  if (asset === "CASH_SDG") return rail === "CASH";
  if (asset === "MTN_MOMO_RWF") return rail === "MTN_MOMO";
  if (asset === "BANK_RWF") return rail === "BANK_RWF";
  return rail === "CRYPTO";
}

function filterObs(
  observations: PriceObservation[],
  opts: {
    base: AssetCode;
    quote: AssetCode;
    rail: PaymentRail;
    side: "BUY" | "SELL";
    amount: number;
    city?: string;
    asOf?: string;
    /** Depth books use ads/RFQ only — completed corridor totals must not enter USDT legs. */
    kinds?: PriceObservation["sourceKind"][];
  },
): PriceObservation[] {
  const asOfMs = opts.asOf ? Date.parse(opts.asOf) : Date.now();
  const kinds = opts.kinds ?? ["P2P_AD", "BINDING_RFQ"];
  return observations.filter((o) => {
    if (!kinds.includes(o.sourceKind)) return false;
    if (o.assetBase !== opts.base || o.assetQuote !== opts.quote) return false;
    if (o.paymentRail !== opts.rail) return false;
    if (o.side !== opts.side) return false;
    if (o.executableUpTo + 1e-9 < opts.amount) return false;
    if (opts.city && o.city && o.city !== opts.city) return false;
    if (Date.parse(o.observedAt) > asOfMs) return false;
    if (o.isSynthetic && o.sourceKind === "SYNTHETIC_TEST") return false;
    if (isLowQualityTrader(o.completionRate, o.rating)) return false;
    return true;
  });
}

function toDepth(obs: PriceObservation[]): DepthLevel[] {
  return obs.map((o) => ({
    price: o.price,
    quantity: o.executableUpTo || o.quantity,
    traderAnonId: o.traderAnonId ?? o.sourceId,
    sourceId: o.sourceId,
    sourceKind: o.sourceKind,
    completionRate: o.completionRate,
    rating: o.rating,
  }));
}

function fmtNum(n: number, digits = 0): string {
  return new Intl.NumberFormat("ar-SD", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

function assetLabel(a: AssetCode): string {
  switch (a) {
    case "BANKAK_SDG":
      return "Bankak-SDG";
    case "CASH_SDG":
      return "Cash-SDG";
    case "MTN_MOMO_RWF":
      return "MTN-MoMo-RWF";
    case "BANK_RWF":
      return "Bank-RWF";
    default:
      return a;
  }
}

export interface QuoteEngineInput {
  observations: PriceObservation[];
  request: CorridorQuoteRequest;
  now?: Date;
  /** Shadow mid TOTAL RWF for 100,000 SDG used only when one side missing. */
  shadowRate?: number;
  dynamicDealerMargin?: number;
  /** Field trader expected band from completed/RFQ when available. */
  traderExpectedBand?: { low: number; high: number };
}

/**
 * Quote for a specific amount, rails, and direction.
 * Paths are never collapsed into a misleading single blended FX type.
 */
export function quoteCorridor(input: QuoteEngineInput): CorridorQuoteResult {
  const { request } = input;
  const now = input.now ?? new Date();
  const warnings: string[] = [];
  const wash = detectWashTrading(
    input.observations.map((o) => ({
      traderAnonId: o.traderAnonId ?? o.sourceId,
      price: o.price,
      quantity: o.quantity,
      side: o.side,
    })),
  );
  if (wash.length) warnings.push(`تنبيهات تلاعب محتمل: ${wash.length}`);

  if (!railMatchesAsset(request.fromAsset, request.fromRail)) {
    warnings.push("طريقة الدفع الأصلية لا تطابق نوع الأصل");
  }
  if (!railMatchesAsset(request.toAsset, request.toRail)) {
    warnings.push("طريقة الدفع المطلوبة لا تطابق نوع الأصل");
  }

  const bridge = BRIDGE.includes(request.fromAsset) || BRIDGE.includes(request.toAsset)
    ? (BRIDGE.find((b) => b === request.fromAsset || b === request.toAsset) ?? "USDT")
    : "USDT";

  // Primary corridor: SDG -> RWF via USDT
  const fromIsSdg = SDG_ASSETS.includes(request.fromAsset);
  const toIsRwf = RWF_ASSETS.includes(request.toAsset);

  let sdgAsk: ReturnType<typeof executeAgainstDepth> | null = null;
  let rwfBid: ReturnType<typeof executeAgainstDepth> | null = null;
  let theoreticalRate: number | null = null;
  let quoteLabel: QuoteLabel = "NO_EXECUTABLE_LIQUIDITY";
  let fairRate: number | null = null;
  let executableRange: { low: number; high: number } | null = null;
  let bid: number | null = null;
  let ask: number | null = null;

  if (fromIsSdg && toIsRwf) {
    // ExecutableAsk_SDG_USDT = SDG per 1 USDT; ExecutableBid_RWF_USDT = RWF per 1 USDT
    // Rate (RWF per SDG) = Bid_RWF_USDT / Ask_SDG_USDT
    const askObsRaw = filterObs(input.observations, {
      base: bridge as AssetCode,
      quote: request.fromAsset,
      rail: request.fromRail,
      side: "SELL",
      amount: request.amount,
      city: request.city,
      asOf: request.asOf,
    });
    // Also accept observations quoted as SDG per USDT with side BUY (merchant buying USDT)
    const askObsAlt = filterObs(input.observations, {
      base: request.fromAsset,
      quote: bridge as AssetCode,
      rail: request.fromRail,
      side: "BUY",
      amount: request.amount,
      city: request.city,
      asOf: request.asOf,
    });

    const askCombined = [...askObsRaw, ...askObsAlt];
    const askPrices = filterOutliers(askCombined.map((o) => o.price));
    const askFiltered = askCombined.filter((o) => askPrices.includes(o.price));
    // Depth quantity for SDG leg is in SDG notional capacity.
    sdgAsk = executeAgainstDepth(
      toDepth(askFiltered).map((l) => ({
        ...l,
        quantity: l.quantity > 1000 ? l.quantity : l.quantity * l.price,
      })),
      request.amount,
      "BUY",
    );

    const bidObsRaw = filterObs(input.observations, {
      base: bridge as AssetCode,
      quote: request.toAsset,
      rail: request.toRail,
      side: "BUY",
      amount: 1,
      city: request.city,
      asOf: request.asOf,
    });
    const bidObsAlt = filterObs(input.observations, {
      base: request.toAsset,
      quote: bridge as AssetCode,
      rail: request.toRail,
      side: "SELL",
      amount: 1,
      city: request.city,
      asOf: request.asOf,
    });
    const bidCombined = [...bidObsRaw, ...bidObsAlt];
    const bidPrices = filterOutliers(bidCombined.map((o) => o.price));
    const bidFiltered = bidCombined.filter((o) => bidPrices.includes(o.price));
    // RWF leg depth is in USDT size.
    const usdtNotional =
      sdgAsk.filled && sdgAsk.vwap && sdgAsk.vwap > 0
        ? request.amount / sdgAsk.vwap
        : request.amount / 5900;
    rwfBid = executeAgainstDepth(toDepth(bidFiltered), usdtNotional, "SELL");

    ask = sdgAsk.vwap;
    bid = rwfBid.vwap;

    if (sdgAsk.filled && rwfBid.filled && ask && bid) {
      const unitRate = executableCrossRate(bid, ask);
      theoreticalRate = unitRate * request.amount;
      fairRate = theoreticalRate;
      quoteLabel = "EXECUTABLE";
      const slip = theoreticalRate * 0.003;
      executableRange = {
        low: theoreticalRate - slip * 2,
        high: theoreticalRate - slip * 0.5,
      };
    } else {
      warnings.push("سيولة أحادية الجانب أو غير كافية للمبلغ المطلوب");
      const shadowTotal =
        input.shadowRate != null
          ? input.shadowRate * (request.amount / 100_000)
          : ask && bid
            ? executableCrossRate(bid, ask) * request.amount
            : null;
      if (shadowTotal) {
        const est = estimatedNonExecutableRate(
          shadowTotal,
          input.dynamicDealerMargin ?? 0.015,
        );
        theoreticalRate = shadowTotal;
        fairRate = shadowTotal;
        quoteLabel = "ESTIMATED_NON_EXECUTABLE";
        warnings.push("سعر تقديري غير قابل للتنفيذ — ليس سعراً نهائياً");
        executableRange = null;
        if (!input.traderExpectedBand) {
          input.traderExpectedBand = { low: est * 0.995, high: est };
        } else {
          const scale = request.amount / 100_000;
          input.traderExpectedBand = {
            low: input.traderExpectedBand.low * scale,
            high: input.traderExpectedBand.high * scale,
          };
        }
      } else {
        quoteLabel = "NO_EXECUTABLE_LIQUIDITY";
        warnings.push("لا يوجد سعر تنفيذي حالياً");
      }
    }
  } else {
    warnings.push("الممر المطلوب خارج المسار الأساسي SDG→RWF عبر USDT في هذه النسخة");
    quoteLabel = "NO_EXECUTABLE_LIQUIDITY";
  }

  const completed = input.observations
    .filter(
      (o) =>
        o.sourceKind === "COMPLETED_TRADE" &&
        (!request.asOf || Date.parse(o.observedAt) <= Date.parse(request.asOf)),
    )
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));

  const lastCompletedTrade = completed[0]?.price ?? null;

  const traders = new Set(
    input.observations
      .filter((o) => o.traderAnonId)
      .map((o) => o.traderAnonId as string),
  );

  const latest = input.observations
    .map((o) => Date.parse(o.observedAt))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];

  const lagSeconds = latest != null ? (now.getTime() - latest) / 1000 : null;
  const health = sourceHealthFromLag(lagSeconds);

  const completedW =
    input.observations.filter((o) => o.sourceKind === "COMPLETED_TRADE").length /
    Math.max(1, input.observations.length);
  const bindingW =
    input.observations.filter((o) => o.sourceKind === "BINDING_RFQ").length /
    Math.max(1, input.observations.length);
  const adW =
    input.observations.filter((o) => o.sourceKind === "P2P_AD").length /
    Math.max(1, input.observations.length);

  const hasBoth = Boolean(sdgAsk?.filled && rwfBid?.filled);
  const conf = confidenceScore({
    independentTraders: traders.size,
    completedTradeWeight: completedW,
    bindingWeight: bindingW,
    adWeight: adW,
    liquidityCoverage: hasBoth ? 1 : 0.3,
    outlierRejectionRate: 0.05,
    sourceHealth: health,
    hasBothSides: hasBoth,
  });

  const scaledExpected = input.traderExpectedBand
    ? {
        low: input.traderExpectedBand.low * (request.amount / 100_000),
        high: input.traderExpectedBand.high * (request.amount / 100_000),
      }
    : null;
  const traderBand = executableRange ?? scaledExpected;

  const spreadPct =
    fairRate != null && traderBand
      ? ((fairRate - (traderBand.low + traderBand.high) / 2) / fairRate) * 100
      : null;

  const grossMarginPct = spreadPct;

  const amountLine = `${fmtNum(request.amount)} ${assetLabel(request.fromAsset)}`;
  const fairRateLine =
    fairRate != null
      ? `السعر العادل: ${fmtNum(Math.round(fairRate))} ${assetLabel(request.toAsset).replace(/.*-/, "")}`
      : "السعر العادل: غير متاح";

  let executableLine: string;
  if (quoteLabel === "NO_EXECUTABLE_LIQUIDITY") {
    executableLine = "لا يوجد سعر تنفيذي حالياً";
  } else if (quoteLabel === "ESTIMATED_NON_EXECUTABLE") {
    executableLine = `سعر تقديري غير قابل للتنفيذ: ${
      traderBand ? `${fmtNum(Math.round(traderBand.low))}–${fmtNum(Math.round(traderBand.high))}` : "—"
    } RWF`;
  } else {
    executableLine = `السعر التنفيذي: ${
      executableRange
        ? `${fmtNum(Math.round(executableRange.low))}–${fmtNum(Math.round(executableRange.high))}`
        : "—"
    } RWF`;
  }

  const marginLine =
    grossMarginPct != null
      ? `الهامش: ${(grossMarginPct * 0.6).toFixed(1)}%–${grossMarginPct.toFixed(1)}%`
      : "الهامش: تقدير غير متاح";

  const confidenceLine = `الثقة: ${conf}/100`;
  const sourcesLine = `المصادر المستقلة: ${traders.size}`;
  const updatedLine =
    lagSeconds != null
      ? `آخر تحديث: ${formatRelativeArabic(lagSeconds)}`
      : "آخر تحديث: غير معروف";

  return {
    request,
    display: {
      amountLine,
      fairRateLine,
      executableLine,
      marginLine,
      confidenceLine,
      sourcesLine,
      updatedLine,
    },
    metrics: {
      lastCompletedTrade,
      bid,
      ask,
      theoreticalRate,
      traderExpectedRate: traderBand
        ? (traderBand.low + traderBand.high) / 2
        : null,
      spreadPct,
      grossDealerMarginPct: grossMarginPct,
      availableLiquidity: (sdgAsk?.availableLiquidity ?? 0) + (rwfBid?.availableLiquidity ?? 0),
      independentTraders: traders.size,
      lastUpdatedAt: latest != null ? new Date(latest).toISOString() : null,
      confidenceScore: conf,
      sourceHealth: health,
      quoteLabel,
      executableRange,
      fairRate,
      methodologyNote:
        "ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT باستخدام عمق العروض القابل لتنفيذ المبلغ كاملاً. المتوسط المرجعي: Weighted Median مع سقف 10% لكل تاجر.",
    },
    legs: {
      sdgUsdtAsk: sdgAsk,
      rwfUsdtBid: rwfBid,
    },
    warnings,
  };
}

export function calibrationSampleQuote(): CorridorQuoteResult {
  const request: CorridorQuoteRequest = {
    amount: 100_000,
    fromAsset: "BANKAK_SDG",
    toAsset: "MTN_MOMO_RWF",
    fromRail: "BANKAK",
    toRail: "MTN_MOMO",
    asOf: "2026-07-27T12:00:00.000Z",
  };
  return {
    request,
    display: {
      amountLine: "100,000 Bankak-SDG",
      fairRateLine: "السعر العادل: 25,588 RWF",
      executableLine: "سعر تقديري غير قابل للتنفيذ / ميداني: 25,200 RWF (عينة معايرة)",
      marginLine: "الهامش: 1.54%",
      confidenceLine: "الثقة: غير محسوبة — عينة معايرة فقط",
      sourcesLine: "لوحظ 180 عرض شراء Bankak — لا يوجد عرض بيع يقبل 100,000 SDG",
      updatedLine: "تاريخ العينة: 27 يوليو 2026",
    },
    metrics: {
      lastCompletedTrade: null,
      bid: null,
      ask: null,
      theoreticalRate: 25587.78,
      traderExpectedRate: 25200,
      spreadPct: 1.54,
      grossDealerMarginPct: 1.54,
      availableLiquidity: 0,
      independentTraders: 0,
      lastUpdatedAt: "2026-07-27T12:00:00.000Z",
      confidenceScore: 0,
      sourceHealth: "STALE",
      quoteLabel: "ESTIMATED_NON_EXECUTABLE",
      executableRange: null,
      fairRate: 25587.78,
      methodologyNote:
        "عينة معايرة مؤرخة وليست سعراً حياً. لا تُثبت كدليل دقة بمفردها.",
    },
    legs: { sdgUsdtAsk: null, rwfUsdtBid: null },
    warnings: [
      "بيانات معايرة مبدئية فقط — ليست سعراً تنفيذياً حياً",
      "لا يوجد عرض بيع يقبل 100,000 SDG في العينة",
    ],
    isCalibrationOnly: true,
  };
}
