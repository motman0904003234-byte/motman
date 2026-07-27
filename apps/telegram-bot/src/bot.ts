import { Bot, InlineKeyboard } from "grammy";

const API = process.env.MOTMAN_API_URL ?? "http://127.0.0.1:8787";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function fetchQuote(amount = 100_000) {
  const url = `${API}/v1/quote?amount=${amount}&from=Bankak-SDG&to=MTN-MoMo-RWF&mode=calibration_aware`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<{
    display: Record<string, string>;
    components: {
      rateLabel: string;
      confidence: number;
      sourceStatus: string;
      methodologyNote: string;
    };
  }>;
}

export function formatQuoteMessage(q: Awaited<ReturnType<typeof fetchQuote>>): string {
  const lines = [
    "مؤشر موتمن",
    q.display.amountLabel,
    q.display.fairPriceLabel,
    q.display.executableRangeLabel,
    q.display.marginLabel,
    q.display.confidenceLabel,
    q.display.sourcesLabel,
    q.display.lastUpdateLabel,
    `الحالة: ${q.components.sourceStatus}`,
    "",
    q.components.methodologyNote,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Alert subscriptions kept in-memory for phase 1 */
const alerts = new Map<number, { amount: number; minConfidence: number }>();

export function createBot(token: string) {
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const kb = new InlineKeyboard()
      .text("سعر 100 ألف بنكك", "q:100000")
      .row()
      .text("تنبيه ثقة≥70", "alert:70");
    await ctx.reply(
      "مرحباً — بوت موتمن للأسعار والتنبيهات.\nمرحلة البيانات فقط: بلا تنفيذ صرف.",
      { reply_markup: kb }
    );
  });

  bot.command("price", async (ctx) => {
    const amount = Number(ctx.match) || 100_000;
    try {
      const q = await fetchQuote(amount);
      await ctx.reply(formatQuoteMessage(q));
    } catch {
      await ctx.reply("تعذر جلب السعر من الـ API.");
    }
  });

  bot.callbackQuery(/q:(\d+)/, async (ctx) => {
    const amount = Number(ctx.match![1]);
    await ctx.answerCallbackQuery();
    try {
      const q = await fetchQuote(amount);
      await ctx.reply(formatQuoteMessage(q));
    } catch {
      await ctx.reply("تعذر جلب السعر.");
    }
  });

  bot.callbackQuery(/alert:(\d+)/, async (ctx) => {
    const minConfidence = Number(ctx.match![1]);
    alerts.set(ctx.from!.id, { amount: 100_000, minConfidence });
    await ctx.answerCallbackQuery({ text: "تم تفعيل التنبيه" });
    await ctx.reply(`تنبيه احترافي: ثقة ≥ ${minConfidence} لـ 100,000 Bankak-SDG`);
  });

  return { bot, alerts };
}

if (TOKEN) {
  const { bot } = createBot(TOKEN);
  bot.start();
  console.log("Telegram bot started");
} else {
  console.log("TELEGRAM_BOT_TOKEN not set — bot idle (library + tests still available)");
}
