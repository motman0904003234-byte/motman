/** Offline-capable local trader cache + API helper using configurable base URL. */

import { appStorage } from './storage'

const API_KEY = 'motman_api_base'
const TRADERS_CACHE = 'motman_traders_cache'

export async function resolveApiBase(): Promise<string> {
  const saved = await appStorage.get(API_KEY)
  if (saved) return saved.replace(/\/$/, '')
  try {
    const r = await fetch('/runtime-config.json', { cache: 'no-store' })
    if (r.ok) {
      const cfg = await r.json()
      if (cfg.apiBase) return String(cfg.apiBase).replace(/\/$/, '')
    }
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/$/, '')
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = await resolveApiBase()
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`
  return fetch(url, init)
}

export async function cacheTraders(items: unknown[]): Promise<void> {
  await appStorage.set(TRADERS_CACHE, JSON.stringify({ ts: Date.now(), items }))
}

export async function readCachedTraders<T = unknown>(): Promise<T[]> {
  const raw = await appStorage.get(TRADERS_CACHE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}