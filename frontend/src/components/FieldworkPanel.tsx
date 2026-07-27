import { useEffect, useState } from 'react'
import { getQuote } from '../api'

type DayPlan = {
  goal?: string
  steps?: string[]
  templates?: { id: string; title: string; body: string }[]
  queue?: {
    next_leads?: { id: string; name: string; city: string; area?: string; wa_link?: string; tg_link?: string }[]
    follow_ups?: { id: string; name: string; city: string; wa_link?: string; tg_link?: string }[]
  }
}

const TEMPLATES = [
  {
    id: 'intro',
    title: 'تعارف سريع',
    body: 'السلام عليكم، أعمل على مسار Bankak-SDG ↔ MTN MoMo RWF. هل تتعاملون بمبالغ 100 ألف / 500 ألف SDG؟',
  },
  {
    id: 'quote',
    title: 'طلب سعر ملزم',
    body: 'مرحبًا، أحتاج سعرًا ملزمًا لمبلغ {amount} Bankak إلى MoMo خلال 15 دقيقة. ما أفضل سعر تنفيذي لديكم؟',
  },
  {
    id: 'confirm',
    title: 'تأكيد شروط',
    body: 'للتأكيد قبل التنفيذ: المبلغ، طريقة الدفع، زمن التسوية، ومن يتحمل رسوم Binance/MoMo. هل موافق؟',
  },
  {
    id: 'follow',
    title: 'متابعة',
    body: 'متابعة بخصوص العرض السابق. هل السيولة ما زالت متاحة لنفس المبلغ اليوم؟',
  },
]

const CHECKLIST = [
  'سجّلت جهاز الهاتف في السحابة',
  'أضفت 5 تجار حقيقيين على الأقل',
  'تواصلت مع 3 تجار اليوم',
  'حفظت نسخة سحابية',
  'اختبرت تسعير 100 ألف Bankak→MoMo',
  'ثبّت التطبيق على الشاشة الرئيسية أو APK',
]

