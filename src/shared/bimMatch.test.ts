import { describe, expect, it } from 'vitest'
import type { BimGroup } from './bimGroups'
import { applyMatches, groupParts, matchGroupsToTasks, words, type MatchTask } from './bimMatch'

const label = (f: string): string => (f === 'storey' ? 'Piso' : f.split('.').pop()!)

const group = (id: string, storey: string, ciclo: string): BimGroup => ({
  id,
  code: id.toUpperCase(),
  name: `Piso ${storey} · Ciclo ${ciclo}`,
  color: '#000',
  query: {
    op: 'and',
    rules: [
      { field: 'storey', op: 'exists', value: '' },
      { field: 'Text.Ciclo', op: 'exists', value: '' },
      { field: 'storey', op: 'eq', value: storey },
      { field: 'Text.Ciclo', op: 'eq', value: ciclo }
    ]
  },
  manualInclude: [],
  manualExclude: []
})

// Fundaciones (Ciclo 1, 2), Piso 1 (Ciclo 1, 2). The names come from an AI, the group values from the model.
const tasks: MatchTask[] = [
  { id: 'f', text: 'Planta Fundaciones', parent: '0' },
  { id: 'f1', text: 'Ciclo 1', parent: 'f' },
  { id: 'f2', text: 'Ciclo 2', parent: 'f' },
  { id: 'p', text: 'Planta Cielo 1° Piso', parent: '0' },
  { id: 'p1', text: 'Ciclo 1', parent: 'p' },
  { id: 'p2', text: 'Ciclo 2', parent: 'p' }
]

describe('words', () => {
  it('drops case, accents, symbols and leading zeros', () => {
    expect(words('Planta Cielo 1° Subterráneo')).toEqual(['planta', 'cielo', '1', 'subterraneo'])
    expect(words('Ciclo 01')).toEqual(['ciclo', '1'])
    expect(words('04-Planta Cielo 1° Piso')).toEqual(['4', 'planta', 'cielo', '1', 'piso'])
  })
})

describe('groupParts', () => {
  it('takes the conditions that make up the name, not the ones of the original search', () => {
    const g = group('g1', '01-Planta Fundaciones', '01')
    g.query.rules.push({ field: 'category', op: 'eq', value: 'IFCSLAB' })
    expect(groupParts(g, label)).toEqual([
      { label: 'Piso', value: '01-Planta Fundaciones' },
      { label: 'Ciclo', value: '01' }
    ])
  })
})

describe('matchGroupsToTasks', () => {
  const groups = [
    group('g1', '01-Planta Fundaciones', '01'),
    group('g2', '01-Planta Fundaciones', '02'),
    group('g3', '04-Planta Cielo 1° Piso', '01'),
    group('g4', '04-Planta Cielo 1° Piso', '02')
  ]

  it('pairs each group with the task of the same level and cycle', () => {
    const r = matchGroupsToTasks(groups, tasks, label)
    expect(r.pairs).toEqual([
      { groupId: 'g1', taskId: 'f1' },
      { groupId: 'g2', taskId: 'f2' },
      { groupId: 'g3', taskId: 'p1' },
      { groupId: 'g4', taskId: 'p2' }
    ])
    expect(r.unmatched).toEqual([])
    expect(r.ambiguous).toEqual([])
  })

  it('does not take a number for another: cycle 1 is not the 1 of "1° Piso"', () => {
    const r = matchGroupsToTasks([group('x', '04-Planta Cielo 1° Piso', '03')], tasks, label)
    expect(r.pairs).toEqual([])
    expect(r.unmatched).toEqual(['x'])
  })

  it('leaves out groups with nothing to match by, and says when two tasks fit', () => {
    const hand: BimGroup = { id: 'h', name: 'A mano', color: '#000', query: { op: 'or', rules: [] }, manualInclude: ['a'], manualExclude: [] }
    const twin: MatchTask[] = [...tasks, { id: 'p1b', text: 'Ciclo 1', parent: 'p' }]
    const r = matchGroupsToTasks([hand, groups[2]], twin, label)
    expect(r.unmatched).toEqual(['h'])
    expect(r.ambiguous).toEqual([{ groupId: 'g3', taskIds: ['p1', 'p1b'] }])
  })

  it('only looks at the last tasks of the tree', () => {
    const r = matchGroupsToTasks([group('s', '01-Planta Fundaciones', '01')], tasks, label)
    expect(r.pairs.map((p) => p.taskId)).toEqual(['f1']) // not the summary "Planta Fundaciones"
  })
})

describe('applyMatches', () => {
  it('adds the groups to the tasks once', () => {
    const pairs = [{ groupId: 'g1', taskId: 'f1' }, { groupId: 'g1', taskId: 'f1' }, { groupId: 'g2', taskId: 'f1' }]
    expect(applyMatches([], pairs)).toEqual([{ taskId: 'f1', groupIds: ['g1', 'g2'], guids: [] }])
  })
})
