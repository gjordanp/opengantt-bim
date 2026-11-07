import { describe, expect, it } from 'vitest'
import {
  addElementsToTask,
  addGroupToTask,
  deleteGroup,
  removeElementsFromTask,
  removeGroupFromTask,
  resolveGroup,
  taskGuids,
  tasksForElement,
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
