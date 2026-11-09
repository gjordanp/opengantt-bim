import { describe, expect, it } from 'vitest'
import { allDays, endFromStart, toDay, weekCalendar } from './scheduling'
import { computeSCurve, type SCurveTask } from './scurve'

const week = weekCalendar() // Monday to Friday
const monday = toDay('2026-01-05')

/** A task of `duration` working days starting on `start` (a working day), as the schedule would place it. */
const task = (start: number, duration: number, progress = 0, weight?: number): SCurveTask => ({
  start,
  end: endFromStart(week, start, duration),
  progress,
  ...(weight === undefined ? {} : { weight })
})

describe('computeSCurve: planned curve', () => {
  it('rises from 0 to 100 percent, read at the start of each day, flat over the weekend', () => {
    const c = computeSCurve([task(monday, 10)], week, monday - 30)!
    expect(c.from).toBe(monday)
    expect(c.planned).toHaveLength(13) // 12 days (Monday of week one to Friday of week two) + the closing boundary
    expect(c.planned[0]).toBe(0)
    expect(c.planned[1]).toBeCloseTo(10) // Monday's work shows from Tuesday
    expect(c.planned[5]).toBeCloseTo(50) // after the first Friday
    expect(c.planned[6]).toBeCloseTo(50) // Saturday starts: nothing happened on Friday night
    expect(c.planned[7]).toBeCloseTo(50) // Sunday starts
    expect(c.planned[12]).toBeCloseTo(100)
    expect(c.plannedFinish).toBe(monday + 11)
  })

  it('weights every task by its working days, so a long task counts more', () => {
    // 5 days and 15 days: the short one is a quarter of the total.
    const c = computeSCurve([task(monday, 5), task(monday + 7, 15)], week, monday - 1)!
    expect(c.planned[5]).toBeCloseTo(25)
    expect(c.planned[c.planned.length - 1]).toBeCloseTo(100)
  })

  it('uses a given weight instead of the working days', () => {
    // Same spans, but the short task is worth three times the long one.
    const c = computeSCurve([task(monday, 5, 0, 300), task(monday + 7, 15, 0, 100)], week, monday - 1)!
    expect(c.planned[5]).toBeCloseTo(75)
  })

  it('returns null with nothing to plot (no tasks, only milestones or zero weights)', () => {
    expect(computeSCurve([], week, monday)).toBeNull()
    expect(computeSCurve([{ start: monday, end: monday, progress: 0 }], week, monday)).toBeNull()
    expect(computeSCurve([task(monday, 5, 0, 0)], week, monday)).toBeNull()
  })
})

describe('computeSCurve: real and projected progress', () => {
  it('counts progress up to the start of today, and stops there', () => {
    // 10 days at 50 %; today is the first Friday: Monday to Thursday are behind us.
    const c = computeSCurve([task(monday, 10, 0.5)], week, monday + 4)!
    expect(c.real[4]).toBeCloseTo(20) // 4 days x 50 % of 10 %
    expect(c.real[5]).toBeNull()
    expect(c.realToday).toBeCloseTo(20)
    expect(c.plannedToday).toBeCloseTo(40)
  })

  it('does not let progress of work still in the future count', () => {
    const c = computeSCurve([task(monday, 5, 1), task(monday + 7, 5, 1)], week, monday + 4)!
    expect(c.realToday).toBeCloseTo(40) // four of the first task's five days, nothing of the second
  })

  it('has no real curve before the project starts', () => {
    const c = computeSCurve([task(monday, 10, 0.5)], week, monday - 3)!
    expect(c.real.every((v) => v === null)).toBe(true)
    expect(c.predicted.every((v) => v === null)).toBe(true)
    expect(c.realToday).toBeNull()
    expect(c.plannedToday).toBeNull()
  })

  it('covers the whole chart when today is past the end, with no projection', () => {
    const c = computeSCurve([task(monday, 10, 0.6)], week, monday + 60)!
    expect(c.real[c.real.length - 1]).toBeCloseTo(60)
    expect(c.real.every((v) => v !== null)).toBe(true)
    expect(c.predicted.every((v) => v === null)).toBe(true)
    expect(c.plannedToday).toBe(100)
    expect(c.realToday).toBeCloseTo(60)
  })

  it('carries the pace so far forward from where the real curve stops, without capping it', () => {
    // 20 working days; today is the first Sunday (index 6): the real curve is read at its start.
    const c = computeSCurve([task(monday, 20, 0.5)], week, monday + 6)!
    const real = c.real[6] as number
    expect(c.predicted[5]).toBeNull()
    expect(c.predicted[6]).toBeCloseTo(real)
    // pace = real progress at today's start over the days elapsed, today included
    expect(((c.predicted[7] as number) - (c.predicted[6] as number))).toBeCloseTo(real / 7)
    expect(c.predicted.filter((v): v is number => v !== null).every((v, i, a) => i === 0 || v >= a[i - 1])).toBe(true)
  })

  it('projects a finish after the planned one when the work is behind', () => {
    const behind = computeSCurve([task(monday, 10, 0.2)], week, monday + 6)!
    expect(behind.projectedFinish).not.toBeNull()
    expect(behind.projectedFinish as number).toBeGreaterThan(behind.plannedFinish)
  })

  it('has no projected finish when nothing has been done yet or everything is done', () => {
    expect(computeSCurve([task(monday, 10, 0)], week, monday + 6)!.projectedFinish).toBeNull()
    expect(computeSCurve([task(monday, 10, 1)], week, monday + 60)!.projectedFinish).toBeNull()
  })

  it('ignores progress outside 0 to 1', () => {
    const c = computeSCurve([task(monday, 10, 7)], week, monday + 60)!
    expect(c.realToday).toBeCloseTo(100)
    const d = computeSCurve([task(monday, 10, -2)], week, monday + 60)!
    expect(d.realToday).toBeCloseTo(0)
  })
})

