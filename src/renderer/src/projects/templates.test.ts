import { describe, expect, it } from 'vitest'
import { buildTemplate, shiftDate } from './templates'

describe('shiftDate', () => {
  it('moves by calendar days across month and year ends', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('buildTemplate', () => {
  it('blank: a named root and one task starting on the chosen day', () => {
    const { tasks, links } = buildTemplate('blank', 'Torre A', '2027-02-01')
    expect(tasks[0]).toMatchObject({ text: 'Torre A', start_date: '2027-02-01', type: 'project' })
    expect(tasks).toHaveLength(2)
    expect(links).toEqual([])
  })

  it('building: starts on the chosen day, keeps spacing, and resets progress', () => {
    const { tasks, links } = buildTemplate('building', 'Torre B', '2027-06-01')
    expect(tasks[0].text).toBe('Torre B')
    expect(tasks.map((t) => t.start_date).sort()[0]).toBe('2027-06-01')
    expect(tasks.every((t) => t.progress === 0)).toBe(true)
    expect(links.length).toBeGreaterThan(0)
    // Pilas -> Excavación are 21 days apart in the original, and still are.
    const a = tasks.find((t) => t.text === 'Pilas')!
    const b = tasks.find((t) => t.text === 'Excavación')!
    expect((Date.parse(b.start_date) - Date.parse(a.start_date)) / 86_400_000).toBe(21)
  })
})
