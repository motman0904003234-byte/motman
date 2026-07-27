# مؤشر موتمن للصرف (Motman FX Reference Index)

منصة بيانات شفافة لأسعار مسارات منفصلة:

| المسار | الوصف |
|--------|--------|
| Bankak-SDG | الجنيه السوداني داخل بنكك |
| Cash-SDG | الجنيه السوداني النقدي |
| MTN-MoMo-RWF | الفرنك الرواندي عبر MTN Mobile Money |
| Bank-RWF | الفرنك الرواندي البنكي |

العملات الوسيطة: **USD / USDT / USDC**. لا تُدمج المسارات في سعر واحد مضلل.

## المرحلة 1

- بيانات وتنبيهات فقط
- بلا حفظ أموال عملاء
- بلا تنفيذ صرف تلقائي
- بلا جمع بيانات بنكك السرية

## البنية

```
apps/api                 واجهة REST + محرك السوق + SQLite + سجل تدقيق
apps/web                 PWA عربي RTL
apps/telegram-bot        أسعار وتنبيهات
apps/trader-connector    موصل محلي (المفتاح لا يغادر الجهاز)
packages/core            Weighted Median، العمق التنفيذي، الدقة، الهوامش
packages/adapters        Binance P2P، RFQ، صفقات مكتملة، بنوك رسمية، سوق موازٍ
packages/shared          أنواع مشتركة
docs/                    المنهجية، API، الأمن، تقرير الدقة، نص نقاش الذكاء الاصطناعي
```

## التشغيل السريع

```bash
pnpm install
pnpm --filter @motman/shared build
pnpm --filter @motman/core build
pnpm --filter @motman/adapters build
pnpm --filter @motman/api dev          # :8787
pnpm --filter @motman/web dev          # :5173
```

اختبارات:

```bash
pnpm test
pnpm accuracy   # يرفض ادّعاء الدقة بدون ≥300 صفقة حقيقية
```

## معادلة المسار Bankak → MoMo

```
ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT
```

عمق كامل للمبلغ. عند غياب جانب:

```
EstimatedRate = ShadowRate × (1 - DynamicDealerMargin)
```

يُعرض صراحةً كـ **سعر تقديري غير قابل للتنفيذ**.

## عينة معايرة (ليست سعراً حياً)

- التاريخ: 2026-07-27
- 100,000 Bankak-SDG → نظري 25,587.78 RWF / ميداني 25,200 RWF / فرق 1.54%
- 180 عرض شراء بنكك، ولا بيع يقبل 100 ألف

## الوثائق

- [المنهجية](docs/METHODOLOGY.md)
- [API](docs/API.md)
- [الأمن](docs/SECURITY.md)
- [تقرير الدقة](docs/ACCURACY_REPORT.md)
- [نص نقاش الذكاء الاصطناعي الإلزامي](docs/AI_SELF_DEBATE_PROMPT.md)
