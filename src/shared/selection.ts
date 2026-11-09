/**
 * Selecting several tasks with the mouse, the way the DHTMLX PRO `multiselect` extension does:
 * - a plain click selects only that task;
 * - Ctrl (or Cmd) + click adds the task, or removes it when it was selected;
 * - Shift + click selects the block of visible tasks from the first selected one to the clicked one,
 *   replacing the block of the previous Shift + click (tasks added with Ctrl stay).
 */
export interface Selection {
  /** Every selected task id. */
  selected: string[]
  /** Where a Shift + click block starts. */
  first: string | null
  /** The task the rest of the app follows (details, BIM). */
  last: string | null
}

export const emptySelection: Selection = { selected: [], first: null, last: null }

export interface ClickKeys {
  /** Ctrl or Cmd. */
  toggle: boolean
  shift: boolean
}

/** Ids between two positions of the visible order, both included. */
function between(order: string[], a: number, b: number): string[] {
  return order.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/**
 * The selection after a click on `target`.
 * @param order  visible task ids, top to bottom (collapsed tasks are not in it)
 * @param oneLevel  only let tasks of the same level be selected together (`multiselect_one_level`)
 * @param level  level of a task in the tree; used with `oneLevel`
 */
export function clickSelection(
  state: Selection,
  order: string[],
  target: string,
  keys: ClickKeys,
  options: { oneLevel?: boolean; level?: (id: string) => number } = {}
): Selection {
  const inOrder = (id: string | null): id is string => id !== null && order.includes(id)
  // Ids that vanished (deleted, collapsed) are not selected any more.
  const alive = new Set(state.selected.filter((id) => order.includes(id)))
  const first = inOrder(state.first) && alive.has(state.first) ? state.first : null
  const last = inOrder(state.last) && alive.has(state.last) ? state.last : null
  const sameLevel = (id: string): boolean => !options.oneLevel || !last || !options.level || options.level(id) === options.level(last)
  // The default "last" is the lowest selected task.
  const lowest = (set: Set<string>): string | null => order.filter((id) => set.has(id)).pop() ?? null

  const single = (): Selection => ({ selected: [target], first: target, last: target })

  if (keys.toggle) {
    const next = new Set(alive)
    let nextFirst = first
    if (!alive.has(target)) nextFirst = target
    if (alive.has(target)) next.delete(target)
    else if (sameLevel(target)) next.add(target)
    else return { selected: [...alive], first, last }
    let nextLast: string | null = last
    if (next.has(target)) nextLast = target
    else if (target === last) nextLast = lowest(next)
    if (!next.size) nextLast = null
    if (nextLast === null || !nextFirst || !next.has(nextFirst)) nextFirst = nextLast
    return { selected: order.filter((id) => next.has(id)), first: nextFirst, last: nextLast }
  }

  if (keys.shift && alive.size) {
    const anchor = first ?? target
    const next = new Set(alive)
    const anchorAt = order.indexOf(anchor)
    const targetAt = order.indexOf(target)
    // Drop the block of the previous Shift + click, then take the new one.
    if (last) for (const id of between(order, anchorAt, order.indexOf(last))) if (id !== anchor) next.delete(id)
    // Walk from the clicked task towards the anchor. With one level only, a task of another level than the
    // one taken just before is skipped.
    const walk = between(order, anchorAt, targetAt).filter((id) => id !== anchor)
    if (targetAt > anchorAt) walk.reverse()
    let cursor = last
    let firstTaken: string | null = null
    for (const id of walk) {
      if (options.oneLevel && options.level && cursor && options.level(id) !== options.level(cursor)) continue
      next.add(id)
      cursor = id
      firstTaken ??= id
    }
    next.add(anchor)
    const nextLast = next.has(target) ? target : (firstTaken ?? lowest(next))
    return { selected: order.filter((id) => next.has(id)), first: next.has(anchor) ? anchor : nextLast, last: nextLast }
  }

  return single()
}
