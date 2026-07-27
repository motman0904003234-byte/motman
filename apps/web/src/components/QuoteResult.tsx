import type { PricingResult } from "../types";

const statusAr: Record<string, string> = {
  LIVE: "مباشر",
  STALE: "متأخر",
  DOWN: "متوقف",
};

export function QuoteResult({
  result,
  latencyMs,
}: {
  result: PricingResult;
  latencyMs: number | null;
}) {
  const c = result.components;
  const warn =
    c.rateLabel !== "EXECUTABLE"
      ? c.rateLabel === "ESTIMATED_NON_EXECUTABLE"
        ? "سعر تقديري غير قابل للتنفيذ"
        : "لا يوجد سعر تنفيذي حالياً"
      : null;

  return (
    <article className="result" aria-live="polite">
      <h2>{result.display.amountLabel}</h2>
      <p className="fair">{result.display.fairPriceLabel}</p>
      <p className={warn ? "exec warn" : "exec"}>{result.display.executableRangeLabel}</p>
      <ul className="metrics">
        <li>{result.display.marginLabel}</li>
        <li>{result.display.confidenceLabel}</li>
        <li>{result.display.sourcesLabel}</li>
        <li>{result.display.lastUpdateLabel}</li>
        <li>حالة المصدر: {statusAr[c.sourceStatus] ?? c.sourceStatus}</li>
        {latencyMs != null && <li>استجابة الواجهة: {latencyMs}ms</li>}
      </ul>
      <div className="grid">
        <Metric label="آخر صفقة مكتملة" value={fmt(c.lastCompletedTrade)} />
        <Metric label="سعر الشراء (Bid)" value={fmt(c.bid)} />
        <Metric label="سعر البيع (Ask)" value={fmt(c.ask)} />
        <Metric label="السعر النظري" value={fmt(c.theoretical)} />
        <Metric label="المتوقع لدى المتداول" value={fmt(c.traderExpected)} />
        <Metric label="الفرق Spread" value={c.spread != null ? `${c.spread.toFixed(2)}%` : "—"} />
        <Metric
          label="هامش التاجر الإجمالي"
          value={
            c.grossDealerMargin != null ? `${c.grossDealerMargin.toFixed(2)}%` : "—"
          }
        />
        <Metric label="السيولة المتاحة" value={fmt(c.availableLiquidity)} />
        <Metric label="تجار مستقلون" value={String(c.independentMerchants)} />
        <Metric label="الثقة" value={`${c.confidence}/100`} />
      </div>
      <p className="note">{c.methodologyNote}</p>
      <p className="audit">معرف التدقيق: {result.auditId}</p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function fmt(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n * 100) / 100;
}
