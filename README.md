# Motman FX Reference Index

مؤشر مرجعي شفاف لمسارات الصرف:

- `Bankak-SDG`
- `Cash-SDG`
- `MTN-MoMo-RWF`
- `Bank-RWF`
- مع `USD` / `USDT` / `USDC` كوسائط

**لا يتم دمج هذه المسارات في سعر واحد مضلل.**

## المكونات

| المسار | الوظيفة |
|---|---|
| `backend/` | FastAPI + محرك تسعير + Provider Adapters |
| `frontend/` | PWA عربي RTL |
| `bot/` | بوت Telegram للأسعار والتنبيهات |
| `connector/` | موصل محلي لصفقات Binance C2C (المفتاح لا يغادر الجهاز) |
| `docs/` | المنهجية والأمن وتقرير الدقة |

## تشغيل سريع

```bash
# API
cd backend
python3 -m pip install -r requirements.txt
PYTHONPATH=. python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Web
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173

# Telegram CLI/bot
MOTMAN_API=http://127.0.0.1:8000/api/v1 python3 bot/telegram_bot.py

# Local connector (fixture mode)
python3 connector/local_c2c_connector.py --fixture data/seed/completed_fixture.json --dry-run
```

## معادلة التنفيذ

```
ExecutableRate = ExecutableBid_RWF_USDT ÷ ExecutableAsk_SDG_USDT
```

يُحسب عبر عمق العروض القابل لتنفيذ المبلغ كاملًا (VWAP)، لا أول إعلان فقط.

عند غياب جانب:

```
EstimatedRate = ShadowRate × (1 - DynamicDealerMargin)
```

ويُعرض صراحة كـ **سعر تقديري غير قابل للتنفيذ**.

## الأمن

- المرحلة الأولى: بيانات وتنبيهات فقط.
- لا حفظ لأموال العملاء.
- لا تنفيذ صرف تلقائي.
- لا جمع لبيانات بنكك السرية.
- موصل الصفقات محلي وبصلاحية قراءة فقط.

## الدقة

لا تُستخدم كلمة Accuracy دون تعريف:

```
PercentageError = abs(Predicted - ActualCompleted) / ActualCompleted × 100
```

معايير القبول تتطلب ≥300 صفقة مكتملة حقيقية و≥10 تجار مستقلين.  
البيانات الاصطناعية للاختبار البرمجي فقط، ولا تُستخدم لادعاء دقة حية. انظر `docs/ACCURACY_REPORT.md`.

## الترخيص التجاري

مجاني للسعر الأساسي. مدفوع للتنبيهات/API/التاريخ/لوحة التجار.  
**ممنوع** الدفع للتأثير على ترتيب الأسعار أو وزن المؤشر.

## الجاهزية

شغّل `./scripts/e2e.sh` للتحقق الكامل. التقرير الصادق في `docs/READY_REPORT.md`.


## تطبيق الجوال (ابدأ اليوم)

### تنزيل APK (رابط ثابت — لا تستخدم Cloudflare)
- CDN: https://cdn.jsdelivr.net/gh/motman0904003234-byte/motman@cursor/fx-reference-index-e58d/releases/motman.apk
- GitHub: https://github.com/motman0904003234-byte/motman/raw/cursor/fx-reference-index-e58d/releases/motman.apk

```bash
./scripts/start_mobile.sh
# أو إنتاج دائم على VPS:
docker compose -f docker-compose.prod.yml up -d --build
```

- تبويب **اليوم**: طابور تواصل + رسائل واتساب + تحميل ثابت
- تبويب **التجار**: واتساب / تلغرام / اتصال / خريطة
- نشر: `docs/DEPLOY.md` · جوال: `docs/MOBILE.md` · إصدارات: `releases/`
