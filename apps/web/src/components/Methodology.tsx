export function Methodology() {
  return (
    <section className="panel method">
      <h2>المنهجية</h2>
      <ol>
        <li>
          <strong>ExecutableRate</strong> = ExecutableBid_RWF_USDT ÷
          ExecutableAsk_SDG_USDT باستخدام عمق العروض القابل لتنفيذ المبلغ كاملاً.
        </li>
        <li>
          عند غياب أحد الجانبين:{" "}
          <strong>EstimatedRate</strong> = ShadowRate × (1 −
          DynamicDealerMargin) ويُعرض كـ «سعر تقديري غير قابل للتنفيذ».
        </li>
        <li>Weighted Median مع سقف 10% لوزن أي تاجر.</li>
        <li>الأوزان: صفقات مكتملة &gt; RFQ ملزم &gt; إعلانات.</li>
        <li>الأسعار الرسمية لكشف الأخطاء فقط — لا تُفرض كسعر تنفيذي.</li>
        <li>
          PercentageError = |Predicted − Actual| ÷ Actual × 100 — لا تُستخدم كلمة
          Accuracy بلا هذا التعريف.
        </li>
      </ol>
      <p>
        عينة 27 يوليو 2026 (تاريخية، ليست حية): 100,000 Bankak-SDG → نظري
        25,587.78 RWF / ميداني 25,200 RWF / فرق 1.54% — مع 180 عرض شراء وغياب بيع
        يقبل 100 ألف.
      </p>
    </section>
  );
}
