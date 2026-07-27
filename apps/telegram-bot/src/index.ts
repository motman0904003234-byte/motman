import { Telegraf } from "telegraf";

const API = process.env.MOTMAN_API_BASE ?? "http://127.0.0.1:8787";
const token = process.env.TELEGRAM_BOT_TOKEN;

type QuotePayload = {
  quote: {
    display: Record<string, string>;
    metrics: { quoteLabel: string; confidenceScore: number };
    warnings: string[];
  };
};

async function fetchQuote(amount = 100_000): Promise<string> {
  const res = await fetch(`${API}/v1/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      amount,
      fromAsset: "BANKAK_SDG",
      toAsset: "MTN_MOMO_RWF",
      fromRail: "BANKAK",
      toRail: "MTN_MOMO",
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = (await res.json()) as QuotePayload;
  const d = data.quote.display;
  return [
    d.amountLine,
    d.fairRateLine,
    d.executableLine,
    d.marginLine,
    d.confidenceLine,
    d.sourcesLine,
    d.updatedLine,
    ...(data.quote.warnings ?? []),
  ].join("\n");
}

export function createBot(botToken: string) {
  const bot = new Telegraf(botToken);

  bot.start(async (ctx) => {
    await ctx.reply(
      "مرحباً بك في بوت مؤمن للأسعار والتنبيهات.\nالأوامر:\n/price [مبلغ]\n/calib\n/help",
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "مرحلة البيانات والتنبيهات فقط — لا تنفيذ صرف.\n/price 100000 — سعر Bankak→MTN\n/calib — عينة المعايرة المؤرخة",
    );
  });

  bot.command("price", async (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    const amount = Number(parts[1] ?? 100000);
    try {
      await ctx.reply(await fetchQuote(Number.isFinite(amount) ? amount : 100000));
    } catch (err) {
      await ctx.reply(`تعذر الجلب: ${err instanceof Error ? err.message : err}`);
    }
  });

  bot.command("calib", async (ctx) => {
    const res = await fetch(`${API}/v1/calibration/2026-07-27`);
    const json = (await res.json()) as { quote: { display: Record<string, string> } };
    const d = json.quote.display;
    await ctx.reply(
      ["عينة معايرة (ليست سعراً حياً)", d.amountLine, d.fairRateLine, d.executableLine, d.marginLine].join(
        "\n",
      ),
    );
  });

  return bot;
}

if (!token) {
  console.log("TELEGRAM_BOT_TOKEN غير مضبوط — البوت لن يعمل حتى توفره.");
  console.log("يمكن استيراد createBot للاختبار.");
} else {
  const bot = createBot(token);
  bot.launch().then(() => console.log("Motman telegram bot running"));
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
