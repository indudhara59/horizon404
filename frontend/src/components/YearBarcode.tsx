import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { YearCodes } from '../lib/types'

interface Props {
  lat: number
  lon: number
  mast: number
  start: string // yyyy-mm-dd, first day of the year shown
  selected: string // currently chosen landing date
  onPick: (date: string) => void
}

// 0 dark, 1 sun only, 2 Earth only, 3 both
const COLORS = ['#0b1020', '#d9a521', '#2f6fc0', '#36c46f']
const LABELS = ['Dark, no Earth', 'Sunlight only', 'Earth only', 'Power + comms']
const DAY_W = 2
const HOUR_H = 6
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function addDays(iso: string, d: number): Date {
  const t = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + d)
  return t
}

/** Every hour of a year as one cell: x = day, y = hour of day (UTC). */
export default function YearBarcode({ lat, lon, mast, start, selected, onPick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [data, setData] = useState<YearCodes | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    setData(null)
    api.year(lat, lon, start, mast).then((d) => !stale && setData(d)).catch(() => !stale && setData(null))
    return () => {
      stale = true
    }
  }, [lat, lon, mast, start])

  const days = data ? Math.floor(data.codes.length / 24) : 365

  useEffect(() => {
    const c = canvas.current
    if (!c || !data) return
    c.width = days * DAY_W
    c.height = 24 * HOUR_H
    const g = c.getContext('2d')!
    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) {
        g.fillStyle = COLORS[+data.codes[d * 24 + h]]
        g.fillRect(d * DAY_W, h * HOUR_H, DAY_W, HOUR_H)
      }
    }
    // mark the selected landing date
    const sel = Math.round((new Date(`${selected}T00:00:00Z`).getTime() - new Date(data.start).getTime()) / 86400e3)
    if (sel >= 0 && sel < days) {
      g.fillStyle = 'rgba(255,255,255,0.9)'
      g.fillRect(sel * DAY_W, 0, 1, c.height)
    }
  }, [data, days, selected])

  const at = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    const d = Math.floor(((e.clientX - b.left) / b.width) * days)
    const h = Math.floor(((e.clientY - b.top) / b.height) * 24)
    return [Math.max(0, Math.min(days - 1, d)), Math.max(0, Math.min(23, h))] as const
  }

  const counts = [0, 0, 0, 0]
  if (data) for (const ch of data.codes) counts[+ch]++
  const total = data?.codes.length || 1

  // month ticks
  const ticks: { left: number; label: string }[] = []
  if (data) {
    for (let d = 0; d < days; d++) {
      const t = addDays(data.start, d)
      if (t.getUTCDate() === 1) ticks.push({ left: (d / days) * 100, label: MONTHS[t.getUTCMonth()] })
    }
  }

  return (
    <div className="barcode">
      {!data && <div className="hint">computing a year of hourly visibility…</div>}
      <div className="barcode-wrap" style={{ display: data ? 'block' : 'none' }}>
        <div className="barcode-axis-y">
          <span>00h</span>
          <span>12h</span>
          <span>24h</span>
        </div>
        <div className="barcode-main">
          <canvas
            ref={canvas}
            onMouseMove={(e) => {
              if (!data) return
              const [d, h] = at(e)
              const code = +data.codes[d * 24 + h]
              const t = addDays(data.start, d)
              setHover(`${t.toISOString().slice(0, 10)} ${String(h).padStart(2, '0')}:00 UTC · ${LABELS[code]}`)
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => data && onPick(addDays(data.start, at(e)[0]).toISOString().slice(0, 10))}
          />
          <div className="barcode-ticks">
            {ticks.map((t) => (
              <span key={t.left} style={{ left: `${t.left}%` }}>{t.label}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="barcode-legend">
        {LABELS.map((l, i) => (
          <span key={l}>
            <i style={{ background: COLORS[i] }} /> {l} {data && <b>{((counts[i] / total) * 100).toFixed(0)}%</b>}
          </span>
        )).reverse()}
      </div>
      <div className="map-readout mono">{hover ?? 'Each column is a day, each row an hour. Click a day to land then.'}</div>
    </div>
  )
}
