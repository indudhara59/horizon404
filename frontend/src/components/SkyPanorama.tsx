import type { Analysis } from '../lib/types'
import { COLORS, Plot, baseLayout, plotConfig } from '../lib/util'

interface Props {
  a: Analysis
  index: number
}

/** 360° skyline panorama with Sun and Earth tracks and their current position. */
export default function SkyPanorama({ a, index }: Props) {
  const t = a.track!
  const hz = a.horizon
  const az = [0, ...hz.azimuth_deg, 360]
  const el = [hz.elevation_deg[hz.elevation_deg.length - 1], ...hz.elevation_deg, hz.elevation_deg[0]]

  const all = [...el, ...t.sun_el, ...t.earth_el.filter((e) => e > -15)]
  const yMax = Math.min(90, Math.max(8, Math.max(...all) + 2))
  const yMin = Math.max(-30, Math.min(-4, Math.min(...el) - 2, Math.min(...t.sun_el, ...t.earth_el) - 1))

  const split = (vis: boolean[], xs: number[], ys: number[]) => ({
    on: { x: xs.filter((_, i) => vis[i]), y: ys.filter((_, i) => vis[i]) },
    off: { x: xs.filter((_, i) => !vis[i]), y: ys.filter((_, i) => !vis[i]) },
  })
  const sun = split(t.sun_fraction.map((f) => f > 0.01), t.sun_az, t.sun_el)
  const earth = split(t.earth_visible, t.earth_az, t.earth_el)

  const sunUp = t.sun_fraction[index] > 0.01
  const earthUp = t.earth_visible[index]

  return (
    <Plot
      data={[
        { x: az, y: az.map(() => yMin - 50), mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
        {
          x: az, y: el, mode: 'lines', fill: 'tonexty', name: 'Terrain skyline',
          line: { color: '#9ca3af', width: 1.5 }, fillcolor: 'rgba(75,85,99,0.85)',
          hovertemplate: 'Skyline %{y:.2f}° at az %{x:.0f}°<extra></extra>',
        },
        {
          ...sun.off, mode: 'markers', name: 'Sun (hidden)', showlegend: false,
          marker: { color: COLORS.sun, size: 4, opacity: 0.18 }, hoverinfo: 'skip',
        },
        {
          ...sun.on, mode: 'markers', name: 'Sun path',
          marker: { color: COLORS.sun, size: 4, opacity: 0.7 },
          hovertemplate: 'Sun az %{x:.1f}°, el %{y:.2f}°<extra></extra>',
        },
        {
          ...earth.off, mode: 'markers', name: 'Earth (hidden)', showlegend: false,
          marker: { color: COLORS.earth, size: 4, opacity: 0.18 }, hoverinfo: 'skip',
        },
        {
          ...earth.on, mode: 'markers', name: 'Earth path',
          marker: { color: COLORS.earth, size: 4, opacity: 0.7 },
          hovertemplate: 'Earth az %{x:.1f}°, el %{y:.2f}°<extra></extra>',
        },
        {
          x: [t.sun_az[index]], y: [t.sun_el[index]], mode: 'text+markers', name: 'Sun now', showlegend: false,
          text: ['☀️'], textfont: { size: 24 }, marker: { size: 30, color: 'rgba(255,201,74,0.25)', line: { width: 0 } },
          opacity: sunUp ? 1 : 0.35,
          hovertemplate: `Sun ${sunUp ? 'visible' : 'behind terrain'}<br>az %{x:.1f}°, el %{y:.2f}°<extra></extra>`,
        },
        {
          x: [t.earth_az[index]], y: [t.earth_el[index]], mode: 'text+markers', name: 'Earth now', showlegend: false,
          text: ['🌍'], textfont: { size: 22 }, marker: { size: 30, color: 'rgba(90,169,255,0.25)', line: { width: 0 } },
          opacity: earthUp ? 1 : 0.35,
          hovertemplate: `Earth ${earthUp ? 'visible' : 'below skyline'}<br>az %{x:.1f}°, el %{y:.2f}°<extra></extra>`,
        },
      ]}
      layout={{
        ...baseLayout,
        height: 340,
        xaxis: {
          range: [0, 360], tickvals: [0, 45, 90, 135, 180, 225, 270, 315, 360],
          ticktext: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'],
          gridcolor: COLORS.grid, zeroline: false, title: { text: 'Azimuth (direction you face)' },
        },
        yaxis: {
          range: [yMin, yMax], gridcolor: COLORS.grid, zeroline: true,
          zerolinecolor: 'rgba(148,163,184,0.4)', ticksuffix: '°', title: { text: 'Elevation' },
        },
        legend: { orientation: 'h', x: 0, y: 1.12, font: { size: 11 } },
        hovermode: 'closest',
      }}
      config={plotConfig}
      style={{ width: '100%', height: 340 }}
      useResizeHandler
    />
  )
}
