import { useEffect, useMemo, useRef, useState } from 'react'
import { computeSCurve, type SCurve, type SCurveTask } from '@shared/scurve'
import { toDay, weekCalendar } from '@shared/scheduling'

interface Props {
  /** Detail tasks with span and progress, read from the gantt. */
  getTasks: () => SCurveTask[]
  /** Changes whenever the gantt reports an edit, so the curve is recomputed. */
  version: number
  holidays: string[]
  workWeek: number[]
}

const MARGIN = { top: 14, right: 44, bottom: 26, left: 40 }
const MS_PER_DAY = 86_400_000

const dayDate = (day: number): Date => new Date(day * MS_PER_DAY)
const fmtDate = (day: number): string => dayDate(day).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const fmtMonth = (day: number): string => dayDate(day).toLocaleDateString('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const pctText = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)} %`)
const localToday = (): number => toDay(new Date().toLocaleDateString('sv-SE'))

/** Month starts inside the chart, thinned so the labels do not collide. */
function monthTicks(from: number, length: number, width: number): number[] {
  const out: number[] = []
  for (let i = 0; i < length; i++) if (dayDate(from + i).getUTCDate() === 1) out.push(i)
  if (out[0] !== 0) out.unshift(0)
  const room = Math.max(1, Math.floor(width / 64))
  const every = Math.ceil(out.length / room)
  return out.filter((_, k) => k % every === 0)
}

/** Planned vs real progress over time, with the pace so far carried forward (like DHTMLX's S-curve sample). */
export default function SCurvePanel({ getTasks, version, holidays, workWeek }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const today = localToday()
  const curve: SCurve | null = useMemo(
    () => computeSCurve(getTasks(), weekCalendar({ holidays, workWeek: workWeek.length ? workWeek : undefined }), today),
    // `version` stands for "the gantt changed": getTasks reads live state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, holidays, workWeek, today]
  )

  const plotW = Math.max(0, size.w - MARGIN.left - MARGIN.right)
  const plotH = Math.max(0, size.h - MARGIN.top - MARGIN.bottom)
  const n = curve?.planned.length ?? 0
  const x = (i: number): number => MARGIN.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW)
  const y = (pct: number): number => MARGIN.top + (1 - pct / 100) * plotH

  const path = (values: (number | null)[]): string => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }

  const todayIdx = curve ? today - curve.from : -1
  const onMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (!curve || n < 2) return
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left - MARGIN.left) / plotW) * (n - 1))
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <div className="scurve">
      <div className="scurve-head">
        <span className="scurve-legend">
          <i className="swatch planned" /> Planificado
        </span>
        <span className="scurve-legend">
          <i className="swatch real" /> Real
        </span>
        <span className="scurve-legend">
          <i className="swatch predicted" /> Real proyectado
        </span>
        {curve && (
          <span className="scurve-stats">
            <span>
              Hoy: planificado <strong>{pctText(curve.plannedToday)}</strong> · real <strong>{pctText(curve.realToday)}</strong>
              {curve.plannedToday !== null && curve.realToday !== null && (
                <>
                  {' '}
                  · diferencia{' '}
                  <strong className={curve.realToday - curve.plannedToday < -0.05 ? 'behind' : 'ahead'}>
                    {(curve.realToday - curve.plannedToday).toFixed(1)} pp
                  </strong>
                </>
              )}
            </span>
            <span>
              Término planificado <strong>{fmtDate(curve.plannedFinish)}</strong>
              {curve.projectedFinish !== null && (
                <>
                  {' '}
                  · proyectado <strong className={curve.projectedFinish > curve.plannedFinish ? 'behind' : 'ahead'}>{fmtDate(curve.projectedFinish)}</strong>
                </>
              )}
            </span>
          </span>
        )}
      </div>
      <div className="scurve-plot" ref={host}>
        {!curve && <div className="scurve-empty">Agrega tareas con duración para ver la curva.</div>}
        {curve && size.w > 0 && size.h > 0 && (
          <svg width={size.w} height={size.h} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Curva S de avance">
            {[0, 20, 40, 60, 80, 100].map((p) => (
              <g key={p}>
                <line className="grid" x1={MARGIN.left} x2={size.w - MARGIN.right} y1={y(p)} y2={y(p)} />
                <text className="axis" x={MARGIN.left - 6} y={y(p) + 4} textAnchor="end">
                  {p}%
                </text>
                <text className="axis" x={size.w - MARGIN.right + 6} y={y(p) + 4}>
                  {p}%
                </text>
              </g>
            ))}
            {monthTicks(curve.from, n, plotW).map((i) => (
              <text key={i} className="axis" x={x(i)} y={size.h - 8} textAnchor="middle">
                {fmtMonth(curve.from + i)}
              </text>
            ))}
            <path className="line planned" d={path(curve.planned)} />
            <path className="line real" d={path(curve.real)} />
            <path className="line predicted" d={path(curve.predicted)} />
            {todayIdx >= 0 && todayIdx < n && (
              <g>
                <line className="today" x1={x(todayIdx)} x2={x(todayIdx)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
                <text className="axis today-label" x={x(todayIdx)} y={MARGIN.top - 3} textAnchor="middle">
                  Hoy
                </text>
              </g>
            )}
            {hover !== null && (
              <g>
                <line className="cursor" x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
                <circle className="dot planned" cx={x(hover)} cy={y(curve.planned[hover])} r={3.5} />
                {curve.real[hover] !== null && <circle className="dot real" cx={x(hover)} cy={y(curve.real[hover] as number)} r={3.5} />}
              </g>
            )}
          </svg>
        )}
        {curve && hover !== null && (
          <div className="scurve-tip" style={{ left: Math.min(x(hover) + 12, Math.max(0, size.w - 190)), top: MARGIN.top + 6 }}>
            <strong>{fmtDate(curve.from + hover)}</strong>
            <span>Planificado: {pctText(curve.planned[hover])}</span>
            {curve.real[hover] !== null && <span>Real: {pctText(curve.real[hover])}</span>}
            {curve.real[hover] === null && curve.predicted[hover] !== null && <span>Proyectado: {pctText(curve.predicted[hover])}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
