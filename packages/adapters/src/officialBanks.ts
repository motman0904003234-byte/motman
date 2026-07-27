import type { MarketQuote } from "@motman/shared";
import { BaseAdapter } from "./base.js";

/**
 * Official Bank of Khartoum / CBOS reference rates.
 * Used for ERROR DETECTION only — never forced as executable price.
 */
export class BankOfKhartoumOfficialAdapter extends BaseAdapter {
  readonly name = "official_bok";
  readonly priority = 5;

  async fetchQuotes(): Promise<MarketQuote[]> {
    try {
      // Placeholder: official feed URL via env; fail soft if unavailable
      const url = process.env.BOK_FX_URL;
      if (!url) {
        this.lastStatus = "STALE";
        this.lastError = "BOK_FX_URL not configured — official reference offline";
        return [];
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { usdSdg?: number; at?: string };
      if (!data.usdSdg) return this.ok([]);
      return this.ok([
        {
          id: `bok-usd-sdg-${data.at ?? "latest"}`,
          source: this.name,
          kind: "OFFICIAL_REFERENCE",
          corridor: "Bankak-SDG",
          intermediate: "USD",
          side: "SELL",
          price: data.usdSdg,
          availableAmount: 0,
          minAmount: 0,
          maxAmount: 0,
          paymentMethod: "BANKAK",
          merchantId: "official_bok",
          observedAt: data.at ?? new Date().toISOString(),
          isBinding: false,
        },
      ]);
    } catch (e) {
      return this.fail(e);
    }
  }
}

/**
 * National Bank of Rwanda official reference — error detection only.
 */
export class BnrOfficialAdapter extends BaseAdapter {
  readonly name = "official_bnr";
  readonly priority = 5;

  async fetchQuotes(): Promise<MarketQuote[]> {
    try {
      const url = process.env.BNR_FX_URL;
      if (!url) {
        this.lastStatus = "STALE";
        this.lastError = "BNR_FX_URL not configured";
        return [];
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { usdRwf?: number; at?: string };
      if (!data.usdRwf) return this.ok([]);
      return this.ok([
        {
          id: `bnr-usd-rwf-${data.at ?? "latest"}`,
          source: this.name,
          kind: "OFFICIAL_REFERENCE",
          corridor: "Bank-RWF",
          intermediate: "USD",
          side: "BUY",
          price: data.usdRwf,
          availableAmount: 0,
          minAmount: 0,
          maxAmount: 0,
          paymentMethod: "BANK_RWF",
          merchantId: "official_bnr",
          observedAt: data.at ?? new Date().toISOString(),
          isBinding: false,
        },
      ]);
    } catch (e) {
      return this.fail(e);
    }
  }
}
