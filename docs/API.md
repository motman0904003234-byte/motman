# API

Base: `http://localhost:8787`

| Method | Path | وصف |
|--------|------|-----|
| GET | `/health` | صحة الخدمة |
| GET | `/v1/meta` | سياسة المرحلة 1 والممرات |
| GET | `/v1/snapshot` | لقطة مصادر + معايرة |
| GET | `/v1/calibration/2026-07-27` | عينة تاريخية (`isLive: false`) |
| GET/POST | `/v1/quote` | تسعير مبلغ+مسار |
| GET | `/v1/history` | تيكات تاريخية للرسوم |
| GET | `/v1/audit` | سجل تدقيق |
| POST | `/v1/refresh` | تحديث من الموصلات (فشل ناعم) |
| POST | `/v1/ingest/trades` | صفقات مكتملة مجهولة من الموصل المحلي |
| POST | `/v1/ingest/rfq` | سعر ملزم من لوحة التاجر |
| GET | `/v1/widget.js` | ودجت مواقع |

## مثال Quote

```http
GET /v1/quote?amount=100000&from=Bankak-SDG&to=MTN-MoMo-RWF&mode=calibration_aware
```

الاستجابة تتضمن `display` (عربي جاهز للواجهة) و`components` (حقول المؤشر كاملة) و`auditId` قابل لإعادة الإنتاج.

## نموذج العمل

- أساسي مجاني
- احترافي: تنبيهات وتحليلات
- API مدفوع للشركات
- تاريخي وتقارير ولوحة تجار وودجت
- **ممنوع** الدفع لتأثير الترتيب أو وزن المؤشر (`paidRankingAllowed: false`)
