import { describe, expect, it } from 'vitest'
import { computeLobRowHeights, findLobSections } from './lob'

const t = (id: string, parent: string, location_surface?: number) => ({ id, parent, location_surface })

describe('findLobSections', () => {
  it('picks tasks with a surface whose children have none', () => {
    const tasks = [t('root', '0'), t('a', 'root', 50), t('a1', 'a'), t('a2', 'a')]
    expect([...findLobSections(tasks)]).toEqual(['a'])
  })

  it('ignores leaf tasks, even with a surface', () => {
    expect(findLobSections([t('leaf', '0', 100)]).size).toBe(0)
  })

  it('treats a task whose children have surfaces as a container, not a section', () => {
    const tasks = [t('building', '0', 900), t('floor', 'building', 300), t('work', 'floor')]
    expect([...findLobSections(tasks)]).toEqual(['floor'])
  })

  it('ignores tasks with zero or missing surface', () => {
    const tasks = [t('a', '0', 0), t('a1', 'a'), t('b', '0'), t('b1', 'b')]
    expect(findLobSections(tasks).size).toBe(0)
  })
})

describe('computeLobRowHeights', () => {
  const base = 30
  const tasks = [
    t('s1', '0', 50),
    t('s1c', 's1'),
    t('s2', '0', 300),
    t('s2c', 's2'),
    t('s3', '0', 870),
    t('s3c', 's3')
  ]

  it('scales linearly from base height (smallest) to base*5 (largest)', () => {
    const h = computeLobRowHeights(tasks, { baseRowHeight: base })
    expect(h.get('s1')).toBe(30)
    expect(h.get('s3')).toBe(150)
    // 30 + (250 / 820) * 120 = 66.6 -> 67
    expect(h.get('s2')).toBe(67)
  })

  it('gives every section the maximum height when surfaces are equal', () => {
    const equal = [t('a', '0', 50), t('a1', 'a'), t('b', '0', 50), t('b1', 'b')]
    const h = computeLobRowHeights(equal, { baseRowHeight: base })
    expect(h.get('a')).toBe(150)
    expect(h.get('b')).toBe(150)
  })

  it('returns an empty map when there are no sections', () => {
    expect(computeLobRowHeights([t('x', '0')], { baseRowHeight: base }).size).toBe(0)
  })

  it('honours a custom max factor', () => {
    const h = computeLobRowHeights(tasks, { baseRowHeight: base, maxFactor: 3 })
    expect(h.get('s3')).toBe(90)
  })
})
