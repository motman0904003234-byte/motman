import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

export const dbPath = process.env.MOTMAN_DB ?? path.join(dataDir, "motman.sqlite");

export function openDb(file = dbPath) {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      source TEXT NOT NULL,
      corridor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      anonymous_merchant_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      amount REAL NOT NULL,
      from_corridor TEXT NOT NULL,
      to_corridor TEXT NOT NULL,
      fair_price REAL,
      rate_label TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calibration_samples (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      is_live INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

export type MotmanDb = ReturnType<typeof openDb>;

export function audit(db: MotmanDb, action: string, detail: unknown) {
  db.prepare(
    "INSERT INTO audit_log (at, action, detail) VALUES (?, ?, ?)"
  ).run(new Date().toISOString(), action, JSON.stringify(detail));
}
