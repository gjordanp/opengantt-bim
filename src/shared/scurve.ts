import { countWorkDays, type Calendar } from './scheduling'

/** A task as the S-curve sees it: its span (end exclusive, like the schedule) and how far along it is. */
export interface SCurveTask {
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
  /** First day of the chart and one entry per calendar day in the arrays below. */
  from: number
  /** Cumulative percent (0 to 100) planned by the end of each day. */
  planned: number[]
  /** Cumulative percent actually done, up to today; null after. */
  real: (number | null)[]
  /** Real progress carried on at the pace so far; null before today. */
  predicted: (number | null)[]
  today: number
  /** Planned and real percent as of today (null when today is outside the chart). */
  plannedToday: number | null
  realToday: number | null
  /** Day the projection reaches 100 % (it may fall after the chart); null when there is no pace yet or the work is done. */
  projectedFinish: number | null
  /** Last planned day. */
  plannedFinish: number
}

/**
 * The planned / real progress curve, the same idea as DHTMLX's S-curve sample:
 * - every task adds its weight, spread evenly over its working days (planned);
 * - up to today, each day also adds the weight times the task's progress (real), so the real
 *   curve is the planned one scaled by how much of each task is done;
 * - from today on, the real progress is carried forward at its average daily pace (predicted).
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
  const length = to - from
  const planned = new Array<number>(length).fill(0)
  const done = new Array<number>(length).fill(0)
  let total = 0

  for (const t of items) {
    const weight = t.weight ?? t.days
    if (!(weight > 0)) continue
    const perDay = weight / t.days
    const progress = Math.min(1, Math.max(0, t.progress))
    for (let d = t.start; d < t.end; d++) {
      if (!cal.isWorkingDay(d)) continue
      planned[d - from] += perDay
      if (d <= today) done[d - from] += perDay * progress
      total += perDay
    }
  }
  if (total === 0) return null

  const pct = (v: number): number => (v / total) * 100
  const plannedCum: number[] = []
  const real: (number | null)[] = []
  const predicted: (number | null)[] = []
  let p = 0
  let r = 0
  const todayIdx = today - from

  // Pace so far: real progress over the days elapsed (calendar days, as in the DHTMLX sample).
  let realTotal = 0
  for (let i = 0; i <= Math.min(todayIdx, length - 1); i++) realTotal += done[i]
  const elapsed = Math.min(todayIdx, length - 1) + 1
  const dailyPace = todayIdx >= 0 && elapsed > 0 ? realTotal / elapsed : 0

  let proj = 0
  let projectedFinish: number | null = null
  for (let i = 0; i < length; i++) {
    p += planned[i]
    plannedCum.push(pct(p))
    if (i <= todayIdx) {
      r += done[i]
      real.push(pct(r))
      predicted.push(i === todayIdx ? pct(r) : null)
      proj = r
    } else {
      real.push(null)
      if (todayIdx < 0 || dailyPace <= 0 || todayIdx >= length - 1) {
        predicted.push(null)
      } else {
        proj = Math.min(total, proj + dailyPace)
        predicted.push(pct(proj))
        if (projectedFinish === null && proj >= total) projectedFinish = from + i
      }
    }
  }

  // The projection may reach 100 % after the chart ends: then the date is worked out from the pace.
  if (projectedFinish === null && dailyPace > 0 && todayIdx >= 0 && realTotal < total) {
    projectedFinish = today + Math.ceil((total - realTotal) / dailyPace)
  }

  const inside = todayIdx >= 0 && todayIdx < length
  return {
    from,
    planned: plannedCum,
    real,
    predicted,
    today,
    plannedToday: inside ? plannedCum[todayIdx] : todayIdx >= length ? 100 : null,
    realToday: inside ? (real[todayIdx] as number) : todayIdx >= length ? pct(realTotal) : null,
    projectedFinish,
    plannedFinish: to - 1
  }
}
