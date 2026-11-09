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

  it('searches property sets, with more conditions', () => {
    const withProps: BimElement[] = [
      { ...el(1, 'IFCWALL', 'A', 'N1'), props: { 'Pset_WallCommon.FireRating': 'F60', 'Pset_WallCommon.IsExternal': 'true' }, volume: 3 },
      { ...el(2, 'IFCWALL', 'B', 'N1'), props: { 'Pset_WallCommon.FireRating': 'F30' }, volume: 12 },
      { ...el(3, 'IFCSLAB', 'C', 'N2'), volume: 8 }
    ]
    const run = (q: Query): number[] => evaluate(q, withProps).map((e) => e.localId)
    expect(run({ op: 'and', rules: [{ field: 'Pset_WallCommon.FireRating', op: 'eq', value: 'f60' }] })).toEqual([1])
    expect(run({ op: 'and', rules: [{ field: 'Pset_WallCommon.FireRating', op: 'exists', value: '' }] })).toEqual([1, 2])
    expect(run({ op: 'and', rules: [{ field: 'Pset_WallCommon.IsExternal', op: 'notExists', value: '' }] })).toEqual([2, 3])
    expect(run({ op: 'and', rules: [{ field: 'volume', op: 'gt', value: '5' }] })).toEqual([2, 3])
    expect(run({ op: 'and', rules: [{ field: 'category', op: 'eq', value: 'IFCWALL' }, { field: 'volume', op: 'lte', value: '3' }] })).toEqual([1])
    expect(run({ op: 'and', rules: [{ field: 'name', op: 'notContains', value: 'a' }] })).toEqual([2, 3])
    expect(run({ op: 'and', rules: [{ field: 'Pset_WallCommon.FireRating', op: 'startsWith', value: 'f' }] })).toEqual([1, 2])
  })
})
