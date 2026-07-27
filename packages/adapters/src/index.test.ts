import { describe, expect, it } from "vitest";
import { anonymizeMerchant } from "./merchantIngest.js";
import { BaseAdapter } from "./base.js";
import type { MarketQuote } from "@motman/shared";

class Flaky extends BaseAdapter {
  readonly name = "flaky";
  readonly priority = 99;
  async fetchQuotes(): Promise<MarketQuote[]> {
    return this.fail(new Error("down"));
  }
}

class Ok extends BaseAdapter {
  readonly name = "ok";
  readonly priority = 1;
  async fetchQuotes(): Promise<MarketQuote[]> {
    return this.ok([
      {
        id: "1",
        source: "ok",
        kind: "ADVERTISEMENT",
        corridor: "Bankak-SDG",
        intermediate: "USDT",
        side: "SELL",
        price: 100,
        availableAmount: 10,
        minAmount: 0,
        maxAmount: 100,
        paymentMethod: "BANKAK",
        merchantId: "m1",
        observedAt: new Date().toISOString(),
        isBinding: false,
      },
    ]);
  }
}

describe("adapters independence", () => {
  it("anonymizes merchant ids", () => {
    expect(anonymizeMerchant("raw")).toHaveLength(24);
    expect(anonymizeMerchant("raw")).toBe(anonymizeMerchant("raw"));
  });

  it("soft-fails without poisoning other adapters", async () => {
    const bad = new Flaky();
    const good = new Ok();
    expect(await bad.fetchQuotes()).toEqual([]);
    expect(bad.health().status).toBe("DOWN");
    expect(bad.health().isSoleFailurePoint).toBe(false);
    const q = await good.fetchQuotes();
    expect(q).toHaveLength(1);
    expect(good.health().status).toBe("LIVE");
  });
});
