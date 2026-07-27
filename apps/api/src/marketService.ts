import type { Corridor, MarketQuote, AnonymizedTrade, PricingResult } from "@motman/shared";
import { AdapterRegistry } from "@motman/adapters";
import { priceQuote } from "@motman/core";
import type { MotmanDb } from "./db.js";
import { audit } from "./db.js";

/** Dated calibration sample — NOT live price */
export const CALIBRATION_2026_07_27 = {
  date: "2026-07-27",
  amount: 100_000,
  from: "Bankak-SDG" as Corridor,
  to: "MTN-MoMo-RWF" as Corridor,
  theoreticalObservedRwf: 25_587.78,
  fieldTraderRwf: 25_200,
  spreadPct: 1.54,
  grossDealerMarginPct: 1.54,
  bankakBuyAdsObserved: 180,
  sellAdsAccepting100k: 0,
  note: "عينة تاريخية مؤرخة — ليست سعراً حياً ولا إثباتاً وحدها للدقة",
};

export class MarketService {
  readonly registry = new AdapterRegistry();
  private cache: MarketQuote[] = [];
  private lastRefresh: string | null = null;

  constructor(private readonly db: MotmanDb) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO calibration_samples (id, payload, is_live) VALUES (?, ?, 0)"
      )
      .run("2026-07-27", JSON.stringify(CALIBRATION_2026_07_27));
  }

  /** Seed demo quotes clearly marked — for software tests / empty-market UX only */
  seedDemoMarket(now = new Date()) {
    const ask = 1450;
    const unit = CALIBRATION_2026_07_27.theoreticalObservedRwf / 100_000;
    const bid = ask * unit;
    const quotes: MarketQuote[] = [];

    // 180 buy ads Bankak (merchant BUY crypto = bid for USDT) — matches observation
    for (let i = 0; i < 180; i++) {
      quotes.push({
        id: `demo-sdg-bid-${i}`,
        source: "demo_seed",
        kind: "ADVERTISEMENT",
        corridor: "Bankak-SDG",
        intermediate: "USDT",
        side: "BUY",
        price: ask - 5 + (i % 7),
        availableAmount: 20 + (i % 30),
        minAmount: 10,
        maxAmount: 80,
        paymentMethod: "BANKAK",
        merchantId: `demo-sm-${i % 40}`,
        merchantCompletionRate: 0.9 + (i % 10) / 100,
        merchantRating: 0.92,
        observedAt: now.toISOString(),
        isBinding: false,
      });
    }
    // Sell side: NO ads accepting 100k SDG ticket (max too small) — one-sided liquidity
    for (let i = 0; i < 12; i++) {
      quotes.push({
        id: `demo-sdg-ask-small-${i}`,
        source: "demo_seed",
        kind: "ADVERTISEMENT",
        corridor: "Bankak-SDG",
        intermediate: "USDT",
        side: "SELL",
        price: ask + (i % 5),
        availableAmount: 15,
        minAmount: 5,
        maxAmount: 40, // cannot fill ~69 USDT for 100k SDG
        paymentMethod: "BANKAK",
        merchantId: `demo-sa-${i}`,
        merchantCompletionRate: 0.95,
        merchantRating: 0.97,
        observedAt: now.toISOString(),
        isBinding: false,
      });
    }
    // RWF MoMo bids with depth
    for (let i = 0; i < 20; i++) {
      quotes.push({
        id: `demo-rwf-bid-${i}`,
        source: "demo_seed",
        kind: "ADVERTISEMENT",
        corridor: "MTN-MoMo-RWF",
        intermediate: "USDT",
        side: "BUY",
        price: bid + (i % 3),
        availableAmount: 100,
        minAmount: 10,
        maxAmount: 500,
        paymentMethod: "MTN_MOMO",
        merchantId: `demo-rm-${i}`,
        merchantCompletionRate: 0.96,
        merchantRating: 0.98,
        observedAt: now.toISOString(),
        isBinding: false,
      });
    }

    this.cache = quotes;
    this.lastRefresh = now.toISOString();
    for (const q of quotes) {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO quotes (id, payload, observed_at, source, corridor) VALUES (?, ?, ?, ?, ?)"
        )
        .run(q.id, JSON.stringify(q), q.observedAt, q.source, q.corridor);
    }
    audit(this.db, "seed_demo_market", {
      count: quotes.length,
      synthetic: true,
      note: "بيانات تجريبية للبرمجيات فقط — مميزة بوضوح",
    });
  }

  /** Separate seed with full executable depth for happy-path demos */
  seedExecutableDemo(now = new Date()) {
    const ask = 1450;
    const unit = CALIBRATION_2026_07_27.theoreticalObservedRwf / 100_000;
    const bid = ask * unit;
    const quotes: MarketQuote[] = [];
    for (let i = 0; i < 14; i++) {
      quotes.push({
        id: `exec-sdg-${i}`,
        source: "demo_seed_executable",
        kind: i < 2 ? "BINDING_RFQ" : "ADVERTISEMENT",
        corridor: "Bankak-SDG",
        intermediate: "USDT",
        side: "SELL",
        price: ask + (i % 3),
        availableAmount: 200,
        minAmount: 5,
        maxAmount: 1000,
        paymentMethod: "BANKAK",
        merchantId: `exec-sm-${i}`,
        merchantCompletionRate: 0.99,
        merchantRating: 0.99,
        observedAt: now.toISOString(),
        isBinding: i < 2,
      });
      quotes.push({
        id: `exec-rwf-${i}`,
        source: "demo_seed_executable",
        kind: "ADVERTISEMENT",
        corridor: "MTN-MoMo-RWF",
        intermediate: "USDT",
        side: "BUY",
        price: bid + (i % 2) * 0.5,
        availableAmount: 200,
        minAmount: 5,
        maxAmount: 1000,
        paymentMethod: "MTN_MOMO",
        merchantId: `exec-rm-${i}`,
        merchantCompletionRate: 0.99,
        merchantRating: 0.99,
        observedAt: now.toISOString(),
        isBinding: false,
      });
    }
    this.cache = [...this.cache.filter((q) => !q.id.startsWith("exec-")), ...quotes];
    this.lastRefresh = now.toISOString();
  }

  async refreshFromProviders() {
    const { quotes, health } = await this.registry.collectQuotes();
    if (quotes.length > 0) {
      // merge live provider quotes on top of cache, keep demo if providers empty for that corridor
      const bySource = new Map(quotes.map((q) => [q.id, q]));
      const keptDemo = this.cache.filter((q) => q.source.startsWith("demo_"));
      this.cache = [...keptDemo.filter((q) => !bySource.has(q.id)), ...quotes];
      this.lastRefresh = new Date().toISOString();
    }
    audit(this.db, "refresh_providers", { health, count: quotes.length });
    return health;
  }

  quote(opts: {
    amount: number;
    fromCorridor: Corridor;
    toCorridor: Corridor;
    city?: string;
    mode?: "calibration_aware" | "live";
  }): PricingResult {
    const sdg = this.cache.filter(
      (q) => q.corridor === opts.fromCorridor || q.paymentMethod === "BANKAK" || q.paymentMethod === "CASH_SDG"
    ).filter((q) => q.corridor === opts.fromCorridor);

    const rwf = this.cache.filter((q) => q.corridor === opts.toCorridor);

    const trades = this.registry.completed.list();

    const useCalibration =
      opts.mode === "calibration_aware" &&
      opts.amount === 100_000 &&
      opts.fromCorridor === "Bankak-SDG";

    const result = priceQuote({
      request: {
        amount: opts.amount,
        fromCorridor: opts.fromCorridor,
        toCorridor: opts.toCorridor,
        city: opts.city,
      },
      sdgUsdtQuotes: sdg,
      rwfUsdtQuotes: rwf,
      completedTrades: trades,
      shadowRatePerSdg: useCalibration
        ? CALIBRATION_2026_07_27.theoreticalObservedRwf / 100_000
        : undefined,
      dynamicDealerMargin: useCalibration
        ? CALIBRATION_2026_07_27.grossDealerMarginPct / 100
        : 0.015,
      traderExpectedTotalRwf: useCalibration
        ? CALIBRATION_2026_07_27.fieldTraderRwf
        : null,
    });

    this.db
      .prepare(
        `INSERT INTO history_ticks (at, amount, from_corridor, to_corridor, fair_price, rate_label, confidence, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        new Date().toISOString(),
        opts.amount,
        opts.fromCorridor,
        opts.toCorridor,
        result.components.fairPrice,
        result.components.rateLabel,
        result.components.confidence,
        JSON.stringify(result)
      );

    audit(this.db, "price_quote", { auditId: result.auditId, label: result.components.rateLabel });
    return result;
  }

  ingestTrade(trade: AnonymizedTrade) {
    const saved = this.registry.completed.ingest(trade);
    const id = `${saved.anonymousMerchantId}-${saved.completedAt}-${saved.price}`;
    this.db
      .prepare(
        "INSERT OR REPLACE INTO trades (id, payload, completed_at, anonymous_merchant_id) VALUES (?, ?, ?, ?)"
      )
      .run(id, JSON.stringify(saved), saved.completedAt, saved.anonymousMerchantId);
    audit(this.db, "ingest_trade", { id, merchant: saved.anonymousMerchantId });
    return saved;
  }

  ingestRfq(input: Parameters<AdapterRegistry["rfq"]["ingest"]>[0]) {
    const q = this.registry.rfq.ingest(input);
    this.cache = [...this.cache.filter((x) => x.id !== q.id), q];
    audit(this.db, "ingest_rfq", { id: q.id });
    return q;
  }

  history(limit = 100) {
    return this.db
      .prepare("SELECT * FROM history_ticks ORDER BY id DESC LIMIT ?")
      .all(limit);
  }

  auditLog(limit = 100) {
    return this.db
      .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?")
      .all(limit);
  }

  snapshot() {
    return {
      quoteCount: this.cache.length,
      lastRefresh: this.lastRefresh,
      health: this.registry.all().map((a) => a.health()),
      calibration: CALIBRATION_2026_07_27,
      corridors: ["Bankak-SDG", "Cash-SDG", "MTN-MoMo-RWF", "Bank-RWF"],
      intermediates: ["USD", "USDT", "USDC"],
    };
  }
}
