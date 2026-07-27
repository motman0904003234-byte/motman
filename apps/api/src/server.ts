import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  AdapterRegistry,
  BindingRfqAdapter,
  BinanceP2PAdapter,
  CompletedTradesAdapter,
  FileFixtureAdapter,
  createBnrStubAdapter,
  createBokStubAdapter,
} from "@motman/adapters";
import {
  calibrationSampleQuote,
  computeGrossMargin,
  evaluateAccuracy,
  quoteCorridor,
} from "@motman/core";
import type {
  AccuracySample,
  AssetCode,
  CompletedTradeRecord,
  CorridorQuoteRequest,
  PaymentRail,
  PriceObservation,
} from "@motman/shared";
import { store } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../../data");

function buildRegistry() {
  return new AdapterRegistry([
    new CompletedTradesAdapter({ list: () => store.listTrades() }),
    new BindingRfqAdapter({ list: () => store.listRfq() }),
    new BinanceP2PAdapter(),
    createBokStubAdapter(),
    createBnrStubAdapter(),
    new FileFixtureAdapter(
      "parallel-sdg",
      "Sudan Parallel Market Feed",
      path.join(dataDir, "samples/parallel-market.json"),
      "PARALLEL_MARKET",
    ),
    new FileFixtureAdapter(
      "synthetic-market",
      "Synthetic Market (software tests only)",
      path.join(dataDir, "synthetic/market-observations.json"),
      "P2P_AD",
    ),
  ]);
}

export async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  const registry = buildRegistry();

  app.get("/health", async () => ({ ok: true, service: "motman-api", phase: "data-alerts-only" }));

  app.get("/v1/methodology", async () => ({
    executableFormula: "ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT",
    aggregation: "Weighted Median with max 10% weight per trader/linked group",
    priority: ["COMPLETED_TRADE", "BINDING_RFQ", "P2P_AD", "PARALLEL_MARKET", "OFFICIAL_BANK"],
    officialRatesUsage: "anomaly detection only — never forced as executable price",
    estimatedLabel: "سعر تقديري غير قابل للتنفيذ",
    noLiquidityLabel: "لا يوجد سعر تنفيذي حالياً",
    corridors: ["BANKAK_SDG", "CASH_SDG", "MTN_MOMO_RWF", "BANK_RWF"],
    bridges: ["USD", "USDT", "USDC"],
    phase1: "data and alerts only — no custody, no auto FX execution",
  }));

  app.get("/v1/providers", async () => {
    const { statuses } = await registry.fetchAll();
    return { providers: statuses };
  });

  app.post<{ Body: Partial<CorridorQuoteRequest> }>("/v1/quote", async (req) => {
    const body = req.body ?? {};
    const request: CorridorQuoteRequest = {
      amount: Number(body.amount ?? 100_000),
      fromAsset: (body.fromAsset as AssetCode) ?? "BANKAK_SDG",
      toAsset: (body.toAsset as AssetCode) ?? "MTN_MOMO_RWF",
      fromRail: (body.fromRail as PaymentRail) ?? "BANKAK",
      toRail: (body.toRail as PaymentRail) ?? "MTN_MOMO",
      side: body.side,
      city: body.city,
      asOf: body.asOf,
    };

    const { observations, statuses } = await registry.fetchAll(request.asOf);
    let obs = observations.filter((o) => o.sourceKind !== "SYNTHETIC_TEST");
    if (obs.length < 5) {
      const cached = await store.listObservationsCache();
      obs = [...obs, ...cached];
    }
    if (obs.length < 5) {
      obs = observations;
    }

    const quote = quoteCorridor({
      observations: obs,
      request,
      shadowRate: 25587.78,
      dynamicDealerMargin: 0.0154,
      traderExpectedBand: { low: 25200, high: 25350 },
    });

    await store.appendAudit({
      actor: "public",
      action: "quote",
      entityType: "corridor_quote",
      entityId: `${request.fromAsset}->${request.toAsset}:${request.amount}`,
      metadata: { quoteLabel: quote.metrics.quoteLabel, confidence: quote.metrics.confidenceScore },
    });

    return { quote, providers: statuses };
  });

  app.get("/v1/calibration/2026-07-27", async () => ({
    note: "عينة معايرة مؤرخة — ليست سعراً حياً ولا إثبات دقة بمفردها",
    quote: calibrationSampleQuote(),
  }));

  app.post<{
    Body: {
      trades: Array<Omit<CompletedTradeRecord, "status"> & { traderAnonId: string }>;
    };
  }>("/v1/trader/trades", async (req) => {
    const trades = (req.body?.trades ?? []).map((t) => ({
      tradeTime: t.tradeTime,
      asset: t.asset,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      totalAmount: t.totalAmount,
      paymentMethod: t.paymentMethod,
      fees: t.fees,
      status: "COMPLETED" as const,
      traderAnonId: t.traderAnonId,
      sourceId: t.sourceId ?? "trader-upload",
      city: t.city,
      isSynthetic: t.isSynthetic ?? false,
    }));
    const n = await store.addTrades(trades);
    await store.appendAudit({
      actor: "trader",
      action: "upload_completed_trades",
      entityType: "completed_trade_batch",
      entityId: String(n),
    });
    return { accepted: n };
  });

  app.post<{ Body: { quotes: PriceObservation[] } }>("/v1/trader/rfq", async (req) => {
    const rows = (req.body?.quotes ?? []).map((q) => ({
      ...q,
      sourceKind: "BINDING_RFQ" as const,
    }));
    const n = await store.addRfq(rows);
    await store.appendAudit({
      actor: "trader",
      action: "upload_binding_rfq",
      entityType: "rfq_batch",
      entityId: String(n),
    });
    return { accepted: n };
  });

  app.post<{
    Body: {
      sellPrice: number;
      buyPrice: number;
      costs?: Record<string, number>;
    };
  }>("/v1/trader/margin", async (req) => {
    const { sellPrice, buyPrice, costs } = req.body ?? { sellPrice: 0, buyPrice: 0 };
    return computeGrossMargin(sellPrice, buyPrice, costs);
  });

  app.get("/v1/history", async () => {
    const trades = await store.listTrades();
    return {
      points: trades
        .filter((t) => t.status === "COMPLETED")
        .map((t) => ({
          t: t.tradeTime,
          price: t.price,
          amount: t.totalAmount,
          rail: t.paymentMethod,
          side: t.side,
          synthetic: Boolean(t.isSynthetic),
        })),
    };
  });

  app.post<{ Body: { samples: AccuracySample[] } }>("/v1/accuracy/evaluate", async (req) => {
    const samples = req.body?.samples ?? [];
    return { report: evaluateAccuracy(samples) };
  });

  app.get("/v1/audit", async () => ({ events: await store.listAudit() }));

  app.post("/v1/admin/refresh", async () => {
    const { observations, statuses } = await registry.fetchAll();
    const durable = observations.filter((o) => !o.isSynthetic && o.sourceKind !== "SYNTHETIC_TEST");
    await store.saveObservationsCache(durable.length ? durable : observations);
    await store.appendAudit({
      actor: "system",
      action: "refresh_observations",
      entityType: "observations_cache",
      entityId: String(observations.length),
    });
    return { count: observations.length, providers: statuses };
  });

  return app;
}
