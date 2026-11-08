import { countWorkDays, toDay, type Calendar } from './scheduling'

/** Today's date (local) as a day number. */
export const localTodayDay = (): number => toDay(new Date().toLocaleDateString('sv-SE'))

/** A task as the S-curve sees it: its span (end exclusive, like the schedule) and how far along it is. */
export interface SCurveTask {
  /** The gantt task this comes from, when the caller needs to tell them apart (volume weights). */
  id?: string
  /** Days since the epoch (see scheduling/calendar `toDay`). */
  start: number
  end: number
  /** 0 to 1. */
  progress: number
  /**
   * What the task is worth in the total. By default its working days, which is what DHTMLX's own
   * S-curve does; later, the volume of the elements built by the task.
   */
  weight?: number
}

export interface SCurve {
  /** First day of the chart. Entry `k` of the arrays below is the start of day `from + k`, so there is one more entry than days. */
  from: number
  /** Cumulative percent planned before each day starts; the last entry is the end of the plan (100). */
  planned: number[]
  /** Cumulative percent actually done before each day starts, up to today's start; null after. */
  real: (number | null)[]
  /** From today's start on, the real progress carried forward at its average daily pace; null before. Not capped at 100. */
  predicted: (number | null)[]
  today: number
  /** Planned and real percent at today's start (null before the project starts). */
  plannedToday: number | null
  realToday: number | null
  /** Last day of the projection reaching 100 % (it may fall after the chart); null when there is no pace yet or the work is done. */
  projectedFinish: number | null
  /** Last planned day. */
  plannedFinish: number
}

/**
 * The planned / real progress curve, computed the way DHTMLX's S-curve sample does it (checked
 * against that sample's own numbers, see scurve.test.ts):
 * - every task adds its weight, spread evenly over its working days (planned);
 * - up to today, each day also adds the weight times the task's progress (real), so the real
 *   curve is the planned one scaled by how much of each task is done;
 * - the figures are read at the start of each day, so the work of a day shows from the next day
 *   on, and the real curve ends where today begins;
 * - from there on, the real progress is carried forward at its average daily pace (predicted),
 *   the pace being the real progress at today's start over the days elapsed, today included.
 * Tasks without span or weight (milestones, summaries the caller left out) are skipped.
 */
export function computeSCurve(tasks: SCurveTask[], cal: Calendar, today: number): SCurve | null {
  const items = tasks
    .filter((t) => t.end > t.start)
    .map((t) => ({ ...t, days: countWorkDays(cal, t.start, t.end) }))
    .filter((t) => t.days > 0)
  if (items.length === 0) return null

  const from = Math.min(...items.map((t) => t.start))
  const to = Math.max(...items.map((t) => t.end)) // exclusive
  const n = to - from
  const plannedDay = new Array<number>(n).fill(0)
  const doneDay = new Array<number>(n).fill(0)
  let total = 0

  for (const t of items) {
    const weight = t.weight ?? t.days
    if (!(weight > 0)) continue
    const perDay = weight / t.days
    const progress = Math.min(1, Math.max(0, t.progress))
    for (let d = t.start; d < t.end; d++) {
      if (!cal.isWorkingDay(d)) continue
      plannedDay[d - from] += perDay
      if (d <= today) doneDay[d - from] += perDay * progress
      total += perDay
    }
  }
  if (total === 0) return null

  const pct = (v: number): number => (v / total) * 100
  const todayIdx = today - from
  const planned: number[] = [0]
  const real: (number | null)[] = [todayIdx >= 0 ? 0 : null]
  let p = 0
  let r = 0
  for (let k = 1; k <= n; k++) {
    p += plannedDay[k - 1]
    r += doneDay[k - 1]
    planned.push(pct(p))
    real.push(k <= todayIdx ? pct(r) : null)
  }

  const inRange = todayIdx >= 0
  const at = Math.min(todayIdx, n)
  const realToday = inRange ? (real[at] as number) : null
  const pace = inRange && realToday !== null ? realToday / (todayIdx + 1) : 0

  const predicted: (number | null)[] = new Array(n + 1).fill(null)
  if (inRange && todayIdx < n && realToday !== null) {
    for (let k = todayIdx; k <= n; k++) predicted[k] = realToday + pace * (k - todayIdx)
  }

  let projectedFinish: number | null = null
  if (pace > 0 && realToday !== null && realToday < 100 - 1e-6) {
    projectedFinish = from + todayIdx + Math.ceil((100 - realToday) / pace) - 1
  }

  return {
    from,
    planned,
    real,
    predicted,
    today,
    plannedToday: inRange ? planned[at] : null,
    realToday,
    projectedFinish,
    plannedFinish: to - 1
  }
}
