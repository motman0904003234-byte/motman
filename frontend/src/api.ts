export type Rail =
  | 'Bankak-SDG'
  | 'Cash-SDG'
  | 'MTN-MoMo-RWF'
  | 'Bank-RWF'
  | 'USD'
  | 'USDT'
  | 'USDC'

export type QuoteResponse = {
  label: string
  display: {
    title: string
    fair: number | null
    executable: string | null
    margin: string | null
    confidence: number
    independent_sources: number
    last_update: string | null
    source_status: string
  }
  result: {
    warnings: string[]
    methodology: string
    calibration_note?: string | null
    details?: Record<string, number>
    available_liquidity_base?: number
    spread?: number | null
    last_completed_price?: number | null
    theoretical_rate?: number | null
    trader_expected_rate?: number | null
  }
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'

export async function getQuote(body: {
  amount: number
  from_rail: Rail
  to_rail: Rail
  from_payment?: string
  to_payment?: string
  city?: string | null
}): Promise<QuoteResponse> {
  const r = await fetch(`${API_BASE}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`quote failed: ${r.status}`)
  return r.json()
}

export async function getHistory() {
  const r = await fetch(`${API_BASE}/history?limit=50`)
  if (!r.ok) throw new Error('history failed')
  return r.json()
}

export async function getMethodology() {
  const r = await fetch(`${API_BASE}/methodology`)
  if (!r.ok) throw new Error('methodology failed')
  return r.json()
}

export async function submitRfq(body: Record<string, unknown>) {
  const r = await fetch(`${API_BASE}/traders/rfq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('rfq failed')
  return r.json()
}

export async function refreshSources() {
  const r = await fetch(`${API_BASE}/refresh`, { method: 'POST' })
  if (!r.ok) throw new Error('refresh failed')
  return r.json()
}