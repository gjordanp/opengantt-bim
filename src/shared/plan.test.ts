import { describe, expect, it } from 'vitest'
import { deadlineLimit, lateness, overdueDays } from './plan'

const d = (y: number, m: number, day: number): Date => new Date(y, m - 1, day)

describe('overdueDays', () => {
  it('is 0 on time and exactly on the limit', () => {
    expect(overdueDays(d(2026, 3, 10), d(2026, 3, 10))).toBe(0)
    expect(overdueDays(d(2026, 3, 9), d(2026, 3, 10))).toBe(0)
  })
  it('counts the days past the limit', () => {
    expect(overdueDays(d(2026, 3, 13), d(2026, 3, 10))).toBe(3)
  })
  it('does not gain a day across a daylight-saving change', () => {
    // Chile moves the clock on the first weekend of April and September.
    expect(overdueDays(d(2026, 4, 8), d(2026, 4, 1))).toBe(7)
    expect(overdueDays(d(2026, 9, 10), d(2026, 9, 3))).toBe(7)
  })
  it('handles missing dates', () => {
    expect(overdueDays(undefined, d(2026, 3, 10))).toBe(0)
    expect(overdueDays(d(2026, 3, 10), null)).toBe(0)
  })
})

describe('lateness', () => {
  const end = d(2026, 3, 11) // exclusive: the task works through the 10th
  it('lets a task end on its deadline day', () => {
    expect(deadlineLimit(d(2026, 3, 10))).toEqual(end)
    expect(lateness({ end_date: end, deadline: d(2026, 3, 10) })).toBeNull()
  })
  it('flags a task that ends after its deadline', () => {
    expect(lateness({ end_date: end, deadline: d(2026, 3, 8) })).toEqual({ kind: 'deadline', days: 2 })
  })
  it('flags a task that ends after its baseline', () => {
    expect(lateness({ end_date: end, baseline_end: d(2026, 3, 9) })).toEqual({ kind: 'baseline', days: 2 })
  })
  it('prefers the deadline when both are late', () => {
    expect(lateness({ end_date: end, baseline_end: d(2026, 3, 9), deadline: d(2026, 3, 5) })?.kind).toBe('deadline')
  })
})
