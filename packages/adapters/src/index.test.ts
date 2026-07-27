import { describe, expect, it } from "vitest";
import { AdapterRegistry, BinanceP2PAdapter } from "./index.js";
import type { PriceObservation } from "@motman/shared";
import { BaseAdapter } from "./base.js";

class OkAdapter extends BaseAdapter {
  readonly id = "ok";
  readonly name = "OK";
  async fetchObservations(): Promise<PriceObservation[]> {
    this.markSuccess();
    return [
      {
        id: "1",
        sourceId: "ok",
        sourceKind: "P2P_AD",
        assetBase: "USDT",
        assetQuote: "BANKAK_SDG",
        paymentRail: "BANKAK",
        side: "SELL",
        price: 1,
        quantity: 1,
        totalAmount: 1,
        observedAt: new Date().toISOString(),
        executableUpTo: 1,
      },
    ];
  }
}

class FailAdapter extends BaseAdapter {
  readonly id = "fail";
  readonly name = "FAIL";
  async fetchObservations(): Promise<PriceObservation[]> {
    this.markFailure(new Error("boom"));
    return [];
  }
}

describe("adapter isolation", () => {
  it("continues when one provider fails", async () => {
    const registry = new AdapterRegistry([new OkAdapter(), new FailAdapter()]);
    const { observations, statuses } = await registry.fetchAll();
    expect(observations.length).toBe(1);
    expect(statuses.find((s) => s.providerId === "fail")?.health).toBe("DOWN");
    expect(statuses.find((s) => s.providerId === "ok")?.health).toBe("LIVE");
  });

  it("binance adapter returns empty on fetch error without throwing", async () => {
    const adapter = new BinanceP2PAdapter(async () => {
      throw new Error("network");
    });
    const rows = await adapter.fetchObservations();
    expect(rows).toEqual([]);
    const status = await adapter.getStatus();
    expect(status.health).toBe("DOWN");
    expect(status.isSoleFailurePoint).toBe(false);
  });
});
