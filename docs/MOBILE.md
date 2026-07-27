# تطبيق مطمن للجوال — ابدأ اليوم

## الأسرع اليوم (بدون متجر)

1. شغّل الخادم:
```bash
./scripts/start_mobile.sh
```
2. افتح الرابط العام أو رابط الشبكة على هاتفك.
3. من Chrome/Safari: **إضافة إلى الشاشة الرئيسية**.
4. ادخل تبويب **التجار** وابدأ الإضافة/البحث/التواصل.
5. من تبويب **السحابة**: انسخ احتياطيًا كل يوم.

## ماذا يُحفظ سحابيًا؟

- التجار وحالاتهم
- سجل التواصل
- النسخ الاحتياطية
- أسعار التسعير المرتبطة بالاستخدام
- معرف الجهاز (لا مفاتيح Binance)

قاعدة البيانات الافتراضية: `motman_cloud.db`
للإنتاج ضع Postgres:
```bash
export CLOUD_DATABASE_URL=postgresql+psycopg://user:pass@host/db
```

## Capacitor (Android لاحقًا)

```bash
cd frontend
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

يتطلب Android Studio محليًا لبناء APK. المشروع جاهز للربط.

## ملاحظات أمان

- لا تنفيذ صرف ولا حفظ أموال.
- لا تخزّن PIN/OTP.
- فضّل معرفات تلغرام بدل أرقام كاملة عند الإمكان.