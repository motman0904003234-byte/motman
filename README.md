# Salon Booking Agent - Kigali 💅

Workflow أتمتة ذكي لحجوزات صالون التجميل في كيغالي، مبني على n8n مع تكامل كامل بين:
**WhatsApp (Twilio) ↔ Claude AI ↔ Telegram (مراجعة) ↔ Google Sheets ↔ WhatsApp (رد)**

---

## مخطط سير العمل (Flow Diagram)

```
عميل يرسل واتساب
        │
        ▼
[📱 Twilio Webhook] ──── يستقبل الرسالة ويرد فوراً بـ 200 OK
        │
        ▼
[📋 استخراج البيانات] ── customerMessage / customerPhone / sandboxNumber
        │
        ▼
[🤖 Claude AI] ────────── claude-sonnet-4-6 | System Prompt: مساعد حجوزات
        │
        ▼
[✍️ تحضير رسالة المراجعة] ── يبني رابطَي الموافقة/الرفض مع resumeUrl
        │
        ▼
[📨 تيليجرام للمالك] ──── رسالة Markdown + رابط ✅ موافقة | ❌ رفض
        │
        ▼
[⏳ انتظار الموافقة] ──── Workflow يتوقف حتى يضغط المالك
        │
        ▼
[✅ هل تمت الموافقة؟]
       / \
      /   \
   نعم    لا
    │      │
    ▼      ▼
[🔍 استخراج   [❌ رسالة
 بيانات الحجز]  رفض للعميل]
    │
    ▼
[📊 Google Sheets] ── الاسم / الخدمة / الوقت / الحالة / التاريخ
    │
    ▼
[📤 Twilio WhatsApp] ── إرسال الرد المعتمد للعميل
```

---

## الإعداد خطوة بخطوة

### 1. استيراد الـ Workflow

1. افتح **n8n** → اذهب إلى **Workflows**
2. اضغط **Import from File**
3. اختر ملف `salon-booking-agent-kigali.json`
4. ستجد الـ workflow جاهزاً للإعداد

---

### 2. إعداد الـ Credentials

