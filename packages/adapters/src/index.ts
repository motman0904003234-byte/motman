import type { ProviderAdapter } from "./base.js";
import type { PriceObservation, ProviderStatus } from "@motman/shared";

/**
 * Fan-out across independent adapters. One unofficial source failure never blocks others.
 */
export class AdapterRegistry {
  constructor(private readonly adapters: ProviderAdapter[]) {}

  async fetchAll(asOf?: string): Promise<{
    observations: PriceObservation[];
    statuses: ProviderStatus[];
  }> {
    const settled = await Promise.all(
      this.adapters.map(async (a) => {
        const observations = await a.fetchObservations({ asOf });
        const status = await a.getStatus();
        return { observations, status };
      }),
    );
    return {
      observations: settled.flatMap((s) => s.observations),
      statuses: settled.map((s) => s.status),
    };
  }
}

export * from "./base.js";
export * from "./binance-p2p.js";
export * from "./official-bank.js";
export * from "./completed-trades.js";
