import type { GanttStatic } from 'dhtmlx-gantt'
import {
  countWorkDays,
  fromDay,
  schedule,
  toDay,
  weekCalendar,
  type LinkKind,
  type SchedLink,
  type SchedTask
} from '@shared/scheduling'

const calendar = weekCalendar()

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local `YYYY-MM-DD` (the gantt library works with local dates). */
export const dateToIso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const isoToDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export interface AutoScheduleOutcome {
  /** Ids of tasks on the critical path. */
  critical: Set<string>
  /** Ids of tasks in a dependency cycle (left untouched). */
  cycle: string[]
  /** How many tasks changed dates. */
  moved: number
}

/**
 * Reads the tasks and links from the gantt, schedules them with our engine and
 * writes the resulting dates back. `duration` is in working days (Mon-Fri).
 *
 * The community gantt edition has no scheduler, so this is the only place that
 * moves tasks around. Callers must guard against the update events this
 * triggers (see `GanttView`).
 */
export function autoSchedule(gantt: GanttStatic): AutoScheduleOutcome {
  const tasks: SchedTask[] = []
  gantt.eachTask((t: any) => {
    tasks.push({
      id: String(t.id),
      start: dateToIso(t.start_date),
      duration: Number(t.duration) || 0,
      parent: String(t.parent)
    })
  })
  const links: SchedLink[] = (gantt.getLinks() as any[]).map((l) => ({
    source: String(l.source),
    target: String(l.target),
    type: String(l.type) as LinkKind,
    lag: Number(l.lag) || 0
  }))

  const result = schedule(tasks, links, { calendar })

  let moved = 0
  const critical = new Set<string>()
  gantt.batchUpdate(() => {
    for (const [id, s] of result.tasks) {
      if (s.critical && !s.summary) critical.add(id)
      const task = gantt.getTask(id) as any
      const start = isoToDate(s.start)
      const end = isoToDate(s.end)
      const changed = dateToIso(task.start_date) !== s.start || !task.end_date || dateToIso(task.end_date) !== s.end
      if (!changed && !s.summary) continue
      task.start_date = start
      task.end_date = end
      if (s.summary) task.duration = s.duration
      if (changed) moved++
      // refreshTask only repaints. updateTask would re-derive `duration` from the
      // dates in calendar days, and each pass would then inflate working-day durations.
      gantt.refreshTask(id)
    }
  })

  return { critical, cycle: result.cycle ?? [], moved }
}

/**
 * After a bar is dragged or resized the gantt re-derives `duration` in calendar
 * days; convert it back to working days so the scheduler sees what was meant.
 */
export function normalizeDuration(gantt: GanttStatic, id: string | number): void {
  const task = gantt.getTask(id) as any
  if (!task.start_date || !task.end_date) return
  task.duration = countWorkDays(calendar, toDay(dateToIso(task.start_date)), toDay(dateToIso(task.end_date)))
}

export { fromDay }
