import { evaluate, type BimElement, type Query } from './bimQuery'

/** A named, saved search. Dynamic: it is re-run against whatever models are loaded. */
export interface BimGroup {
  id: string
  name: string
  color: string
  query: Query
  /** GlobalIds always included, whatever the query says. */
  manualInclude: string[]
  /** GlobalIds always left out. */
  manualExclude: string[]
}

/** What a gantt task is tied to: whole groups plus individually picked elements. Elements are GlobalIds. */
export interface BimTaskLink {
  taskId: string
  groupIds: string[]
  guids: string[]
}

export interface BimData {
  groups: BimGroup[]
  links: BimTaskLink[]
}

export const emptyBim = (): BimData => ({ groups: [], links: [] })

/** query results + manual includes - manual excludes, as GlobalIds. */
export function resolveGroup(group: BimGroup, elements: BimElement[]): Set<string> {
  const out = new Set(evaluate(group.query, elements).map((e) => e.guid))
  for (const g of group.manualInclude) out.add(g)
  for (const g of group.manualExclude) out.delete(g)
  out.delete('')
  return out
}

/** Every GlobalId a task is tied to (groups resolved now + direct elements). */
export function taskGuids(link: BimTaskLink | undefined, groups: BimGroup[], elements: BimElement[]): Set<string> {
  const out = new Set<string>()
  if (!link) return out
  for (const id of link.groupIds) {
    const group = groups.find((g) => g.id === id)
    if (group) for (const g of resolveGroup(group, elements)) out.add(g)
  }
  for (const g of link.guids) out.add(g)
  return out
}

const upsert = (links: BimTaskLink[], taskId: string, change: (l: BimTaskLink) => BimTaskLink): BimTaskLink[] => {
  const current = links.find((l) => l.taskId === taskId) ?? { taskId, groupIds: [], guids: [] }
  const next = change(current)
  const rest = links.filter((l) => l.taskId !== taskId)
  // A link with nothing left in it is dropped.
  return next.groupIds.length === 0 && next.guids.length === 0 ? rest : [...rest, next]
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)]

export const addGroupToTask = (links: BimTaskLink[], taskId: string, groupId: string): BimTaskLink[] =>
  upsert(links, taskId, (l) => ({ ...l, groupIds: uniq([...l.groupIds, groupId]) }))

export const removeGroupFromTask = (links: BimTaskLink[], taskId: string, groupId: string): BimTaskLink[] =>
  upsert(links, taskId, (l) => ({ ...l, groupIds: l.groupIds.filter((g) => g !== groupId) }))

export const addElementsToTask = (links: BimTaskLink[], taskId: string, guids: string[]): BimTaskLink[] =>
  upsert(links, taskId, (l) => ({ ...l, guids: uniq([...l.guids, ...guids.filter(Boolean)]) }))

export const removeElementsFromTask = (links: BimTaskLink[], taskId: string, guids: string[]): BimTaskLink[] =>
  upsert(links, taskId, (l) => ({ ...l, guids: l.guids.filter((g) => !guids.includes(g)) }))

/** Deleting a group also removes it from every task. */
export function deleteGroup(bim: BimData, groupId: string): BimData {
  const links = bim.links
    .map((l) => ({ ...l, groupIds: l.groupIds.filter((g) => g !== groupId) }))
    .filter((l) => l.groupIds.length > 0 || l.guids.length > 0)
  return { groups: bim.groups.filter((g) => g.id !== groupId), links }
}

/** Tasks that use an element, directly or through a group. */
export function tasksForElement(guid: string, bim: BimData, elements: BimElement[]): string[] {
  return bim.links.filter((l) => taskGuids(l, bim.groups, elements).has(guid)).map((l) => l.taskId)
}
