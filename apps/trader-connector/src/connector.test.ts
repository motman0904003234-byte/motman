import { describe, expect, it } from "vitest";
import {
  sanitizeTrade,
  assertNoSecrets,
  anonymizeMerchantId,
} from "./connector.js";

describe("local connector sanitizer", () => {
  it("keeps only completed anonymized fields", () => {
    const out = sanitizeTrade(
      {
        orderNumber: "123",
        createTime: Date.parse("2026-07-20T10:00:00Z"),
        asset: "USDT",
        fiatUnit: "SDG",
        tradeType: "BUY",
        amount: "50",
        price: "1450",
        totalPrice: "72500",
        payMethodName: "Bank of Khartoum",
        commission: "0.1",
        orderStatus: "COMPLETED",
        counterPartyName: "SHOULD_BE_DROPPED",
        phone: "SHOULD_BE_DROPPED",
      },
      "key-abc"
    );
    expect(out).not.toBeNull();
    expect(out!.status).toBe("COMPLETED");
    expect(out!.paymentMethod).toBe("BANKAK");
    expect(JSON.stringify(out)).not.toContain("SHOULD_BE_DROPPED");
    expect(out!.anonymousMerchantId).toBe(anonymizeMerchantId("key-abc"));
  });

  it("drops non-completed", () => {
    expect(
      sanitizeTrade(
        {
          createTime: Date.now(),
          asset: "USDT",
          tradeType: "BUY",
          amount: 1,
          price: 1,
          orderStatus: "PENDING",
        },
        "k"
      )
    ).toBeNull();
  });

  it("blocks secret-looking payloads", () => {
    expect(() => assertNoSecrets({ api_secret: "x" })).toThrow();
  });
});
