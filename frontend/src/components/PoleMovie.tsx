import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { PoleMovie as Movie, Selection } from '../lib/types'
import { xyToLatLon } from '../lib/util'

interface Props {
  selected: Selection | null
  onPick: (s: Selection) => void
  onSite: (id: string) => void
}

const PX = 720
// overlay per state: 0 dark, 1 < half disk, 2 most of disk, 3 full Sun
const SHADE: [number, number, number, number][] = [
  [3, 6, 18, 215],
  [10, 14, 34, 150],
  [30, 30, 40, 60],
  [255, 214, 120, 26],
]

/** Light and shadow sweeping over the south pole during one lunar day, computed from LOLA + DE421. */
export default function PoleMovie({ selected, onPick, onSite }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [data, setData] = useState<{ meta: Movie; frames: Uint8Array } | null>(null)
  const [relief, setRelief] = useState<HTMLImageElement | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)

  // load only once the panel scrolls into view (~0.9 MB)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setVisible(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || data) return
    api.movie().then(setData).catch((e: Error) => setErr(e.message))
    const img = new Image()
    img.onload = () => setRelief(img)
    img.src = `${import.meta.env.BASE_URL}movie/relief.webp`
  }, [visible, data])

  useEffect(() => {
    if (!playing || !data) return
    const id = setInterval(() => setFrame((f) => (f + 1) % data.meta.frames), 110)
    return () => clearInterval(id)
  }, [playing, data])

  // draw
  useEffect(() => {
    const c = canvas.current
    if (!c || !data || !relief) return
    const { meta, frames } = data
    const n = meta.n
    c.width = PX
    c.height = PX
    const g = c.getContext('2d')!
    g.drawImage(relief, 0, 0, PX, PX)

    const off = document.createElement('canvas')
    off.width = n
    off.height = n
    const og = off.getContext('2d')!
    const img = og.createImageData(n, n)
    const base = frame * meta.bytes_per_frame
    for (let k = 0; k < n * n; k++) {
      const v = (frames[base + (k >> 2)] >> ((k & 3) * 2)) & 3
      img.data.set(SHADE[v], k * 4)
    }
    og.putImageData(img, 0, 0)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(off, 0, 0, PX, PX)

    // sites
    const toPx = (x: number, y: number) => [((x + meta.half_km) / (2 * meta.half_km)) * PX, ((meta.half_km - y) / (2 * meta.half_km)) * PX]
    g.font = '600 13px Inter, system-ui, sans-serif'
    for (const s of meta.sites) {
      const [px, py] = toPx(s.x_km, s.y_km)
      g.fillStyle = '#f8fafc'
      g.strokeStyle = '#0f172a'
      g.lineWidth = 2
      g.beginPath()
      g.arc(px, py, 5, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      const label = s.name.replace(/ \(.*\)/, '').replace('Shackleton ', '')
      g.lineWidth = 3
      g.strokeText(label, px + 8, py + 4)
      g.fillText(label, px + 8, py + 4)
    }
    // scale bar: 10 km
    const bar = (10 / (2 * meta.half_km)) * PX
    g.fillStyle = '#e2e8f0'
    g.fillRect(16, PX - 22, bar, 3)
    g.font = '12px Inter, system-ui, sans-serif'
    g.fillText('10 km', 16, PX - 30)
    g.fillText('↑ 0°E', PX - 52, 20)
  }, [data, relief, frame])

  const time = data
    ? new Date(new Date(data.meta.start).getTime() + frame * data.meta.step_hours * 3600e3).toISOString().slice(0, 16).replace('T', ' ')
    : ''

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data) return
    const b = e.currentTarget.getBoundingClientRect()
    const h = data.meta.half_km
    const x = ((e.clientX - b.left) / b.width) * 2 * h - h
    const y = h - ((e.clientY - b.top) / b.height) * 2 * h
    const near = data.meta.sites.find((s) => Math.hypot(s.x_km - x, s.y_km - y) < 1.5)
    if (near) return onSite(near.id)
    const [lat, lon] = xyToLatLon(x, y)
    onPick({ name: 'Custom site', lat: +lat.toFixed(4), lon: +lon.toFixed(4) })
  }

  return (
    <div ref={box} className="movie">
      {err && <div className="error">{err}</div>}
      {!data && !err && <div className="hint">Loading the movie…</div>}
      <div className="movie-frame" style={{ display: data ? 'block' : 'none' }}>
        <canvas ref={canvas} onClick={click} title="Click to analyse this spot" />
        {selected && data && <SelectedRing sel={selected} half={data.meta.half_km} />}
        <div className="movie-badge mono">{time} UTC</div>
      </div>
      {data && (
        <div className="scrubber">
          <button onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
          <input
            type="range" min={0} max={data.meta.frames - 1} value={frame}
            onChange={(e) => { setFrame(+e.target.value); setPlaying(false) }}
          />
          <span className="chip on-sun">☀️ {data.meta.lit_pct[frame].toFixed(0)}% in full sun</span>
        </div>
      )}
      <p className="hint">
        80 × 80 km around the pole, one frame every 6 h through a lunar day from 14 Nov 2026. Black = no Sun
        (terrain shadow), warm = full Sun. Computed on a 0.5 km grid with the same skyline + ephemeris engine.
        Crater floors that never light up are the permanently shadowed regions where water ice can survive. Click to
        analyse any spot.
      </p>
    </div>
  )
}

function SelectedRing({ sel, half }: { sel: Selection; half: number }) {
  // polar stereographic, same as the main map (km)
  const r = 2 * 1737.4 * Math.tan(((90 + sel.lat) * Math.PI) / 360)
  const l = (sel.lon * Math.PI) / 180
  const x = r * Math.sin(l)
  const y = r * Math.cos(l)
  if (Math.abs(x) > half || Math.abs(y) > half) return null
  return (
    <div
      className="movie-ring"
      style={{ left: `${((x + half) / (2 * half)) * 100}%`, top: `${((half - y) / (2 * half)) * 100}%` }}
    />
  )
}
