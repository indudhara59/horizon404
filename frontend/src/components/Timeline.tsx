import type { Shape } from 'plotly.js'
import type { Analysis, Window } from '../lib/types'
import { COLORS, Plot, baseLayout, plotConfig } from '../lib/util'

interface Row {
  label: string
  a: Analysis
}

interface Props {
  rows: Row[]
  cursor?: string
  height?: number
}

const LANES: { key: 'sunlit' | 'earth' | 'both'; label: string; color: string }[] = [
  { key: 'sunlit', label: 'Sunlight', color: COLORS.sun },
  { key: 'earth', label: 'Earth in view', color: COLORS.earth },
  { key: 'both', label: 'Power + comms', color: COLORS.both },
]

/** Gantt-style bands of sunlit / Earth-visible / both, for one or more scenarios. */
export default function Timeline({ rows, cursor, height }: Props) {
  const shapes: Partial<Shape>[] = []
  const ticks: string[] = []
  const tickVals: number[] = []
  let y = 0
  const multi = rows.length > 1

  // With several scenarios, align them on "days after landing" so different dates compare fairly.
  const rel = (iso: string, row: Row) =>
    (new Date(iso).getTime() - new Date(row.a.window.start).getTime()) / 86400e3

  rows.forEach((row, ri) => {
    LANES.forEach((lane) => {
      const wins: Window[] = row.a.windows[lane.key]
      wins.forEach(([x0, x1]) =>
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: multi ? rel(x0, row) : x0, x1: multi ? rel(x1, row) : x1,
          y0: y - 0.38, y1: y + 0.38,
          fillcolor: lane.color, opacity: lane.key === 'both' ? 0.95 : 0.75, line: { width: 0 },
        }),
      )
      ticks.push(multi ? `${row.label} · ${lane.label}` : lane.label)
      tickVals.push(y)
      y -= 1
    })
    if (multi && ri < rows.length - 1) {
      shapes.push({
        type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: y + 0.5, y1: y + 0.5,
        line: { color: 'rgba(148,163,184,0.35)', width: 1, dash: 'dot' },
      })
      y -= 0.4
    }
  })

  const days = rows[0].a.window.days
  const start = multi ? 0 : rows[0].a.window.start
  const end = multi ? days : new Date(new Date(rows[0].a.window.start).getTime() + days * 86400e3).toISOString()
  if (cursor && !multi) {
    shapes.push({
      type: 'line', xref: 'x', yref: 'paper', x0: cursor, x1: cursor, y0: 0, y1: 1,
      line: { color: '#f8fafc', width: 2 },
    })
  }

  const h = height ?? 70 + tickVals.length * 34

  return (
    <Plot
      data={[{ x: [start, end], y: [0, 0], mode: 'markers', marker: { opacity: 0 }, hoverinfo: 'skip', showlegend: false }]}
      layout={{
        ...baseLayout,
        margin: { ...baseLayout.margin, l: multi ? 150 : 110 },
        height: h,
        shapes,
        xaxis: multi
          ? { type: 'linear', range: [start, end], gridcolor: COLORS.grid, title: { text: 'Days after landing' } }
          : { type: 'date', range: [start, end], gridcolor: COLORS.grid },
        yaxis: {
          tickvals: tickVals, ticktext: ticks, range: [y + 0.5, 0.6],
          showgrid: false, zeroline: false, fixedrange: true,
        },
        hovermode: false,
      }}
      config={plotConfig}
      style={{ width: '100%', height: h }}
      useResizeHandler
    />
  )
}
