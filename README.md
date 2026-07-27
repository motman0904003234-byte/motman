# مؤمن (Motman) — مؤشر أسعار صرف مرجعي

منصة بيانات وAPI وتطبيق ويب تقدمي (PWA) عربي RTL وبوت Telegram ولوحة/موصل تجار لأسعار:

- **Bankak-SDG** / **Cash-SDG**
- **MTN-MoMo-RWF** / **Bank-RWF**
- جسور: **USD / USDT / USDC**

لا تُدمج المسارات في سعر واحد مضلل. كل مسار له سعره، مع مؤشر مرجعي واضح المنهجية.

## المرحلة الحالية

بيانات وتنبيهات فقط:

- لا حفظ لأموال العملاء
- لا تنفيذ صرف تلقائي
- لا جمع لأسرار بنكك
- مفتاح Binance السري يبقى على جهاز التاجر (موصل محلي)

## التشغيل السريع

```bash
npm install
npm run build -w @motman/shared && npm run build -w @motman/core && npm run build -w @motman/adapters
npm run seed -w @motman/api
npm run dev:api
# طرفية أخرى
npm run dev:web
```

- API: `http://127.0.0.1:8787`
- Web PWA: `http://127.0.0.1:5173`

## المعادلة الأساسية

```
ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT
```

باستخدام عمق العروض القابل لتنفيذ المبلغ كاملاً (وليس أول إعلان).

عند غياب أحد الجانبين:

```
EstimatedRate = ShadowRate × (1 - DynamicDealerMargin)
```

ويُعرض صراحة: **سعر تقديري غير قابل للتنفيذ**.

## الحزم

| المسار | الوظيفة |
|--------|---------|
| `packages/shared` | الأنواع المشتركة |
| `packages/core` | التسعير، Weighted Median، الدقة |
| `packages/adapters` | موصّلات مصادر مستقلة |
| `apps/api` | REST API + سجل تدقيق |
| `apps/web` | PWA عربي RTL |
| `apps/telegram-bot` | أسعار وتنبيهات |
| `apps/trader-connector` | موصل C2C محلي |

## الاختبار

```bash
npm test
npm run test:accuracy
```

## الدقة

لا تُدعى «Accuracy» دون تعريف:

```
PercentageError = abs(Predicted - ActualCompleted) / ActualCompleted × 100
```

معايير القبول تتطلب ≥300 صفقة مكتملة حقيقية و≥10 تجار مستقلين. البيانات الاصطناعية للاختبار البرمجي فقط وموسومة `isSynthetic`.

## التوثيق

- [المنهجية](docs/METHODOLOGY.md)
- [API](docs/API.md)
- [الأمن](docs/SECURITY.md)
- [تقرير الدقة والمخاطر](docs/ACCURACY_AND_RISKS.md)
- [نص النقاش الذاتي الثنائي](docs/DUAL_AGENT_PROMPT.md)
