# تطبيق مطمن للجوال — ابدأ اليوم

## الحل الصحيح للتنزيل (ثابت)

أنفاق Cloudflare (`*.trycloudflare.com`) **مؤقتة وتنتهي**. لا تستخدمها لتحميل APK.

### حمّل من GitHub مباشرة:
- CDN: https://cdn.jsdelivr.net/gh/motman0904003234-byte/motman@cursor/fx-reference-index-e58d/releases/motman.apk
- GitHub: https://github.com/motman0904003234-byte/motman/raw/cursor/fx-reference-index-e58d/releases/motman.apk
- التعليمات: `releases/README.md`

### تثبيت
1. افتح الرابط من الهاتف → تحميل
2. ثبّت (مصادر غير معروفة)
3. الحزمة: `com.motman.fx`

## تشغيل الخادم (اختياري للتسعير/السحابة)

```bash
docker compose -f docker-compose.prod.yml up -d --build
# أو
./scripts/start_mobile.sh
```

ضع عنوان API في إعدادات التطبيق:
`https://YOUR_STABLE_HOST/api/v1`

بدون خادم: التطبيق يحتفظ بالتجار محليًا (وضع عدم اتصال).

## ميدان اليوم
- طابور تواصل + واتساب/تلغرام/خريطة
- رسائل جاهزة + سعر مرجعي عند توفر الـ API

## أمان
- لا تنفيذ صرف ولا حفظ أموال
- لا تخزّن PIN/OTP
- صفوف DEMO ليست تجارًا حقيقيين
