import { useEffect, useState } from 'react'

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
  const [stats, setStats] = useState<{ n_traders?: number; n_outreach?: number; next_action?: string } | null>(
    null,
  )
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
  }, [])

  const templates = TEMPLATES.map((t) => ({ ...t, body: t.body.replace('{amount}', amount) }))

  function toggle(item: string) {
    const next = { ...done, [item]: !done[item] }
    setDone(next)
    localStorage.setItem('motman_checklist', JSON.stringify(next))
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
  }

  const progress = CHECKLIST.filter((c) => done[c]).length

  return (
    <section className="panel grid">
      <h2 style={{ margin: 0 }}>ميدان اليوم</h2>
      <p className="tag">
        قائمة تنفيذ + رسائل جاهزة للتجار. التقدم: {progress}/{CHECKLIST.length}
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
      {stats?.next_action && <p className="tag">التالي: {stats.next_action}</p>}

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
            <button type="button" className="primary" onClick={() => void copy(t.body)}>
              نسخ الرسالة
            </button>
          </article>
        ))}
      </div>

      <div className="panel" style={{ boxShadow: 'none' }}>
        <h3 style={{ marginTop: 0 }}>تثبيت سريع</h3>
        <p className="tag">حمّل APK أو امسح رمز QR من الخادم.</p>
        <div className="grid two">
          <a className="primary" href="/downloads/motman.apk" style={{ textAlign: 'center', textDecoration: 'none' }}>
            تحميل APK
          </a>
          <a href="/api/v1/mobile/download-info" style={{ textAlign: 'center' }}>
            معلومات التحميل
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