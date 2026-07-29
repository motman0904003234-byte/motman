import { appStorage } from './storage'
import { apiFetch, cacheTraders, readCachedTraders, resolveApiBase } from './offline'

async function deviceHeaders(): Promise<Record<string, string>> {
  const id = await appStorage.get('device_id')
  const token = await appStorage.get('device_token')
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (id) h['X-Device-Id'] = id
  if (token) h['X-Device-Token'] = token
  return h
}

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

export type Trader = {
  id: string
  display_name: string
  city: string
  area?: string
  map_query?: string
  rails: string[]
  payment_methods: string[]
  telegram: string
  whatsapp: string
  phone_note: string
  status: string
  trust_score: number
  notes: string
  source: string
  updated_at?: string | null
  wa_link?: string
  tg_link?: string
  map_link?: string
  tel_link?: string
}

export async function getQuote(body: {
  amount: number
  from_rail: Rail
  to_rail: Rail
  from_payment?: string
  to_payment?: string
  city?: string | null
}): Promise<QuoteResponse> {
  const r = await apiFetch('/quote', {
    method: 'POST',
    headers: await deviceHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`quote failed: ${r.status}`)
  return r.json()
}

export async function getHistory() {
  const r = await apiFetch('/history?limit=50')
  if (!r.ok) throw new Error('history failed')
  return r.json()
}

export async function getMethodology() {
  const r = await apiFetch('/methodology')
  if (!r.ok) throw new Error('methodology failed')
  return r.json()
}

export async function submitRfq(body: Record<string, unknown>) {
  const r = await apiFetch('/traders/rfq', {
    method: 'POST',
    headers: await deviceHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('rfq failed')
  return r.json()
}

export async function refreshSources() {
  const r = await apiFetch('/refresh', { method: 'POST' })
  if (!r.ok) throw new Error('refresh failed')
  return r.json()
}

export async function ensureDevice(name = 'هاتف مطمن') {
  const existingId = await appStorage.get('device_id')
  const existingToken = await appStorage.get('device_token')
  if (existingId && existingToken) return { device_id: existingId, device_token: existingToken }
  const r = await apiFetch('/cloud/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!r.ok) throw new Error('device register failed')
  const data = await r.json()
  await appStorage.set('device_id', data.device_id)
  await appStorage.set('device_token', data.device_token)
  await appStorage.set('device_name', name)
  return data
}

export async function cloudStatus() {
  const r = await apiFetch('/cloud/status')
  if (!r.ok) throw new Error('cloud status failed')
  return r.json()
}

export async function listTraders(params: { q?: string; status?: string; city?: string } = {}) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.status) sp.set('status', params.status)
  if (params.city) sp.set('city', params.city)
  try {
    const r = await apiFetch(`/cloud/traders?${sp.toString()}`)
    if (!r.ok) throw new Error('traders failed')
    const data = (await r.json()) as { items: Trader[]; count: number }
    await cacheTraders(data.items)
    return data
  } catch (err) {
    const cached = await readCachedTraders<Trader>()
    if (cached.length) {
      let items = cached
      if (params.q) {
        const q = params.q.toLowerCase()
        items = items.filter((t) =>
          `${t.display_name} ${t.telegram} ${t.notes} ${t.city}`.toLowerCase().includes(q),
        )
      }
      if (params.status) items = items.filter((t) => t.status === params.status)
      if (params.city) items = items.filter((t) => t.city.toLowerCase().includes(params.city!.toLowerCase()))
      return { items, count: items.length, offline: true as const }
    }
    throw err
  }
}

export async function saveTrader(body: Partial<Trader> & { display_name: string }) {
  await ensureDevice()
  const r = await apiFetch('/cloud/traders', {
    method: 'POST',
    headers: await deviceHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('save trader failed')
  const data = await r.json()
  // refresh local cache + auto cloud backup (best effort)
  try {
    const listed = await listTraders({})
    await cacheTraders(listed.items)
    await createBackup('auto-after-trader-save')
  } catch {
    /* ignore */
  }
  return data
}

export async function addOutreach(body: {
  trader_id: string
  channel?: string
  message?: string
  outcome?: string
}) {
  await ensureDevice()
  const r = await apiFetch('/cloud/outreach', {
    method: 'POST',
    headers: await deviceHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('outreach failed')
  return r.json()
}

export async function createBackup(note = 'نسخة هاتف') {
  await ensureDevice()
  const r = await apiFetch('/cloud/backup', {
    method: 'POST',
    headers: await deviceHeaders(),
    body: JSON.stringify({ note }),
  })
  if (!r.ok) throw new Error('backup failed')
  const data = await r.json()
  if (data.backup_id) await appStorage.set('last_backup_id', data.backup_id)
  return data
}

export async function exportCloud() {
  const r = await apiFetch('/cloud/export')
  if (!r.ok) throw new Error('export failed')
  return r.json()
}

export async function seedTraders() {
  const r = await apiFetch('/cloud/seed', { method: 'POST' })
  if (!r.ok) throw new Error('seed failed')
  return r.json()
}

export async function restoreBackup(backup_id: string) {
  await ensureDevice()
  const r = await apiFetch('/cloud/restore', {
    method: 'POST',
    headers: await deviceHeaders(),
    body: JSON.stringify({ backup_id }),
  })
  if (!r.ok) throw new Error('restore failed')
  return r.json()
}

export { resolveApiBase }