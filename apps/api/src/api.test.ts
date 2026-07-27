import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";

describe("api integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("methodology", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/methodology" });
    expect(res.json().executableFormula).toContain("ExecutableBid_RWF_USDT");
  });

  it("quote endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/quote",
      payload: {
        amount: 100000,
        fromAsset: "BANKAK_SDG",
        toAsset: "MTN_MOMO_RWF",
        fromRail: "BANKAK",
        toRail: "MTN_MOMO",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.quote.display.amountLine).toContain("Bankak-SDG");
    expect(body.quote.metrics.quoteLabel).toBeTruthy();
  });

  it("calibration is marked non-live", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/calibration/2026-07-27" });
    expect(res.json().quote.isCalibrationOnly).toBe(true);
  });

  it("rejects inventing net margin without costs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/trader/margin",
      payload: { sellPrice: 100, buyPrice: 90 },
    });
    expect(res.json().labeledAs).toBe("GROSS_ONLY");
  });
});
