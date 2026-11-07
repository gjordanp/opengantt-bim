import { describe, expect, it } from 'vitest'
import { phasesAt, spanRange, type TaskSpan } from './bim4d'

const spans: TaskSpan[] = [
  { id: 'a', start: 10, end: 20 },
  { id: 'b', start: 20, end: 30 },
  { id: 'c', start: 15, end: 25 }
]
const byTask = new Map<string, string[]>([
  ['a', ['x', 'y']],
  ['b', ['z', 'y']],
  ['c', ['w']]
])
const sorted = (s: Set<string>): string[] => [...s].sort()

describe('4D phases', () => {
  it('everything is pending before the first task starts', () => {
    const p = phasesAt(5, spans, byTask)
    expect(sorted(p.pending)).toEqual(['w', 'x', 'y', 'z'])
    expect(p.building.size + p.done.size).toBe(0)
  })

  it('an element is building while its task runs, and done after', () => {
    const p = phasesAt(12, spans, byTask)
    expect(sorted(p.building)).toEqual(['x', 'y'])
    expect(sorted(p.pending)).toEqual(['w', 'z'])
    const later = phasesAt(22, spans, byTask)
    expect(sorted(later.done)).toEqual(['x'])
    expect(sorted(later.building)).toEqual(['w', 'y', 'z'])
  })

  it('treats the end day as exclusive', () => {
    expect(phasesAt(19, spans, byTask).building.has('x')).toBe(true)
    expect(phasesAt(20, spans, byTask).done.has('x')).toBe(true)
  })

  it('an element in two tasks is pending until the earliest starts', () => {
    expect(phasesAt(10, spans, byTask).building.has('y')).toBe(true)
    expect(phasesAt(9, spans, byTask).pending.has('y')).toBe(true)
  })

  it('ignores elements of tasks it has no elements for, and computes the range', () => {
    const p = phasesAt(12, spans, new Map([['a', ['x']]]))
    expect(sorted(p.building)).toEqual(['x'])
    expect(spanRange(spans, new Set(['a', 'c']))).toEqual({ from: 10, to: 25 })
    expect(spanRange(spans, new Set())).toBeNull()
  })
})
