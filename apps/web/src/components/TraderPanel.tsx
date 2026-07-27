import { useState, type FormEvent } from "react";

export function TraderPanel({ apiBase }: { apiBase: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [price, setPrice] = useState("1450");
  const [amount, setAmount] = useState("100");

  async function submitRfq(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`${apiBase}/v1/ingest/rfq`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        corridor: "Bankak-SDG",
        intermediate: "USDT",
        side: "SELL",
        price: Number(price),
        availableAmount: Number(amount),
        minAmount: 10,
        maxAmount: Number(amount),
        paymentMethod: "BANKAK",
        merchantId: `web-trader-${crypto.randomUUID().slice(0, 8)}`,
      }),
    });
    setMsg(res.ok ? "تم تسجيل سعر ملزم (RFQ) مجهول الهوية" : "فشل التسجيل");
  }

  return (
    <section className="panel">
      <h2>لوحة التاجر</h2>
      <p>
        قدّم أسعاراً ملزمة وارفع سجلات صفقات مكتملة مجهولة عبر الموصل المحلي.
        المفتاح السري لا يغادر جهازك.
      </p>
      <form className="form" onSubmit={submitRfq}>
        <label>
          سعر ملزم (SDG لكل USDT)
          <input value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          الكمية المتاحة (USDT)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button type="submit">إرسال RFQ ملزم</button>
      </form>
      {msg && <p className="ok">{msg}</p>}
      <div className="callout">
        <strong>الموصل المحلي</strong>
        <p>
          شغّل <code>apps/trader-connector</code> بصلاحية قراءة Binance C2C
          فقط. يُرسل: الوقت، العملة، الاتجاه، الكمية، السعر، الإجمالي، طريقة
          الدفع، الرسوم، COMPLETED، ومعرف مشفّر — بلا اسم أو هاتف أو حساب أو
          PIN/OTP.
        </p>
      </div>
    </section>
  );
}
