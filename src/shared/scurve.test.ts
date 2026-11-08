import { describe, expect, it } from 'vitest'
import { endFromStart, toDay, weekCalendar } from './scheduling'
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
  it('rises from 0 to 100 percent over the working days and is flat on weekends', () => {
    const c = computeSCurve([task(monday, 10)], week, monday - 30)!
    expect(c.from).toBe(monday)
    expect(c.planned).toHaveLength(12) // Monday of week one to Friday of week two
    expect(c.planned[0]).toBeCloseTo(10) // 1 of 10 days
    expect(c.planned[4]).toBeCloseTo(50) // end of the first Friday
    expect(c.planned[5]).toBeCloseTo(50) // Saturday: nothing planned
    expect(c.planned[6]).toBeCloseTo(50)
    expect(c.planned[11]).toBeCloseTo(100)
    expect(c.plannedFinish).toBe(monday + 11)
  })

  it('weights every task by its working days, so a long task counts more', () => {
    // 5 days and 15 days: the short one is a quarter of the total.
    const c = computeSCurve([task(monday, 5), task(monday + 7, 15)], week, monday - 1)!
    const lastDayOfShort = 4 // Friday of week one
    expect(c.planned[lastDayOfShort]).toBeCloseTo(25)
    expect(c.planned[c.planned.length - 1]).toBeCloseTo(100)
  })

  it('uses a given weight instead of the working days', () => {
    // Same spans, but the short task is worth three times the long one.
    const c = computeSCurve([task(monday, 5, 0, 300), task(monday + 7, 15, 0, 100)], week, monday - 1)!
    expect(c.planned[4]).toBeCloseTo(75)
  })

  it('returns null with nothing to plot (no tasks, only milestones or zero weights)', () => {
    expect(computeSCurve([], week, monday)).toBeNull()
    expect(computeSCurve([{ start: monday, end: monday, progress: 0 }], week, monday)).toBeNull()
    expect(computeSCurve([task(monday, 5, 0, 0)], week, monday)).toBeNull()
  })
})

describe('computeSCurve: real and projected progress', () => {
  it('counts each task’s progress only up to today', () => {
    // 10 days at 50 %; today is the first Friday, 5 working days in.
    const c = computeSCurve([task(monday, 10, 0.5)], week, monday + 4)!
    expect(c.real[4]).toBeCloseTo(25) // 5 days x 50 % of 10
    expect(c.real[5]).toBeNull()
    expect(c.realToday).toBeCloseTo(25)
    expect(c.plannedToday).toBeCloseTo(50)
  })

  it('does not let progress of work still in the future count', () => {
    const c = computeSCurve([task(monday, 5, 1), task(monday + 7, 5, 1)], week, monday + 4)!
    expect(c.realToday).toBeCloseTo(50) // only the first task is behind us
  })

  it('has no real curve before the project starts', () => {
    const c = computeSCurve([task(monday, 10, 0.5)], week, monday - 3)!
    expect(c.real.every((v) => v === null)).toBe(true)
    expect(c.predicted.every((v) => v === null)).toBe(true)
    expect(c.realToday).toBeNull()
  })

  it('covers the whole chart when today is past the end, with no projection', () => {
    const c = computeSCurve([task(monday, 10, 0.6)], week, monday + 60)!
    expect(c.real[c.real.length - 1]).toBeCloseTo(60)
    expect(c.predicted.every((v) => v === null)).toBe(true)
    expect(c.plannedToday).toBe(100)
    expect(c.realToday).toBeCloseTo(60)
  })

  it('carries the pace so far forward, never above 100, and reports when it gets there', () => {
    // 20 working days, 4 weeks; after the first week everything planned is half done.
    const c = computeSCurve([task(monday, 20, 0.5)], week, monday + 6)!
    const todayIdx = 6
    expect(c.predicted[todayIdx]).toBeCloseTo(c.real[todayIdx] as number)
    expect(c.predicted[todayIdx - 1]).toBeNull()
    const last = c.predicted[c.predicted.length - 1] as number
    expect(last).toBeLessThanOrEqual(100)
    expect(c.predicted.filter((v): v is number => v !== null).every((v, i, a) => i === 0 || v >= a[i - 1])).toBe(true)
  })

  it('projects a finish after the planned one when the work is behind', () => {
    // Plan finishes on day 11, but at today's pace the 100 % mark would be later than the chart: no date.
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
