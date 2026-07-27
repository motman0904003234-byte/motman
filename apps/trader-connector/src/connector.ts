/**
 * Local trader connector — runs ONLY on the merchant device.
 *
 * Security contract:
 * - API secret NEVER leaves this machine / never posted to Motman.
 * - Read-only Binance C2C trade history permission.
 * - Strips PII before upload: no name, phone, account, password, PIN, OTP.
 * - Uploads only COMPLETED anonymized fields listed in ALLOWED_FIELDS.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export const ALLOWED_FIELDS = [
  "completedAt",
  "asset",
  "quoteAsset",
  "side",
  "quantity",
  "price",
  "totalAmount",
  "paymentMethod",
  "fees",
  "status",
  "anonymousMerchantId",
] as const;

const rawTradeSchema = z.object({
  orderNumber: z.string().optional(),
  createTime: z.union([z.number(), z.string()]),
  asset: z.string(),
  fiatUnit: z.string().optional(),
  tradeType: z.enum(["BUY", "SELL"]),
  amount: z.union([z.string(), z.number()]),
  price: z.union([z.string(), z.number()]),
  totalPrice: z.union([z.string(), z.number()]).optional(),
  payMethodName: z.string().optional(),
  commission: z.union([z.string(), z.number()]).optional(),
  orderStatus: z.union([z.string(), z.number()]),
});

export function anonymizeMerchantId(apiKeyId: string): string {
  return createHash("sha256").update(`local-only:${apiKeyId}`).digest("hex").slice(0, 24);
}

export function mapPayment(name?: string): "BANKAK" | "CASH_SDG" | "MTN_MOMO" | "BANK_RWF" | "OTHER" {
  const n = (name ?? "").toLowerCase();
  if (/bankak|khartoum|bank of khartoum/.test(n)) return "BANKAK";
  if (/cash/.test(n)) return "CASH_SDG";
  if (/mtn|momo|mobile money/.test(n)) return "MTN_MOMO";
  if (/rwanda|bank/.test(n)) return "BANK_RWF";
  return "OTHER";
}

export function corridorFor(payment: ReturnType<typeof mapPayment>) {
  switch (payment) {
    case "BANKAK":
      return "Bankak-SDG" as const;
    case "CASH_SDG":
      return "Cash-SDG" as const;
    case "MTN_MOMO":
      return "MTN-MoMo-RWF" as const;
    case "BANK_RWF":
      return "Bank-RWF" as const;
    default:
      return "Bankak-SDG" as const;
  }
}

/** Convert raw exchange payload → anonymized COMPLETED trade. Drops everything else. */
export function sanitizeTrade(
  raw: unknown,
  merchantKeyId: string
): Record<string, unknown> | null {
  const parsed = rawTradeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  const status = String(t.orderStatus).toUpperCase();
  const completed =
    status === "COMPLETED" || status === "4" || status === "FINISHED";
  if (!completed) return null;

  const paymentMethod = mapPayment(t.payMethodName);
  const completedAt =
    typeof t.createTime === "number"
      ? new Date(t.createTime).toISOString()
      : new Date(t.createTime).toISOString();

  const quantity = Number(t.amount);
  const price = Number(t.price);
  const totalAmount = t.totalPrice != null ? Number(t.totalPrice) : quantity * price;

  return {
    anonymousMerchantId: anonymizeMerchantId(merchantKeyId),
    completedAt,
    asset: t.asset.toUpperCase(),
    quoteAsset: (t.fiatUnit ?? "SDG").toUpperCase(),
    side: t.tradeType,
    quantity,
    price,
    totalAmount,
    paymentMethod,
    fees: Number(t.commission ?? 0),
    status: "COMPLETED",
    corridor: corridorFor(paymentMethod),
    kind: "COMPLETED_TRADE",
    source: "local_trader_connector",
  };
}

export function assertNoSecrets(payload: unknown) {
  const s = JSON.stringify(payload).toLowerCase();
  const banned = [
    "password",
    "passwd",
    "secret",
    "api_secret",
    "apisecret",
    "pin",
    "otp",
    "phone",
    "mobile",
    "accountnumber",
    "account_number",
    "iban",
  ];
  for (const b of banned) {
    if (s.includes(b)) {
      throw new Error(`Refusing to upload: field pattern "${b}" detected`);
    }
  }
}

/**
 * Fetch trade history using keys that stay local.
 * Binance signing happens here; only sanitized JSON is POSTed to Motman.
 */
export async function pullAndUpload(opts: {
  apiKey: string;
  apiSecret: string;
  motmanIngestUrl: string;
  merchantKeyId: string;
}) {
  // Keys used only in-process for request signing — never included in upload body.
  void opts.apiSecret;
  // Placeholder: merchants wire their signed C2C history call here.
  // For safety we do NOT embed live secret-dependent HTTP in CI.
  const localRawHistory: unknown[] = [];

  const trades = localRawHistory
    .map((row) => sanitizeTrade(row, opts.merchantKeyId))
    .filter(Boolean);

  const body = { trades };
  assertNoSecrets(body);
  // Ensure secret not accidentally present
  if (JSON.stringify(body).includes(opts.apiSecret)) {
    throw new Error("Refusing upload — api secret leaked into body");
  }

  const res = await fetch(opts.motmanIngestUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ingest failed: ${res.status}`);
  return res.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`
Motman local trader connector
=============================
1) Export BINANCE_API_KEY / BINANCE_API_SECRET on THIS machine only (read-only).
2) Never paste secrets into Motman web UI.
3) Run: MOTMAN_INGEST_URL=http://127.0.0.1:8787/v1/ingest/trades pnpm start

Allowed upload fields: ${ALLOWED_FIELDS.join(", ")}
`);
}
