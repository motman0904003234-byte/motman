import { describe, expect, it } from "vitest";
import {
  executeAgainstDepth,
  executableCrossRate,
  estimatedNonExecutableRate,
  weightedMedian,
  percentageError,
  computeGrossMargin,
  quoteCorridor,
  evaluateAccuracy,
  calibrationSampleQuote,
  filterOutliers,
} from "./index.js";

describe("depth execution", () => {
  it("fills full amount with VWAP across levels", () => {
    const res = executeAgainstDepth(
      [
        { price: 10, quantity: 40, traderAnonId: "a", sourceId: "s", sourceKind: "P2P_AD" },
        { price: 11, quantity: 80, traderAnonId: "b", sourceId: "s", sourceKind: "P2P_AD" },
      ],
      100,
      "BUY",
    );
    expect(res.filled).toBe(true);
    expect(res.vwap).toBeCloseTo((40 * 10 + 60 * 11) / 100, 6);
    expect(res.independentTraders).toBe(2);
  });

  it("reports unfilled when liquidity insufficient", () => {
    const res = executeAgainstDepth(
      [{ price: 10, quantity: 20, traderAnonId: "a", sourceId: "s", sourceKind: "P2P_AD" }],
      100,
      "BUY",
    );
    expect(res.filled).toBe(false);
  });
});

describe("cross rate & estimate", () => {
  it("computes ExecutableBid/Ask", () => {
    expect(executableCrossRate(1509.68, 5900)).toBeCloseTo(0.255878, 5);
  });

  it("applies dealer margin for non-executable estimate", () => {
    expect(estimatedNonExecutableRate(25587.78, 0.0154)).toBeCloseTo(25587.78 * (1 - 0.0154), 4);
  });
});

describe("weighted median caps", () => {
  it("caps a dominant trader at 10%", () => {
    const points = [
      { value: 100, weight: 1000, traderAnonId: "whale" },
      { value: 200, weight: 10, traderAnonId: "a" },
      { value: 200, weight: 10, traderAnonId: "b" },
      { value: 200, weight: 10, traderAnonId: "c" },
      { value: 200, weight: 10, traderAnonId: "d" },
      { value: 200, weight: 10, traderAnonId: "e" },
      { value: 200, weight: 10, traderAnonId: "f" },
      { value: 200, weight: 10, traderAnonId: "g" },
      { value: 200, weight: 10, traderAnonId: "h" },
      { value: 200, weight: 10, traderAnonId: "i" },
    ];
    const m = weightedMedian(points);
    expect(m).toBe(200);
  });
});

describe("margin & error", () => {
  it("shows gross only when costs missing", () => {
    const m = computeGrossMargin(100, 90);
    expect(m.labeledAs).toBe("GROSS_ONLY");
    expect(m.grossMargin).toBe(10);
    expect(m.netMargin).toBeUndefined();
  });

  it("percentage error definition", () => {
    expect(percentageError(25200, 25587.78)).toBeCloseTo(
      (Math.abs(25200 - 25587.78) / 25587.78) * 100,
      6,
    );
  });
});

