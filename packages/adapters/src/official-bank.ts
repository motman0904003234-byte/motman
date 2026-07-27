import type { PriceObservation } from "@motman/shared";
import { BaseAdapter } from "./base.js";

/** Official bank rates — used for anomaly detection only, never as executable FX. */
export class OfficialBankAdapter extends BaseAdapter {
  readonly id: string;
  readonly name: string;

  constructor(
    id: string,
    name: string,
    private readonly loader: () => Promise<PriceObservation[]>,
  ) {
    super();
    this.id = id;
    this.name = name;
  }

  async fetchObservations(): Promise<PriceObservation[]> {
    try {
      const rows = await this.loader();
      const tagged = rows.map((r) => ({
        ...r,
        sourceId: this.id,
        sourceKind: "OFFICIAL_BANK" as const,
      }));
      this.markSuccess();
      return tagged;
    } catch (err) {
      this.markFailure(err);
      return [];
    }
  }
}

export function createBokStubAdapter(): OfficialBankAdapter {
  return new OfficialBankAdapter("bok-official", "Bank of Khartoum Official", async () => []);
}

export function createBnrStubAdapter(): OfficialBankAdapter {
  return new OfficialBankAdapter("bnr-official", "National Bank of Rwanda Official", async () => []);
}
