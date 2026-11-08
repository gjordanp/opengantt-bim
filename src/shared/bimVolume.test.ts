import { describe, expect, it } from 'vitest'
import { splitVolumes } from './bimVolume'

const volumes: Record<string, number> = { w1: 10, w2: 20, s1: 40, win: 0 }
const volumeOf = (g: string): number | null => (g in volumes ? volumes[g] : null)
const assign = (entries: Record<string, string[]>): Map<string, string[]> => new Map(Object.entries(entries))
const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0)

describe('splitVolumes: elements shared by several tasks', () => {
  it('splits an element in proportion to the tasks’ durations, not equally', () => {
    // A wall of 10 m3 built by a 10-day task and a 2-day task.
    const r = splitVolumes(
      [{ id: 'formwork', duration: 10 }, { id: 'pour', duration: 2 }],
      assign({ formwork: ['w1'], pour: ['w1'] }),
      volumeOf
    )
    expect(r.byTask.get('formwork')).toBeCloseTo((10 * 10) / 12)
    expect(r.byTask.get('pour')).toBeCloseTo((10 * 2) / 12)
  })

  it('counts every element once: task volumes add up to the assigned volume', () => {
    const r = splitVolumes(
      [{ id: 'a', duration: 5 }, { id: 'b', duration: 3 }, { id: 'c', duration: 8 }],
      assign({ a: ['w1', 'w2'], b: ['w1', 'w2', 's1'], c: ['w2', 's1'] }),
      volumeOf
    )
    expect(r.assignedVolume).toBe(70)
    expect(sum(r.byTask)).toBeCloseTo(70)
  })

  it('gives all of an element to a task that is the only one using it', () => {
    const r = splitVolumes([{ id: 'a', duration: 4 }, { id: 'b', duration: 9 }], assign({ a: ['w1'], b: ['w2'] }), volumeOf)
    expect(r.byTask.get('a')).toBe(10)
    expect(r.byTask.get('b')).toBe(20)
  })

  it('does not double count an element listed twice for the same task', () => {
    const r = splitVolumes([{ id: 'a', duration: 4 }], assign({ a: ['w1', 'w1'] }), volumeOf)
    expect(r.byTask.get('a')).toBe(10)
  })

  it('ignores tasks with no duration when splitting, and reports an element only they use', () => {
    const r = splitVolumes(
      [{ id: 'work', duration: 5 }, { id: 'milestone', duration: 0 }],
      assign({ work: ['w1'], milestone: ['w1', 's1'] }),
      volumeOf
    )
    expect(r.byTask.get('work')).toBe(10) // the milestone takes no share of the wall
    expect(r.byTask.get('milestone')).toBe(0)
    expect(r.excluded.noTime).toEqual(['s1'])
    expect(r.assignedVolume).toBe(10)
  })
})

describe('splitVolumes: what is left out', () => {
  it('reports elements without a usable volume and leaves them out of the total', () => {
    const r = splitVolumes([{ id: 'a', duration: 2 }], assign({ a: ['w1', 'win', 'ghost'] }), volumeOf)
    expect(r.excluded.noVolume.sort()).toEqual(['ghost', 'win'])
    expect(r.assignedVolume).toBe(10)
  })

  it('reports the model’s elements no task uses, with their volume, to show how much is covered', () => {
    const r = splitVolumes([{ id: 'a', duration: 2 }], assign({ a: ['w1'] }), volumeOf, ['w1', 'w2', 's1', 'win'])
    expect(r.unassigned.sort()).toEqual(['s1', 'w2', 'win'])
    expect(r.unassignedVolume).toBe(60)
    expect(r.modelVolume).toBe(70)
    expect(r.assignedVolume / r.modelVolume).toBeCloseTo(10 / 70)
  })

  it('works with nothing assigned', () => {
    const r = splitVolumes([{ id: 'a', duration: 2 }], assign({}), volumeOf, ['w1'])
    expect(r.assignedVolume).toBe(0)
    expect(r.byTask.get('a')).toBe(0)
    expect(r.unassigned).toEqual(['w1'])
  })
})
