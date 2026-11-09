import type { GanttStatic } from 'dhtmlx-gantt'
import { countWorkDays, endFromStart, fromDay, toDay, type Calendar } from '@shared/scheduling'
import { dateToIso, isoToDate } from './autoSchedule'

/**
 * Makes the gantt count durations in working days of the project calendar, the way the PRO edition does with
 * `work_time`. The Community edition always counts calendar days, so every edit that goes through the gantt
 * itself (the edit window, `updateTask`) turned a working-day duration into a calendar-day one and, at each pass,
 * made it longer. These two methods are what the gantt calls to go between a start, a duration and an end.
 */
export function installWorkTime(gantt: GanttStatic, getCalendar: () => Calendar): void {
  const g = gantt as any
  const durationOf = g.calculateDuration.bind(g)
  const endOf = g.calculateEndDate.bind(g)
  const isDays = (unit: unknown): boolean => unit === undefined || unit === 'day'

  g.calculateDuration = (a: any, b?: any, c?: any): number => {
    const cfg = a instanceof Date ? { start_date: a, end_date: b, task: c } : a
    if (!isDays(cfg?.unit) || !cfg?.start_date || !cfg?.end_date) return durationOf(a, b, c)
    const from = toDay(dateToIso(cfg.start_date))
    const to = toDay(dateToIso(cfg.end_date))
    return to <= from ? 0 : countWorkDays(getCalendar(), from, to)
  }

  g.calculateEndDate = (a: any, b?: any, c?: any, d?: any): Date => {
    const cfg = a instanceof Date ? { start_date: a, duration: b, unit: c, task: d } : a
    if (!isDays(cfg?.unit) || !cfg?.start_date) return endOf(a, b, c, d)
    return isoToDate(fromDay(endFromStart(getCalendar(), toDay(dateToIso(cfg.start_date)), Number(cfg.duration) || 0)))
  }
}
