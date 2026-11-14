export interface Site {
  id: string
  name: string
  lat: number
  lon: number
  group: string
  note: string
  source: string
}

export interface Selection {
  name: string
  lat: number
  lon: number
  note?: string
}

export interface Horizon {
  terrain: boolean
  complete: boolean
  site_height_m: number
  azimuth_deg: number[]
  elevation_deg: number[]
}

export interface Metrics {
  now: {
    sun_elevation_deg: number
    sun_azimuth_deg: number
    sun_clearance_deg: number
    sun_visible_fraction: number
    earth_elevation_deg: number
    earth_azimuth_deg: number
    earth_clearance_deg: number
    sunlit: boolean
    earth_visible: boolean
  }
  hours_to_sun_change: number | null
  hours_to_earth_change: number | null
  sunlit_pct: number
  earth_visible_pct: number
  power_and_comms_pct: number
  mean_power_index: number
  max_sun_elevation_deg: number
  longest_dark_hours: number
  longest_comms_gap_hours: number
  longest_power_and_comms_hours: number
  rating: 'good' | 'marginal' | 'poor'
}

export interface Track {
  times: string[]
  sun_az: number[]
  sun_el: number[]
  earth_az: number[]
  earth_el: number[]
  sun_horizon: number[]
  earth_horizon: number[]
  sun_fraction: number[]
  earth_visible: boolean[]
  power_index: number[]
}

export type Window = [string, string]

export interface Analysis {
  site: { lat: number; lon: number; observer_height_m: number }
  window: { start: string; days: number; step_minutes: number }
  terrain: boolean
  site_height_m: number
  slope_deg: number | null
  metrics: Metrics
  windows: { sunlit: Window[]; earth: Window[]; both: Window[] }
  horizon: Horizon
  track?: Track
}

export interface BestDate {
  date: string
  power_and_comms_pct: number
  sunlit_pct: number
}

export interface LayerGrid {
  x0: number
  y0: number
  dx: number
  nx: number
  ny: number
  scale: number
  data: string // base64 uint8, row 0 = y0 (bottom), 255 = no data
}

export interface Layer {
  label: string
  unit: string
  legend: [number, string][]
  grid: LayerGrid
}

export type LayerKey = 'both' | 'sunlit' | 'earth' | 'slope'

export interface LayerSet {
  window: { start: string; days: number; step_minutes: number }
  image_extent: { x: [number, number]; y: [number, number] }
  layers: Record<LayerKey, Layer>
}

export interface TerrainPatch {
  lat: number
  lon: number
  half_km: number
  n: number
  site_height_m: number
  min_m: number
  max_m: number
  heights: number[] // metres relative to the site, row 0 = north edge, west to east
}

export interface YearCodes {
  start: string
  step_hours: number
  days: number
  terrain: boolean
  codes: string // one char per hour: 0 dark, 1 sun only, 2 Earth only, 3 both
}

export interface PoleMovie {
  start: string
  step_hours: number
  frames: number
  n: number
  half_km: number
  bytes_per_frame: number
  lit_pct: number[]
  sites: { id: string; name: string; x_km: number; y_km: number }[]
}
