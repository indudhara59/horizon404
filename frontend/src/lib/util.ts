import type { Config } from 'plotly.js'
import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-basic-dist-min'

// react-plotly.js is CommonJS; handle both interop shapes.
const factory =
  (createPlotlyComponent as unknown as { default?: typeof createPlotlyComponent }).default ??
  createPlotlyComponent
export const Plot = factory(Plotly)

export const MOON_R_KM = 1737.4

/** Polar stereographic (south pole), same as the LOLA DEM. Returns km. */
export function latLonToXY(lat: number, lon: number): [number, number] {
  const r = 2 * MOON_R_KM * Math.tan(((90 + lat) * Math.PI) / 360)
  const l = (lon * Math.PI) / 180
  return [r * Math.sin(l), r * Math.cos(l)]
}

export function xyToLatLon(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y)
  const lat = -90 + (2 * Math.atan(r / (2 * MOON_R_KM)) * 180) / Math.PI
  const lon = (((Math.atan2(x, y) * 180) / Math.PI) % 360 + 360) % 360
  return [lat, lon]
}

export function fmtDuration(hours: number | null, windowDays?: number): string {
  if (hours === null) return windowDays ? `> ${fmtDuration(windowDays * 24)}` : '—'
  if (hours < 1) return '< 1 h'
  const d = Math.floor(hours / 24)
  const h = Math.round(hours - d * 24)
  if (d === 0) return `${h} h`
  return h ? `${d} d ${h} h` : `${d} d`
}

export function fmtLatLon(lat: number, lon: number): string {
  const ns = lat < 0 ? 'S' : 'N'
  const e = ((lon % 360) + 360) % 360
  return `${Math.abs(lat).toFixed(3)}°${ns}, ${e.toFixed(3)}°E`
}

export function fmtTime(iso: string): string {
  return iso.replace('T', ' ').replace(/:00Z$/, ' UTC').replace(/Z$/, ' UTC')
}

export const COLORS = {
  sun: '#ffc94a',
  earth: '#5aa9ff',
  both: '#4ade80',
  terrain: '#6b7280',
  grid: 'rgba(148,163,184,0.15)',
  text: '#cbd5e1',
  muted: '#94a3b8',
}

export const baseLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, system-ui, sans-serif', color: COLORS.text, size: 12 },
  margin: { l: 50, r: 16, t: 10, b: 40 },
}

export const plotConfig: Partial<Config> = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }

/** Trigger a CSV download in the browser. */
export function downloadCsv(name: string, rows: (string | number)[][], comments: string[] = []): void {
  const text = [...comments, ...rows.map((r) => r.join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
