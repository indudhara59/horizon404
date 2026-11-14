import type { Analysis, BestDate, LayerSet, Site } from './types'

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:8000' : '') // production: same origin

async function get<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const r = await fetch(`${API_URL}${path}?${q}`)
  if (!r.ok) {
    const body = await r.json().catch(() => ({ detail: r.statusText }))
    throw new Error(typeof body.detail === 'string' ? body.detail : r.statusText)
  }
  return r.json() as Promise<T>
}

export const api = {
  sites: () => get<Site[]>('/api/sites'),
  analyze: (lat: number, lon: number, start: string, days: number, track = true, height = 2) =>
    get<Analysis>('/api/analyze', {
      lat,
      lon,
      start,
      days,
      step: days > 60 ? 180 : days > 20 ? 60 : 30,
      track,
      height,
    }),
  bestDates: (lat: number, lon: number, start: string, missionDays = 14, height = 2) =>
    get<BestDate[]>('/api/best-dates', { lat, lon, start, months: 12, mission_days: missionDays, height }),
  layers: async (): Promise<LayerSet> => {
    const r = await fetch(`${import.meta.env.BASE_URL}layers/layers.json`)
    if (!r.ok) throw new Error('map layers unavailable')
    return r.json() as Promise<LayerSet>
  },
}

/** Value of a precomputed layer at map coordinates (km), or null outside / no data. */
export function layerValue(g: LayerSet['layers'][keyof LayerSet['layers']]['grid'], bytes: Uint8Array, x: number, y: number): number | null {
  const i = Math.round((x - g.x0) / g.dx)
  const j = Math.round((y - g.y0) / g.dx)
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null
  const v = bytes[j * g.nx + i]
  return v === 255 ? null : v / g.scale
}

export function decodeGrid(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k)
  return out
}
