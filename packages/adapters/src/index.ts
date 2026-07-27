import type { AnonymizedTrade, MarketQuote, SourceStatus } from "@motman/shared";
import { BaseAdapter, type ProviderAdapter, type ProviderHealth } from "./base.js";
import { BinanceP2pAdapter, bankakUsdtAdapters, mtnMomoUsdtAdapters } from "./binanceP2p.js";
import { BankOfKhartoumOfficialAdapter, BnrOfficialAdapter } from "./officialBanks.js";
import { SudanParallelMarketAdapter } from "./parallelMarket.js";
import {
  BindingRfqAdapter,
  CompletedTradesAdapter,
  anonymizeMerchant,
} from "./merchantIngest.js";

/**
 * Fan-in all adapters. Failure of any single unofficial source must not halt the index.
 */
export class AdapterRegistry {
  readonly completed = new CompletedTradesAdapter();
  readonly rfq = new BindingRfqAdapter();
  readonly officialBok = new BankOfKhartoumOfficialAdapter();
  readonly officialBnr = new BnrOfficialAdapter();
  readonly parallel = new SudanParallelMarketAdapter();
  private binance: BinanceP2pAdapter[] = [
    ...bankakUsdtAdapters(),
    ...mtnMomoUsdtAdapters(),
  ];

  all(): BaseAdapter[] {
    return [
      this.completed,
      this.rfq,
      ...this.binance,
      this.officialBok,
      this.officialBnr,
      this.parallel,
    ];
  }

  async collectQuotes(): Promise<{
    quotes: MarketQuote[];
    health: ProviderHealth[];
  }> {
    const health: ProviderHealth[] = [];
    const quotes: MarketQuote[] = [];
    for (const adapter of this.all()) {
      try {
        const q = await adapter.fetchQuotes();
        quotes.push(...q);
      } catch {
        // soft-fail — never sole failure point
      }
      health.push(adapter.health());
    }
    return { quotes, health };
  }

  async collectTrades(): Promise<AnonymizedTrade[]> {
    return this.completed.list();
  }
}

export type { MarketQuote, AnonymizedTrade, SourceStatus, ProviderAdapter, ProviderHealth };
export {
  BaseAdapter,
  BinanceP2pAdapter,
  bankakUsdtAdapters,
  mtnMomoUsdtAdapters,
  BankOfKhartoumOfficialAdapter,
  BnrOfficialAdapter,
  SudanParallelMarketAdapter,
  BindingRfqAdapter,
  CompletedTradesAdapter,
  anonymizeMerchant,
};
