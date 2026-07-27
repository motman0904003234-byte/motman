import { useState } from 'react'
import type { FormEvent } from 'react'
import { submitRfq } from '../api'

export function TraderDesk() {
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    trader_anon_id: 't_demo_trader',
    base_rail: 'USDT',
    quote_rail: 'Bankak-SDG',
    side: 'SELL',
    price: '599.5',
    amount_base: '150',
    payment_method: 'Bankak',
    city: 'Khartoum',
  })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      const res = await submitRfq({
        ...form,
        price: Number(form.price),
        amount_base: Number(form.amount_base),
        valid_minutes: 20,
      })
      setMsg(`تم تسجيل سعر ملزم: ${res.quote_id}`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'فشل الإرسال')
    }
  }

  return (
    <section className="panel grid">
      <h2 style={{ margin: 0 }}>لوحة التاجر — أسعار ملزمة</h2>
      <p className="tag">
        ارفع أسعار RFQ ملزمة لنفس المبلغ وطريقة الدفع. لا ترفع أسرارًا أو أرقام حسابات أو OTP.
        سجلات الصفقات المكتملة تُرفع عبر الموصل المحلي فقط.
      </p>
      <form className="grid" onSubmit={onSubmit}>
        <div className="grid two">
          {(
            [
              ['trader_anon_id', 'معرّف تاجر مجهول'],
              ['price', 'السعر'],
              ['amount_base', 'الكمية'],
              ['payment_method', 'طريقة الدفع'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="grid two">
          <label>
            base_rail
            <select
              value={form.base_rail}
              onChange={(e) => setForm({ ...form, base_rail: e.target.value })}
            >
              <option>USDT</option>
              <option>USDC</option>
              <option>USD</option>
            </select>
          </label>
          <label>
            quote_rail
            <select
              value={form.quote_rail}
              onChange={(e) => setForm({ ...form, quote_rail: e.target.value })}
            >
              <option>Bankak-SDG</option>
              <option>Cash-SDG</option>
              <option>MTN-MoMo-RWF</option>
              <option>Bank-RWF</option>
            </select>
          </label>
        </div>
        <div className="grid two">
          <label>
            الاتجاه
            <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
              <option value="SELL">SELL</option>
              <option value="BUY">BUY</option>
            </select>
          </label>
          <label>
            المدينة
            <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option>Khartoum</option>
              <option>Kigali</option>
              <option>Unknown</option>
            </select>
          </label>
        </div>
        <button className="primary">نشر سعر ملزم</button>
      </form>
      {msg && <p className="tag">{msg}</p>}
    </section>
  )
}