import type { BestDate } from '../lib/types'
import { COLORS, Plot, baseLayout, plotConfig } from '../lib/util'

interface Props {
  data: BestDate[]
  missionDays: number
  selected: string
  onPick: (date: string) => void
}

/** Power+comms % for a mission starting on each day of the next 12 months. */
export default function BestDates({ data, missionDays, selected, onPick }: Props) {
  const best = [...data].sort((a, b) => b.power_and_comms_pct - a.power_and_comms_pct).slice(0, 3)
  return (
    <div>
      <p className="hint">
        Each bar is a {missionDays}-day surface mission starting that day. Click a bar to load that date. Best:{' '}
        {best.map((b, i) => (
          <button key={b.date} className="link" onClick={() => onPick(b.date)}>
            {b.date} ({b.power_and_comms_pct.toFixed(0)}%){i < best.length - 1 ? ',' : ''}
          </button>
        ))}
      </p>
      <Plot
        data={[
          {
            type: 'bar', x: data.map((d) => d.date), y: data.map((d) => d.power_and_comms_pct),
            marker: {
              color: data.map((d) =>
                d.date === selected ? '#f8fafc'
                  : d.power_and_comms_pct >= 50 ? COLORS.both
                    : d.power_and_comms_pct >= 25 ? '#facc15' : '#f87171'),
            },
            customdata: data.map((d) => d.sunlit_pct),
            hovertemplate: '%{x}<br>power + comms %{y:.0f}%<br>sunlit %{customdata:.0f}%<extra></extra>',
          },
        ]}
        layout={{
          ...baseLayout,
          height: 220,
          bargap: 0,
          xaxis: { type: 'date', gridcolor: COLORS.grid },
          yaxis: { range: [0, 100], ticksuffix: '%', gridcolor: COLORS.grid },
        }}
        config={plotConfig}
        onClick={(e) => {
          const x = e.points?.[0]?.x
          if (typeof x === 'string') onPick(x.slice(0, 10))
        }}
        style={{ width: '100%' }}
        useResizeHandler
      />
    </div>
  )
}
