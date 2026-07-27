import type { PriceObservation } from "@motman/shared";
import { BaseAdapter } from "./base.js";

/**
 * Binance P2P public ads adapter (read-only market listings).
 * Does not use private API keys. Failures must not halt the whole index.
 */
export class BinanceP2PAdapter extends BaseAdapter {
  readonly id = "binance-p2p";
  readonly name = "Binance P2P Ads";

  constructor(
    private readonly fetcher: (
      body: Record<string, unknown>,
    ) => Promise<unknown> = defaultBinanceFetch,
  ) {
    super();
  }

  async fetchObservations(): Promise<PriceObservation[]> {
    try {
      const configs = [
        {
          asset: "USDT",
          fiat: "SDG",
          payTypes: ["BankofKhartoum"],
          tradeType: "SELL" as const,
          rail: "BANKAK" as const,
          quoteAsset: "BANKAK_SDG" as const,
        },
        {
          asset: "USDT",
          fiat: "SDG",
          payTypes: ["BankofKhartoum"],
          tradeType: "BUY" as const,
          rail: "BANKAK" as const,
          quoteAsset: "BANKAK_SDG" as const,
        },
        {
          asset: "USDT",
          fiat: "RWF",
          payTypes: ["MTNMobileMoney"],
          tradeType: "BUY" as const,
          rail: "MTN_MOMO" as const,
          quoteAsset: "MTN_MOMO_RWF" as const,
        },
        {
          asset: "USDT",
          fiat: "RWF",
          payTypes: ["MTNMobileMoney"],
          tradeType: "SELL" as const,
          rail: "MTN_MOMO" as const,
          quoteAsset: "MTN_MOMO_RWF" as const,
        },
      ];

      const out: PriceObservation[] = [];
      for (const cfg of configs) {
        const raw = await this.fetcher({
          page: 1,
          rows: 20,
          asset: cfg.asset,
          fiat: cfg.fiat,
          tradeType: cfg.tradeType,
          payTypes: cfg.payTypes,
        });
        const rows = extractRows(raw);
        for (const row of rows) {
          out.push({
            id: `binance-${row.advNo}`,
            sourceId: this.id,
            sourceKind: "P2P_AD",
            traderAnonId: hashAnon(row.userNo || row.advertiserName || row.advNo),
            assetBase: "USDT",
            assetQuote: cfg.quoteAsset,
            paymentRail: cfg.rail,
            side: cfg.tradeType,
            price: Number(row.price),
            quantity: Number(row.surplusAmount ?? row.tradableQuantity ?? 0),
            totalAmount: Number(row.price) * Number(row.surplusAmount ?? 0),
            observedAt: new Date().toISOString(),
            executableUpTo: Number(row.maxSingleTransAmount ?? row.surplusAmount ?? 0),
            completionRate: row.monthFinishRate != null ? Number(row.monthFinishRate) : undefined,
            rating: row.positiveRate != null ? Number(row.positiveRate) * 100 : undefined,
          });
        }
      }
      this.markSuccess();
      return out;
    } catch (err) {
      this.markFailure(err);
      return [];
    }
  }
}

async function defaultBinanceFetch(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Binance P2P HTTP ${res.status}`);
  return res.json();
}

function extractRows(raw: unknown): Array<Record<string, any>> {
  const data = (raw as any)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({
    ...(d.adv ?? {}),
    advertiserName: d.advertiser?.nickName,
    userNo: d.advertiser?.userNo,
    monthFinishRate: d.advertiser?.monthFinishRate,
    positiveRate: d.advertiser?.positiveRate,
  }));
}

function hashAnon(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return `t_${h.toString(16).padStart(8, "0")}`;
}