export function FieldworkPanel() {
  const [amount, setAmount] = useState('100000')
  const [stats, setStats] = useState<{
    n_traders?: number
    n_outreach?: number
    next_action?: string
  } | null>(null)
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [liveFair, setLiveFair] = useState<number | null>(null)
  const [liveLabel, setLiveLabel] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('motman_checklist') || '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    void fetch('/api/v1/mobile/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => undefined)
    void fetch('/api/v1/mobile/day-plan')
      .then((r) => r.json())
      .then(setPlan)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    void getQuote({
      amount: Number(amount) || 100000,
      from_rail: 'Bankak-SDG',
      to_rail: 'MTN-MoMo-RWF',
    })
      .then((q) => {
        setLiveFair(q.display.fair)
        setLiveLabel(q.label)
      })
      .catch(() => undefined)
  }, [amount])

  const templates = (plan?.templates?.length ? plan.templates : TEMPLATES).map((t) => ({
    ...t,
    body: t.body.replace('{amount}', amount),
  }))

  function toggle(item: string) {
    const next = { ...done, [item]: !done[item] }
    setDone(next)
    localStorage.setItem('motman_checklist', JSON.stringify(next))
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied('تم النسخ')
    setTimeout(() => setCopied(null), 1500)
  }

  function shareWhatsApp(text: string, link?: string) {
    const base = link || 'https://wa.me/'
    const sep = base.includes('?') ? '&' : '?'
    window.open(`${base}${sep}text=${encodeURIComponent(text)}`, '_blank')
  }

  const progress = CHECKLIST.filter((c) => done[c]).length
  const quoteMsg =
    liveFair != null
      ? `مرجع مطمن لـ${Number(amount).toLocaleString()} Bankak→MoMo ≈ ${Math.round(liveFair).toLocaleString()} RWF (${liveLabel}). أحتاج سعركم الملزم.`
      : templates.find((t) => t.id === 'quote')?.body || ''

  return (
    <section className="panel grid">
      <h2 style={{ margin: 0 }}>ميدان اليوم</h2>
      <p className="tag">
        قائمة تنفيذ + رسائل جاهزة + طابور تواصل. التقدم: {progress}/{CHECKLIST.length}
      </p>
      {stats && (
        <div className="metrics">
          <div className="metric">
            <div className="k">التجار</div>
            <div className="v">{stats.n_traders ?? 0}</div>
          </div>
          <div className="metric">
            <div className="k">تواصلات</div>
            <div className="v">{stats.n_outreach ?? 0}</div>
          </div>
        </div>
      )}
      {liveFair != null && (
        <div className="metric">
          <div className="k">مرجع مطمن الآن · {liveLabel}</div>
          <div className="v">{Math.round(liveFair).toLocaleString()} RWF</div>
          <div className="tag">لـ {Number(amount).toLocaleString()} Bankak → MoMo — قارن قبل الاتفاق</div>
          <button type="button" className="primary" onClick={() => void copy(quoteMsg)}>
            نسخ رسالة السعر المرجعي
          </button>
        </div>
      )}
      {stats?.next_action && <p className="tag">التالي: {stats.next_action}</p>}

      {(plan?.queue?.next_leads?.length || plan?.queue?.follow_ups?.length) && (
        <div className="grid">
          <h3 style={{ margin: 0 }}>طابور التواصل الآن</h3>
          {(plan?.queue?.next_leads || []).map((t) => (
            <article key={t.id} className="metric" style={{ display: 'grid', gap: '0.4rem' }}>
              <strong>
                {t.name}
                {t.area ? ` · ${t.area}` : ''}
              </strong>
              <div className="k">{t.city} · جديد</div>
              <div className="grid two">
                <button
                  type="button"
                  className="primary"
                  disabled={!t.wa_link}
                  onClick={() => shareWhatsApp(quoteMsg || templates[0]?.body || TEMPLATES[0].body, t.wa_link)}
                >
                  واتساب + سعر
                </button>
                <a href={t.tg_link || '#'} target="_blank" rel="noreferrer" style={{ textAlign: 'center' }}>
                  تلغرام
                </a>
              </div>
            </article>
          ))}
          {(plan?.queue?.follow_ups || []).map((t) => (
            <article key={t.id} className="metric" style={{ display: 'grid', gap: '0.4rem' }}>
              <strong>{t.name}</strong>
              <div className="k">{t.city} · متابعة</div>
              <button
                type="button"
                className="primary"
                disabled={!t.wa_link}
                onClick={() =>
                  shareWhatsApp(
                    templates.find((x) => x.id === 'follow')?.body || TEMPLATES[3].body,
                    t.wa_link,
                  )
                }
              >
                متابعة واتساب
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="grid">
        {CHECKLIST.map((item) => (
          <label key={item} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <input type="checkbox" checked={!!done[item]} onChange={() => toggle(item)} />
            <span>{item}</span>
          </label>
        ))}
      </div>

      <label>
        مبلغ الرسائل
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>

      <div className="grid">
        {templates.map((t) => (
          <article key={t.id} className="metric" style={{ display: 'grid', gap: '0.45rem' }}>
            <strong>{t.title}</strong>
            <div className="tag">{t.body}</div>
            <div className="grid two">
              <button type="button" className="primary" onClick={() => void copy(t.body)}>
                نسخ
              </button>
              <button type="button" onClick={() => shareWhatsApp(t.body)}>
                واتساب عام
              </button>
            </div>
          </article>
        ))}
      </div>
      {copied && <p className="tag">{copied}</p>}

      <div className="panel" style={{ boxShadow: 'none' }}>
        <h3 style={{ marginTop: 0 }}>تثبيت سريع</h3>
        <p className="tag">حمّل APK مباشرة (تجاوز الكاش) أو امسح QR.</p>
        <div className="grid two">
          <a
            className="primary"
            href="/api/v1/mobile/apk"
            download="motman.apk"
            style={{ textAlign: 'center', textDecoration: 'none' }}
          >
            تحميل APK
          </a>
          <a href="/motman.apk" download="motman.apk" style={{ textAlign: 'center' }}>
            رابط بديل
          </a>
        </div>
        <div className="grid two" style={{ marginTop: '0.5rem' }}>
          <a href="/api/v1/mobile/traders.csv" style={{ textAlign: 'center' }}>
            تصدير التجار CSV
          </a>
          <a href="/download" download="motman.apk" style={{ textAlign: 'center' }}>
            /download
          </a>
        </div>
        <div className="grid two" style={{ marginTop: '0.75rem' }}>
          <figure style={{ margin: 0, textAlign: 'center' }}>
            <img src="/downloads/motman-qr.png" alt="QR للتطبيق" style={{ width: '100%', maxWidth: 180 }} />
            <figcaption className="tag">فتح التطبيق</figcaption>
          </figure>
          <figure style={{ margin: 0, textAlign: 'center' }}>
            <img src="/downloads/motman-apk-qr.png" alt="QR للـAPK" style={{ width: '100%', maxWidth: 180 }} />
            <figcaption className="tag">تحميل APK</figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