#### أ) Anthropic API Key (Claude)
1. اذهب إلى **Credentials** → **New** → ابحث عن `HTTP Header Auth`
2. الاسم: `Anthropic API Key`
3. **Name**: `x-api-key`
4. **Value**: مفتاحك من [console.anthropic.com](https://console.anthropic.com)
5. في الـ workflow، ربط هذا الـ credential بنود **🤖 Claude AI - رد مقترح**

#### ب) Telegram Bot
1. أنشئ بوت من [@BotFather](https://t.me/BotFather) واحفظ الـ Token
2. اذهب إلى **Credentials** → **New** → `Telegram API`
3. أضف الـ Bot Token
4. احصل على **Chat ID** الخاص بك:
   - أرسل أي رسالة للبوت
   - افتح: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - انسخ قيمة `"id"` من قسم `"chat"`
5. في نود **📨 إرسال للمراجعة - تيليجرام**:
   - استبدل `OWNER_TELEGRAM_CHAT_ID` بالـ Chat ID الخاص بك

#### ج) Twilio
1. من [console.twilio.com](https://console.twilio.com) احصل على:
   - Account SID
   - Auth Token
2. اذهب إلى **Credentials** → **New** → `Twilio API`
3. أضف Account SID و Auth Token
4. تأكد من تفعيل **WhatsApp Sandbox** من Twilio Console

#### د) Google Sheets
1. اذهب إلى **Credentials** → **New** → `Google Sheets OAuth2 API`
2. اتبع خطوات ربط حساب Google
3. أنشئ Google Sheet جديد بالأعمدة التالية (بالترتيب):

| الاسم | الخدمة | الوقت | الحالة | رقم_الهاتف | رسالة_العميل | رد_المساعد | التاريخ |
|-------|--------|-------|--------|------------|--------------|------------|---------|

4. انسخ **Sheet ID** من رابط الـ Sheet:
   `https://docs.google.com/spreadsheets/d/**SHEET_ID**/edit`
5. في نود **📊 إضافة في Google Sheets**:
   - استبدل `YOUR_GOOGLE_SHEET_ID` بالـ ID الحقيقي

---

### 3. إعداد Twilio WhatsApp Sandbox

1. افتح الـ workflow في n8n وشغّله (لأخذ الـ Webhook URL)
2. انسخ الـ URL من نود **📱 Twilio WhatsApp Trigger**:
   ```
   https://your-n8n-instance.com/webhook/twilio-whatsapp
   ```
3. اذهب إلى Twilio Console:
   - **Messaging** → **Try it out** → **Send a WhatsApp message**
   - في حقل **WHEN A MESSAGE COMES IN**: الصق الـ URL
4. من هاتفك أرسل `join <sandbox-keyword>` للرقم التجريبي للانضمام للـ Sandbox

---

### 4. تفعيل الـ Workflow

1. في n8n افتح الـ workflow
2. اضغط على زر **Active** (مفتاح التفعيل) في الأعلى
3. الـ Workflow أصبح يعمل تلقائياً ✅

---

## كيفية الاستخدام

### من منظور العميل:
```
عميل → يرسل واتساب: "أريد حجز موعد لقص الشعر يوم الجمعة"
     ← يستقبل الرد تلقائياً بعد موافقة صاحب الصالون
```

### من منظور صاحب الصالون:
```
يستقبل على تيليجرام:
──────────────────────────────
🔔 طلب حجز جديد - صالون كيغالي

📱 العميل: `whatsapp:+250788123456`
💬 رسالة العميل: أريد حجز موعد لقص الشعر يوم الجمعة

🤖 الرد المقترح:
مرحباً! يسعدنا خدمتك. هل يمكنك تزويدنا باسمك الكريم؟
وهل تفضلين وقتاً صباحياً أم مسائياً يوم الجمعة؟

─────────────────────
✅ موافقة وإرسال الرد
❌ رفض وإلغاء
──────────────────────────────

يضغط ✅ → يُرسل الرد للعميل + يُسجَّل في Google Sheets
يضغط ❌ → يُرسل للعميل رسالة اعتذار
```

---

## بنية البيانات في Google Sheets

| العمود | المصدر | مثال |
|--------|--------|------|
| الاسم | مستخرج من رد Claude | فاطمة |
| الخدمة | مستخرج من رد Claude | قص شعر |
| الوقت | مستخرج من رد Claude | الجمعة 3 عصراً |
| الحالة | ثابت | مؤكد ✅ |
| رقم_الهاتف | من Twilio | +250788123456 |
| رسالة_العميل | رسالة العميل الأصلية | أريد حجز... |
| رد_المساعد | رد Claude الكامل | مرحباً! يسعدنا... |
| التاريخ | تلقائي | 11/09/2026 |

> **ملاحظة:** استخراج الاسم/الخدمة/الوقت يعتمد على نص رد Claude. إذا لم يتمكن من استخراجها، ستظهر القيمة "يحتاج مراجعة" وتستطيع التعديل يدوياً في الـ Sheet.

---

## المتطلبات

| الأداة | الإصدار المطلوب |
|--------|----------------|
| n8n | v1.0+ |
| Twilio Account | مع WhatsApp Sandbox مفعّل |
| Anthropic API | وصول لـ claude-sonnet-4-6 |
| Telegram Bot | أي بوت فعّال |
| Google Account | مع Google Sheets API مفعّل |

---

## استكشاف الأخطاء

**الـ Webhook لا يستقبل رسائل؟**
- تأكد أن الـ workflow نشط (Active)
- تحقق من URL في Twilio Console
- تأكد أن n8n instance متاح من الإنترنت

**Claude لا يرد؟**
- تحقق من صحة الـ API Key في credentials
- تأكد من وجود رصيد في حساب Anthropic

**رسائل تيليجرام لا تصل؟**
- تحقق من Chat ID (يجب أن يكون رقماً مثل `123456789`)
- تأكد أن البوت تلقى رسالة منك أولاً

**Google Sheets لا يُضاف؟**
- تأكد من Sheet ID الصحيح
- تأكد من أن أسماء الأعمدة في الـ Sheet مطابقة تماماً للقائمة أعلاه
