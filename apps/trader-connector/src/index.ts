#!/usr/bin/env node
/**
 * Local-only Binance C2C Trade History connector.
 * API secret NEVER leaves this machine. Only anonymized COMPLETED trade fields are uploaded.
 *
 * Collected fields only:
 * tradeTime, asset, side, quantity, price, totalAmount, paymentMethod, fees, status, traderAnonId
 */
import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";

type LocalConfig = {
  apiKey: string;
  apiSecret: string;
  salt: string;
  apiBase: string;
};

const secretsDir = path.resolve(process.cwd(), ".secrets");
const configPath = path.join(secretsDir, "binance-local.json");

function anonId(seed: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${seed}`).digest("hex").slice(0, 16);
}

function sign(query: string, secret: string): string {
  return createHmac("sha256", secret).update(query).digest("hex");
}

async function loadConfig(): Promise<LocalConfig> {
  const raw = await readFile(configPath, "utf8");
  return JSON.parse(raw) as LocalConfig;
}

async function initConfig(opts: {
  key: string;
  secret: string;
  apiBase?: string;
}): Promise<void> {
  await mkdir(secretsDir, { recursive: true });
  const cfg: LocalConfig = {
    apiKey: opts.key,
    apiSecret: opts.secret,
    salt: createHash("sha256").update(`${opts.key}:${Date.now()}`).digest("hex").slice(0, 32),
    apiBase: opts.apiBase ?? "http://127.0.0.1:8787",
  };
  await writeFile(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  console.log(`Saved local secrets to ${configPath} (mode 600). Secret never uploaded.`);
}

/**
 * Minimal signed GET helper for Binance private read endpoints.
 * Scope must remain READ-ONLY on the API key (no withdraw / trading permissions).
 */
async function binanceSignedGet(
  pathname: string,
  params: Record<string, string | number>,
  cfg: LocalConfig,
): Promise<unknown> {
  const qs = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Date.now()),
  });
  const signature = sign(qs.toString(), cfg.apiSecret);
  qs.set("signature", signature);
  const url = `https://api.binance.com${pathname}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": cfg.apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance ${res.status}: ${text}`);
  }
  return res.json();
}

function sanitizeTrade(raw: Record<string, unknown>, cfg: LocalConfig) {
  // Map common C2C history fields defensively; ignore PII if present.
  const tradeTime = String(raw.createTime ?? raw.tradeTime ?? raw.time ?? "");
  const asset = String(raw.asset ?? raw.cryptoCurrency ?? "USDT");
  const side = String(raw.tradeType ?? raw.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const quantity = Number(raw.amount ?? raw.quantity ?? 0);
  const price = Number(raw.price ?? 0);
  const totalAmount = Number(raw.totalPrice ?? raw.totalAmount ?? price * quantity);
  const paymentMethod = mapPay(String(raw.payType ?? raw.paymentMethod ?? "UNKNOWN"));
  const fees = Number(raw.commission ?? raw.fees ?? 0);
  const status = String(raw.orderStatus ?? raw.status ?? "");
  if (status !== "COMPLETED" && status !== "COMPLETED".toLowerCase() && status !== "4") {
    return null;
  }
  return {
    tradeTime: tradeTime.includes("T")
      ? tradeTime
      : new Date(Number(tradeTime)).toISOString(),
    asset: asset.includes("SDG") ? "BANKAK_SDG" : asset.includes("RWF") ? "MTN_MOMO_RWF" : "USDT",
    side,
    quantity,
    price,
    totalAmount,
    paymentMethod,
    fees,
    status: "COMPLETED" as const,
    traderAnonId: anonId(cfg.apiKey, cfg.salt),
    sourceId: "binance-c2c-local",
  };
}

function mapPay(p: string): "BANKAK" | "CASH" | "MTN_MOMO" | "BANK_RWF" | "CRYPTO" {
  const s = p.toLowerCase();
  if (s.includes("khartoum") || s.includes("bankak")) return "BANKAK";
  if (s.includes("mtn") || s.includes("momo")) return "MTN_MOMO";
  if (s.includes("cash")) return "CASH";
  if (s.includes("rwanda") || s.includes("bank")) return "BANK_RWF";
  return "CRYPTO";
}

async function syncHistory(): Promise<void> {
  const cfg = await loadConfig();
  // Endpoint name may vary by Binance C2C API version; connector keeps secrets local regardless.
  let raw: unknown;
  try {
    raw = await binanceSignedGet("/sapi/v1/c2c/orderMatch/listUserOrderHistory", {
      timestamp: Date.now(),
      page: 1,
      rows: 100,
    }, cfg);
  } catch (err) {
    console.error("تعذر جلب التاريخ من Binance. تأكد من مفتاح قراءة فقط وصلاحية الشبكة.");
    console.error(err);
    console.error("يمكنك بدلاً من ذلك استيراد ملف JSON محلي عبر: npm run dev -- import-file trades.json");
    process.exitCode = 1;
    return;
  }

  const rows = Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  const trades = rows
    .map((r: Record<string, unknown>) => sanitizeTrade(r, cfg))
    .filter(Boolean);

  const res = await fetch(`${cfg.apiBase}/v1/trader/trades`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trades }),
  });
  if (!res.ok) throw new Error(`Upload failed ${res.status}`);
  const json = await res.json();
  console.log("Uploaded anonymized trades:", json);
  console.log("Secret remained on this device.");
}

async function importFile(file: string): Promise<void> {
  const cfg = await loadConfig();
  const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>[];
  const trades = raw
    .map((r) => sanitizeTrade(r, cfg))
    .filter(Boolean);
  const res = await fetch(`${cfg.apiBase}/v1/trader/trades`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trades }),
  });
  if (!res.ok) throw new Error(`Upload failed ${res.status}`);
  console.log(await res.json());
}

const program = new Command();
program
  .name("motman-trader-connector")
  .description("Local Binance C2C read-only connector — secrets never leave the device");

program
  .command("init")
  .requiredOption("--key <apiKey>")
  .requiredOption("--secret <apiSecret>")
  .option("--api-base <url>", "Motman API", "http://127.0.0.1:8787")
  .action(async (opts) => {
    await initConfig(opts);
  });

program.command("sync").action(async () => {
  await syncHistory();
});

program
  .command("import-file")
  .argument("<file>")
  .action(async (file: string) => {
    await importFile(file);
  });

program.parseAsync(process.argv);
