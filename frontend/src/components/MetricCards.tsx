import type { Analysis } from '../lib/types'
import { fmtDuration } from '../lib/util'

const RATING_TEXT = { good: 'Good', marginal: 'Marginal', poor: 'Poor' }

/** Typical lander tolerance: < 5° comfortable, 5–10° marginal, > 10° hazardous. */
function slopeRating(s: number): 'good' | 'marginal' | 'poor' {
  return s < 5 ? 'good' : s <= 10 ? 'marginal' : 'poor'
}

interface Props {
  a: Analysis
  batteryHours: number
}

export default function MetricCards({ a, batteryHours }: Props) {
  const m = a.metrics
  const days = a.window.days
  const night = m.longest_dark_hours
  const survives = night <= batteryHours
  const slope = a.slope_deg
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
        <div className="sub">
          power index {(m.mean_power_index * 100).toFixed(0)}% · max Sun {m.max_sun_elevation_deg.toFixed(1)}°
        </div>
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
      <div className={`card ${survives ? 'ok' : 'fail'}`}>
        <div className="label">🔋 Longest night</div>
        <div className="value">{fmtDuration(night)}</div>
        <div className="sub">
          {survives ? (
            <><span className="pill good">Survives</span> on a {fmtDuration(batteryHours)} battery</>
          ) : (
            <><span className="pill poor">Too long</span> battery lasts {fmtDuration(batteryHours)}</>
          )}
        </div>
      </div>
      <div className="card">
        <div className="label">⛰️ Landing slope</div>
        {slope === null ? (
          <>
            <div className="value">n/a</div>
            <div className="sub">outside the polar elevation model</div>
          </>
        ) : (
          <>
            <div className="value">{slope.toFixed(1)}°</div>
            <div className="sub">
              <span className={`pill ${slopeRating(slope)}`}>
                {slopeRating(slope) === 'good' ? 'Safe' : slopeRating(slope) === 'marginal' ? 'Caution' : 'Hazard'}
              </span>{' '}
              landers need &lt; 8–10°
            </div>
          </>
        )}
      </div>
    </div>
  )
}
