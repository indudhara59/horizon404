import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import BestDates from './components/BestDates'
import Compare, { type CompareStore } from './components/Compare'
import Learn from './components/Learn'
import MetricCards from './components/MetricCards'
import PoleMap, { type MapLayer } from './components/PoleMap'
import SkyPanorama from './components/SkyPanorama'
import Timeline from './components/Timeline'
import PoleMovie from './components/PoleMovie'
import YearBarcode from './components/YearBarcode'

const Terrain3D = lazy(() => import('./components/Terrain3D'))
import { api } from './lib/api'
import type { Analysis, BestDate, Selection, Site } from './lib/types'
import { downloadCsv, fmtLatLon, fmtTime } from './lib/util'

type Tab = 'explore' | 'compare' | 'learn'

const WINDOWS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 29.53, label: '1 lunar day' },
  { days: 90, label: '3 months' },
  { days: 365, label: '1 year' },
]
const MISSION_DAYS = 14
const MASTS = [2, 5, 10, 20]
const BATTERIES = [
  { h: 24, label: '1 day' },
  { h: 72, label: '3 days' },
  { h: 168, label: '1 week' },
  { h: 360, label: '15 days (lunar night)' },
]
const LAYERS: MapLayer[] = ['relief', 'both', 'sunlit', 'earth', 'slope']
const today = new Date().toISOString().slice(0, 10)
const TABS: Tab[] = ['explore', 'compare', 'learn']

/** Shareable state lives in the URL: ?tab=…&site=id | lat=…&lon=…, &date=…&days=… */
function readUrl() {
  const q = new URLSearchParams(window.location.search)
  const num = (k: string) => {
    const v = q.get(k)
    return v !== null && v !== '' && Number.isFinite(+v) ? +v : null
  }
  const date = q.get('date')
  const days = num('days')
  return {
    tab: (TABS as string[]).includes(q.get('tab') ?? '') ? (q.get('tab') as Tab) : 'explore',
    site: q.get('site'),
    lat: num('lat'),
    lon: num('lon'),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01' && date <= '2049-12-31' ? date : null,
    days: days !== null && WINDOWS.some((w) => w.days === days) ? days : null,
    mast: MASTS.includes(num('h') ?? -1) ? (num('h') as number) : 2,
    battery: BATTERIES.some((b) => b.h === num('bat')) ? (num('bat') as number) : 72,
    layer: (LAYERS as string[]).includes(q.get('layer') ?? '') ? (q.get('layer') as MapLayer) : 'relief',
  }
}
const initial = readUrl()

