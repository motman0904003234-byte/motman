import type { MarketQuote } from "@motman/shared";

/** MAD-based outlier filter; drops quotes beyond k * MAD from median. */
export function filterOutliers(quotes: MarketQuote[], k = 3.5): MarketQuote[] {
  if (quotes.length < 5) return quotes;
  const prices = quotes.map((q) => q.price).sort((a, b) => a - b);
  const mid = prices[Math.floor(prices.length / 2)]!;
  const deviations = prices.map((p) => Math.abs(p - mid)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)]! || 1;
  const threshold = k * mad * 1.4826;
  return quotes.filter((q) => Math.abs(q.price - mid) <= threshold);
}

/** Drop low completion / low rating merchants. */
export function filterLowQuality(
  quotes: MarketQuote[],
  minCompletion = 0.85,
  minRating = 0.9
): MarketQuote[] {
  return quotes.filter((q) => {
    if (q.merchantCompletionRate != null && q.merchantCompletionRate < minCompletion) {
      return false;
    }
    if (q.merchantRating != null && q.merchantRating < minRating) return false;
    return true;
  });
}

/** Detect duplicate ads (same merchant, same price, same amount window). */
export function dedupeAds(quotes: MarketQuote[]): MarketQuote[] {
  const seen = new Set<string>();
  const out: MarketQuote[] = [];
  for (const q of quotes) {
    const key = `${q.merchantId}|${q.side}|${q.price}|${q.minAmount}|${q.maxAmount}|${q.paymentMethod}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/**
 * Wash-trade / self-dealing heuristic: same anonymized cluster appearing on both sides
 * with mirrored amounts within a short window — flag by excluding from index weight.
 */
export function excludeLinkedClusters(
  quotes: MarketQuote[],
  linkedClusters: Map<string, string>
): MarketQuote[] {
  return quotes.filter((q) => {
    const cluster = linkedClusters.get(q.merchantId);
    if (!cluster) return true;
    // Keep one representative per cluster only
    return q.merchantId === cluster;
  });
}
