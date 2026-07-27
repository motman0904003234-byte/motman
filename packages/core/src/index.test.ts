import { describe, expect, it } from "vitest";
import {
  weightedMedian,
  capMerchantWeights,
  percentageError,
  executableCrossRate,
  estimatedNonExecutableRate,
  executableVwap,
  priceQuote,
  evaluateAccuracy,
  grossMargin,
  netOrGrossOnly,
  filterOutliers,
  KIND_WEIGHTS,
} from "./index.js";
import type { MarketQuote } from "@motman/shared";

describe("weightedMedian + merchant cap", () => {
  it("caps a dominant merchant at 10%", () => {
    const obs = [
      { value: 100, weight: 100, merchantId: "a", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "b", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "c", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "d", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "e", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "f", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "g", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "h", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "i", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "j", kindWeight: 1 },
      { value: 200, weight: 1, merchantId: "k", kindWeight: 1 },
    ];
    const capped = capMerchantWeights(obs);
    const total = capped.reduce((s, o) => s + o.weight * o.kindWeight, 0);
    const aShare =
      capped.filter((o) => o.merchantId === "a").reduce((s, o) => s + o.weight * o.kindWeight, 0) /
      total;
    expect(aShare).toBeLessThanOrEqual(0.1001);
  });

  it("computes weighted median", () => {
    const m = weightedMedian([
      { value: 10, weight: 1, merchantId: "a", kindWeight: 1 },
      { value: 20, weight: 1, merchantId: "b", kindWeight: 1 },
      { value: 30, weight: 1, merchantId: "c", kindWeight: 1 },
    ]);
    expect(m).toBe(20);
  });
});

describe("cross rate formulas", () => {
  it("ExecutableRate = Bid_RWF / Ask_SDG", () => {
    // Calibration-inspired: theoretical total 25587.78 for 100k SDG → unit 0.2558778
    const askSdg = 1450; // SDG per USDT
    const bidRwf = askSdg * 0.2558778;
    const unit = executableCrossRate(bidRwf, askSdg)!;
    expect(unit * 100_000).toBeCloseTo(25_587.78, 1);
  });

  it("labels estimated rate formula", () => {
    const est = estimatedNonExecutableRate(0.2558778, 0.0154)!;
    expect(est).toBeCloseTo(0.2558778 * (1 - 0.0154), 6);
  });
});

describe("executable depth", () => {
  const mk = (partial: Partial<MarketQuote> & Pick<MarketQuote, "id" | "price" | "availableAmount" | "side">): MarketQuote => ({
    source: "test",
    kind: "ADVERTISEMENT",
    corridor: "Bankak-SDG",
    intermediate: "USDT",
    minAmount: 0,
    maxAmount: 1e12,
    paymentMethod: "BANKAK",
    merchantId: partial.id,
    observedAt: new Date().toISOString(),
    isBinding: false,
    ...partial,
  });

  it("requires full fill — not top of book only", () => {
    const quotes = [
      mk({ id: "1", side: "BUY", price: 100, availableAmount: 10 }),
      mk({ id: "2", side: "BUY", price: 110, availableAmount: 90 }),
    ];
    const r = executableVwap(quotes, "BUY", 100)!;
    expect(r.vwap).toBeCloseTo((10 * 100 + 90 * 110) / 100, 5);
    expect(executableVwap(quotes, "BUY", 200)).toBeNull();
  });
});

describe("percentage error definition", () => {
  it("matches acceptance formula", () => {
    expect(percentageError(25200, 25587.78)).toBeCloseTo(
      (Math.abs(25200 - 25587.78) / 25587.78) * 100,
      5
    );
  });
});

describe("margins — never invent net", () => {
  it("returns gross only when costs missing", () => {
    const r = netOrGrossOnly(100, 90, { binanceFees: 1 });
    expect(r.netAvailable).toBe(false);
    expect(r.label).toContain("تقديرًا");
    expect(r.grossMargin).toBe(10);
  });

  it("computes net when all costs present", () => {
    const r = netOrGrossOnly(100, 90, {
      binanceFees: 1,
      bankakFees: 1,
      mobileMoneyFees: 1,
      liquidityCosts: 1,
      cashOutPremium: 1,
      inventoryRisk: 1,
      disputeLosses: 1,
    });
    expect(r.netAvailable).toBe(true);
    expect(r.netMargin).toBe(3);
  });
});

