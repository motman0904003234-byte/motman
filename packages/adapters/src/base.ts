import type { MarketQuote, AnonymizedTrade, SourceStatus } from "@motman/shared";

export interface ProviderHealth {
  name: string;
  status: SourceStatus;
  lastSuccessAt: string | null;
  lastError: string | null;
  isSoleFailurePoint: false; // architectural guarantee — never sole dependency
}

export interface ProviderAdapter {
  readonly name: string;
  readonly priority: number;
  fetchQuotes(): Promise<MarketQuote[]>;
  fetchTrades?(): Promise<AnonymizedTrade[]>;
  health(): ProviderHealth;
}

export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly name: string;
  abstract readonly priority: number;
  protected lastSuccessAt: string | null = null;
  protected lastError: string | null = null;
  protected lastStatus: SourceStatus = "DOWN";

  abstract fetchQuotes(): Promise<MarketQuote[]>;

  health(): ProviderHealth {
    return {
      name: this.name,
      status: this.lastStatus,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      isSoleFailurePoint: false,
    };
  }

  protected ok(quotes: MarketQuote[]): MarketQuote[] {
    this.lastSuccessAt = new Date().toISOString();
    this.lastError = null;
    this.lastStatus = quotes.length ? "LIVE" : "STALE";
    return quotes;
  }

  protected fail(err: unknown): MarketQuote[] {
    this.lastError = err instanceof Error ? err.message : String(err);
    this.lastStatus = "DOWN";
    return [];
  }
}
