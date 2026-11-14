import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from '../lib/api'
import type { Analysis, Selection, Site } from '../lib/types'
import { fmtDuration, fmtLatLon } from '../lib/util'
import Timeline from './Timeline'

export interface Scenario {
  sel: Selection
  start: string
}

/** Scenario list + results, owned by App so they survive switching tabs. */
export interface CompareStore {
  scen: Scenario[]
  setScen: Dispatch<SetStateAction<Scenario[]>>
  results: Record<string, Analysis>
  setResults: Dispatch<SetStateAction<Record<string, Analysis>>>
}

interface Props {
  store: CompareStore
  sites: Site[]
  current: Selection | null
  start: string
  days: number
}

const MAX = 4

function shiftDate(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

export default function Compare({ sites, current, start, days, store }: Props) {
  const { scen, setScen, results, setResults } = store
  const [err, setErr] = useState<string | null>(null)
  const [pickId, setPickId] = useState(sites[0]?.id ?? '')
  const [pickDate, setPickDate] = useState(start)

  const key = (s: Scenario) => `${s.sel.lat},${s.sel.lon},${s.start},${days}`

  // seed with the current site + a 2-week slip, which is the classic planning question
  useEffect(() => {
    if (current && scen.length === 0) {
      setScen([
        { sel: current, start },
        { sel: current, start: shiftDate(start, 14) },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  useEffect(() => {
    scen.forEach((s) => {
      const k = key(s)
      if (results[k]) return
      api
        .analyze(s.sel.lat, s.sel.lon, `${s.start}T00:00:00Z`, days, false)
        .then((r) => setResults((prev) => ({ ...prev, [k]: r })))
        .catch((e: Error) => setErr(e.message))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scen, days])

  const add = (s: Scenario) => scen.length < MAX && setScen([...scen, s])
  const ready = scen.map((s) => results[key(s)]).filter(Boolean)
  const all = scen.length > 0 && ready.length === scen.length

  type Row = { label: string; get: (a: Analysis) => number; fmt: (v: number) => string; higher: boolean }
  const rows: Row[] = [
    { label: 'Power + comms', get: (a) => a.metrics.power_and_comms_pct, fmt: (v) => `${v.toFixed(0)}%`, higher: true },
    { label: 'Sunlight', get: (a) => a.metrics.sunlit_pct, fmt: (v) => `${v.toFixed(0)}%`, higher: true },
    { label: 'Earth in view', get: (a) => a.metrics.earth_visible_pct, fmt: (v) => `${v.toFixed(0)}%`, higher: true },
    { label: 'Longest night', get: (a) => a.metrics.longest_dark_hours, fmt: (v) => fmtDuration(v), higher: false },
    { label: 'Longest comms blackout', get: (a) => a.metrics.longest_comms_gap_hours, fmt: (v) => fmtDuration(v), higher: false },
    { label: 'Solar power index', get: (a) => a.metrics.mean_power_index * 100, fmt: (v) => `${v.toFixed(0)}%`, higher: true },
  ]

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Compare scenarios</h2>
        <span className="hint">Up to {MAX} site / date combinations, {days.toFixed(1)}-day window each</span>
      </div>

      <div className="compare-add">
        <select value={pickId} onChange={(e) => setPickId(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} />
        <button
          disabled={scen.length >= MAX}
          onClick={() => {
            const s = sites.find((x) => x.id === pickId)
            if (s) add({ sel: { name: s.name, lat: s.lat, lon: s.lon }, start: pickDate })
          }}
        >
          + Add scenario
        </button>
        {current && (
          <button className="ghost" disabled={scen.length >= MAX} onClick={() => add({ sel: current, start })}>
            + Add current ({current.name.slice(0, 24)})
          </button>
        )}
      </div>
      {err && <div className="error">{err}</div>}

      {scen.length > 0 && (
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th />
                {scen.map((s, i) => (
                  <th key={i}>
                    <div className="scen-name"><span className="scen-num">#{i + 1}</span> {s.sel.name}</div>
                    <div className="scen-sub">{fmtLatLon(s.sel.lat, s.sel.lon)}</div>
                    <div className="scen-sub">from {s.start}</div>
                    <button className="x" title="Remove" onClick={() => setScen(scen.filter((_, j) => j !== i))}>×</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vals = scen.map((s) => (results[key(s)] ? r.get(results[key(s)]) : null))
                const nums = vals.filter((v): v is number => v !== null)
                const best = nums.length ? (r.higher ? Math.max(...nums) : Math.min(...nums)) : null
                return (
                  <tr key={r.label}>
                    <td className="row-label">{r.label}</td>
                    {vals.map((v, i) => (
                      <td key={i} className={v !== null && v === best && scen.length > 1 ? 'best' : ''}>
                        {v === null ? '…' : r.fmt(v)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {all && (
        <Timeline rows={scen.map((_, i) => ({ label: `#${i + 1}`, a: ready[i] }))} />
      )}
    </section>
  )
}
