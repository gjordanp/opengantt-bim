import { describe, expect, it } from 'vitest'
import { evaluate, facets, type BimElement, type Query } from './bimQuery'

const el = (localId: number, category: string, name: string, storey: string): BimElement => ({
  modelId: 'm',
  localId,
  guid: `g${localId}`,
  category,
  name,
  storey
})

const elements = [
  el(1, 'IFCWALL', 'Muro 20cm', 'Nivel 1'),
  el(2, 'IFCWALL', 'Muro 30cm', 'Nivel 2'),
  el(3, 'IFCSLAB', 'Losa', 'Nivel 1'),
  el(4, 'IFCDOOR', 'Puerta', 'Nivel 2')
]
const ids = (q: Query): number[] => evaluate(q, elements).map((e) => e.localId)

describe('bim query', () => {
  it('matches by class and storey with AND', () => {
    expect(
      ids({ op: 'and', rules: [{ field: 'category', op: 'eq', value: 'ifcwall' }, { field: 'storey', op: 'eq', value: 'Nivel 1' }] })
    ).toEqual([1])
  })

  it('supports OR, in, contains and neq', () => {
    expect(ids({ op: 'or', rules: [{ field: 'category', op: 'in', value: ['IFCSLAB', 'IFCDOOR'] }] })).toEqual([3, 4])
    expect(ids({ op: 'and', rules: [{ field: 'name', op: 'contains', value: 'muro' }] })).toEqual([1, 2])
    expect(ids({ op: 'and', rules: [{ field: 'category', op: 'neq', value: 'IFCWALL' }] })).toEqual([3, 4])
  })

  it('nests groups', () => {
    const q: Query = {
      op: 'and',
      rules: [
        { field: 'storey', op: 'eq', value: 'Nivel 2' },
        { op: 'or', rules: [{ field: 'category', op: 'eq', value: 'IFCDOOR' }, { field: 'name', op: 'contains', value: '30' }] }
      ]
    }
    expect(ids(q)).toEqual([2, 4])
  })

  it('treats empty groups as identity (AND) or nothing (OR)', () => {
    expect(ids({ op: 'and', rules: [] })).toHaveLength(4)
    expect(ids({ op: 'or', rules: [] })).toHaveLength(0)
  })

  it('counts facet values', () => {
    expect(facets(elements, 'category')[0]).toEqual({ value: 'IFCWALL', count: 2 })
    expect(facets(elements, 'storey').map((f) => f.value)).toEqual(['Nivel 1', 'Nivel 2'])
  })
})
