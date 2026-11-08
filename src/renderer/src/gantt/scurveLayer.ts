import type { GanttStatic } from 'dhtmlx-gantt'
import type { SCurve } from '@shared/scurve'
import { fromDay } from '@shared/scheduling'

const SVG = 'http://www.w3.org/2000/svg'
const PAD = { top: 22, bottom: 10, side: 34 }

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

const dayToDate = (day: number): Date => {
  const [y, m, d] = fromDay(day).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const pct = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)} %`)
const fmtDay = (day: number): string => dayToDate(day).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The progress curve drawn right over the gantt's timeline, like DHTMLX's overlay sample (that
 * extension is PRO only). It covers the visible part of the timeline, with the percent axes
 * fixed on both sides; the curves line up with the date scale and move with the horizontal scroll.
 */
export class SCurveOverlay {
  private root: HTMLDivElement | null = null
  private svg: SVGSVGElement | null = null
  private content: SVGGElement | null = null
  private badge: HTMLDivElement | null = null
  private ids: string[] = []
  private observer: ResizeObserver | null = null

  constructor(
    private readonly gantt: GanttStatic,
    private readonly getCurve: () => SCurve | null
  ) {}

  mount(): void {
    this.ids.push(this.gantt.attachEvent('onGanttRender', () => this.draw()))
    this.ids.push(this.gantt.attachEvent('onGanttScroll', () => this.shift()))
    const host = this.gantt.$task as HTMLElement | undefined
    if (host && typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.draw())
      this.observer.observe(host)
    }
    this.gantt.$root?.classList.add('scurve-on')
    this.draw()
  }

  destroy(): void {
    for (const id of this.ids) this.gantt.detachEvent(id)
    this.ids = []
    this.observer?.disconnect()
    this.observer = null
    this.root?.remove()
    this.root = null
    this.svg = null
    this.content = null
    this.badge = null
    this.gantt.$root?.classList.remove('scurve-on')
  }

  private ensure(): HTMLDivElement | null {
    const host = this.gantt.$task as HTMLElement | undefined
    if (!host) return null
    if (!this.root) {
      this.root = document.createElement('div')
      this.root.className = 'scurve-ov'
      this.badge = document.createElement('div')
      this.badge.className = 'scurve-ov-badge'
    }
    // The gantt can rebuild its cells; re-attach if we were dropped.
    if (this.root.parentElement !== host) host.appendChild(this.root)
    return this.root
  }

  /** Moves the curves with the timeline's horizontal scroll, without recomputing anything. */
  private shift(): void {
    const host = this.gantt.$task as HTMLElement | undefined
    if (!host || !this.root) return
    // The timeline scrolls natively, and our layer lives inside it: pin the layer to the viewport,
    // then slide the curves by the scroll so they stay under their dates.
    this.root.style.left = `${host.scrollLeft}px`
    this.root.style.top = `${this.scaleHeight() + host.scrollTop}px`
    this.content?.setAttribute('transform', `translate(${-host.scrollLeft} 0)`)
  }

  private scaleHeight(): number {
    return (this.gantt.$task_scale as HTMLElement | undefined)?.offsetHeight ?? this.gantt.config.scale_height
  }

  private draw(): void {
    const root = this.ensure()
    const host = this.gantt.$task as HTMLElement | undefined
    if (!root || !host) return
    const scaleH = this.scaleHeight()
    const width = host.clientWidth
    const height = host.clientHeight - scaleH
    root.style.width = `${width}px`
    root.style.height = `${Math.max(0, height)}px`
    root.replaceChildren()
    if (width <= 0 || height <= 40) return

    const curve = this.getCurve()
    if (!curve) {
      const empty = document.createElement('div')
      empty.className = 'scurve-ov-empty'
      empty.textContent = 'Sin tareas con duración para dibujar la curva.'
      root.appendChild(empty)
      return
    }

    const top = PAD.top
    const bottom = height - PAD.bottom
    const y = (p: number): number => bottom - (p / 100) * (bottom - top)
    // A point is the end of its day; x comes from the gantt's own date scale, so it lines up with the bars.
    const x = (day: number): number => this.gantt.posFromDate(dayToDate(day))

    const svg = el('svg', { width, height, class: 'scurve-ov-svg' })
    const grid = el('g')
    for (const p of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      grid.appendChild(el('line', { class: 'ov-grid', x1: 0, x2: width, y1: y(p), y2: y(p) }))
    }
    svg.appendChild(grid)

    const content = el('g')
    const line = (cls: string, points: [number, number][]): void => {
      if (points.length < 2) return
      const d = points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
      content.appendChild(el('path', { class: `ov-line ${cls}`, d }))
    }
    const series = (values: (number | null)[]): [number, number][] => {
      const pts: [number, number][] = [[x(curve.from), y(0)]]
      values.forEach((v, i) => {
        if (v !== null) pts.push([x(curve.from + i + 1), y(v)])
      })
      return pts
    }
    line('planned', series(curve.planned))
    line('real', series(curve.real))
    // The projection starts where the real curve stops.
    const todayI = curve.today - curve.from
    const proj: [number, number][] = []
    curve.predicted.forEach((v, i) => {
      if (v !== null) proj.push([x(curve.from + i + 1), y(v)])
    })
    if (todayI >= 0 && todayI < curve.predicted.length) line('predicted', proj)
    svg.appendChild(content)

    // Percent axes, fixed on both sides.
    const axes = el('g')
    for (const p of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      const l = el('text', { class: 'ov-axis', x: 4, y: y(p) + 4 })
      l.textContent = `${p}%`
      const r = el('text', { class: 'ov-axis', x: width - 4, y: y(p) + 4, 'text-anchor': 'end' })
      r.textContent = `${p}%`
      axes.append(l, r)
    }
    svg.appendChild(axes)

    root.appendChild(svg)
    this.svg = svg
    this.content = content
    this.shift()

    // Legend and the figures for today, in a corner.
    const diff = curve.plannedToday !== null && curve.realToday !== null ? curve.realToday - curve.plannedToday : null
    const badge = this.badge!
    badge.replaceChildren()
    const add = (html: string): void => {
      const span = document.createElement('span')
      span.innerHTML = html
      badge.appendChild(span)
    }
    add('<i class="ov-sw planned"></i>Planificado')
    add('<i class="ov-sw real"></i>Real')
    add('<i class="ov-sw predicted"></i>Proyectado')
    add(
      `Hoy: <b>${pct(curve.plannedToday)}</b> plan · <b>${pct(curve.realToday)}</b> real` +
        (diff !== null ? ` · <b class="${diff < -0.05 ? 'behind' : 'ahead'}">${diff.toFixed(1)} pp</b>` : '')
    )
    if (curve.projectedFinish !== null) {
      add(`Término: plan <b>${fmtDay(curve.plannedFinish)}</b> · proyectado <b class="${curve.projectedFinish > curve.plannedFinish ? 'behind' : 'ahead'}">${fmtDay(curve.projectedFinish)}</b>`)
    }
    // In a narrow timeline the legend would cover the curve itself.
    if (width >= 420) root.appendChild(badge)
  }
}