describe('computeSCurve against DHTMLX’s PRO sample', () => {
  // Read from the sample (samples/02_extensions/21_overlay.html, DHTMLX Gantt 8.0.6) running in a
  // browser: its 16 detail tasks, "today" (14 April 2024) and the three series it draws. It plots whole
  // percents and every day counts as working time (no work calendar).
  const tasks: [string, string, number][] = [
    ['2024-04-02', '2024-04-09', 0.8], ['2024-04-03', '2024-04-10', 0.6], ['2024-04-11', '2024-04-19', 0.6], ['2024-04-14', '2024-04-19', 0.8],
    ['2024-04-14', '2024-04-18', 0.7], ['2024-04-14', '2024-04-17', 0.75], ['2024-04-03', '2024-04-08', 1], ['2024-04-03', '2024-04-05', 1],
    ['2024-04-08', '2024-04-10', 0.8], ['2024-04-10', '2024-04-14', 0.82], ['2024-04-10', '2024-04-14', 0.6], ['2024-04-02', '2024-04-08', 0.8],
    ['2024-04-03', '2024-04-07', 0.5], ['2024-04-03', '2024-04-07', 0.1], ['2024-04-03', '2024-04-08', 0], ['2024-04-02', '2024-04-09', 0]
  ]
  const planned = [0, 4, 16, 27, 38, 48, 56, 61, 64, 66, 70, 74, 78, 83, 88, 94, 97, 100]
  const real = [0, 2, 8, 15, 19, 24, 29, 31, 33, 35, 38, 40, 43]
  const predicted = [null, null, null, null, null, null, null, null, null, null, null, null, 43, 46, 50, 53, 56, 59]

  const c = computeSCurve(
    tasks.map(([s, e, p]) => ({ start: toDay(s), end: toDay(e), progress: p })),
    allDays,
    toDay('2024-04-14')
  )!

  it('draws the planned curve point for point', () => {
    expect(c.planned.map(Math.round)).toEqual(planned)
  })

  it('draws the real curve point for point, ending where today starts', () => {
    expect(c.real.filter((v) => v !== null).map((v) => Math.round(v as number))).toEqual(real)
    expect(c.real.slice(13).every((v) => v === null)).toBe(true)
  })

  it('projects at the same pace', () => {
    expect(c.predicted.map((v) => (v === null ? null : Math.round(v)))).toEqual(predicted)
  })
})

describe('computeSCurve: plan on the baseline', () => {
  // A 10-day task that started on time (baseline = Jan 5-16) but slipped two weeks (now Jan 19-30), 50 % done.
  const slipped = (): SCurveTask => ({
    start: toDay('2026-01-19'),
    end: toDay('2026-01-31'),
    progress: 0.5,
    plannedStart: monday,
    plannedEnd: toDay('2026-01-17')
  })
  const today = toDay('2026-01-26')

  it('by default the plan follows the current dates, so a slip hides itself', () => {
    const c = computeSCurve([slipped()], week, today)!
    expect(c.from).toBe(toDay('2026-01-19'))
    expect(c.plannedToday).toBeCloseTo(50) // 5 of its 10 days passed, the plan moved with the task
  })

  it('on the baseline the plan stays where it was: the slip shows as a gap', () => {
    const c = computeSCurve([slipped()], week, today, 'baseline')!
    expect(c.from).toBe(monday) // the chart starts at the baseline
    expect(c.plannedToday).toBeCloseTo(100) // the baseline said it would be done by now
    expect(c.realToday).toBeLessThan(30)
    expect(c.plannedFinish).toBe(toDay('2026-01-16'))
  })

  it('tasks without a baseline keep their current dates', () => {
    const plain = task(monday, 10, 0)
    const c = computeSCurve([plain, slipped()], week, today, 'baseline')!
    const current = computeSCurve([plain, slipped()], week, today, 'current')!
    expect(c.planned.length).toBeGreaterThanOrEqual(current.planned.length - 10)
    expect(c.planned[c.planned.length - 1]).toBeCloseTo(100)
  })
})
