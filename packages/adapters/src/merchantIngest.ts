import { createHash, randomUUID } from "node:crypto";
import type { AnonymizedTrade, MarketQuote } from "@motman/shared";
import { BaseAdapter } from "./base.js";

/**
 * Binding RFQ quotes submitted by verified merchants via trader dashboard.
 * Higher weight than ads; lower than completed trades.
 */
export class BindingRfqAdapter extends BaseAdapter {
  readonly name = "binding_rfq";
  readonly priority = 2;
  private quotes: MarketQuote[] = [];

  ingest(quote: Omit<MarketQuote, "id" | "source" | "kind" | "isBinding" | "observedAt"> & {
    id?: string;
  }) {
    const q: MarketQuote = {
      ...quote,
      id: quote.id ?? randomUUID(),
      source: this.name,
      kind: "BINDING_RFQ",
      isBinding: true,
      observedAt: new Date().toISOString(),
      merchantId: anonymizeMerchant(quote.merchantId),
    };
    this.quotes.push(q);
    this.ok(this.quotes);
    return q;
  }

  async fetchQuotes(): Promise<MarketQuote[]> {
    const cutoff = Date.now() - 2 * 60 * 1000;
    this.quotes = this.quotes.filter((q) => +new Date(q.observedAt) >= cutoff);
    return this.ok(this.quotes);
  }
}

/**
 * Completed anonymized trades — highest priority source.
 * Ingested ONLY from local trader connector (API keys never leave merchant device).
 */
export class CompletedTradesAdapter extends BaseAdapter {
  readonly name = "completed_trades";
  readonly priority = 1;
  private trades: AnonymizedTrade[] = [];

  ingest(trade: AnonymizedTrade) {
    if (trade.status !== "COMPLETED") {
      throw new Error("Only COMPLETED trades accepted");
    }
    // Strip any accidental PII keys
    const clean: AnonymizedTrade = {
      anonymousMerchantId: anonymizeMerchant(trade.anonymousMerchantId),
      completedAt: trade.completedAt,
      asset: trade.asset,
      quoteAsset: trade.quoteAsset,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      totalAmount: trade.totalAmount,
      paymentMethod: trade.paymentMethod,
      fees: trade.fees,
      status: "COMPLETED",
      corridor: trade.corridor,
      city: trade.city,
      source: "local_trader_connector",
      kind: "COMPLETED_TRADE",
    };
    this.trades.push(clean);
    this.lastSuccessAt = new Date().toISOString();
    this.lastStatus = "LIVE";
    return clean;
  }

  async fetchQuotes(): Promise<MarketQuote[]> {
    return this.trades.slice(-500).map((t) => ({
      id: `${t.anonymousMerchantId}-${t.completedAt}-${t.price}`,
      source: this.name,
      kind: "COMPLETED_TRADE" as const,
      corridor: t.corridor,
      intermediate: "USDT" as const,
      side: t.side,
      price: t.price,
      availableAmount: t.quantity,
      minAmount: t.quantity,
      maxAmount: t.quantity,
      paymentMethod: t.paymentMethod,
      merchantId: t.anonymousMerchantId,
      observedAt: t.completedAt,
      isBinding: true,
      city: t.city,
    }));
  }

  async fetchTrades(): Promise<AnonymizedTrade[]> {
    return [...this.trades];
  }

  list(): AnonymizedTrade[] {
    return [...this.trades];
  }
}

export function anonymizeMerchant(rawId: string): string {
  return createHash("sha256").update(`motman-merchant:${rawId}`).digest("hex").slice(0, 24);
}
