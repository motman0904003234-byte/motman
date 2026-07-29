import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getQuote } from '../api'
import type { QuoteResponse, Rail } from '../api'

const rails: Rail[] = [
  'Bankak-SDG',
  'Cash-SDG',
  'MTN-MoMo-RWF',
  'Bank-RWF',
  'USDT',
  'USDC',
  'USD',
]

function badgeClass(label: string, status: string) {
  if (label === 'EXECUTABLE') return 'badge exec'
  if (label === 'ESTIMATED_NON_EXECUTABLE') return 'badge est'
  if (label === 'NO_EXECUTABLE_LIQUIDITY') return 'badge no'
  if (status === 'LIVE') return 'badge live'
  if (status === 'STALE') return 'badge stale'
  return 'badge down'
}

function labelAr(label: string) {
  switch (label) {
    case 'EXECUTABLE':
      return 'سعر تنفيذي'
    case 'ESTIMATED_NON_EXECUTABLE':
      return 'تقديري غير قابل للتنفيذ'
    case 'NO_EXECUTABLE_LIQUIDITY':
      return 'لا يوجد سعر تنفيذي حاليًا'
    default:
      return label
  }
}

export function QuotePanel() {
  const [amount, setAmount] = useState('100000')
  const [fromRail, setFromRail] = useState<Rail>('Bankak-SDG')
  const [toRail, setToRail] = useState<Rail>('MTN-MoMo-RWF')
  const [fromPayment, setFromPayment] = useState('Bankak')
  const [toPayment, setToPayment] = useState('MTN Mobile Money')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<QuoteResponse | null>(null)

  const ageText = useMemo(() => {
    if (!data?.display.last_update) return '—'
    const t = new Date(data.display.last_update).getTime()
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000))
    return `منذ ${sec} ثانية`
  }, [data])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await getQuote({
        amount: Number(amount),
        from_rail: fromRail,
        to_rail: toRail,
        from_payment: fromPayment,
        to_payment: toPayment,
        city: city || null,
      })
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ غير معروف')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel">
      <form className="grid" onSubmit={onSubmit}>
        <div className="grid two">
          <label>
            المبلغ
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label>
            المدينة (اختياري)
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">غير محدد</option>
              <option value="Khartoum">الخرطوم</option>
              <option value="Kigali">كيغالي</option>
            </select>
          </label>
        </div>
        <div className="grid two">
          <label>
            من
            <select value={fromRail} onChange={(e) => setFromRail(e.target.value as Rail)}>
              {rails.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            إلى
            <select value={toRail} onChange={(e) => setToRail(e.target.value as Rail)}>
              {rails.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid two">
          <label>
            طريقة الدفع الأصلية
            <select value={fromPayment} onChange={(e) => setFromPayment(e.target.value)}>
              <option>Bankak</option>
              <option>Cash</option>
              <option>Bank Transfer</option>
            </select>
          </label>
          <label>
            طريقة الدفع المطلوبة
            <select value={toPayment} onChange={(e) => setToPayment(e.target.value)}>
              <option>MTN Mobile Money</option>
              <option>Bank Transfer</option>
              <option>Cash</option>
            </select>
          </label>
        </div>
        <button className="primary" disabled={loading}>
          {loading ? 'جارٍ التسعير…' : 'احسب السعر الشفاف'}
        </button>
      </form>

      {error && <p className="warnings">{error}</p>}

      {data && (
        <div className="result">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className={badgeClass(data.label, data.display.source_status)}>
              {labelAr(data.label)}
            </span>
            <span className={badgeClass('', data.display.source_status)}>
              المصدر: {data.display.source_status}
            </span>
          </div>
          <h2>{data.display.title}</h2>
          <div className="metrics">
            <div className="metric">
              <div className="k">السعر العادل</div>
              <div className="v">
                {data.display.fair == null ? '—' : data.display.fair.toLocaleString('en-US')}
              </div>
            </div>
            <div className="metric">
              <div className="k">السعر التنفيذي</div>
              <div className="v">{data.display.executable}</div>
            </div>
            <div className="metric">
              <div className="k">الهامش الإجمالي</div>
              <div className="v">{data.display.margin ?? '—'}</div>
            </div>
            <div className="metric">
              <div className="k">الثقة</div>
              <div className="v">{data.display.confidence}/100</div>
            </div>
            <div className="metric">
              <div className="k">تجار مستقلون</div>
              <div className="v">{data.display.independent_sources}</div>
            </div>
            <div className="metric">
              <div className="k">آخر تحديث</div>
              <div className="v">{ageText}</div>
            </div>
          </div>
          {data.result.calibration_note && (
            <p className="tag">{data.result.calibration_note}</p>
          )}
          {data.result.warnings?.length > 0 && (
            <ul className="warnings">
              {data.result.warnings.map((w: string) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <p className="tag mono">{data.result.methodology}</p>
        </div>
      )}
    </section>
  )
}