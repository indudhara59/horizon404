import type { Analysis } from '../lib/types'
import { fmtDuration } from '../lib/util'

const RATING_TEXT = { good: 'Good', marginal: 'Marginal', poor: 'Poor' }

export default function MetricCards({ a }: { a: Analysis }) {
  const m = a.metrics
  const days = a.window.days
  return (
    <div className="cards">
      <div className={`card hero ${m.rating}`}>
        <div className="label">Power + comms together</div>
        <div className="value">{m.power_and_comms_pct.toFixed(0)}%</div>
        <div className="sub">
          <span className={`pill ${m.rating}`}>{RATING_TEXT[m.rating]}</span> longest stretch{' '}
          {fmtDuration(m.longest_power_and_comms_hours)}
        </div>
      </div>
      <div className="card">
        <div className="label">☀️ Sunlight</div>
        <div className="value sun">{m.sunlit_pct.toFixed(0)}%</div>
        <div className="sub">longest night {fmtDuration(m.longest_dark_hours)}</div>
      </div>
      <div className="card">
        <div className="label">🌍 Earth in view</div>
        <div className="value earth">{m.earth_visible_pct.toFixed(0)}%</div>
        <div className="sub">longest blackout {fmtDuration(m.longest_comms_gap_hours)}</div>
      </div>
      <div className="card">
        <div className="label">{m.now.sunlit ? 'Sunset in' : 'Sunrise in'}</div>
        <div className="value">{fmtDuration(m.hours_to_sun_change, days)}</div>
        <div className="sub">
          Sun {m.now.sun_elevation_deg.toFixed(1)}° high, {m.now.sun_clearance_deg >= 0 ? '+' : ''}
          {m.now.sun_clearance_deg.toFixed(1)}° vs skyline
        </div>
      </div>
      <div className="card">
        <div className="label">{m.now.earth_visible ? 'Earthset in' : 'Earthrise in'}</div>
        <div className="value">{fmtDuration(m.hours_to_earth_change, days)}</div>
        <div className="sub">
          Earth {m.now.earth_elevation_deg.toFixed(1)}° high, {m.now.earth_clearance_deg >= 0 ? '+' : ''}
          {m.now.earth_clearance_deg.toFixed(1)}° vs skyline
        </div>
      </div>
      <div className="card">
        <div className="label">Solar power index</div>
        <div className="value">{(m.mean_power_index * 100).toFixed(0)}%</div>
        <div className="sub">vertical tracking array · max Sun {m.max_sun_elevation_deg.toFixed(1)}°</div>
      </div>
    </div>
  )
}
