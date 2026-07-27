import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "./db.js";
import { MarketService } from "./marketService.js";
import { createApp } from "./app.js";

describe("API integration", () => {
  let app: ReturnType<typeof createApp>["app"];
  let market: MarketService;

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "motman-"));
    const db = openDb(path.join(dir, "t.sqlite"));
    market = new MarketService(db);
    market.seedDemoMarket(new Date("2026-07-27T12:00:00Z"));
    ({ app } = createApp(market));
  });

  it("health & meta", async () => {
    const h = await request(app).get("/health");
    expect(h.status).toBe(200);
    expect(h.body.holdsCustomerFunds).toBeUndefined();
    const m = await request(app).get("/v1/meta");
    expect(m.body.holdsCustomerFunds).toBe(false);
    expect(m.body.executesFx).toBe(false);
    expect(m.body.paidRankingAllowed).toBe(false);
  });

  it("returns no invented executable on one-sided 100k Bankak", async () => {
    const res = await request(app)
      .get("/v1/quote")
      .query({ amount: 100000, from: "Bankak-SDG", to: "MTN-MoMo-RWF", mode: "calibration_aware" });
    expect(res.status).toBe(200);
    expect(res.body.display.amountLabel).toContain("100,000");
    expect(res.body.components.rateLabel).not.toBe("EXECUTABLE");
    expect(
      res.body.display.executableRangeLabel.includes("لا يوجد") ||
        res.body.display.executableRangeLabel.includes("تقديري")
    ).toBe(true);
    expect(res.body.components.fairPrice).toBeGreaterThan(20_000);
  });

  it("rejects PII in trade ingest", async () => {
    const res = await request(app)
      .post("/v1/ingest/trades")
      .send({ trades: [], password: "x" });
    expect(res.status).toBe(400);
  });

  it("accepts anonymized completed trade", async () => {
    const res = await request(app)
      .post("/v1/ingest/trades")
      .send({
        trades: [
          {
            anonymousMerchantId: "merchant-local-1",
            completedAt: "2026-07-26T10:00:00Z",
            asset: "USDT",
            quoteAsset: "SDG",
            side: "BUY",
            quantity: 50,
            price: 1450,
            totalAmount: 72500,
            paymentMethod: "BANKAK",
            fees: 0.1,
            status: "COMPLETED",
            corridor: "Bankak-SDG",
            kind: "COMPLETED_TRADE",
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.ingested).toBe(1);
  });

  it("calibration endpoint is not live", async () => {
    const res = await request(app).get("/v1/calibration/2026-07-27");
    expect(res.body.isLive).toBe(false);
    expect(res.body.theoreticalObservedRwf).toBe(25587.78);
  });

  it("executable demo can produce EXECUTABLE label", async () => {
    market.seedExecutableDemo(new Date("2026-07-27T12:00:00Z"));
    const res = await request(app)
      .get("/v1/quote")
      .query({ amount: 100000, from: "Bankak-SDG", to: "MTN-MoMo-RWF", mode: "live" });
    expect(res.body.components.rateLabel).toBe("EXECUTABLE");
    expect(res.body.display.executableRangeLabel).toContain("RWF");
  });
});
