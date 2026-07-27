import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getHistory, getMethodology } from '../api'

export function HistoryPanel() {
  const [rows, setRows] = useState<Array<{ ts: string; fair: number | null; label: string }>>([])
  const [method, setMethod] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    void (async () => {
      const [h, m] = await Promise.all([getHistory(), getMethodology()])
      setMethod(m)
      const mapped = (h.items || []).map((item: any) => ({
        ts: item.ts,
        label: item.result?.label,
        fair: item.result?.fair_rate ?? null,
      }))
      setRows(mapped)
    })()
  }, [])

  return (
    <section className="panel grid">
      <h2 style={{ margin: 0 }}>التاريخ والمنهجية</h2>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={rows}>
            <CartesianGrid stroke="rgba(240,245,232,0.08)" />
            <XAxis dataKey="ts" hide />
            <YAxis stroke="#a7bbae" width={50} />
            <Tooltip />
            <Line type="monotone" dataKey="fair" stroke="#d7f56a" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>التصنيف</th>
              <th>العادل</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .reverse()
              .slice(0, 12)
              .map((r) => (
                <tr key={r.ts + String(r.fair)}>
                  <td className="mono">{new Date(r.ts).toLocaleString('ar')}</td>
                  <td>{r.label}</td>
                  <td className="mono">{r.fair?.toLocaleString('en-US') ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {method && (
        <pre className="mono" style={{ whiteSpace: 'pre-wrap', color: '#a7bbae', margin: 0 }}>
          {JSON.stringify(method, null, 2)}
        </pre>
      )}
    </section>
  )
}