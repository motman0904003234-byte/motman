# API

Base: `http://127.0.0.1:8787`

## عام

| Method | Path | وصف |
|--------|------|-----|
| GET | `/health` | صحة الخدمة |
| GET | `/v1/methodology` | المنهجية الآلية |
| GET | `/v1/providers` | حالة المزودين |
| POST | `/v1/quote` | تسعير ممر لمبلغ وطريقة دفع |
| GET | `/v1/calibration/2026-07-27` | عينة معايرة مؤرخة |
| GET | `/v1/history` | نقاط تاريخية |
| POST | `/v1/accuracy/evaluate` | تقييم PercentageError |
| GET | `/v1/audit` | سجل التدقيق |
| POST | `/v1/admin/refresh` | تحديث كاش الملاحظات |

## تجار

| Method | Path | وصف |
|--------|------|-----|
| POST | `/v1/trader/trades` | رفع صفقات مكتملة مجهولة |
| POST | `/v1/trader/rfq` | أسعار ملزمة |
| POST | `/v1/trader/margin` | هامش إجمالي/صافي إن توفرت التكاليف |

### مثال Quote

```bash
curl -s http://127.0.0.1:8787/v1/quote \
  -H 'content-type: application/json' \
  -d '{
    "amount": 100000,
    "fromAsset": "BANKAK_SDG",
    "toAsset": "MTN_MOMO_RWF",
    "fromRail": "BANKAK",
    "toRail": "MTN_MOMO"
  }'
```

### حقول الصفقة المقبولة فقط

`tradeTime, asset, side, quantity, price, totalAmount, paymentMethod, fees, status=COMPLETED, traderAnonId`

يُرفض ضمنياً جمع الاسم الحقيقي، رقم الحساب، الهاتف، كلمة المرور، PIN أو OTP.
