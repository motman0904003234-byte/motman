import type { MarketQuote } from "@motman/shared";
import { BaseAdapter } from "./base.js";

/**
 * Parallel Sudanese market feeds (trusted aggregators only).
 * Independent adapter — never the sole failure point.
 */
export class SudanParallelMarketAdapter extends BaseAdapter {
  readonly name = "parallel_market_sdg";
  readonly priority = 6;

  async fetchQuotes(): Promise<MarketQuote[]> {
    try {
      const url = process.env.SDG_PARALLEL_URL;
      if (!url) {
        this.lastStatus = "STALE";
        this.lastError = "SDG_PARALLEL_URL not configured";
        return [];
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        buy?: number;
        sell?: number;
        at?: string;
      };
      const at = data.at ?? new Date().toISOString();
      const out: MarketQuote[] = [];
      if (data.sell) {
        out.push({
          id: `parallel-sell-${at}`,
          source: this.name,
          kind: "PARALLEL_MARKET",
          corridor: "Cash-SDG",
          intermediate: "USD",
          side: "SELL",
          price: data.sell,
          availableAmount: 0,
          minAmount: 0,
          maxAmount: 0,
          paymentMethod: "CASH_SDG",
          merchantId: "parallel_feed",
          observedAt: at,
          isBinding: false,
        });
      }
      if (data.buy) {
        out.push({
          id: `parallel-buy-${at}`,
          source: this.name,
          kind: "PARALLEL_MARKET",
          corridor: "Cash-SDG",
          intermediate: "USD",
          side: "BUY",
          price: data.buy,
          availableAmount: 0,
          minAmount: 0,
          maxAmount: 0,
          paymentMethod: "CASH_SDG",
          merchantId: "parallel_feed",
          observedAt: at,
          isBinding: false,
        });
      }
      return this.ok(out);
    } catch (e) {
      return this.fail(e);
    }
  }
}