describe("pricing engine — one-sided liquidity", () => {
  it("does not invent executable price when sell side missing", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const asks: MarketQuote[] = Array.from({ length: 20 }, (_, i) => ({
      id: `a${i}`,
      source: "binance_p2p",
      kind: "ADVERTISEMENT" as const,
      corridor: "Bankak-SDG" as const,
      intermediate: "USDT" as const,
      side: "SELL" as const,
      price: 1450 + i,
      availableAmount: 50,
      minAmount: 10,
      maxAmount: 500,
      paymentMethod: "BANKAK" as const,
      merchantId: `m${i}`,
      merchantCompletionRate: 0.95,
      merchantRating: 0.98,
      observedAt: now.toISOString(),
      isBinding: false,
    }));
    // No RWF bids that can fill → estimated or no liquidity
    const result = priceQuote({
      request: {
        amount: 100_000,
        fromCorridor: "Bankak-SDG",
        toCorridor: "MTN-MoMo-RWF",
      },
      sdgUsdtQuotes: asks,
      rwfUsdtQuotes: [],
      completedTrades: [],
      now,
      shadowRatePerSdg: 0.2558778,
      dynamicDealerMargin: 0.0154,
      traderExpectedTotalRwf: 25_200,
    });
    expect(result.components.rateLabel).not.toBe("EXECUTABLE");
    expect(result.display.executableRangeLabel).toMatch(/تقديري|لا يوجد/);
  });

  it("matches calibration display shape for 100k Bankak", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const ask = 1450;
    const bid = ask * 0.2558778;
    const sdg: MarketQuote[] = Array.from({ length: 14 }, (_, i) => ({
      id: `s${i}`,
      source: "binance_p2p",
      kind: i < 3 ? ("COMPLETED_TRADE" as const) : ("ADVERTISEMENT" as const),
      corridor: "Bankak-SDG" as const,
      intermediate: "USDT" as const,
      side: "SELL" as const,
      price: ask + (i % 3),
      availableAmount: 200,
      minAmount: 10,
      maxAmount: 1000,
      paymentMethod: "BANKAK" as const,
      merchantId: `sm${i}`,
      merchantCompletionRate: 0.99,
      merchantRating: 0.99,
      observedAt: now.toISOString(),
      isBinding: i < 2,
    }));
    const rwf: MarketQuote[] = Array.from({ length: 14 }, (_, i) => ({
      id: `r${i}`,
      source: "binance_p2p",
      kind: "ADVERTISEMENT" as const,
      corridor: "MTN-MoMo-RWF" as const,
      intermediate: "USDT" as const,
      side: "BUY" as const,
      price: bid + (i % 2),
      availableAmount: 200,
      minAmount: 10,
      maxAmount: 1000,
      paymentMethod: "MTN_MOMO" as const,
      merchantId: `rm${i}`,
      merchantCompletionRate: 0.99,
      merchantRating: 0.99,
      observedAt: now.toISOString(),
      isBinding: false,
    }));
    const result = priceQuote({
      request: {
        amount: 100_000,
        fromCorridor: "Bankak-SDG",
        toCorridor: "MTN-MoMo-RWF",
      },
      sdgUsdtQuotes: sdg,
      rwfUsdtQuotes: rwf,
      completedTrades: [],
      now,
      traderExpectedTotalRwf: 25_200,
    });
    expect(result.components.fairPrice).toBeGreaterThan(25_000);
    expect(result.components.fairPrice).toBeLessThan(26_500);
    expect(result.components.independentMerchants).toBeGreaterThanOrEqual(10);
    expect(result.display.amountLabel).toContain("100,000");
  });
});

describe("accuracy gate — refuses to claim with synthetic-only", () => {
  it("flags insufficient real samples", () => {
    const report = evaluateAccuracy([
      {
        predictedPrice: 100,
        actualCompletedPrice: 100,
        completedAt: "2026-01-01",
        amountBucket: "100k",
        corridorPair: "Bankak-SDG>MTN-MoMo-RWF",
        side: "BUY",
        isSynthetic: true,
      },
    ]);
    expect(report.sampleCount).toBe(0);
    expect(report.meetsMinimum90).toBe(false);
    expect(report.caveats.some((c) => c.includes("300"))).toBe(true);
  });
});

describe("kind weights ordering", () => {
  it("completed > binding > ads", () => {
    expect(KIND_WEIGHTS.COMPLETED_TRADE).toBeGreaterThan(KIND_WEIGHTS.BINDING_RFQ);
    expect(KIND_WEIGHTS.BINDING_RFQ).toBeGreaterThan(KIND_WEIGHTS.ADVERTISEMENT);
  });
});

describe("outlier filter", () => {
  it("drops extreme prices", () => {
    const base = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`,
      source: "t",
      kind: "ADVERTISEMENT" as const,
      corridor: "Bankak-SDG" as const,
      intermediate: "USDT" as const,
      side: "SELL" as const,
      price: 1000 + i,
      availableAmount: 10,
      minAmount: 0,
      maxAmount: 100,
      paymentMethod: "BANKAK" as const,
      merchantId: `m${i}`,
      observedAt: new Date().toISOString(),
      isBinding: false,
    }));
    base.push({ ...base[0]!, id: "x", price: 50_000, merchantId: "whale" });
    const filtered = filterOutliers(base);
    expect(filtered.every((q) => q.price < 2000)).toBe(true);
  });
});

describe("gross margin", () => {
  it("sell - buy", () => {
    expect(grossMargin(25587.78, 25200).grossMargin).toBeCloseTo(387.78, 2);
  });
});
