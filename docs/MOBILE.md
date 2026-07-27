# تطبيق مطمن للجوال — ابدأ اليوم

## الأسرع اليوم

### 1) PWA على الهاتف (موصى به فورًا)
افتح الرابط العام ثم «إضافة إلى الشاشة الرئيسية»:

- Cloudflare: انظر `/opt/cursor/artifacts/MOBILE_URLS.txt`
- محلي: `http://127.0.0.1:8000`

### 2) تثبيت APK أندرويد
روابط التنزيل الموثوقة (لا تستخدم `/downloads/...` فقط إن فشل):

- `/api/v1/mobile/apk` ← الأفضل
- `/motman.apk`
- `/download.html` صفحة تنزيل بسيطة

أو من الملفات المحلية:
`/opt/cursor/artifacts/motman-debug.apk`

```bash
./scripts/build_apk.sh
```

ثم انقل APK للهاتف وثبّته (مصدر غير معروف).

في التطبيق: **إعدادات → عنوان API السحابي** =
`https://YOUR_PUBLIC_HOST/api/v1`

افتح دائمًا الرابط الحالي من `/opt/cursor/artifacts/MOBILE_URLS.txt` لأن نفق Cloudflare قد يتغيّر.

## ميدان اليوم داخل التطبيق
- تبويب **اليوم**: قائمة تحقق + طابور تواصل + رسائل واتساب جاهزة + QR
- تبويب **التجار**: واتساب / تلغرام / اتصال / خريطة لكل تاجر
- دليل كيغالي التجريبي (DEMO) قابل للاستبدال بجهات حقيقية

## ماذا يُحفظ سحابيًا؟
- التجار وحالاتهم والمناطق وروابط الخرائط
- سجل التواصل
- النسخ الاحتياطية
- أسعار التسعير
- معرف الجهاز

قاعدة البيانات الافتراضية: `motman_cloud.db`  
للإنتاج:
```bash
export CLOUD_DATABASE_URL=postgresql+psycopg://user:pass@host/db
docker compose -f docker-compose.prod.yml up -d --build
```

## Capacitor
```bash
cd frontend
npm run build && npx cap sync android
npx cap open android
```

## أمان
- لا تنفيذ صرف ولا حفظ أموال
- لا تخزّن PIN/OTP
- فضّل Telegram بدل أرقام كاملة عند الإمكان
- صفوف DEMO ليست تجارًا حقيقيين
