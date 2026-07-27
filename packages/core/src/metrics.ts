import type {
  GrossMarginBreakdown,
  SourceHealth,
  SourceKind,
} from "@motman/shared";
import { DOWN_THRESHOLD_SECONDS, STALE_THRESHOLD_SECONDS } from "@motman/shared";

export function percentageError(
  predictedPrice: number,
  actualCompletedPrice: number,
): number {
  if (actualCompletedPrice === 0) {
    throw new Error("Actual completed price must be non-zero");
  }
  return (
    (Math.abs(predictedPrice - actualCompletedPrice) / actualCompletedPrice) *
    100
  );
}

export function computeGrossMargin(
  sellPrice: number,
  buyPrice: number,
  costs?: Partial<{
    binanceFees: number;
    bankakFees: number;
    mobileMoneyFees: number;
    liquidityCosts: number;
    cashOutPremium: number;
    inventoryRisk: number;
    disputeLosses: number;
  }>,
): GrossMarginBreakdown {
  const grossMargin = sellPrice - buyPrice;
  const grossMarginPct = buyPrice === 0 ? 0 : (grossMargin / buyPrice) * 100;
  const costKeys = [
    "binanceFees",
    "bankakFees",
    "mobileMoneyFees",
    "liquidityCosts",
    "cashOutPremium",
    "inventoryRisk",
    "disputeLosses",
  ] as const;

  const missing: string[] = [];
  let knownCosts = 0;
  let allPresent = true;
  for (const key of costKeys) {
    const v = costs?.[key];
    if (v === undefined || v === null || Number.isNaN(v)) {
      missing.push(key);
      allPresent = false;
    } else {
      knownCosts += v;
    }
  }

  if (!allPresent) {
    return {
      sellPrice,
      buyPrice,
      grossMargin,
      grossMarginPct,
      labeledAs: "GROSS_ONLY",
      missingCostItems: missing,
    };
  }

  return {
    sellPrice,
    buyPrice,
    grossMargin,
    grossMarginPct,
    labeledAs: "NET_ESTIMATE",
    netMargin: grossMargin - knownCosts,
    missingCostItems: [],
  };
}

export function sourceHealthFromLag(lagSeconds: number | null | undefined): SourceHealth {
  if (lagSeconds == null || !Number.isFinite(lagSeconds)) return "DOWN";
  if (lagSeconds <= STALE_THRESHOLD_SECONDS) return "LIVE";
  if (lagSeconds <= DOWN_THRESHOLD_SECONDS) return "DELAYED";
  return "STALE";
}

export function confidenceScore(input: {
  independentTraders: number;
  completedTradeWeight: number;
  bindingWeight: number;
  adWeight: number;
  liquidityCoverage: number;
  outlierRejectionRate: number;
  sourceHealth: SourceHealth;
  hasBothSides: boolean;
}): number {
  let score = 0;
  score += Math.min(input.independentTraders, 20) * 2; // up to 40
  score += Math.min(input.completedTradeWeight, 1) * 25;
  score += Math.min(input.bindingWeight, 1) * 15;
  score += Math.min(input.adWeight, 1) * 5;
  score += Math.min(Math.max(input.liquidityCoverage, 0), 1) * 10;
  score -= Math.min(input.outlierRejectionRate, 1) * 10;
  if (!input.hasBothSides) score -= 20;
  if (input.sourceHealth === "DELAYED") score -= 8;
  if (input.sourceHealth === "STALE") score -= 15;
  if (input.sourceHealth === "DOWN") score -= 30;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function formatRelativeArabic(secondsAgo: number): string {
  if (secondsAgo < 5) return "الآن";
  if (secondsAgo < 60) return `منذ ${Math.round(secondsAgo)} ثانية`;
  if (secondsAgo < 3600) return `منذ ${Math.round(secondsAgo / 60)} دقيقة`;
  return `منذ ${Math.round(secondsAgo / 3600)} ساعة`;
}

export function isLowQualityTrader(
  completionRate?: number,
  rating?: number,
): boolean {
  if (completionRate != null && completionRate < 0.85) return true;
  if (rating != null && rating < 90) return true;
  return false;
}

export function detectWashTrading(
  observations: Array<{ traderAnonId: string; price: number; quantity: number; side: string }>,
): string[] {
  const flags: string[] = [];
  const byTrader = new Map<string, typeof observations>();
  for (const o of observations) {
    const list = byTrader.get(o.traderAnonId) ?? [];
    list.push(o);
    byTrader.set(o.traderAnonId, list);
  }
  for (const [id, list] of byTrader) {
    const buys = list.filter((x) => x.side === "BUY");
    const sells = list.filter((x) => x.side === "SELL");
    for (const b of buys) {
      for (const s of sells) {
        if (
          Math.abs(b.price - s.price) / b.price < 0.001 &&
          Math.abs(b.quantity - s.quantity) / b.quantity < 0.01
        ) {
          flags.push(`possible_wash:${id}`);
        }
      }
    }
  }
  return [...new Set(flags)];
}

export function sourceKindPriority(kind: SourceKind): number {
  const order: SourceKind[] = [
    "COMPLETED_TRADE",
    "BINDING_RFQ",
    "P2P_AD",
    "PARALLEL_MARKET",
    "OFFICIAL_BANK",
    "CALIBRATION_SAMPLE",
    "SYNTHETIC_TEST",
  ];
  return order.indexOf(kind);
}
