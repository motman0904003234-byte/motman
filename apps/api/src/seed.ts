import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CompletedTradeRecord, PriceObservation } from "@motman/shared";
import { store } from "./store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");

function synthObservations(): PriceObservation[] {
  const now = new Date();
  const out: PriceObservation[] = [];
  // SDG/USDT asks around ~1550 SDG per USDT (illustrative synthetic)
  // RWF/USDT bids around ~1400 RWF per USDT
  // Cross ≈ 1400/1550 * 100000 wait - rate is RWF per SDG = bid/ask = 1400/1550 ≈ 0.90 RWF per SDG
  // But calibration says 25587 RWF for 100k SDG => 0.255877 RWF per SDG
  // So Ask_SDG_USDT (SDG per USDT) and Bid_RWF_USDT (RWF per USDT):
  // rate RWF/SDG = Bid_RWF / Ask_SDG
  // 0.255877 = Bid / Ask => if Ask = 6000 SDG/USDT, Bid = 1535 RWF/USDT
  // Use realistic synthetic around calibration: theoretical 25587.78 for 100k => per-unit 0.2558778

  const askSdg = 5900; // SDG per USDT
  const bidRwf = askSdg * 0.2558778; // ≈ 1509.68 RWF per USDT

  for (let i = 0; i < 18; i++) {
    const trader = `synth_trader_${(i % 12) + 1}`;
    const ts = new Date(now.getTime() - i * 15_000).toISOString();
    out.push({
      id: `synth-ask-${i}`,
      sourceId: "synthetic-market",
      sourceKind: "P2P_AD",
      traderAnonId: trader,
      assetBase: "USDT",
      assetQuote: "BANKAK_SDG",
      paymentRail: "BANKAK",
      side: "SELL",
      price: askSdg + (i % 5) * 8 - 10,
      quantity: 50 + i * 3,
      totalAmount: (askSdg + i) * 50,
      observedAt: ts,
      executableUpTo: 150_000 + i * 1000,
      completionRate: 0.92 + (i % 5) * 0.01,
      rating: 95,
      isSynthetic: true,
    });
    out.push({
      id: `synth-bid-${i}`,
      sourceId: "synthetic-market",
      sourceKind: "P2P_AD",
      traderAnonId: `rwf_${trader}`,
      assetBase: "USDT",
      assetQuote: "MTN_MOMO_RWF",
      paymentRail: "MTN_MOMO",
      side: "BUY",
      price: bidRwf + (i % 4) * 1.5 - 2,
      quantity: 80,
      totalAmount: (bidRwf + i) * 80,
      observedAt: ts,
      executableUpTo: 80,
      completionRate: 0.93,
      rating: 96,
      isSynthetic: true,
    });
  }

  // Binding RFQ near executable
  out.push({
    id: "synth-rfq-1",
    sourceId: "binding-rfq",
    sourceKind: "BINDING_RFQ",
    traderAnonId: "synth_trader_rfq_1",
    assetBase: "USDT",
    assetQuote: "BANKAK_SDG",
    paymentRail: "BANKAK",
    side: "SELL",
    price: askSdg,
    quantity: 100,
    totalAmount: askSdg * 100,
    observedAt: now.toISOString(),
    executableUpTo: 150_000,
    completionRate: 0.98,
    rating: 99,
    isSynthetic: true,
  });

  return out;
}

function synthTrades(): CompletedTradeRecord[] {
  const trades: CompletedTradeRecord[] = [];
  const base = Date.parse("2026-07-20T00:00:00.000Z");
  for (let i = 0; i < 320; i++) {
    const trader = `hist_trader_${(i % 12) + 1}`;
    const predicted = 25587.78;
    const noise = ((i * 17) % 50) - 25;
    const actual = predicted - 380 + noise; // around field 25200
    trades.push({
      tradeTime: new Date(base + i * 3600_000).toISOString(),
      asset: "BANKAK_SDG",
      side: i % 2 === 0 ? "BUY" : "SELL",
      quantity: [100_000, 500_000, 1_000_000][i % 3]!,
      price: actual,
      totalAmount: actual * 0.01,
      paymentMethod: i % 3 === 0 ? "MTN_MOMO" : "BANKAK",
      fees: 1.2,
      status: "COMPLETED",
      traderAnonId: trader,
      sourceId: "synthetic-history",
      isSynthetic: true,
    });
  }
  return trades;
}

async function main() {
  await mkdir(path.join(root, "synthetic"), { recursive: true });
  await mkdir(path.join(root, "samples"), { recursive: true });
  await mkdir(path.join(root, "calibration"), { recursive: true });

  const observations = synthObservations();
  await writeFile(
    path.join(root, "synthetic/market-observations.json"),
    JSON.stringify(observations, null, 2),
  );

  await writeFile(
    path.join(root, "samples/parallel-market.json"),
    JSON.stringify(
      [
        {
          id: "parallel-1",
          sourceId: "parallel-sdg",
          sourceKind: "PARALLEL_MARKET",
          traderAnonId: "parallel_desk_1",
          assetBase: "CASH_SDG",
          assetQuote: "USD",
          paymentRail: "CASH",
          side: "BUY",
          price: 2100,
          quantity: 5000,
          totalAmount: 10_500_000,
          observedAt: "2026-07-27T08:00:00.000Z",
          executableUpTo: 5000,
        },
      ],
      null,
      2,
    ),
  );

  await writeFile(
    path.join(root, "calibration/2026-07-27.json"),
    JSON.stringify(
      {
        date: "2026-07-27",
        amount: 100_000,
        asset: "BANKAK_SDG",
        theoreticalRateRwf: 25587.78,
        fieldTraderRateRwf: 25200,
        gapPct: 1.54,
        grossDealerMarginPct: 1.54,
        bankakBuyAdsObserved: 180,
        sellAdsAccepting100k: 0,
        disclaimer: "عينة معايرة مؤرخة وليست سعراً حياً ولا إثبات دقة بمفردها",
      },
      null,
      2,
    ),
  );

  const trades = synthTrades();
  await writeFile(
    path.join(root, "synthetic/completed-trades.json"),
    JSON.stringify(trades, null, 2),
  );

  await store.addTrades(trades);
  await store.saveObservationsCache(observations);
  await store.appendAudit({
    actor: "seed",
    action: "seed_synthetic",
    entityType: "dataset",
    entityId: "synthetic-v1",
    metadata: { trades: trades.length, observations: observations.length },
  });

  console.log(`Seeded ${observations.length} synthetic observations and ${trades.length} synthetic trades`);
  console.log("NOTE: synthetic data is for software tests only — not live accuracy proof");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