export default function App() {
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [sites, setSites] = useState<Site[]>([])
  const [sel, setSel] = useState<Selection | null>(null)
  const [start, setStart] = useState(initial.date ?? today)
  const [days, setDays] = useState(initial.days ?? 29.53)
  const [a, setA] = useState<Analysis | null>(null)
  const [best, setBest] = useState<BestDate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [latIn, setLatIn] = useState('')
  const [lonIn, setLonIn] = useState('')
  const [mast, setMast] = useState(initial.mast)
  const [battery, setBattery] = useState(initial.battery)
  const [layer, setLayer] = useState<MapLayer>(initial.layer)
  const [skyMode, setSkyMode] = useState<'sky' | '3d'>('sky')
  const [live, setLive] = useState(false)
  const [scen, setScen] = useState<CompareStore['scen']>([])
  const [results, setResults] = useState<CompareStore['results']>({})

  useEffect(() => {
    api
      .sites()
      .then((s) => {
        setSites(s)
        const fromUrl = s.find((x) => x.id === initial.site)
        if (fromUrl) setSel({ name: fromUrl.name, lat: fromUrl.lat, lon: fromUrl.lon, note: fromUrl.note })
        else if (initial.lat !== null && initial.lon !== null && Math.abs(initial.lat) <= 90)
          setSel({ name: 'Custom site', lat: initial.lat, lon: ((initial.lon % 360) + 360) % 360 })
        else setSel({ name: s[0].name, lat: s[0].lat, lon: s[0].lon, note: s[0].note })
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
    let stale = false // ignore answers to requests that were superseded
    api
      .analyze(sel.lat, sel.lon, `${start}T00:00:00Z`, days, true, mast)
      .then((r) => {
        if (stale) return
        setA(r)
        setIdx(0)
      })
      .catch((e: Error) => !stale && setErr(e.message))
      .finally(() => !stale && setLoading(false))
    return () => {
      stale = true
    }
  }, [sel, start, days, mast])

  useEffect(() => {
    if (!sel) return
    setBest(null)
    let stale = false
    api
      .bestDates(sel.lat, sel.lon, today, MISSION_DAYS, mast)
      .then((b) => !stale && setBest(b))
      .catch(() => !stale && setBest(null))
    return () => {
      stale = true
    }
  }, [sel, mast])

  const n = a?.track?.times.length ?? 0
  useEffect(() => {
    if (!playing || n === 0) return
    const id = setInterval(() => setIdx((i) => (i + 1) % n), skyMode === '3d' ? 120 : 70)
    return () => clearInterval(id)
  }, [playing, n, skyMode])

  // Live mode: follow the real clock. The window must contain "now", so it starts today.
  useEffect(() => {
    if (!live) return
    if (start !== today) {
      setStart(today)
      return
    }
    if (!a?.track) return
    const t0 = new Date(a.window.start).getTime()
    const stepMs = a.window.step_minutes * 60e3
    const tick = () => setIdx(Math.max(0, Math.min(n - 1, Math.round((Date.now() - t0) / stepMs))))
    tick()
    const id = setInterval(tick, 20e3)
    return () => clearInterval(id)
  }, [live, a, start, n])
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [live])

  const siteInfo = useMemo(
    () => sites.find((s) => sel && s.lat === sel.lat && s.lon === sel.lon),
    [sites, sel],
  )
  // keep the URL in sync so any view can be shared as a link
  useEffect(() => {
    if (!sel) return
    const q = new URLSearchParams()
    if (tab !== 'explore') q.set('tab', tab)
    if (siteInfo) q.set('site', siteInfo.id)
    else {
      q.set('lat', String(+sel.lat.toFixed(4)))
      q.set('lon', String(+sel.lon.toFixed(4)))
    }
    q.set('date', start)
    q.set('days', String(days))
    if (mast !== 2) q.set('h', String(mast))
    if (battery !== 72) q.set('bat', String(battery))
    if (layer !== 'relief') q.set('layer', layer)
    window.history.replaceState(null, '', `?${q}`)
  }, [tab, sel, siteInfo, start, days, mast, battery, layer])

  const [copied, setCopied] = useState(false)
  const share = () => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => undefined)
  }

  /** One-click stories that show off what the tool answers. */
  const QUESTIONS: { q: string; go: () => void }[] = [
    { q: 'Where at the south pole is power + comms best?', go: () => { setTab('explore'); setLayer('both'); pickSite('connecting-ridge') } },
    { q: 'Why did IM-1 Odysseus tip over?', go: () => { setTab('explore'); setLayer('slope'); pickSite('im-1') } },
    { q: 'Launch slipped two weeks: is the site still OK?', go: () => { setTab('compare') } },
    { q: 'Can a far-side lander talk to Earth?', go: () => { setTab('explore'); setLayer('relief'); pickSite('change-4') } },
    { q: 'Does a taller mast help at the pole?', go: () => { setTab('explore'); setMast(20); pickSite('south-pole') } },
  ]

  const exportCsv = () => {
    if (!a?.track || !sel) return
    const tr = a.track
    const rows = tr.times.map((time, i) => [
      time, tr.sun_az[i], tr.sun_el[i], tr.sun_horizon[i], tr.sun_fraction[i],
      tr.earth_az[i], tr.earth_el[i], tr.earth_horizon[i], tr.earth_visible[i] ? 1 : 0, tr.power_index[i],
    ])
    const header = ['time_utc', 'sun_az_deg', 'sun_el_deg', 'skyline_at_sun_deg', 'sun_visible_fraction',
      'earth_az_deg', 'earth_el_deg', 'skyline_at_earth_deg', 'earth_visible', 'power_index']
    const name = `horizon404_${(siteInfo?.id ?? `${sel.lat}_${sel.lon}`)}_${start}_${a.window.days}d.csv`
    downloadCsv(name, [header, ...rows], [
      `# Horizon404 · ${sel.name} · ${fmtLatLon(sel.lat, sel.lon)} · mast ${mast} m`,
      `# Sun/Earth: JPL DE421 + NAIF lunar frame; skyline: LRO LOLA LDEM_75S_120M`,
    ])
  }

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

  useEffect(() => {
    if (a && !a.terrain && skyMode === '3d') setSkyMode('sky')
  }, [a, skyMode])

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
        <div className="header-right">
          <a className="deck-btn" href="/demo/" target="_blank" rel="noopener">
            🎞️ Presentation
          </a>
          <nav>
            {TABS.map((x) => (
              <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>
                {x === 'explore' ? 'Explore' : x === 'compare' ? 'Compare' : 'Learn'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {err && <div className="error banner">{err}</div>}

      {tab !== 'learn' && (
        <div className="questions">
          <span className="hint">Try:</span>
          {QUESTIONS.map((x) => (
            <button key={x.q} className="chip-btn" onClick={x.go}>{x.q}</button>
          ))}
        </div>
      )}

      {tab === 'learn' && <Learn />}
      {tab === 'compare' && sites.length > 0 && (
        <Compare sites={sites} current={sel} start={start} days={days} mast={mast} store={{ scen, setScen, results, setResults }} />
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
                <input type="date" value={start} min="1900-01-01" max="2049-12-31" onChange={(e) => { if (e.target.value) { setStart(e.target.value); setLive(false) } }} />
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

            <div className="row">
              <div>
                <label>Antenna / panel mast</label>
                <select value={mast} onChange={(e) => setMast(+e.target.value)}>
                  {MASTS.map((m) => (
                    <option key={m} value={m}>{m} m above ground</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Battery lasts</label>
                <select value={battery} onChange={(e) => setBattery(+e.target.value)}>
                  {BATTERIES.map((b) => (
                    <option key={b.h} value={b.h}>{b.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <label>Click the map to pick any south-pole location</label>
            <PoleMap sites={sites} selected={sel} onPick={setSel} layer={layer} onLayer={setLayer} />
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
                    {a && a.terrain && !a.horizon.complete && <> · skyline partial (near DEM edge)</>}
                    {a && !a.terrain && <> · smooth horizon (outside polar DEM)</>}
                  </div>
                  {(sel.note ?? siteInfo?.note) && <p className="note">{sel.note ?? siteInfo?.note}</p>}
                </div>
                <div className="head-actions">
                  {loading && <div className="spinner" aria-label="loading" />}
                  <button className="ghost" onClick={share} title="Copy a link to this site, date and window">
                    {copied ? '✓ Link copied' : '🔗 Share'}
                  </button>
                </div>
              </div>
            )}

            {a && (
              <>
                <MetricCards a={a} batteryHours={battery} />

                <div className="panel">
                  <div className="panel-head">
                    <h3>{skyMode === 'sky' ? 'Sky view from the lander' : '3D terrain, real sunlight'}</h3>
                    <div className="layer-switch tight">
                      <button className={skyMode === 'sky' ? 'active' : ''} onClick={() => setSkyMode('sky')}>360° sky</button>
                      <button className={skyMode === '3d' ? 'active' : ''} onClick={() => setSkyMode('3d')} disabled={!a.terrain} title={a.terrain ? '' : 'Needs a south-pole site (LOLA terrain)'}>
                        🏔️ 3D terrain
                      </button>
                    </div>
                  </div>
                  {t && skyMode === 'sky' && (
                    <>
                      <span className="hint">grey = terrain skyline · faded dots = behind terrain</span>
                      <SkyPanorama a={a} index={idx} />
                    </>
                  )}
                  {t && skyMode === '3d' && a.terrain && sel && (
                    <Suspense fallback={<div className="hint">Loading 3D engine…</div>}>
                      <Terrain3D
                        lat={sel.lat} lon={sel.lon} mast={mast}
                        sunAz={t.sun_az[idx]} sunEl={t.sun_el[idx]} sunFrac={t.sun_fraction[idx]}
                        earthAz={t.earth_az[idx]} earthEl={t.earth_el[idx]} earthVisible={t.earth_visible[idx]}
                      />
                    </Suspense>
                  )}
                  {t && (
                    <div className="scrubber">
                      <button onClick={() => { setLive(false); setPlaying(!playing) }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
                      <button className={`live-btn ${live ? 'on' : ''}`} onClick={() => { setPlaying(false); setLive(!live) }} title="Follow the real clock">
                        <span className="dot" /> {live ? `LIVE ${clock.toISOString().slice(11, 19)} UTC` : 'Live now'}
                      </button>
                      <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => { setIdx(+e.target.value); setPlaying(false); setLive(false) }} />
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
                    <span className="hint">
                      green = sunlight and Earth at the same time{' '}
                      <button className="ghost small" onClick={exportCsv} disabled={!a.track}>⬇ CSV</button>
                    </span>
                  </div>
                  <Timeline rows={[{ label: sel?.name ?? '', a }]} cursor={now} />
                </div>

                {sel && (
                  <div className="panel">
                    <div className="panel-head">
                      <h3>Year at a glance</h3>
                      <span className="hint">every hour of the next 12 months · {mast} m mast</span>
                    </div>
                    <YearBarcode lat={sel.lat} lon={sel.lon} mast={mast} start={today} selected={start} onPick={(d) => { setStart(d); setLive(false) }} />
                  </div>
                )}

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

            <div className="panel">
              <div className="panel-head">
                <h3>🎬 Light and shadow at the south pole</h3>
                <span className="hint">one lunar day, animated</span>
              </div>
              <PoleMovie selected={sel} onPick={setSel} onSite={pickSite} />
            </div>
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
