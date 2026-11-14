import { useRef } from 'react'
import type { Selection, Site } from '../lib/types'
import { COLORS, Plot, baseLayout, latLonToXY, plotConfig, xyToLatLon } from '../lib/util'

const HALF_EXTENT_KM = 457.4 // from public/southpole.json (LDEM_75S_120M)
const VIEW_X: [number, number] = [-190, 190]
const VIEW_Y: [number, number] = [-100, 320]

// short labels placed so the cluster around the pole stays readable
const LABELS: Record<string, [string, string]> = {
  'connecting-ridge': ['Connecting ridge', 'bottom left'],
  'south-pole': ['Pole', 'top right'],
  'shackleton-floor': ['Shackleton floor', 'bottom right'],
  'de-gerlache-rim': ['de Gerlache rim', 'top left'],
  'malapert-massif': ['Malapert', 'top left'],
  'mons-mouton': ['Mons Mouton', 'top right'],
  'im-1': ['IM-1 Odysseus', 'top center'],
}

interface Props {
  sites: Site[]
  selected: Selection | null
  onPick: (s: Selection) => void
}

/** Shaded-relief LOLA map of the south pole. Click a site or anywhere on the terrain. */
export default function PoleMap({ sites, selected, onPick }: Props) {
  const gd = useRef<HTMLElement | null>(null)
  const down = useRef<[number, number] | null>(null)
  const polar = sites.filter((s) => s.lat <= -75)
  const xy = polar.map((s) => latLonToXY(s.lat, s.lon))
  const sel = selected && selected.lat <= -75 ? latLonToXY(selected.lat, selected.lon) : null

  // latitude rings
  const rings = [-88, -86, -84, -82, -80, -78].map((lat) => {
    const r = latLonToXY(lat, 0)[1]
    return {
      type: 'circle' as const, xref: 'x' as const, yref: 'y' as const,
      x0: -r, x1: r, y0: -r, y1: r, line: { color: 'rgba(226,232,240,0.18)', width: 1, dash: 'dot' as const },
    }
  })

  const handleUp = (e: React.MouseEvent) => {
    const start = down.current
    down.current = null
    if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4 || !gd.current) return
    const drag = gd.current.querySelector('.nsewdrag') as SVGRectElement | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fl = (gd.current as any)._fullLayout
    if (!drag || !fl) return
    const b = drag.getBoundingClientRect()
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return
    const [x0, x1] = fl.xaxis.range as [number, number]
    const [y0, y1] = fl.yaxis.range as [number, number]
    const x = x0 + ((e.clientX - b.left) / b.width) * (x1 - x0)
    const y = y1 - ((e.clientY - b.top) / b.height) * (y1 - y0)
    const [lat, lon] = xyToLatLon(x, y)
    // snap to a curated site if the click is close to one
    const hit = polar.find((_, i) => Math.hypot(xy[i][0] - x, xy[i][1] - y) < (x1 - x0) / 60)
    if (hit) onPick({ name: hit.name, lat: hit.lat, lon: hit.lon, note: hit.note })
    else if (lat <= -75.5) onPick({ name: 'Custom site', lat: +lat.toFixed(4), lon: +lon.toFixed(4) })
  }

  return (
    <div
      onMouseDown={(e) => (down.current = [e.clientX, e.clientY])}
      onMouseUp={handleUp}
      style={{ cursor: 'crosshair' }}
    >
      <Plot
        data={[
          {
            x: xy.map((p) => p[0]), y: xy.map((p) => p[1]), mode: 'text+markers',
            text: polar.map((s) => LABELS[s.id]?.[0] ?? s.name.replace(/ \(.*\)/, '')),
            textposition: polar.map((s) => LABELS[s.id]?.[1] ?? 'top center') as never,
            hovertext: polar.map((s) => s.name),
            textfont: { color: '#f1f5f9', size: 11 },
            marker: { size: 10, color: '#f8fafc', line: { color: '#0f172a', width: 2 } },
            customdata: polar.map((s) => [s.lat, s.lon]),
            hovertemplate: '%{hovertext}<br>%{customdata[0]:.3f}°, %{customdata[1]:.3f}°E<extra></extra>',
            showlegend: false,
          },
          ...(sel
            ? [{
                x: [sel[0]], y: [sel[1]], mode: 'markers' as const, hoverinfo: 'skip' as const, showlegend: false,
                marker: { size: 22, color: 'rgba(0,0,0,0)', line: { color: COLORS.both, width: 3 } },
              }]
            : []),
        ]}
        layout={{
          ...baseLayout,
          margin: { l: 0, r: 0, t: 0, b: 0 },
          height: 420,
          dragmode: 'pan',
          xaxis: { range: VIEW_X, visible: false, scaleanchor: 'y' },
          yaxis: { range: VIEW_Y, visible: false },
          images: [{
            source: `${import.meta.env.BASE_URL}southpole.jpg`, xref: 'x', yref: 'y',
            x: -HALF_EXTENT_KM, y: HALF_EXTENT_KM, sizex: 2 * HALF_EXTENT_KM, sizey: 2 * HALF_EXTENT_KM,
            sizing: 'stretch', layer: 'below',
          }],
          shapes: rings,
          annotations: [{
            x: 0, y: 0, text: 'S. Pole', showarrow: false, font: { size: 10, color: '#e2e8f0' }, yshift: -10,
          }],
        }}
        config={{ ...plotConfig, scrollZoom: false, modeBarButtonsToAdd: [] }}
        onInitialized={(_, el) => (gd.current = el)}
        onUpdate={(_, el) => (gd.current = el)}
        style={{ width: '100%', height: 420 }}
        useResizeHandler
      />
    </div>
  )
}
