import { readFile } from "node:fs/promises";
import type { CompletedTradeRecord, PriceObservation } from "@motman/shared";
import { BaseAdapter } from "./base.js";

/**
 * Ingests anonymized completed trades uploaded by traders (server-side store).
 * Secrets never leave the trader device — this adapter only accepts sanitized payloads.
 */
export class CompletedTradesAdapter extends BaseAdapter {
  readonly id = "completed-trades";
  readonly name = "Anonymized Completed Trades";

  constructor(private readonly store: { list: () => Promise<CompletedTradeRecord[]> }) {
    super();
  }

  async fetchObservations(): Promise<PriceObservation[]> {
    try {
      const trades = await this.store.list();
      const out: PriceObservation[] = trades
        .filter((t) => t.status === "COMPLETED")
        .map((t) => ({
          id: `ct-${t.traderAnonId}-${t.tradeTime}-${t.price}`,
          sourceId: this.id,
          sourceKind: "COMPLETED_TRADE",
          traderAnonId: t.traderAnonId,
          assetBase: t.asset,
          assetQuote: t.asset.includes("SDG") ? "USDT" : t.asset.includes("RWF") ? "USDT" : "USD",
          paymentRail: t.paymentMethod,
          side: t.side,
          price: t.price,
          quantity: t.quantity,
          totalAmount: t.totalAmount,
          fees: t.fees,
          city: t.city,
          observedAt: t.tradeTime,
          executableUpTo: t.quantity,
          isSynthetic: t.isSynthetic,
        }));
      this.markSuccess();
      return out;
    } catch (err) {
      this.markFailure(err);
      return [];
    }
  }
}

export class FileFixtureAdapter extends BaseAdapter {
  readonly id: string;
  readonly name: string;

  constructor(
    id: string,
    name: string,
    private readonly filePath: string,
    private readonly kind: PriceObservation["sourceKind"],
  ) {
    super();
    this.id = id;
    this.name = name;
  }

  async fetchObservations(): Promise<PriceObservation[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as PriceObservation[];
      this.markSuccess();
      return data.map((d) => ({ ...d, sourceId: this.id, sourceKind: this.kind }));
    } catch (err) {
      this.markFailure(err);
      return [];
    }
  }
}

export class BindingRfqAdapter extends BaseAdapter {
  readonly id = "binding-rfq";
  readonly name = "Binding RFQ Quotes";

  constructor(private readonly store: { list: () => Promise<PriceObservation[]> }) {
    super();
  }

  async fetchObservations(): Promise<PriceObservation[]> {
    try {
      const rows = (await this.store.list()).map((r) => ({
        ...r,
        sourceKind: "BINDING_RFQ" as const,
        sourceId: this.id,
      }));
      this.markSuccess();
      return rows;
    } catch (err) {
      this.markFailure(err);
      return [];
    }
  }
}
