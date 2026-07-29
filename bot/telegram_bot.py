#!/usr/bin/env python3
"""Telegram alerts bot — rates and threshold notifications. No custody/execution."""

from __future__ import annotations

import asyncio
import os

import httpx

API = os.getenv("MOTMAN_API", "http://127.0.0.1:8000/api/v1")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


async def fetch_quote(amount: float = 100000) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{API}/quote",
            json={
                "amount": amount,
                "from_rail": "Bankak-SDG",
                "to_rail": "MTN-MoMo-RWF",
                "from_payment": "Bankak",
                "to_payment": "MTN Mobile Money",
            },
        )
        r.raise_for_status()
        return r.json()


def format_message(payload: dict) -> str:
    d = payload.get("display", {})
    label = payload.get("label")
    lines = [
        "مؤشر مطمن — مسارات منفصلة",
        f"{d.get('title')}",
        f"التصنيف: {label}",
        f"السعر العادل: {d.get('fair')}",
        f"التنفيذي: {d.get('executable')}",
        f"الهامش الإجمالي: {d.get('margin')}",
        f"الثقة: {d.get('confidence')}/100",
        f"تجار مستقلون: {d.get('independent_sources')}",
        f"حالة المصدر: {d.get('source_status')}",
        "",
        "تنبيه: بيانات وتنبيهات فقط — لا حفظ أموال ولا تنفيذ تلقائي.",
    ]
    return "\n".join(str(x) for x in lines)


async def poll_cli() -> None:
    """CLI mode when Telegram token absent."""
    data = await fetch_quote()
    print(format_message(data))


async def run_bot() -> None:
    if not TOKEN:
        await poll_cli()
        return
    from telegram import Update
    from telegram.ext import Application, CommandHandler, ContextTypes

    async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await update.message.reply_text(
            "مرحبًا. أوامر: /rate [amount] — أسعار Bankak→MoMo الشفافة."
        )

    async def rate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        amount = 100000
        if context.args:
            try:
                amount = float(context.args[0])
            except ValueError:
                pass
        data = await fetch_quote(amount)
        await update.message.reply_text(format_message(data))

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("rate", rate))
    await app.run_polling()


if __name__ == "__main__":
    asyncio.run(run_bot())