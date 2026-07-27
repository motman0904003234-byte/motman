import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AuditEvent, CompletedTradeRecord, PriceObservation } from "@motman/shared";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/local");

async function ensure() {
  await mkdir(root, { recursive: true });
}

function file(name: string) {
  return path.join(root, name);
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  await ensure();
  try {
    return JSON.parse(await readFile(file(name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await ensure();
  await writeFile(file(name), JSON.stringify(data, null, 2), "utf8");
}

export function anonymizeTraderId(rawStableId: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${rawStableId}`).digest("hex").slice(0, 16);
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export const store = {
  async listTrades(): Promise<CompletedTradeRecord[]> {
    return readJson("completed-trades.json", []);
  },
  async addTrades(trades: CompletedTradeRecord[]): Promise<number> {
    const existing = await this.listTrades();
    const merged = [...existing, ...trades];
    await writeJson("completed-trades.json", merged);
    return trades.length;
  },
  async listRfq(): Promise<PriceObservation[]> {
    return readJson("binding-rfq.json", []);
  },
  async addRfq(rows: PriceObservation[]): Promise<number> {
    const existing = await this.listRfq();
    await writeJson("binding-rfq.json", [...existing, ...rows]);
    return rows.length;
  },
  async listObservationsCache(): Promise<PriceObservation[]> {
    return readJson("observations-cache.json", []);
  },
  async saveObservationsCache(rows: PriceObservation[]): Promise<void> {
    await writeJson("observations-cache.json", rows);
  },
  async listAudit(): Promise<AuditEvent[]> {
    return readJson("audit.json", []);
  },
  async appendAudit(event: Omit<AuditEvent, "id" | "at"> & { id?: string; at?: string }): Promise<AuditEvent> {
    const list = await this.listAudit();
    const full: AuditEvent = {
      id: event.id ?? randomBytes(8).toString("hex"),
      at: event.at ?? new Date().toISOString(),
      actor: event.actor,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata,
    };
    list.push(full);
    await writeJson("audit.json", list);
    return full;
  },
};
