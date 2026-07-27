import type { GrossMarginBreakdown, NetMarginBreakdown } from "@motman/shared";

export function grossMargin(sellPrice: number, buyPrice: number): GrossMarginBreakdown {
  const gm = sellPrice - buyPrice;
  const pct = buyPrice !== 0 ? (gm / buyPrice) * 100 : 0;
  return {
    sellPrice,
    buyPrice,
    grossMargin: gm,
    grossMarginPct: pct,
    label: "ربح إجمالي",
  };
}

export interface OptionalCosts {
  binanceFees?: number;
  bankakFees?: number;
  mobileMoneyFees?: number;
  liquidityCosts?: number;
  cashOutPremium?: number;
  inventoryRisk?: number;
  disputeLosses?: number;
}

/**
 * Net margin only when all cost inputs provided.
 * Otherwise return gross only labeled «تقديرًا».
 */
export function netOrGrossOnly(
  sellPrice: number,
  buyPrice: number,
  costs: OptionalCosts
): NetMarginBreakdown {
  const base = grossMargin(sellPrice, buyPrice);
  const required: (keyof OptionalCosts)[] = [
    "binanceFees",
    "bankakFees",
    "mobileMoneyFees",
    "liquidityCosts",
    "cashOutPremium",
    "inventoryRisk",
    "disputeLosses",
  ];
  const missing = required.filter((k) => costs[k] == null);
  if (missing.length > 0) {
    return {
      ...base,
      label: "تقديرًا — ربح إجمالي فقط",
      netAvailable: false,
      note: `لا يُعرض الربح الصافي — تكاليف ناقصة: ${missing.join(", ")}`,
      ...costs,
    };
  }
  const deductions =
    (costs.binanceFees ?? 0) +
    (costs.bankakFees ?? 0) +
    (costs.mobileMoneyFees ?? 0) +
    (costs.liquidityCosts ?? 0) +
    (costs.cashOutPremium ?? 0) +
    (costs.inventoryRisk ?? 0) +
    (costs.disputeLosses ?? 0);
  return {
    ...base,
    ...costs,
    netMargin: base.grossMargin - deductions,
    netAvailable: true,
    note: "ربح صافٍ محسوب من تكاليف مكتملة فقط",
  };
}
