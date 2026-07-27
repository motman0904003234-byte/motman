import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const now = Date.now();
const askSdg = 5900;
const bidRwf = askSdg * 0.2558778;
const out = [];

for (let i = 0; i < 18; i++) {
  const trader = `synth_trader_${(i % 12) + 1}`;
  const ts = new Date(now - i * 15_000).toISOString();
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
    quantity: 30,
    totalAmount: (askSdg + i) * 30,
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

mkdirSync(path.join(root, "synthetic"), { recursive: true });
writeFileSync(
  path.join(root, "synthetic/market-observations.json"),
  JSON.stringify(out, null, 2),
);
console.log("wrote", out.length);
