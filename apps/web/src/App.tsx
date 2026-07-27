import { FormEvent, useEffect, useState } from "react";

type QuoteResponse = {
  quote: {
    display: {
      amountLine: string;
      fairRateLine: string;
      executableLine: string;
      marginLine: string;
      confidenceLine: string;
      sourcesLine: string;
      updatedLine: string;
    };
    metrics: {
      quoteLabel: string;
      sourceHealth: "LIVE" | "DELAYED" | "STALE" | "DOWN";
      confidenceScore: number;
      methodologyNote: string;
    };
    warnings: string[];
    isCalibrationOnly?: boolean;
  };
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const healthLabel: Record<string, string> = {
  LIVE: "مباشر",
  DELAYED: "متأخر",
  STALE: "متوقف/قديم",
  DOWN: "متوقف",
};

function TraderPanel({ apiBase }: { apiBase: string }) {
  const [status, setStatus] = useState<string>("");
  const [price, setPrice] = useState("25200");
  const [amount, setAmount] = useState("100000");

  async function submitRfq(e: FormEvent) {
    e.preventDefault();
    setStatus("جاري الرفع…");
    try {
      const res = await fetch(`${apiBase}/v1/trader/rfq`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quotes: [
            {
              id: `rfq-${Date.now()}`,
              sourceId: "trader-ui",
              sourceKind: "BINDING_RFQ",
              traderAnonId: `web_${Math.random().toString(16).slice(2, 10)}`,
              assetBase: "USDT",
              assetQuote: "BANKAK_SDG",
              paymentRail: "BANKAK",
              side: "SELL",
              price: Number(price),
              quantity: 20,
              totalAmount: Number(price) * 20,
              observedAt: new Date().toISOString(),
              executableUpTo: Number(amount),
              completionRate: 0.97,
              rating: 98,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStatus(`تم قبول ${json.accepted} عرض ملزم (مجهول)`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "فشل الرفع");
    }
  }

  return (
    <section className="panel" id="trader">
      <h2>لوحة التاجر (ملزم / مجهول)</h2>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        لرفع صفقات Binance المكتملة استخدم الموصل المحلي حتى لا يغادر المفتاح السري جهازك.
      </p>
      <form className="grid" onSubmit={submitRfq}>
        <label>
          سعر ملزم (SDG لكل USDT أو حقل تجريبي)
          <input value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          قابل للتنفيذ حتى (SDG)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <div style={{ gridColumn: "1 / -1" }}>
          <button className="btn btn-ghost" type="submit">
            إرسال RFQ ملزم
          </button>
        </div>
      </form>
      {status && <p className="warnings">{status}</p>}
    </section>
  );
}

export default function App() {
  const [amount, setAmount] = useState("100000");
  const [fromAsset, setFromAsset] = useState("BANKAK_SDG");
  const [toAsset, setToAsset] = useState("MTN_MOMO_RWF");
  const [fromRail, setFromRail] = useState("BANKAK");
  const [toRail, setToRail] = useState("MTN_MOMO");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [calibration, setCalibration] = useState<QuoteResponse["quote"] | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/calibration/2026-07-27`)
      .then((r) => r.json())
      .then((j) => setCalibration(j.quote))
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          fromAsset,
          toAsset,
          fromRail,
          toRail,
          city: city || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as QuoteResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر جلب السعر");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setFromRail(fromAsset === "CASH_SDG" ? "CASH" : "BANKAK");
  }, [fromAsset]);

  useEffect(() => {
    setToRail(toAsset === "BANK_RWF" ? "BANK_RWF" : "MTN_MOMO");
  }, [toAsset]);

  const q = data?.quote;

  return (
    <div className="app-shell">
      <header className="brand-hero">
        <p className="badge live">مرحلة البيانات والتنبيهات فقط</p>
        <h1 className="brand-mark">
          مؤم<span>ن</span>
        </h1>
        <p className="lede">
          مؤشر مرجعي غير متحيز لمسارات Bankak-SDG وCash-SDG وMTN-MoMo-RWF وBank-RWF عبر
          USD/USDT/USDC — كل مسار بسعره، بلا دمج مضلل.
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="#quote">
            احسب السعر
          </a>
          <a className="btn btn-ghost" href="#method">
            المنهجية
          </a>
        </div>
      </header>

      <section className="panel" id="quote">
        <h2>حاسبة الممر</h2>
        <form className="grid" onSubmit={onSubmit}>
          <label>
            المبلغ
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label>
            العملة الأصلية
            <select value={fromAsset} onChange={(e) => setFromAsset(e.target.value)}>
              <option value="BANKAK_SDG">Bankak-SDG</option>
              <option value="CASH_SDG">Cash-SDG</option>
            </select>
          </label>
          <label>
            العملة المطلوبة
            <select value={toAsset} onChange={(e) => setToAsset(e.target.value)}>
              <option value="MTN_MOMO_RWF">MTN-MoMo-RWF</option>
              <option value="BANK_RWF">Bank-RWF</option>
            </select>
          </label>
          <label>
            طريقة الدفع الأصلية
            <select value={fromRail} onChange={(e) => setFromRail(e.target.value)}>
              <option value="BANKAK">بنكك</option>
              <option value="CASH">نقد</option>
            </select>
          </label>
          <label>
            طريقة الاستلام
            <select value={toRail} onChange={(e) => setToRail(e.target.value)}>
              <option value="MTN_MOMO">MTN MoMo</option>
              <option value="BANK_RWF">بنك رواندي</option>
            </select>
          </label>
          <label>
            المدينة (اختياري)
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="مثلاً: الخرطوم"
            />
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "جاري الحساب…" : "عرض السعر"}
            </button>
          </div>
        </form>

        {error && <p className="warnings">خطأ: {error}</p>}

        {q && (
          <div className="result">
            <div className="amount">{q.display.amountLine}</div>
            <div className="fair">{q.display.fairRateLine}</div>
            <div>{q.display.executableLine}</div>
            <div className="meta">
              <div>{q.display.marginLine}</div>
              <div>{q.display.confidenceLine}</div>
              <div>{q.display.sourcesLine}</div>
              <div>{q.display.updatedLine}</div>
              <span className={`badge ${q.metrics.sourceHealth.toLowerCase()}`}>
                حالة المصدر: {healthLabel[q.metrics.sourceHealth]}
              </span>
            </div>
            {q.warnings?.length > 0 && (
              <div className="warnings">
                {q.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <TraderPanel apiBase={API_BASE} />

      {calibration && (
        <section className="section panel">
          <h2>عينة معايرة 27 يوليو 2026</h2>
          <p>مؤرخة وليست سعراً حياً — لا تُعد إثبات دقة بمفردها.</p>
          <div className="result">
            <div className="amount">{calibration.display.amountLine}</div>
            <div className="fair">{calibration.display.fairRateLine}</div>
            <div>{calibration.display.executableLine}</div>
            <div className="meta">
              <div>{calibration.display.marginLine}</div>
              <div>{calibration.display.sourcesLine}</div>
            </div>
          </div>
        </section>
      )}

      <section className="section" id="method">
        <h2>المنهجية باختصار</h2>
        <p>
          ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT باستخدام عمق العروض
          القابل لتنفيذ المبلغ كاملاً. التجميع: Weighted Median مع سقف 10٪ لكل تاجر. عند غياب أحد
          الجانبين يُعرض «سعر تقديري غير قابل للتنفيذ» فقط.
        </p>
      </section>

      <footer className="footer">
        لا حفظ لأموال العملاء · لا تنفيذ صرف تلقائي · لا جمع لأسرار بنكك · البيانات الحساسة تُشفَّر
        ومفتاح Binance يبقى على جهاز التاجر.
      </footer>
    </div>
  );
}
