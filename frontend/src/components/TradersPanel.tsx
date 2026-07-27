import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { addOutreach, listTraders, saveTrader, seedTraders, type Trader } from '../api'

const INTRO =
  'السلام عليكم، أحتاج سعر Bankak↔MoMo اليوم. هل لديكم سيولة لمبلغ 100000؟'
const QUOTE =
  'السلام عليكم، أحتاج سعرًا ملزمًا لـ100000 Bankak إلى MoMo خلال 15 دقيقة.'

export function TradersPanel() {
  const [items, setItems] = useState<Trader[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [city, setCity] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    display_name: '',
    city: 'Kigali',
    area: '',
    map_query: '',
    telegram: '',
    whatsapp: '',
    phone_note: '',
    rails: 'Bankak-SDG,MTN-MoMo-RWF,USDT',
    payment_methods: 'Bankak,MTN Mobile Money',
    notes: '',
    status: 'lead',
  })

  async function load() {
    try {
      const res = await listTraders({ q, status, city })
      setItems(res.items)
      if ((res as { offline?: boolean }).offline) {
        setMsg('وضع عدم اتصال: عرض النسخة المحلية المخزّنة')
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load().catch((e) => setMsg(String(e)))
  }, [])

  async function onSearch(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    await load()
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      await saveTrader({
        display_name: form.display_name,
        city: form.city,
        area: form.area,
        map_query: form.map_query || (form.area ? `${form.area} ${form.city}` : form.city),
        telegram: form.telegram,
        whatsapp: form.whatsapp,
        phone_note: form.phone_note,
        notes: form.notes,
        status: form.status,
        rails: form.rails.split(',').map((x) => x.trim()).filter(Boolean),
        payment_methods: form.payment_methods.split(',').map((x) => x.trim()).filter(Boolean),
        source: 'mobile',
        trust_score: 55,
      })
      setForm({
        ...form,
        display_name: '',
        area: '',
        map_query: '',
        telegram: '',
        whatsapp: '',
        phone_note: '',
        notes: '',
      })
      setMsg('تم حفظ التاجر في السحابة')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'فشل الحفظ')
    }
  }

  async function logContact(trader: Trader, channel: string, message: string) {
    await addOutreach({
      trader_id: trader.id,
      channel,
      message,
      outcome: 'contacted',
    })
    if (trader.status === 'lead' || trader.status === 'contacted') {
      try {
        await saveTrader({
          ...trader,
          display_name: trader.display_name,
          status: trader.status === 'lead' ? 'contacted' : 'active',
        })
      } catch {
        /* ignore */
      }
    }
  }

  async function openChannel(trader: Trader, channel: 'telegram' | 'whatsapp' | 'call' | 'map', template?: string) {
    const message = template || INTRO
    if (channel === 'telegram' || channel === 'whatsapp') {
      await logContact(trader, channel, message)
    }
    const text = encodeURIComponent(message)
    if (channel === 'telegram' && trader.telegram) {
      window.open(`https://t.me/${trader.telegram.replace('@', '')}?text=${text}`, '_blank')
    } else if (channel === 'whatsapp' && trader.whatsapp) {
      window.open(`https://wa.me/${trader.whatsapp.replace(/[^\d]/g, '')}?text=${text}`, '_blank')
    } else if (channel === 'call' && trader.whatsapp) {
      window.open(`tel:${trader.whatsapp}`, '_self')
    } else if (channel === 'map') {
      const q = encodeURIComponent(trader.map_query || `${trader.area || ''} ${trader.city}`.trim())
      window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank')
    } else {
      setMsg('لا يوجد رابط تواصل لهذا التاجر')
      return
    }
    setMsg(`تم فتح ${channel} — ${trader.display_name}`)
    await load()
  }

  return (
    <section className="panel grid">
      <h2 style={{ margin: 0 }}>التجار — ابدأ اليوم</h2>
      <p className="tag">
        ابحث، اتصل واتساب/تلغرام، افتح الخريطة. البيانات تُحفظ سحابيًا. صفوف DEMO للاختبار فقط.
      </p>

      <form className="grid" onSubmit={onSearch}>
        <div className="grid two">
          <label>
            بحث
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم / حي / تلغرام" />
          </label>
          <label>
            المدينة
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">الكل</option>
              <option value="Kigali">كيغالي</option>
              <option value="Khartoum">الخرطوم</option>
            </select>
          </label>
        </div>
        <div className="grid two">
          <label>
            الحالة
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">الكل</option>
              <option value="lead">جديد</option>
              <option value="contacted">تم التواصل</option>
              <option value="active">نشط</option>
              <option value="paused">موقوف</option>
            </select>
          </label>
          <button className="primary" type="submit">
            بحث
          </button>
        </div>
      </form>

      <div className="grid">
        {items.map((t) => (
          <article key={t.id} className="metric" style={{ display: 'grid', gap: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <strong>{t.display_name}</strong>
              <span className="badge live">{t.status}</span>
            </div>
            <div className="k">
              {t.city}
              {t.area ? ` · ${t.area}` : ''} · ثقة {t.trust_score}
            </div>
            <div className="k">{(t.rails || []).join(' · ')}</div>
            <div className="k">{t.telegram || t.whatsapp || 'بدون تواصل بعد'}</div>
            {t.notes && <div className="tag">{t.notes}</div>}
            <div className="grid two">
              <button
                className="primary"
                type="button"
                disabled={!t.whatsapp}
                onClick={() => void openChannel(t, 'whatsapp')}
              >
                واتساب
              </button>
              <button
                className="primary"
                type="button"
                disabled={!t.telegram}
                onClick={() => void openChannel(t, 'telegram')}
              >
                تلغرام
              </button>
            </div>
            <div className="grid two">
              <button type="button" disabled={!t.whatsapp} onClick={() => void openChannel(t, 'call')}>
                اتصال
              </button>
              <button type="button" onClick={() => void openChannel(t, 'map')}>
                خريطة
              </button>
            </div>
            <div className="grid two">
              <button type="button" onClick={() => void openChannel(t, t.whatsapp ? 'whatsapp' : 'telegram', QUOTE)}>
                طلب سعر
              </button>
              <button
                type="button"
                onClick={() =>
                  void saveTrader({
                    ...t,
                    display_name: t.display_name,
                    status: 'active',
                  }).then(load)
                }
              >
                تفعيل
              </button>
            </div>
          </article>
        ))}
        {items.length === 0 && <p className="tag">لا تجار بعد — أضف أول تاجر بالأسفل أو حمّل أمثلة.</p>}
      </div>

      <button
        type="button"
        onClick={() =>
          void seedTraders()
            .then(load)
            .then(() => setMsg('تمت إضافة/تحديث دليل التجار التجريبي'))
        }
      >
        تحميل دليل كيغالي التجريبي
      </button>

      <h3 style={{ marginBottom: 0 }}>إضافة تاجر حقيقي</h3>
      <form className="grid" onSubmit={onSave}>
        <label>
          الاسم الظاهر
          <input
            required
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </label>
        <div className="grid two">
          <label>
            المدينة
            <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option>Kigali</option>
              <option>Khartoum</option>
              <option>Unknown</option>
            </select>
          </label>
          <label>
            الحي / المنطقة
            <input
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="Remera / Kimironko"
            />
          </label>
        </div>
        <div className="grid two">
          <label>
            الحالة
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="lead">جديد</option>
              <option value="contacted">تم التواصل</option>
              <option value="active">نشط</option>
            </select>
          </label>
          <label>
            بحث الخريطة
            <input
              value={form.map_query}
              onChange={(e) => setForm({ ...form, map_query: e.target.value })}
              placeholder="Kimironko Market Kigali"
            />
          </label>
        </div>
        <div className="grid two">
          <label>
            Telegram
            <input
              value={form.telegram}
              onChange={(e) => setForm({ ...form, telegram: e.target.value })}
              placeholder="@username"
            />
          </label>
          <label>
            WhatsApp
            <input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="+250..."
            />
          </label>
        </div>
        <label>
          المسارات (مفصولة بفاصلة)
          <input value={form.rails} onChange={(e) => setForm({ ...form, rails: e.target.value })} />
        </label>
        <label>
          طرق الدفع
          <input
            value={form.payment_methods}
            onChange={(e) => setForm({ ...form, payment_methods: e.target.value })}
          />
        </label>
        <label>
          ملاحظات
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button className="primary">حفظ في السحابة</button>
      </form>
      {msg && <p className="tag">{msg}</p>}
    </section>
  )
}
