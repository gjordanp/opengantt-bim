/**
 * Day arithmetic for the scheduling engine.
 *
 * Dates are `YYYY-MM-DD` strings; internally a date is an integer day number
 * (days since 1970-01-01, UTC) so there is no timezone or DST drift. A task
 * occupies the half-open range [start, end): `end` is the day after its last
 * working day, matching the gantt library (a 3-day task starting Monday ends
 * on Thursday 00:00).
 */

const MS_PER_DAY = 86_400_000

export const toDay = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

export const fromDay = (day: number): string => new Date(day * MS_PER_DAY).toISOString().slice(0, 10)

/** 0 = Sunday … 6 = Saturday. 1970-01-01 (day 0) was a Thursday. */
export const weekday = (day: number): number => (((day + 4) % 7) + 7) % 7

export interface Calendar {
  isWorkingDay(day: number): boolean
}

/** Every day is a working day. */
export const allDays: Calendar = { isWorkingDay: () => true }

export interface WeekCalendarOptions {
  /** Working weekdays, 0 = Sunday. Default Monday to Friday. */
  workWeek?: number[]
  /** Non-working dates (`YYYY-MM-DD`). */
  holidays?: string[]
}

export function weekCalendar({ workWeek = [1, 2, 3, 4, 5], holidays = [] }: WeekCalendarOptions = {}): Calendar {
  if (workWeek.length === 0) throw new Error('A calendar needs at least one working weekday')
  const week = new Set(workWeek)
  const off = new Set(holidays.map(toDay))
  return { isWorkingDay: (day) => week.has(weekday(day)) && !off.has(day) }
}

// A calendar whose holidays cover every working weekday for years would loop
// forever; bail out instead.
const MAX_SCAN_DAYS = 3660

export function nextWorkingDay(cal: Calendar, day: number): number {
  let d = day
  for (let i = 0; i < MAX_SCAN_DAYS; i++, d++) if (cal.isWorkingDay(d)) return d
  throw new Error('Calendar has no working day in the next 10 years')
}

export function prevWorkingDay(cal: Calendar, day: number): number {
  let d = day
  for (let i = 0; i < MAX_SCAN_DAYS; i++, d--) if (cal.isWorkingDay(d)) return d
  throw new Error('Calendar has no working day in the previous 10 years')
}

/** Exclusive end of a task that starts on `start` and lasts `duration` working days. */
export function endFromStart(cal: Calendar, start: number, duration: number): number {
  if (duration <= 0) return start
  let d = nextWorkingDay(cal, start)
  for (let left = duration; ; left--) {
    if (left === 1) return d + 1
    d = nextWorkingDay(cal, d + 1)
  }
}

/** Start of a task that ends (exclusive) at `end` and lasts `duration` working days. */
export function startFromEnd(cal: Calendar, end: number, duration: number): number {
  if (duration <= 0) return end
  let d = prevWorkingDay(cal, end - 1)
  for (let left = duration; ; left--) {
    if (left === 1) return d
    d = prevWorkingDay(cal, d - 1)
  }
}

/**
 * `date` moved by `lag` working days. Positive lags walk forward over working
 * days, negative lags walk back (a lead). The result is a boundary date, not
 * yet snapped to a working day.
 */
export function shiftWorkDays(cal: Calendar, date: number, lag: number): number {
  if (lag === 0) return date
  return lag > 0 ? endFromStart(cal, date, lag) : startFromEnd(cal, date, -lag)
}

/** Working days in [from, to). */
export function countWorkDays(cal: Calendar, from: number, to: number): number {
  let n = 0
  for (let d = from; d < to; d++) if (cal.isWorkingDay(d)) n++
  return n
}
