import { evaluate, type BimElement, type Query, type Rule } from './bimQuery'

/** A named, saved search. Dynamic: it is re-run against whatever models are loaded. */
export interface BimGroup {
  id: string
  /** Short identifier shown next to the name: G1, G2… Absent in groups saved before codes existed. */
  code?: string
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

/** A converted IFC kept with the project (fragments file in the app data folder). */
export interface BimModelRef {
  id: string
  name: string
  /** Size of the stored file, in bytes. */
  size: number
  addedAt: string
}

/** A search kept with the project: conditions on properties, combined with all (and) or any (or). */
export interface BimSearch {
  id: string
  name: string
  match: 'and' | 'or'
  rules: Rule[]
}

export interface BimData {
  groups: BimGroup[]
  /** Saved searches. Absent in projects saved before they existed. */
  searches?: BimSearch[]
  links: BimTaskLink[]
  /** Models that open with the project. Absent in projects saved before models were kept. */
  models?: BimModelRef[]
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
  return { ...bim, groups: bim.groups.filter((g) => g.id !== groupId), links }
}

/** Tasks that use an element, directly or through a group. */
export function tasksForElement(guid: string, bim: BimData, elements: BimElement[]): string[] {
  return bim.links.filter((l) => taskGuids(l, bim.groups, elements).has(guid)).map((l) => l.taskId)
}

const codeNumber = (code: string | undefined): number => {
  const m = code?.match(/^G(\d+)$/)
  return m ? Number(m[1]) : 0
}

/** The next free code: one more than the highest G-number in use, so codes are never reused after deleting a group. */
export function nextGroupCode(groups: BimGroup[]): string {
  return `G${groups.reduce((max, g) => Math.max(max, codeNumber(g.code)), 0) + 1}`
}

/** Gives a code to every group that has none (projects saved before codes), in the order they are listed. Same object if none is missing. */
export function ensureGroupCodes(bim: BimData): BimData {
  if (bim.groups.every((g) => g.code)) return bim
  const groups: BimGroup[] = []
  for (const g of bim.groups) groups.push(g.code ? g : { ...g, code: nextGroupCode([...bim.groups, ...groups]) })
  return { ...bim, groups }
}

/** The groups a task is tied to, in the order they were assigned. */
export function groupsOfTask(link: BimTaskLink | undefined, groups: BimGroup[]): BimGroup[] {
  return (link?.groupIds ?? []).map((id) => groups.find((g) => g.id === id)).filter((g): g is BimGroup => !!g)
}

/** The tasks a group is assigned to. */
export function tasksOfGroup(groupId: string, links: BimTaskLink[]): string[] {
  return links.filter((l) => l.groupIds.includes(groupId)).map((l) => l.taskId)
}
