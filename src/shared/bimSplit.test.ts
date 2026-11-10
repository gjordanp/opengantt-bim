import { describe, expect, it } from 'vitest'
import { evaluate, type BimElement, type Query } from './bimQuery'
import { splitBy } from './bimSplit'

const el = (localId: number, category: string, ciclo: string, nivel: string): BimElement => ({
  modelId: 'm',
  localId,
  guid: `g${localId}`,
  category,
  name: `e${localId}`,
  storey: '',
  props: { 'Ubicación.Ciclo': ciclo, 'Ubicación.Nivel': nivel }
})

const elements: BimElement[] = [
  el(1, 'IFCWALL', '01', '2'),
  el(2, 'IFCWALL', '01', '10'),
  el(3, 'IFCWALL', '02', '2'),
  el(4, 'IFCWALL', '02', '2'),
  el(5, 'IFCSLAB', '01', '2'),
  el(6, 'IFCWALL', '', '2'),
  el(7, 'IFCWALL', '03', '')
]
const walls: Query = { op: 'and', rules: [{ field: 'category', op: 'eq', value: 'IFCWALL' }] }
const label = (f: string): string => f.split('.').pop()!

describe('splitBy', () => {
  it('makes one group per combination that occurs, in natural order', () => {
    const { groups, skipped } = splitBy(walls, elements, ['Ubicación.Ciclo', 'Ubicación.Nivel'], label)
    expect(groups.map((g) => [g.name, g.count])).toEqual([
      ['Ciclo 01 · Nivel 2', 1],
      ['Ciclo 01 · Nivel 10', 1],
      ['Ciclo 02 · Nivel 2', 2]
    ])
    expect(skipped).toBe(2) // no cycle / no level
  })

  it('splits by a single field', () => {
    const { groups } = splitBy(walls, elements, ['Ubicación.Ciclo'], label)
    expect(groups.map((g) => [g.name, g.count])).toEqual([
      ['Ciclo 01', 2],
      ['Ciclo 02', 2],
      ['Ciclo 03', 1]
    ])
  })

  it('each group query finds exactly its elements, and only inside the search', () => {
    const { groups } = splitBy(walls, elements, ['Ubicación.Ciclo', 'Ubicación.Nivel'], label)
    for (const g of groups) expect(evaluate(g.query, elements)).toHaveLength(g.count)
    // the slab of cycle 01 / level 2 is not in the walls search, so it is not in the group
    expect(evaluate(groups[0].query, elements).map((e) => e.localId)).toEqual([1])
  })

  it('keeps an OR search whole', () => {
    const either: Query = { op: 'or', rules: [{ field: 'category', op: 'eq', value: 'IFCSLAB' }, { field: 'name', op: 'eq', value: 'e3' }] }
    const { groups } = splitBy(either, elements, ['Ubicación.Ciclo'], label)
    expect(groups.map((g) => [g.name, g.count])).toEqual([
      ['Ciclo 01', 1],
      ['Ciclo 02', 1]
    ])
    expect(evaluate(groups[1].query, elements).map((e) => e.localId)).toEqual([3])
  })

  it('treats values that differ only in case or spaces as one group', () => {
    const els = [el(1, 'IFCWALL', 'A', '1'), el(2, 'IFCWALL', ' a ', '1')]
    expect(splitBy(walls, els, ['Ubicación.Ciclo'], label).groups).toHaveLength(1)
  })

  it('gives no groups when nothing has the field', () => {
    const r = splitBy(walls, elements, ['Otra.Cosa'], label)
    expect(r.groups).toEqual([])
    expect(r.skipped).toBe(6)
  })
})
