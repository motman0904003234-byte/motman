import type { DepthLevel, ExecutableDepthResult } from "@motman/shared";

/**
 * Fill an amount against order-book depth (price-time priority by sorted levels).
 * BUY uses ascending ask prices; SELL uses descending bid prices.
 */
export function executeAgainstDepth(
  levels: DepthLevel[],
  amount: number,
  side: "BUY" | "SELL",
): ExecutableDepthResult {
  if (amount <= 0 || levels.length === 0) {
    return {
      filled: false,
      vwap: null,
      filledQuantity: 0,
      levelsUsed: 0,
      independentTraders: 0,
      availableLiquidity: levels.reduce((s, l) => s + l.quantity, 0),
    };
  }

  const sorted = [...levels].sort((a, b) =>
    side === "BUY" ? a.price - b.price : b.price - a.price,
  );

  let remaining = amount;
  let notional = 0;
  let filled = 0;
  let levelsUsed = 0;
  const traders = new Set<string>();
  const availableLiquidity = sorted.reduce((s, l) => s + l.quantity, 0);

  for (const level of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.quantity);
    if (take <= 0) continue;
    notional += take * level.price;
    filled += take;
    remaining -= take;
    levelsUsed += 1;
    traders.add(level.traderAnonId);
  }

  const fullyFilled = filled + 1e-9 >= amount;
  return {
    filled: fullyFilled,
    vwap: filled > 0 ? notional / filled : null,
    filledQuantity: filled,
    levelsUsed,
    independentTraders: traders.size,
    availableLiquidity,
  };
}

/**
 * ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT
 */
export function executableCrossRate(
  bidRwfUsdt: number,
  askSdgUsdt: number,
): number {
  if (askSdgUsdt <= 0) {
    throw new Error("Ask SDG/USDT must be positive");
  }
  return bidRwfUsdt / askSdgUsdt;
}

/**
 * EstimatedRate = ShadowRate × (1 - DynamicDealerMargin)
 * Must be labeled ESTIMATED_NON_EXECUTABLE by callers.
 */
export function estimatedNonExecutableRate(
  shadowRate: number,
  dynamicDealerMargin: number,
): number {
  if (shadowRate <= 0) {
    throw new Error("Shadow rate must be positive");
  }
  const m = Math.min(Math.max(dynamicDealerMargin, 0), 0.5);
  return shadowRate * (1 - m);
}
