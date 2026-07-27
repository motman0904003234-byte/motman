import express from "express";
import cors from "cors";
import { z } from "zod";
import { openDb } from "./db.js";
import { MarketService, CALIBRATION_2026_07_27 } from "./marketService.js";

export function createApp(service?: MarketService) {
  const db = openDb();
  const market = service ?? new MarketService(db);
  if (!service) {
    market.seedDemoMarket();
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "motman-fx-api", phase: "data-alerts-only" });
  });

  app.get("/v1/meta", (_req, res) => {
    res.json({
      product: "Motman FX Reference Index",
      phase: 1,
      holdsCustomerFunds: false,
      executesFx: false,
      paidRankingAllowed: false,
      corridors: market.snapshot().corridors,
      methodology:
        "ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT; Weighted Median; max 10% merchant weight",
    });
  });

  app.get("/v1/snapshot", (_req, res) => {
    res.json(market.snapshot());
  });

  app.get("/v1/calibration/2026-07-27", (_req, res) => {
    res.json({
      ...CALIBRATION_2026_07_27,
      isLive: false,
      warning: "عينة تاريخية مؤرخة — ليست سعراً حياً",
    });
  });

  const quoteSchema = z.object({
    amount: z.number().positive().max(1e12),
    fromCorridor: z.enum(["Bankak-SDG", "Cash-SDG", "MTN-MoMo-RWF", "Bank-RWF"]),
    toCorridor: z.enum(["Bankak-SDG", "Cash-SDG", "MTN-MoMo-RWF", "Bank-RWF"]),
    city: z.string().optional(),
    mode: z.enum(["calibration_aware", "live"]).optional(),
  });

  app.post("/v1/quote", (req, res) => {
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = market.quote(parsed.data);
    res.json(result);
  });

  app.get("/v1/quote", (req, res) => {
    const amount = Number(req.query.amount ?? 100_000);
    const fromCorridor = String(req.query.from ?? "Bankak-SDG") as
      | "Bankak-SDG"
      | "Cash-SDG"
      | "MTN-MoMo-RWF"
      | "Bank-RWF";
    const toCorridor = String(req.query.to ?? "MTN-MoMo-RWF") as
      | "Bankak-SDG"
      | "Cash-SDG"
      | "MTN-MoMo-RWF"
      | "Bank-RWF";
    const city = req.query.city ? String(req.query.city) : undefined;
    const mode = req.query.mode === "live" ? "live" : "calibration_aware";
    const result = market.quote({ amount, fromCorridor, toCorridor, city, mode });
    res.json(result);
  });

  app.get("/v1/history", (req, res) => {
    const limit = Math.min(500, Number(req.query.limit ?? 100));
    res.json({ ticks: market.history(limit) });
  });

  app.get("/v1/audit", (req, res) => {
    const limit = Math.min(500, Number(req.query.limit ?? 100));
    res.json({ entries: market.auditLog(limit) });
  });

  app.post("/v1/refresh", async (_req, res) => {
    const health = await market.refreshFromProviders();
    res.json({ health, snapshot: market.snapshot() });
  });

  /** Merchant local connector posts anonymized COMPLETED trades only */
  app.post("/v1/ingest/trades", (req, res) => {
    const schema = z.object({
      trades: z.array(
        z.object({
          anonymousMerchantId: z.string().min(3),
          completedAt: z.string(),
          asset: z.enum(["USD", "USDT", "USDC", "SDG", "RWF"]),
          quoteAsset: z.enum(["USD", "USDT", "USDC", "SDG", "RWF"]),
          side: z.enum(["BUY", "SELL"]),
          quantity: z.number().positive(),
          price: z.number().positive(),
          totalAmount: z.number().positive(),
          paymentMethod: z.enum(["BANKAK", "CASH_SDG", "MTN_MOMO", "BANK_RWF", "OTHER"]),
          fees: z.number().nonnegative(),
          status: z.literal("COMPLETED"),
          corridor: z.enum(["Bankak-SDG", "Cash-SDG", "MTN-MoMo-RWF", "Bank-RWF"]),
          city: z.string().optional(),
          source: z.string().default("local_trader_connector"),
          kind: z.literal("COMPLETED_TRADE").default("COMPLETED_TRADE"),
        })
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    // Reject payloads that look like they contain secrets/PII fields
    const raw = JSON.stringify(req.body).toLowerCase();
    const banned = ["password", "pin", "otp", "secret", "api_secret", "phone", "accountnumber"];
    if (banned.some((b) => raw.includes(b))) {
      res.status(400).json({
        error: "PII or secrets detected — connector must strip before upload",
      });
      return;
    }
    const saved = parsed.data.trades.map((t) => market.ingestTrade(t));
    res.json({ ingested: saved.length });
  });

  app.post("/v1/ingest/rfq", (req, res) => {
    const schema = z.object({
      corridor: z.enum(["Bankak-SDG", "Cash-SDG", "MTN-MoMo-RWF", "Bank-RWF"]),
      intermediate: z.enum(["USD", "USDT", "USDC"]),
      side: z.enum(["BUY", "SELL"]),
      price: z.number().positive(),
      availableAmount: z.number().positive(),
      minAmount: z.number().nonnegative(),
      maxAmount: z.number().positive(),
      paymentMethod: z.enum(["BANKAK", "CASH_SDG", "MTN_MOMO", "BANK_RWF", "OTHER"]),
      merchantId: z.string().min(3),
      city: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const q = market.ingestRfq(parsed.data);
    res.json(q);
  });

  app.post("/v1/demo/seed-executable", (_req, res) => {
    market.seedExecutableDemo();
    res.json({ ok: true, note: "synthetic executable depth for demos only" });
  });

  app.get("/v1/widget.js", (_req, res) => {
    res.type("application/javascript").send(`
(function(){
  var s=document.currentScript;
  var amount=s.getAttribute('data-amount')||'100000';
  var from=s.getAttribute('data-from')||'Bankak-SDG';
  var to=s.getAttribute('data-to')||'MTN-MoMo-RWF';
  var api=s.getAttribute('data-api')||'';
  var el=document.createElement('div');
  el.dir='rtl';
  el.style.cssText='font-family:Tahoma,sans-serif;padding:12px;border:1px solid #ccc';
  s.parentNode.insertBefore(el,s);
  fetch(api+'/v1/quote?amount='+amount+'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to))
    .then(r=>r.json()).then(function(j){
      el.innerHTML='<strong>'+j.display.amountLabel+'</strong><br>'+j.display.fairPriceLabel+'<br>'+j.display.executableRangeLabel+'<br>'+j.display.confidenceLabel;
    }).catch(function(){ el.textContent='تعذر تحميل المؤشر'; });
})();`);
  });

  return { app, market, db };
}
