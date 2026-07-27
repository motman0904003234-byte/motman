import { createHash, randomUUID } from "node:crypto";
import type { MarketQuote } from "@motman/shared";
import { BaseAdapter } from "./base.js";

export interface BinanceP2pSearchParams {
  asset: "USDT" | "USDC";
  fiat: "SDG" | "RWF";
  tradeType: "BUY" | "SELL";
  payTypes: string[];
  transAmount?: number;
}

/**
 * Binance P2P public advertisement adapter.
 * Independent of completed-trade connector and official banks.
 * Respect ToS — public c2c market endpoints only; no scraping of private pages.
 */
export class BinanceP2pAdapter extends BaseAdapter {
  readonly name = "binance_p2p";
  readonly priority = 3;
  private readonly endpoint =
    process.env.BINANCE_P2P_URL ?? "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

  constructor(private readonly params: BinanceP2pSearchParams) {
    super();
  }

  async fetchQuotes(): Promise<MarketQuote[]> {
    try {
      const body = {
        page: 1,
        rows: 20,
        asset: this.params.asset,
        fiat: this.params.fiat,
        tradeType: this.params.tradeType,
        payTypes: this.params.payTypes,
        transAmount: this.params.transAmount,
        publisherType: null,
      };
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "motman-fx-index/0.1" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        data?: Array<{
          adv: {
            advNo: string;
            price: string;
            surplusAmount: string;
            minSingleTransAmount: string;
            maxSingleTransAmount: string;
            tradeType: string;
          };
          advertiser: {
            userNo: string;
            monthFinishRate?: number;
            monthOrderCount?: number;
          };
        }>;
      };
      const corridor =
        this.params.fiat === "SDG"
          ? this.params.payTypes.includes("BankofKhartoum") ||
            this.params.payTypes.some((p) => /bankak|khartoum/i.test(p))
            ? ("Bankak-SDG" as const)
            : ("Cash-SDG" as const)
          : this.params.payTypes.some((p) => /mtn|momo/i.test(p))
            ? ("MTN-MoMo-RWF" as const)
            : ("Bank-RWF" as const);

      const paymentMethod =
        corridor === "Bankak-SDG"
          ? ("BANKAK" as const)
          : corridor === "Cash-SDG"
            ? ("CASH_SDG" as const)
            : corridor === "MTN-MoMo-RWF"
              ? ("MTN_MOMO" as const)
              : ("BANK_RWF" as const);

      const quotes: MarketQuote[] = (json.data ?? []).map((row) => {
        const anon = createHash("sha256")
          .update(`binance:${row.advertiser.userNo}`)
          .digest("hex")
          .slice(0, 16);
        return {
          id: row.adv.advNo || randomUUID(),
          source: this.name,
          kind: "ADVERTISEMENT" as const,
          corridor,
          intermediate: this.params.asset,
          // Binance tradeType BUY = user buys crypto = merchant sells = ASK
          side: this.params.tradeType === "BUY" ? ("SELL" as const) : ("BUY" as const),
          price: Number(row.adv.price),
          availableAmount: Number(row.adv.surplusAmount),
          minAmount: Number(row.adv.minSingleTransAmount),
          maxAmount: Number(row.adv.maxSingleTransAmount),
          paymentMethod,
          merchantId: anon,
          merchantCompletionRate: row.advertiser.monthFinishRate,
          observedAt: new Date().toISOString(),
          isBinding: false,
        };
      });
      return this.ok(quotes);
    } catch (e) {
      return this.fail(e);
    }
  }
}

export function bankakUsdtAdapters(amount?: number) {
  return [
    new BinanceP2pAdapter({
      asset: "USDT",
      fiat: "SDG",
      tradeType: "BUY",
      payTypes: ["BankofKhartoum"],
      transAmount: amount,
    }),
    new BinanceP2pAdapter({
      asset: "USDT",
      fiat: "SDG",
      tradeType: "SELL",
      payTypes: ["BankofKhartoum"],
      transAmount: amount,
    }),
  ];
}

export function mtnMomoUsdtAdapters(amount?: number) {
  return [
    new BinanceP2pAdapter({
      asset: "USDT",
      fiat: "RWF",
      tradeType: "BUY",
      payTypes: ["MTNMobileMoney"],
      transAmount: amount,
    }),
    new BinanceP2pAdapter({
      asset: "USDT",
      fiat: "RWF",
      tradeType: "SELL",
      payTypes: ["MTNMobileMoney"],
      transAmount: amount,
    }),
  ];
}