describe("quote corridor", () => {
  it("returns executable quote when both sides have depth", () => {
    const now = new Date().toISOString();
    const observations = [] as any[];
    for (let i = 0; i < 8; i++) {
      observations.push({
        id: `a${i}`,
        sourceId: "s",
        sourceKind: "P2P_AD",
        traderAnonId: `t${i}`,
        assetBase: "USDT",
        assetQuote: "BANKAK_SDG",
        paymentRail: "BANKAK",
        side: "SELL",
        price: 5900 + i,
        quantity: 20,
        totalAmount: 100000,
        observedAt: now,
        executableUpTo: 150000,
        completionRate: 0.95,
        rating: 98,
      });
      observations.push({
        id: `b${i}`,
        sourceId: "s",
        sourceKind: "P2P_AD",
        traderAnonId: `r${i}`,
        assetBase: "USDT",
        assetQuote: "MTN_MOMO_RWF",
        paymentRail: "MTN_MOMO",
        side: "BUY",
        price: 1510 - i * 0.2,
        quantity: 50,
        totalAmount: 50000,
        observedAt: now,
        executableUpTo: 50,
        completionRate: 0.95,
        rating: 98,
      });
    }
    const q = quoteCorridor({
      observations,
      request: {
        amount: 100000,
        fromAsset: "BANKAK_SDG",
        toAsset: "MTN_MOMO_RWF",
        fromRail: "BANKAK",
        toRail: "MTN_MOMO",
      },
    });
    expect(q.metrics.quoteLabel).toBe("EXECUTABLE");
    expect(q.metrics.fairRate).toBeGreaterThan(1000);
    expect(q.display.executableLine).toContain("السعر التنفيذي");
    expect(q.metrics.fairRate!).toBeCloseTo(
      (q.metrics.bid! / q.metrics.ask!) * 100000,
      0,
    );
  });

  it("labels one-sided liquidity as estimated non-executable", () => {
    const now = new Date().toISOString();
    const observations = [
      {
        id: "only-ask",
        sourceId: "s",
        sourceKind: "P2P_AD",
        traderAnonId: "t1",
        assetBase: "USDT",
        assetQuote: "BANKAK_SDG",
        paymentRail: "BANKAK",
        side: "SELL",
        price: 5900,
        quantity: 20,
        totalAmount: 100000,
        observedAt: now,
        executableUpTo: 150000,
        completionRate: 0.95,
        rating: 98,
      },
    ] as any[];
    const q = quoteCorridor({
      observations,
      request: {
        amount: 100000,
        fromAsset: "BANKAK_SDG",
        toAsset: "MTN_MOMO_RWF",
        fromRail: "BANKAK",
        toRail: "MTN_MOMO",
      },
      shadowRate: 25587.78,
      dynamicDealerMargin: 0.0154,
    });
    expect(q.metrics.quoteLabel).toBe("ESTIMATED_NON_EXECUTABLE");
    expect(q.display.executableLine).toContain("تقديري غير قابل للتنفيذ");
  });

  it("says no executable price when nothing available", () => {
    const q = quoteCorridor({
      observations: [],
      request: {
        amount: 100000,
        fromAsset: "BANKAK_SDG",
        toAsset: "MTN_MOMO_RWF",
        fromRail: "BANKAK",
        toRail: "MTN_MOMO",
      },
    });
    expect(q.metrics.quoteLabel).toBe("NO_EXECUTABLE_LIQUIDITY");
    expect(q.display.executableLine).toBe("لا يوجد سعر تنفيذي حالياً");
  });
});

describe("calibration sample", () => {
  it("is clearly non-live", () => {
    const c = calibrationSampleQuote();
    expect(c.isCalibrationOnly).toBe(true);
    expect(c.metrics.theoreticalRate).toBeCloseTo(25587.78, 2);
  });
});

describe("accuracy harness", () => {
  it("does not claim live accuracy on synthetic-only samples", () => {
    const samples = Array.from({ length: 320 }, (_, i) => ({
      id: `s${i}`,
      predictedPrice: 25500,
      actualCompletedPrice: 25200 + (i % 7),
      corridor: "BANKAK->MTN",
      amountBucket: (["100k", "500k", "1m_plus"] as const)[i % 3]!,
      side: (i % 2 === 0 ? "BUY" : "SELL") as "BUY" | "SELL",
      paymentRail: (i % 2 === 0 ? "BANKAK" : "MTN_MOMO") as "BANKAK" | "MTN_MOMO",
      traderAnonId: `trader_${(i % 12) + 1}`,
      tradeTime: `2026-07-${String((i % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
      usedFutureData: false,
      isSynthetic: true,
    }));
    const report = evaluateAccuracy(samples);
    expect(report.syntheticOnly).toBe(true);
    expect(report.disclaimer).toMatch(/اصطناعية/);
    expect(report.sampleCount).toBe(320);
    expect(report.independentTraders).toBe(12);
  });

  it("excludes future leakage", () => {
    const report = evaluateAccuracy([
      {
        id: "1",
        predictedPrice: 1,
        actualCompletedPrice: 1,
        corridor: "x",
        amountBucket: "100k",
        side: "BUY",
        paymentRail: "BANKAK",
        traderAnonId: "t",
        tradeTime: "2026-01-01T00:00:00.000Z",
        usedFutureData: true,
        isSynthetic: false,
      },
    ]);
    expect(report.sampleCount).toBe(0);
    expect(report.excludedFutureLeakage).toBe(1);
  });
});

describe("outliers", () => {
  it("filters extreme ads", () => {
    const filtered = filterOutliers([10, 11, 10.5, 10.2, 1000]);
    expect(filtered.includes(1000)).toBe(false);
  });
});
