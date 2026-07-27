import { useEffect, useState, useTransition } from "react";
import { QuoteForm } from "./components/QuoteForm";
import { QuoteResult } from "./components/QuoteResult";
import { TraderPanel } from "./components/TraderPanel";
import { Methodology } from "./components/Methodology";
import type { PricingResult, Corridor } from "./types";

const API = import.meta.env.VITE_API_URL ?? "";

export function App() {
  const [tab, setTab] = useState<"quote" | "trader" | "method">("quote");
  const [result, setResult] = useState<PricingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastFetchMs, setLastFetchMs] = useState<number | null>(null);

  async function runQuote(input: {
    amount: number;
    fromCorridor: Corridor;
    toCorridor: Corridor;
    city?: string;
  }) {
    setError(null);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API}/v1/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, mode: "calibration_aware" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PricingResult;
      startTransition(() => {
        setResult(data);
        setLastFetchMs(Math.round(performance.now() - t0));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر جلب السعر");
    }
  }

  useEffect(() => {
    void runQuote({
      amount: 100_000,
      fromCorridor: "Bankak-SDG",
      toCorridor: "MTN-MoMo-RWF",
    });
  }, []);

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <p className="eyebrow">مرحلة البيانات والتنبيهات فقط — بلا حفظ أموال</p>
        <h1 className="brand">موتمن</h1>
        <p className="tagline">
          مؤشر مرجعي شفاف لمسارات Bankak-SDG وCash-SDG وMTN MoMo وBank-RWF عبر
          USD/USDT/USDC — كل مسار بسعره، بلا دمج مضلل.
        </p>
        <nav className="tabs" aria-label="أقسام التطبيق">
          <button
            className={tab === "quote" ? "active" : ""}
            onClick={() => setTab("quote")}
            type="button"
          >
            حاسبة السعر
          </button>
          <button
            className={tab === "trader" ? "active" : ""}
            onClick={() => setTab("trader")}
            type="button"
          >
            لوحة التاجر
          </button>
          <button
            className={tab === "method" ? "active" : ""}
            onClick={() => setTab("method")}
            type="button"
          >
            المنهجية
          </button>
        </nav>
      </header>

      <main>
        {tab === "quote" && (
          <section className="panel quote-panel">
            <QuoteForm onSubmit={runQuote} busy={pending} />
            {error && <p className="error">{error}</p>}
            {result && (
              <QuoteResult result={result} latencyMs={lastFetchMs} />
            )}
          </section>
        )}
        {tab === "trader" && <TraderPanel apiBase={API} />}
        {tab === "method" && <Methodology />}
      </main>

      <footer className="foot">
        <span>مجاني للأفراد · API للشركات · لا دفع لتأثير الترتيب</span>
      </footer>
    </div>
  );
}
