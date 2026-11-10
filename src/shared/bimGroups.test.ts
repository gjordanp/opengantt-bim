import { describe, expect, it } from 'vitest'
import {
  addElementsToTask,
  addGroupToTask,
  deleteGroup,
  ensureGroupCodes,
  groupsOfTask,
  nextGroupCode,
  parseGroupCodes,
  setTaskGroups,
  removeElementsFromTask,
  removeGroupFromTask,
  resolveGroup,
  taskGuids,
  tasksForElement,
  tasksOfGroup,
  type BimData,
  type BimGroup
} from './bimGroups'
import type { BimElement } from './bimQuery'

const el = (n: number, category: string, storey: string): BimElement => ({
  modelId: 'm',
  localId: n,
  guid: `g${n}`,
  category,
  name: `e${n}`,
  storey
})
const elements = [el(1, 'IFCWALL', 'N1'), el(2, 'IFCWALL', 'N2'), el(3, 'IFCSLAB', 'N1')]

const walls: BimGroup = {
  id: 'walls',
  name: 'Muros',
  color: '#000',
  query: { op: 'and', rules: [{ field: 'category', op: 'eq', value: 'IFCWALL' }] },
  manualInclude: [],
  manualExclude: []
}

describe('bim groups', () => {
  it('resolves the query, then manual includes and excludes', () => {
    expect([...resolveGroup(walls, elements)].sort()).toEqual(['g1', 'g2'])
    const tweaked = { ...walls, manualInclude: ['g3'], manualExclude: ['g1'] }
    expect([...resolveGroup(tweaked, elements)].sort()).toEqual(['g2', 'g3'])
  })

  it('is dynamic: a new model element that matches joins the group', () => {
    const more = [...elements, el(4, 'IFCWALL', 'N3')]
    expect(resolveGroup(walls, more).has('g4')).toBe(true)
  })

  it('merges groups and direct elements for a task', () => {
    let links = addGroupToTask([], 't1', 'walls')
    links = addElementsToTask(links, 't1', ['g3', 'g3'])
    expect([...taskGuids(links[0], [walls], elements)].sort()).toEqual(['g1', 'g2', 'g3'])
  })

  it('drops a link when it becomes empty', () => {
    let links = addElementsToTask([], 't1', ['g1'])
    links = removeElementsFromTask(links, 't1', ['g1'])
    expect(links).toEqual([])
    links = removeGroupFromTask(addGroupToTask([], 't1', 'walls'), 't1', 'walls')
    expect(links).toEqual([])
  })

  it('removes a deleted group from every task but keeps direct elements', () => {
    const bim: BimData = {
      groups: [walls],
      links: [
        { taskId: 't1', groupIds: ['walls'], guids: [] },
        { taskId: 't2', groupIds: ['walls'], guids: ['g3'] }
      ]
    }
    const next = deleteGroup(bim, 'walls')
    expect(next.groups).toEqual([])
    expect(next.links).toEqual([{ taskId: 't2', groupIds: [], guids: ['g3'] }])
  })

  it('finds the tasks that use an element', () => {
    const bim: BimData = {
      groups: [walls],
      links: [
        { taskId: 't1', groupIds: ['walls'], guids: [] },
        { taskId: 't2', groupIds: [], guids: ['g3'] }
      ]
    }
    expect(tasksForElement('g1', bim, elements)).toEqual(['t1'])
    expect(tasksForElement('g3', bim, elements)).toEqual(['t2'])
    expect(tasksForElement('gX', bim, elements)).toEqual([])
  })
})

describe('group codes', () => {
  const g = (id: string, code?: string): BimGroup => ({ id, name: id, color: '#000', query: { op: 'and', rules: [] }, manualInclude: [], manualExclude: [], ...(code ? { code } : {}) })

  it('next code is one more than the highest in use, and never reuses a deleted one', () => {
    expect(nextGroupCode([])).toBe('G1')
    expect(nextGroupCode([g('a', 'G1'), g('b', 'G2')])).toBe('G3')
    expect(nextGroupCode([g('a', 'G1'), g('b', 'G7')])).toBe('G8')
    expect(nextGroupCode([g('a')])).toBe('G1')
  })

  it('gives codes to groups saved without them, keeping the ones that have one', () => {
    const bim: BimData = { groups: [g('a'), g('b', 'G5'), g('c')], links: [] }
    expect(ensureGroupCodes(bim).groups.map((x) => x.code)).toEqual(['G6', 'G5', 'G7'])
    const done = ensureGroupCodes(bim)
    expect(ensureGroupCodes(done)).toBe(done)
  })

  it('finds the groups of a task and the tasks of a group', () => {
    const groups = [g('a', 'G1'), g('b', 'G2')]
    const links = [
      { taskId: 't1', groupIds: ['a', 'b'], guids: [] },
      { taskId: 't2', groupIds: ['b'], guids: [] }
    ]
    expect(groupsOfTask(links[0], groups).map((x) => x.code)).toEqual(['G1', 'G2'])
    expect(groupsOfTask(undefined, groups)).toEqual([])
    expect(tasksOfGroup('b', links)).toEqual(['t1', 't2'])
    expect(tasksOfGroup('a', links)).toEqual(['t1'])
  })
})

describe('typed group codes', () => {
  const groups: BimGroup[] = ['a', 'b', 'c'].map((id, i) => ({ id, code: `G${i + 1}`, name: id, color: '#000', query: { op: 'and', rules: [] }, manualInclude: [], manualExclude: [] }))

  it('reads codes separated by commas, spaces or semicolons, in any case', () => {
    expect(parseGroupCodes('G1, g3 ;G2', groups)).toEqual({ ok: true, ids: ['a', 'c', 'b'] })
    expect(parseGroupCodes('', groups)).toEqual({ ok: true, ids: [] })
    expect(parseGroupCodes('G2,G2', groups)).toEqual({ ok: true, ids: ['b'] })
  })

  it('names the code that does not exist', () => {
    const r = parseGroupCodes('G1, G9', groups)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('G9')
    expect(parseGroupCodes('hola', groups).ok).toBe(false)
  })

  it('sets the groups of a task exactly, keeping its loose elements', () => {
    const links = [{ taskId: 't1', groupIds: ['a'], guids: ['x'] }]
    expect(setTaskGroups(links, 't1', ['b', 'c'])).toEqual([{ taskId: 't1', groupIds: ['b', 'c'], guids: ['x'] }])
    expect(setTaskGroups(links, 't2', ['a'])).toHaveLength(2)
    // nothing left at all: the link goes away
    expect(setTaskGroups([{ taskId: 't1', groupIds: ['a'], guids: [] }], 't1', [])).toEqual([])
  })
})
