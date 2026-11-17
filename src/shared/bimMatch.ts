import { addGroupToTask, type BimGroup, type BimTaskLink } from './bimGroups'
import type { Query, Rule, RuleField } from './bimQuery'

/** A task as the matching sees it: its name and its parent ('0' at the top), which gives its path (the summaries above it). */
export interface MatchTask {
  id: string
  text: string
  parent: string
}

export interface MatchPair {
  groupId: string
  taskId: string
}

export interface MatchResult {
  /** Groups with exactly one task that fits them. */
  pairs: MatchPair[]
  /** Groups no task fits, or that have nothing to match by (a hand-made group). */
  unmatched: string[]
  /** Groups that fit more than one task: left for the user. */
  ambiguous: { groupId: string; taskIds: string[] }[]
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const isNumber = (w: string): boolean => /^\d+$/.test(w)

/** The words of a text: no case, no accents, no symbols ("1° Piso" → "1", "piso"), and numbers without leading zeros ("01" → "1"). */
export function words(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (isNumber(w) ? String(Number(w)) : w))
}

const contains = (haystack: string[], needle: string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let i = 0; i + needle.length <= haystack.length; i++) if (needle.every((w, k) => haystack[i + k] === w)) return true
  return false
}

const equalityRules = (query: Query): Rule[] =>
  query.rules.flatMap((r) => ('rules' in r ? equalityRules(r) : r.op === 'eq' && typeof r.value === 'string' && r.value.trim() ? [r] : []))

export interface GroupPart {
  label: string
  value: string
}

/**
 * What a split group stands for, as the pieces of its name ("Piso 04-Planta Cielo 1° Piso · Ciclo 01"): each "is equal to"
 * condition whose label and value appear in the name. Conditions of the search the group came from are not parts of its name.
 */
export function groupParts(group: BimGroup, labelOf: (field: RuleField) => string): GroupPart[] {
  const name = fold(group.name)
  return equalityRules(group.query)
    .map((r) => ({ label: labelOf(r.field), value: String(r.value) }))
    .filter((p) => name.includes(fold(`${p.label} ${p.value}`)))
}

/** Whether a piece of a group is found in the path of a task: its value, or (for plain numbers) its label followed by the value. */
function partFits(part: GroupPart, path: string[]): boolean {
  // "04-Planta Cielo 1° Piso": the number before the dash only orders the levels in the model.
  const valueWords = words(part.value.replace(/^\s*\d+\s*-\s*/, ''))
  if (valueWords.length === 0) return false
  const labelled = contains(path, [...words(part.label), ...valueWords])
  return valueWords.every(isNumber) ? labelled : labelled || contains(path, valueWords)
}

/** Pairs each group with the task of the same name: the last tasks of the tree (no subtasks) whose path holds every piece of the group. */
export function matchGroupsToTasks(groups: BimGroup[], tasks: MatchTask[], labelOf: (field: RuleField) => string): MatchResult {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const parents = new Set(tasks.map((t) => t.parent))
  const pathOf = (task: MatchTask): string[] => {
    const out: string[] = []
    for (let t: MatchTask | undefined = task, guard = 0; t && guard < 50; t = byId.get(t.parent), guard++) out.unshift(...words(t.text))
    return out
  }
  const leaves = tasks.filter((t) => !parents.has(t.id)).map((t) => ({ id: t.id, path: pathOf(t) }))

  const result: MatchResult = { pairs: [], unmatched: [], ambiguous: [] }
  for (const group of groups) {
    const parts = groupParts(group, labelOf)
    const fits = parts.length === 0 ? [] : leaves.filter((l) => parts.every((p) => partFits(p, l.path)))
    if (fits.length === 1) result.pairs.push({ groupId: group.id, taskId: fits[0].id })
    else if (fits.length === 0) result.unmatched.push(group.id)
    else result.ambiguous.push({ groupId: group.id, taskIds: fits.map((f) => f.id) })
  }
  return result
}

/** Adds each pair to the task links, leaving alone the ones that are already there. */
export function applyMatches(links: BimTaskLink[], pairs: MatchPair[]): BimTaskLink[] {
  let next = links
  for (const p of pairs) next = addGroupToTask(next, p.taskId, p.groupId)
  return next
}
