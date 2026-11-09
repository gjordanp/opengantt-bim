import type { GanttStatic } from 'dhtmlx-gantt'

/** A vertical line at today's date (the Community edition has no markers). */
export class TodayLine {
  private el: HTMLDivElement | null = null
  private eventId: string | null = null

  constructor(private readonly gantt: GanttStatic) {}

  mount(): void {
    this.eventId = this.gantt.attachEvent('onGanttRender', () => this.draw())
    this.draw()
  }

  destroy(): void {
    if (this.eventId) this.gantt.detachEvent(this.eventId)
    this.eventId = null
    this.el?.remove()
    this.el = null
  }

  private draw(): void {
    const host = this.gantt.$task_data as HTMLElement | undefined
    if (!host) return
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.className = 'today-line'
      this.el.title = 'Hoy'
    }
    if (this.el.parentElement !== host) host.appendChild(this.el)

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
    const state = this.gantt.getState() as { min_date: Date; max_date: Date }
    if (today < state.min_date || today > state.max_date) {
      this.el.style.display = 'none'
      return
    }
    this.el.style.display = 'block'
    this.el.style.left = `${Math.round(this.gantt.posFromDate(today))}px`
    this.el.style.height = `${this.gantt.getVisibleTaskCount() ? host.scrollHeight : 0}px`
  }
}
