/** Baselines and deadlines: when a task is late, and by how many days. Dates are local midnights. */

const DAY_MS = 86_400_000

/** Calendar days between two dates (rounded, so a daylight-saving hour never adds a day). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

/**
 * Days the end of a task is past a limit; 0 when it is on time.
 * Both are instants: the task's end is exclusive (midnight after its last day). Same rule as the DHTMLX
 * baseline sample, with whole days.
 */
export function overdueDays(end: Date | null | undefined, limit: Date | null | undefined): number {
  if (!end || !limit || end.getTime() <= limit.getTime()) return 0
  return Math.max(1, daysBetween(limit, end))
}

/**
 * The instant a deadline allows a task to run up to. A deadline is a day (the last one the task may work),
 * like the "Fin" column; a task's end is the midnight after its last day, so the limit is the next midnight.
 */
export function deadlineLimit(deadline: Date): Date {
  return new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate() + 1)
}

export interface Lateness {
  kind: 'baseline' | 'deadline'
  days: number
}

/** The lateness to show for a task: the deadline first, then the baseline; null when on time. */
export function lateness(task: { end_date?: Date | null; baseline_end?: Date | null; deadline?: Date | null }): Lateness | null {
  if (task.deadline) {
    const days = overdueDays(task.end_date, deadlineLimit(task.deadline))
    if (days) return { kind: 'deadline', days }
  }
  if (task.baseline_end) {
    const days = overdueDays(task.end_date, task.baseline_end)
    if (days) return { kind: 'baseline', days }
  }
  return null
}

/** The day before, at midnight (not 24 hours earlier: that is wrong on the day the clocks change). */
export function previousDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)
}
