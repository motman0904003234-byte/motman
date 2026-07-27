import type { PriceObservation, ProviderStatus, SourceHealth } from "@motman/shared";

export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  /** Never treat any single unofficial UI scrape as sole failure point. */
  readonly isCriticalSoleSource: false;
  fetchObservations(params: {
    asOf?: string;
  }): Promise<PriceObservation[]>;
  getStatus(): Promise<ProviderStatus>;
}

export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly isCriticalSoleSource = false as const;
  protected lastSuccessAt: string | null = null;
  protected lastError?: string;
  protected health: SourceHealth = "DOWN";

  abstract fetchObservations(params: {
    asOf?: string;
  }): Promise<PriceObservation[]>;

  async getStatus(): Promise<ProviderStatus> {
    return {
      providerId: this.id,
      name: this.name,
      health: this.health,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      isSoleFailurePoint: false,
    };
  }

  protected markSuccess(): void {
    this.lastSuccessAt = new Date().toISOString();
    this.lastError = undefined;
    this.health = "LIVE";
  }

  protected markFailure(err: unknown): void {
    this.lastError = err instanceof Error ? err.message : String(err);
    this.health = "DOWN";
  }
}
