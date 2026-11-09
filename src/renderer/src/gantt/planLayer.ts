import type { GanttStatic } from 'dhtmlx-gantt'
import { lateness, previousDay } from '@shared/plan'

/**
 * Draws the baseline (a pale bar under the task's bar) and the deadline (a ring on its day) of every visible task.
 *
 * The Community edition has `addTaskLayer` switched off, so, like the line-of-balance overlay, this keeps its
 * own element inside the timeline's data area and redraws after every render. Positions come from the gantt
 * itself (`getTaskPosition`), so hidden days and zoom are followed for free.
 */
export class PlanOverlay {
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

  private ensureElement(): HTMLDivElement | null {
    const host = this.gantt.$task_data as HTMLElement | undefined
    if (!host) return null
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.className = 'plan-overlay'
      this.el.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:4'
    }
    if (this.el.parentElement !== host) host.appendChild(this.el)
    return this.el
  }

  private draw(): void {
    const el = this.ensureElement()
    if (!el) return
    el.replaceChildren()
    const gantt = this.gantt
    const format = gantt.date.date_to_str('%d/%m/%Y')
    gantt.eachTask((task: any) => {
      // Collapsed rows have no position.
      if (gantt.getGlobalTaskIndex(task.id) < 0) return
      if (task.baseline_start && task.baseline_end) {
        const pos = gantt.getTaskPosition(task, task.baseline_start, task.baseline_end) as { left: number; width: number; top: number; height: number }
        const bar = document.createElement('div')
        bar.className = 'baseline'
        bar.style.left = `${pos.left}px`
        bar.style.width = `${pos.width}px`
        bar.style.top = `${pos.top + pos.height + 1}px`
        const last = previousDay(task.baseline_end)
        bar.title = `Línea base: ${format(task.baseline_start)} – ${format(last)}`
        el.appendChild(bar)
      }
      if (task.deadline) {
        // The deadline is the last day the task may work: the ring sits at the end of that day.
        const limit = new Date(task.deadline.getFullYear(), task.deadline.getMonth(), task.deadline.getDate() + 1)
        const pos = gantt.getTaskPosition(task, limit) as { left: number; top: number; height: number }
        const ring = document.createElement('div')
        ring.className = 'deadline'
        ring.style.left = `${pos.left}px`
        ring.style.top = `${pos.top + pos.height / 2 - 9}px`
        ring.title = `Plazo: ${format(task.deadline)}`
        el.appendChild(ring)
      }
    })
  }
}

/** The gantt reads these dates as text: turn them into dates (`onTaskLoading`). */
export function parsePlanDates(gantt: GanttStatic, task: any): void {
  for (const key of ['baseline_start', 'baseline_end', 'deadline']) {
    if (typeof task[key] === 'string' && task[key]) task[key] = gantt.templates.parse_date(task[key])
    else if (!task[key]) task[key] = null
  }
}

/** Style classes a task bar takes from its baseline and deadline. */
export function planTaskClasses(end: Date, task: any): string[] {
  const classes: string[] = []
  if (task.baseline_end) classes.push('has-baseline')
  if (lateness({ ...task, end_date: end })) classes.push('overdue')
  return classes
}

/** Text to the right of a late task's bar. */
export function planSideText(end: Date, task: any): string {
  const late = lateness({ ...task, end_date: end })
  if (!late) return ''
  return `<b>${late.kind === 'deadline' ? 'Fuera de plazo' : 'Atraso'}: ${late.days} ${late.days === 1 ? 'día' : 'días'}</b>`
}
