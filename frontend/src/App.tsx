import { useEffect, useMemo, useState } from 'react'
import BestDates from './components/BestDates'
import Compare from './components/Compare'
import Learn from './components/Learn'
import MetricCards from './components/MetricCards'
import PoleMap from './components/PoleMap'
import SkyPanorama from './components/SkyPanorama'
import Timeline from './components/Timeline'
import { api } from './lib/api'
import type { Analysis, BestDate, Selection, Site } from './lib/types'
import { fmtLatLon, fmtTime } from './lib/util'

type Tab = 'explore' | 'compare' | 'learn'

const WINDOWS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 29.53, label: '1 lunar day (29.5 d)' },
  { days: 90, label: '3 months' },
  { days: 365, label: '1 year' },
]
const MISSION_DAYS = 14
const today = new Date().toISOString().slice(0, 10)

export default function App() {
  const [tab, setTab] = useState<Tab>('explore')
  const [sites, setSites] = useState<Site[]>([])
  const [sel, setSel] = useState<Selection | null>(null)
  const [start, setStart] = useState(today)
  const [days, setDays] = useState(29.53)
  const [a, setA] = useState<Analysis | null>(null)
  const [best, setBest] = useState<BestDate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [latIn, setLatIn] = useState('')
  const [lonIn, setLonIn] = useState('')

  useEffect(() => {
    api
      .sites()
      .then((s) => {
        setSites(s)
        const first = s[0]
        setSel({ name: first.name, lat: first.lat, lon: first.lon, note: first.note })
      })
      .catch(() => setErr('Cannot reach the Horizon404 API. Is the backend running?'))
  }, [])

  useEffect(() => {
    if (!sel) return
    setLatIn(String(sel.lat))
    setLonIn(String(sel.lon))
    setLoading(true)
    setErr(null)
    setPlaying(false)
    api
      .analyze(sel.lat, sel.lon, `${start}T00:00:00Z`, days)
      .then((r) => {
        setA(r)
        setIdx(0)
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [sel, start, days])

  useEffect(() => {
    if (!sel) return
    setBest(null)
    api.bestDates(sel.lat, sel.lon, today, MISSION_DAYS).then(setBest).catch(() => setBest(null))
  }, [sel])

  const n = a?.track?.times.length ?? 0
  useEffect(() => {
    if (!playing || n === 0) return
    const id = setInterval(() => setIdx((i) => (i + 1) % n), 70)
    return () => clearInterval(id)
  }, [playing, n])

  const siteInfo = useMemo(
    () => sites.find((s) => sel && s.lat === sel.lat && s.lon === sel.lon),
    [sites, sel],
  )
  const groups = useMemo(() => [...new Set(sites.map((s) => s.group))], [sites])

  const pickSite = (id: string) => {
    const s = sites.find((x) => x.id === id)
    if (s) setSel({ name: s.name, lat: s.lat, lon: s.lon, note: s.note })
  }

  const goCustom = () => {
    const lat = parseFloat(latIn)
    const lon = parseFloat(lonIn)
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90) {
      setSel({ name: 'Custom site', lat, lon: ((lon % 360) + 360) % 360 })
    } else setErr('Latitude must be between -90 and 90; longitude in degrees east.')
  }

  const t = a?.track
  const now = t ? t.times[idx] : undefined

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">🌗</span>
          <div>
            <h1>Horizon404</h1>
            <p>Lunar Landing Site Navigator · will your lander see the Sun and Earth, and for how long?</p>
          </div>
        </div>
        <nav>
          {(['explore', 'compare', 'learn'] as Tab[]).map((x) => (
            <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>
              {x === 'explore' ? 'Explore' : x === 'compare' ? 'Compare' : 'Learn'}
            </button>
          ))}
        </nav>
      </header>

      {err && <div className="error banner">{err}</div>}

      {tab === 'learn' && <Learn />}
      {tab === 'compare' && sites.length > 0 && (
        <Compare sites={sites} current={sel} start={start} days={days} />
      )}

      {tab === 'explore' && (
        <main className="explore">
          <aside className="panel side">
            <label>Landing site</label>
            <select value={siteInfo?.id ?? ''} onChange={(e) => pickSite(e.target.value)}>
              {!siteInfo && <option value="">Custom site</option>}
              {groups.map((g) => (
                <optgroup key={g} label={g === 'Reference' ? 'Reference sites (smooth horizon)' : 'South pole (LOLA terrain)'}>
                  {sites.filter((s) => s.group === g).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="row">
              <div>
                <label>Latitude</label>
                <input value={latIn} onChange={(e) => setLatIn(e.target.value)} />
              </div>
              <div>
                <label>Longitude °E</label>
                <input value={lonIn} onChange={(e) => setLonIn(e.target.value)} />
              </div>
              <button className="go" onClick={goCustom}>Go</button>
            </div>

            <div className="row">
              <div>
                <label>Landing date (UTC)</label>
                <input type="date" value={start} min="1900-01-01" max="2049-12-31" onChange={(e) => e.target.value && setStart(e.target.value)} />
              </div>
              <div>
                <label>Window</label>
                <select value={days} onChange={(e) => setDays(parseFloat(e.target.value))}>
                  {WINDOWS.map((w) => (
                    <option key={w.days} value={w.days}>{w.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <label>Click the map to pick any south-pole location</label>
            <PoleMap sites={sites} selected={sel} onPick={setSel} />
            <p className="hint">Shaded relief rendered from LRO LOLA elevation data (75°S to the pole). Drag to pan; use the + / − buttons (top right of the map) to zoom.</p>
          </aside>

          <section className="main">
            {sel && (
              <div className="site-head">
                <div>
                  <h2>{sel.name}</h2>
                  <div className="coords">
                    {fmtLatLon(sel.lat, sel.lon)}
                    {a && a.terrain && <> · terrain height {a.site_height_m.toFixed(0)} m</>}
                    {a && !a.terrain && <> · smooth horizon (outside polar DEM)</>}
                  </div>
                  {(sel.note ?? siteInfo?.note) && <p className="note">{sel.note ?? siteInfo?.note}</p>}
                </div>
                {loading && <div className="spinner" aria-label="loading" />}
              </div>
            )}

            {a && (
              <>
                <MetricCards a={a} />

                <div className="panel">
                  <div className="panel-head">
                    <h3>Sky view from the lander</h3>
                    <span className="hint">grey = terrain skyline · faded dots = behind terrain</span>
                  </div>
                  {t && <SkyPanorama a={a} index={idx} />}
                  {t && (
                    <div className="scrubber">
                      <button onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
                      <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => { setIdx(+e.target.value); setPlaying(false) }} />
                      <span className="mono">{now && fmtTime(now)}</span>
                      <span className={`chip ${t.sun_fraction[idx] > 0.01 ? 'on-sun' : 'off'}`}>
                        ☀️ {t.sun_fraction[idx] > 0.99 ? 'full Sun' : t.sun_fraction[idx] > 0.01 ? `${Math.round(t.sun_fraction[idx] * 100)}% of disk` : 'dark'}
                      </span>
                      <span className={`chip ${t.earth_visible[idx] ? 'on-earth' : 'off'}`}>
                        🌍 {t.earth_visible[idx] ? 'comms OK' : 'no line of sight'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h3>Operational windows</h3>
                    <span className="hint">green = sunlight and Earth at the same time</span>
                  </div>
                  <Timeline rows={[{ label: sel?.name ?? '', a }]} cursor={now} />
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h3>Best landing dates, next 12 months</h3>
                    <span className="hint">power + comms over a {MISSION_DAYS}-day mission</span>
                  </div>
                  {best ? (
                    <BestDates data={best} missionDays={MISSION_DAYS} selected={start} onPick={setStart} />
                  ) : (
                    <div className="hint">computing…</div>
                  )}
                </div>
              </>
            )}
          </section>
        </main>
      )}

      <footer>
        Data: NASA LRO LOLA · JPL DE421 & NAIF kernels · validated against JPL Horizons. Built by Team Orbit404 for the
        NASA Space Apps Challenge 2026.
      </footer>
    </div>
  )
}
