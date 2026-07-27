# API

Base: `/api/v1`

| Method | Path | وصف |
|---|---|---|
| GET | `/health` | صحة الخدمة وحالة المصادر |
| GET | `/rails` | المسارات المدعومة |
| POST | `/refresh` | تحديث كل الـadapters |
| POST | `/quote` | تسعير مبلغ/مسار/دفع |
| POST | `/traders/rfq` | سعر ملزم |
| POST | `/traders/completed` | دفعات صفقات مكتملة مجهولة |
| GET | `/history` | سجل التسعير |
| GET | `/audit` | سجل تدقيق |
| GET | `/methodology` | المنهجية |
| POST | `/accuracy/evaluate` | تقييم الدقة المعرّفة |
| GET | `/business` | نموذج العمل |

## مثال quote

```bash
curl -X POST localhost:8000/api/v1/quote \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 100000,
    "from_rail": "Bankak-SDG",
    "to_rail": "MTN-MoMo-RWF",
    "from_payment": "Bankak",
    "to_payment": "MTN Mobile Money"
  }'
```

الحقول الحساسة (password/pin/otp/secret) في `/traders/completed` تُرفض.