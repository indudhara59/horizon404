import type { Analysis, BestDate, Site } from './types'

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

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
  analyze: (lat: number, lon: number, start: string, days: number, track = true) =>
    get<Analysis>('/api/analyze', {
      lat,
      lon,
      start,
      days,
      step: days > 60 ? 180 : days > 20 ? 60 : 30,
      track,
    }),
  bestDates: (lat: number, lon: number, start: string, missionDays = 14) =>
    get<BestDate[]>('/api/best-dates', { lat, lon, start, months: 12, mission_days: missionDays }),
}
