import type { MarketQuote, TradeSide } from "@motman/shared";

/**
 * Walk the order book by best price until `amount` is fully fillable.
 * Returns VWAP executable price, or null if depth insufficient.
 */
export function executableVwap(
  quotes: MarketQuote[],
  side: TradeSide,
  amount: number
): { vwap: number; filled: number; levelsUsed: number } | null {
  if (amount <= 0) return null;
  const relevant = quotes
    .filter((q) => q.side === side)
    .filter((q) => amount >= q.minAmount && amount <= q.maxAmount || q.availableAmount > 0)
    .filter((q) => q.availableAmount > 0)
    .sort((a, b) => (side === "BUY" ? a.price - b.price : b.price - a.price));

  // For BUY side of USDT (paying SDG): we want lowest ask. For SELL: highest bid.
  let remaining = amount;
  let notional = 0;
  let filled = 0;
  let levels = 0;

  for (const q of relevant) {
    // Skip ads that cannot accept the full ticket if max < amount (strict rule)
    if (q.maxAmount > 0 && amount > q.maxAmount) continue;
    if (q.minAmount > 0 && amount < q.minAmount && q.availableAmount < amount) continue;

    const take = Math.min(remaining, q.availableAmount);
    if (take <= 0) continue;
    notional += take * q.price;
    filled += take;
    remaining -= take;
    levels += 1;
    if (remaining <= 1e-9) break;
  }

  if (filled + 1e-9 < amount) return null;
  return { vwap: notional / filled, filled, levelsUsed: levels };
}

/**
 * Bankak-SDG → MTN-MoMo-RWF via USDT:
 * ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT
 *
 * Ask_SDG_USDT = SDG per 1 USDT (what you pay in Bankak to buy USDT)
 * Bid_RWF_USDT = RWF per 1 USDT (what you receive selling USDT for MoMo)
 * Rate in RWF per 1 SDG? Actually for converting amount SDG to RWF:
 *   USDT bought = SDG_amount / Ask_SDG_USDT
 *   RWF received = USDT * Bid_RWF_USDT
 *   RWF per SDG unit ticket = Bid / Ask  → total RWF = amount_SDG * (Bid/Ask)? 
 * Wait: if Ask is SDG/USDT and Bid is RWF/USDT:
 *   rate_RWF_for_full_amount = (amount / Ask) * Bid
 *   implied RWF per SDG = Bid / Ask
 */
export function executableCrossRate(
  bidRwfUsdt: number,
  askSdgUsdt: number
): number | null {
  if (!Number.isFinite(bidRwfUsdt) || !Number.isFinite(askSdgUsdt) || askSdgUsdt <= 0) {
    return null;
  }
  return bidRwfUsdt / askSdgUsdt;
}

/**
 * When one side missing:
 * EstimatedRate = ShadowRate × (1 - DynamicDealerMargin)
 * Must be labeled ESTIMATED_NON_EXECUTABLE — never as final.
 */
export function estimatedNonExecutableRate(
  shadowRate: number,
  dynamicDealerMargin: number
): number | null {
  if (!Number.isFinite(shadowRate) || !Number.isFinite(dynamicDealerMargin)) return null;
  if (dynamicDealerMargin < 0 || dynamicDealerMargin >= 1) return null;
  return shadowRate * (1 - dynamicDealerMargin);
}
