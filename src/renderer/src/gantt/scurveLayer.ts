import type { GanttStatic } from 'dhtmlx-gantt'
import type { SCurve } from '@shared/scurve'
import { fromDay } from '@shared/scheduling'

const SVG = 'http://www.w3.org/2000/svg'
const CLIP_ID = 'scurve-ov-clip'
/** Above this many points per curve the dots are dropped: they would only make a smear. */
const MAX_DOTS = 1500
/** Dots are drawn when the days are at least this many pixels apart. */
const MIN_DOT_SPACING = 6
const SMOOTH_STEP = 10

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

const dayToDate = (day: number): Date => {
  const [y, m, d] = fromDay(day).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const fmtDay = (day: number): string => dayToDate(day).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtShort = (day: number): string => dayToDate(day).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
const pct = (v: number | null): string => (v === null ? '—' : `${v.toFixed(2)} %`)

type Point = [number, number]

/**
 * A smooth curve through the points that never overshoots them (monotone cubic, Fritsch-Carlson):
 * the same shape as Chart.js' `cubicInterpolationMode: 'monotone'`, which DHTMLX's sample uses.
 * Flat stretches (weekends) stay flat.
 */
export function monotonePath(pts: Point[]): string {
  const n = pts.length
  if (n === 0) return ''
  const f = (v: number): string => v.toFixed(1)
  if (n === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}`
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0]
    slope.push(dx === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx)
  }
  const tangent: number[] = new Array(n)
  tangent[0] = slope[0]
  tangent[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0
      tangent[i + 1] = 0
      continue
    }
    const a = tangent[i] / slope[i]
    const b = tangent[i + 1] / slope[i]
    const r = a * a + b * b
    if (r > 9) {
      const tau = 3 / Math.sqrt(r)
      tangent[i] = tau * a * slope[i]
      tangent[i + 1] = tau * b * slope[i]
    }
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const h = (x1 - x0) / 3
    d += `C${f(x0 + h)} ${f(y0 + tangent[i] * h)} ${f(x1 - h)} ${f(y1 - tangent[i + 1] * h)} ${f(x1)} ${f(y1)}`
  }
  return d
}

/**
 * The progress curve drawn right over the gantt's timeline, like DHTMLX's overlay sample (that
 * extension is PRO only): smooth planned / real / projected curves with a dot per day, percent axes
 * on both sides, faded bars and a tooltip with the three values under the pointer. It covers the
 * visible part of the timeline; the curves follow the date scale (so they follow zoom and scroll).
 */
export class SCurveOverlay {
  private root: HTMLDivElement | null = null
  private content: SVGGElement | null = null
  private cursor: SVGLineElement | null = null
  private badge: HTMLDivElement | null = null
  private tip: HTMLDivElement | null = null
  private ids: string[] = []
  private observer: ResizeObserver | null = null
  private hostEvents: [string, (e: MouseEvent) => void][] = []
  // From the last draw, for the tooltip.
  private shown: { curve: SCurve; xs: number[]; round: { planned: number[]; real: (number | null)[]; predicted: (number | null)[] }; top: number; left: number } | null = null

  constructor(
    private readonly gantt: GanttStatic,
    private readonly getCurve: () => SCurve | null
  ) {}

  mount(): void {
    this.ids.push(this.gantt.attachEvent('onGanttRender', () => this.draw()))
    this.ids.push(this.gantt.attachEvent('onGanttScroll', () => this.shift()))
    const host = this.gantt.$task as HTMLElement | undefined
    if (host) {
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.draw())
        this.observer.observe(host)
      }
      this.hostEvents = [
        ['mousemove', (e) => this.onMove(e)],
        ['mouseleave', () => this.hideTip()]
      ]
      for (const [name, fn] of this.hostEvents) host.addEventListener(name, fn as EventListener)
    }
    this.gantt.$root?.classList.add('scurve-on')
    this.draw()
  }

  destroy(): void {
    for (const id of this.ids) this.gantt.detachEvent(id)
    this.ids = []
    this.observer?.disconnect()
    this.observer = null
    const host = this.gantt.$task as HTMLElement | undefined
    for (const [name, fn] of this.hostEvents) host?.removeEventListener(name, fn as EventListener)
    this.hostEvents = []
    this.root?.remove()
    this.root = null
    this.content = null
    this.cursor = null
    this.badge = null
    this.tip = null
    this.shown = null
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
      this.tip = document.createElement('div')
      this.tip.className = 'scurve-ov-tip'
    }
    // The gantt can rebuild its cells; re-attach if we were dropped.
    if (this.root.parentElement !== host) host.appendChild(this.root)
    return this.root
  }

  private scaleHeight(): number {
    return (this.gantt.$task_scale as HTMLElement | undefined)?.offsetHeight ?? this.gantt.config.scale_height
  }

  /** The timeline scrolls natively and our layer lives inside it: pin the layer to the viewport, then slide the curves by the scroll. */
  private shift(): void {
    const host = this.gantt.$task as HTMLElement | undefined
    if (!host || !this.root) return
    this.root.style.left = `${host.scrollLeft}px`
    this.root.style.top = `${this.scaleHeight() + host.scrollTop}px`
    this.content?.setAttribute('transform', `translate(${-host.scrollLeft} 0)`)
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
    this.shown = null
    if (width <= 0 || height <= 40) return

    const curve = this.getCurve()
    if (!curve) {
      const empty = document.createElement('div')
      empty.className = 'scurve-ov-empty'
      empty.textContent = 'Sin tareas con duración para dibujar la curva.'
      root.appendChild(empty)
      return
    }

    // Same vertical padding as DHTMLX's sample, so 0 % and 100 % sit on the same rows.
    const pad = Math.max(8, this.gantt.config.row_height - 12)
    const top = pad
    const bottom = height - pad
    const y = (p: number): number => bottom - (p / 100) * (bottom - top)
    const n = curve.planned.length
    // Entry k is the start of day from + k; x comes from the gantt's own date scale, so it follows zoom and scroll.
    const xs = Array.from({ length: n }, (_, k) => this.gantt.posFromDate(dayToDate(curve.from + k)))
    // Exact values, so small early progress is visible (the tooltip shows two decimals).
    const round = {
      planned: curve.planned,
      real: curve.real,
      predicted: curve.predicted
    }

    const svg = el('svg', { width, height, class: 'scurve-ov-svg' })
    const defs = el('defs')
    const clip = el('clipPath', { id: CLIP_ID })
    clip.appendChild(el('rect', { x: 0, y: top - 1, width, height: bottom - top + 2 }))
    defs.appendChild(clip)
    svg.appendChild(defs)

    const grid = el('g')
    for (let p = 0; p <= 100; p += 10) grid.appendChild(el('line', { class: 'ov-grid', x1: 0, x2: width, y1: y(p), y2: y(p) }))
    svg.appendChild(grid)

    const clipped = el('g', { 'clip-path': `url(#${CLIP_ID})` })
    const content = el('g')
    clipped.appendChild(content)
    svg.appendChild(clipped)

    // A dot per day, as in the sample, unless zoomed out so far that they would only smear.
    const spacious = n > 1 && (xs[n - 1] - xs[0]) / (n - 1) >= MIN_DOT_SPACING
    // Zoomed out, the per-day steps (and the whole-percent rounding) show as a jagged line: draw the true values,
    // one point every few pixels, so the curve reads smooth.
    const points = (values: (number | null)[], raw: (number | null)[]): Point[] => {
      const out: Point[] = []
      let lastX = -Infinity
      let lastIdx = -1
      values.forEach((v, k) => {
        if (v === null) return
        if (spacious) {
          out.push([xs[k], y(v)])
          return
        }
        const rv = raw[k] ?? v
        if (xs[k] - lastX >= SMOOTH_STEP) {
          out.push([xs[k], y(rv)])
          lastX = xs[k]
          lastIdx = k
        } else lastIdx = -2 - k
      })
      // Always end on the last value.
      if (!spacious && lastIdx < -1) {
        const k = -2 - lastIdx
        out.push([xs[k], y(raw[k] ?? values[k] ?? 0)])
      }
      return out
    }
    const draw = (cls: string, pts: Point[]): void => {
      if (pts.length === 0) return
      content.appendChild(el('path', { class: `ov-line ${cls}`, d: monotonePath(pts) }))
      if (spacious && pts.length <= MAX_DOTS) for (const [px, py] of pts) content.appendChild(el('circle', { class: `ov-dot ${cls}`, cx: px.toFixed(1), cy: py.toFixed(1), r: 3 }))
    }
    draw('planned', points(round.planned, curve.planned))
    draw('real', points(round.real, curve.real))
    draw('predicted', points(round.predicted, curve.predicted))

    const cursor = el('line', { class: 'ov-cursor', y1: top, y2: bottom, style: 'display:none' })
    content.appendChild(cursor)
    this.cursor = cursor

    // Percent axes, fixed on both sides.
    const axes = el('g')
    for (let p = 0; p <= 100; p += 10) {
      const l = el('text', { class: 'ov-axis', x: 4, y: y(p) + 4 })
      l.textContent = `${p}%`
      const r = el('text', { class: 'ov-axis', x: width - 4, y: y(p) + 4, 'text-anchor': 'end' })
      r.textContent = `${p}%`
      axes.append(l, r)
    }
    svg.appendChild(axes)

    root.appendChild(svg)
    this.content = content
    this.shown = { curve, xs, round, top: scaleH, left: 0 }
    this.shift()

    // Legend and today's figures, in a corner.
    const diff = curve.plannedToday !== null && curve.realToday !== null ? curve.realToday - curve.plannedToday : null
    const badge = this.badge!
    badge.replaceChildren()
    const add = (html: string): void => {
      const span = document.createElement('span')
      span.innerHTML = html
      badge.appendChild(span)
    }
    add('<i class="ov-sw planned"></i>Progreso planificado')
    add('<i class="ov-sw real"></i>Progreso real')
    add('<i class="ov-sw predicted"></i>Progreso real (proyectado)')
    add(
      `Hoy: <b>${pct(curve.plannedToday)}</b> plan · <b>${pct(curve.realToday)}</b> real` +
        (diff !== null ? ` · <b class="${diff < -0.05 ? 'behind' : 'ahead'}">${diff.toFixed(2)} pp</b>` : '')
    )
    if (curve.projectedFinish !== null) {
      add(`Término: plan <b>${fmtShort(curve.plannedFinish)}</b> · proyectado <b class="${curve.projectedFinish > curve.plannedFinish ? 'behind' : 'ahead'}">${fmtShort(curve.projectedFinish)}</b>`)
    }
    // In a narrow timeline the legend would cover the curve itself.
    if (width >= 420) root.appendChild(badge)
    root.appendChild(this.tip!)
    this.hideTip()
  }

  private hideTip(): void {
    if (this.tip) this.tip.style.display = 'none'
    this.cursor?.setAttribute('style', 'display:none')
  }

  /** Tooltip with the three values of the day under the pointer, like the sample's "index" tooltip. */
  private onMove(e: MouseEvent): void {
    const host = this.gantt.$task as HTMLElement | undefined
    const s = this.shown
    if (!host || !s || !this.tip || !this.root) return
    const rect = host.getBoundingClientRect()
    const localY = e.clientY - rect.top - s.top
    if (localY < 0) {
      this.hideTip()
      return
    }
    const cx = e.clientX - rect.left + host.scrollLeft // x in timeline coordinates
    let lo = 0
    let hi = s.xs.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (s.xs[mid] < cx) lo = mid + 1
      else hi = mid
    }
    const k = lo > 0 && Math.abs(s.xs[lo - 1] - cx) < Math.abs(s.xs[lo] - cx) ? lo - 1 : lo
    const lines = [`<b>${fmtDay(s.curve.from + k)}</b>`, `Progreso planificado: ${s.round.planned[k].toFixed(2)}%`]
    if (s.round.real[k] !== null) lines.push(`Progreso real: ${s.round.real[k]!.toFixed(2)}%`)
    if (s.round.predicted[k] !== null) lines.push(`Progreso real (proyectado): ${s.round.predicted[k]!.toFixed(2)}%`)
    this.tip.innerHTML = lines.map((l) => `<span>${l}</span>`).join('')
    this.tip.style.display = 'flex'
    const viewX = s.xs[k] - host.scrollLeft
    const tipW = this.tip.offsetWidth
    this.tip.style.left = `${viewX + 14 + tipW > host.clientWidth ? Math.max(0, viewX - 14 - tipW) : viewX + 14}px`
    this.tip.style.top = `${Math.max(0, Math.min(localY + 10, this.root.clientHeight - this.tip.offsetHeight - 4))}px`
    this.cursor?.setAttribute('style', '')
    this.cursor?.setAttribute('x1', String(s.xs[k]))
    this.cursor?.setAttribute('x2', String(s.xs[k]))
  }
}
