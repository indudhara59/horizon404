import { useEffect, useMemo, useRef, useState } from 'react'
import { api, decodeGrid, layerValue } from '../lib/api'
import type { LayerKey, LayerSet, Selection, Site } from '../lib/types'
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

export type MapLayer = 'relief' | LayerKey

const LAYER_BUTTONS: { key: MapLayer; label: string }[] = [
  { key: 'relief', label: 'Relief' },
  { key: 'both', label: 'Power + comms' },
  { key: 'sunlit', label: 'Sunlight' },
  { key: 'earth', label: 'Earth' },
  { key: 'slope', label: 'Slope' },
]

interface Props {
  sites: Site[]
  selected: Selection | null
  onPick: (s: Selection) => void
  layer: MapLayer
  onLayer: (l: MapLayer) => void
}

let layerCache: Promise<LayerSet> | null = null

/** Shaded-relief LOLA map of the south pole with precomputed suitability layers. */
export default function PoleMap({ sites, selected, onPick, layer, onLayer }: Props) {
  const gd = useRef<HTMLElement | null>(null)
  const down = useRef<[number, number] | null>(null)
  const [ls, setLs] = useState<LayerSet | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    if (layer === 'relief' || ls) return
    layerCache ??= api.layers()
    layerCache.then(setLs).catch(() => setLs(null))
  }, [layer, ls])

  const bytes = useMemo(() => {
    if (!ls) return null
    const out = {} as Record<LayerKey, Uint8Array>
    for (const k of Object.keys(ls.layers) as LayerKey[]) out[k] = decodeGrid(ls.layers[k].grid.data)
    return out
  }, [ls])

  const polar = sites.filter((s) => s.lat <= -75)
  const xy = polar.map((s) => latLonToXY(s.lat, s.lon))
  const sel = selected && selected.lat <= -75 ? latLonToXY(selected.lat, selected.lon) : null
  const active = layer !== 'relief' && ls ? ls.layers[layer] : null

  // latitude rings
  const rings = [-88, -86, -84, -82, -80, -78].map((lat) => {
    const r = latLonToXY(lat, 0)[1]
    return {
      type: 'circle' as const, xref: 'x' as const, yref: 'y' as const,
      x0: -r, x1: r, y0: -r, y1: r, line: { color: 'rgba(226,232,240,0.18)', width: 1, dash: 'dot' as const },
    }
  })

  /** Map coordinates (km) under the mouse, or null if outside the plot area. */
  const toMap = (e: React.MouseEvent): [number, number] | null => {
    if (!gd.current) return null
    const drag = gd.current.querySelector('.nsewdrag') as SVGRectElement | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fl = (gd.current as any)._fullLayout
    if (!drag || !fl) return null
    const b = drag.getBoundingClientRect()
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return null
    const [x0, x1] = fl.xaxis.range as [number, number]
    const [y0, y1] = fl.yaxis.range as [number, number]
    return [x0 + ((e.clientX - b.left) / b.width) * (x1 - x0), y1 - ((e.clientY - b.top) / b.height) * (y1 - y0)]
  }

  const handleUp = (e: React.MouseEvent) => {
    const start = down.current
    down.current = null
    if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4) return
    const p = toMap(e)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fl = (gd.current as any)?._fullLayout
    if (!p || !fl) return
    const [x, y] = p
    const span = fl.xaxis.range[1] - fl.xaxis.range[0]
    const [lat, lon] = xyToLatLon(x, y)
    // snap to a curated site if the click is close to one
    const hit = polar.find((_, i) => Math.hypot(xy[i][0] - x, xy[i][1] - y) < span / 60)
    if (hit) onPick({ name: hit.name, lat: hit.lat, lon: hit.lon, note: hit.note })
    else if (lat <= -75.5) onPick({ name: 'Custom site', lat: +lat.toFixed(4), lon: +lon.toFixed(4) })
  }

  const handleMove = (e: React.MouseEvent) => {
    const p = toMap(e)
    if (!p) return setHover(null)
    const [lat, lon] = xyToLatLon(p[0], p[1])
    let txt = `${Math.abs(lat).toFixed(2)}°S, ${lon.toFixed(1)}°E`
    if (active && bytes && layer !== 'relief') {
      const v = layerValue(active.grid, bytes[layer], p[0], p[1])
      txt += v === null ? ' · outside layer' : ` · ${active.label} ${v.toFixed(layer === 'slope' ? 1 : 0)}${active.unit}`
    }
    setHover(txt)
  }

  const legendMax = active ? active.legend[active.legend.length - 1][0] : 100
  const gradient = active
    ? `linear-gradient(90deg, ${active.legend.map(([v, c]) => `${c} ${(v / legendMax) * 100}%`).join(', ')})`
    : ''

  return (
    <div className="pole-map">
      <div className="layer-switch" role="tablist" aria-label="Map layer">
        {LAYER_BUTTONS.map((b) => (
          <button key={b.key} className={layer === b.key ? 'active' : ''} onClick={() => onLayer(b.key)}>
            {b.label}
          </button>
        ))}
      </div>
      <div
        onMouseDown={(e) => (down.current = [e.clientX, e.clientY])}
        onMouseUp={handleUp}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
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
            images: [
              {
                source: `${import.meta.env.BASE_URL}southpole.jpg`, xref: 'x', yref: 'y',
                x: -HALF_EXTENT_KM, y: HALF_EXTENT_KM, sizex: 2 * HALF_EXTENT_KM, sizey: 2 * HALF_EXTENT_KM,
                sizing: 'stretch', layer: 'below',
              },
              ...(active && ls
                ? [{
                    source: `${import.meta.env.BASE_URL}layers/${layer}.webp`, xref: 'x' as const, yref: 'y' as const,
                    x: ls.image_extent.x[0], y: ls.image_extent.y[1],
                    sizex: ls.image_extent.x[1] - ls.image_extent.x[0], sizey: ls.image_extent.y[1] - ls.image_extent.y[0],
                    sizing: 'stretch' as const, layer: 'below' as const, opacity: 0.85,
                  }]
                : []),
            ],
            shapes: rings,
          }}
          config={{ ...plotConfig, scrollZoom: false, modeBarButtonsToAdd: [] }}
          onInitialized={(_, el) => (gd.current = el)}
          onUpdate={(_, el) => (gd.current = el)}
          style={{ width: '100%', height: 420 }}
          useResizeHandler
        />
      </div>
      <div className="map-readout mono">{hover ?? 'Hover the map for coordinates and layer values'}</div>
      {active && ls && (
        <div className="legend">
          <div className="legend-bar" style={{ background: gradient }} />
          <div className="legend-ticks">
            {active.legend.map(([v]) => (
              <span key={v} style={{ left: `${(v / legendMax) * 100}%` }}>
                {v}{active.unit}{v === legendMax && layer !== 'earth' ? '+' : ''}
              </span>
            ))}
          </div>
          <p className="hint">
            {layer === 'slope'
              ? 'Slope over a 240 m baseline from LOLA. Landers typically need < 8–10°.'
              : `Share of time over 12 months from ${ls.window.start} (3 h steps, 2 m mast), on a 3 km grid. Ridges narrower than the grid can be brighter than shown, so click a spot for the exact value.`}
          </p>
        </div>
      )}
    </div>
  )
}
