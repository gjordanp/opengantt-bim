/**
 * Line-of-balance helpers (pure, no gantt library dependency).
 *
 * A "LOB section" is a task that has a surface (m²) and children, none of
 * which have a surface themselves. In LOB mode each section is collapsed to a
 * single row whose height is proportional to its surface, and its children are
 * drawn as diagonal lines across that row. Tasks that contain sections stay
 * expanded so each section row remains visible.
 */

export interface LobTaskInput {
  id: string
  parent: string
  location_surface?: number
}

export interface LobOptions {
  /** Height of an ordinary row, in px. Also the height of the smallest section. */
  baseRowHeight: number
  /** Height of the largest section = baseRowHeight * maxFactor. */
  maxFactor?: number
}

const hasSurface = (t: LobTaskInput): boolean => (t.location_surface ?? 0) > 0

/** Ids of tasks that are LOB sections (see module doc). */
export function findLobSections(tasks: LobTaskInput[]): Set<string> {
  const childrenOf = new Map<string, LobTaskInput[]>()
  for (const t of tasks) {
    const list = childrenOf.get(t.parent)
    if (list) list.push(t)
    else childrenOf.set(t.parent, [t])
  }

  const sections = new Set<string>()
  for (const t of tasks) {
    if (!hasSurface(t)) continue
    const children = childrenOf.get(t.id)
    if (!children || children.length === 0) continue
    if (children.some(hasSurface)) continue
    sections.add(t.id)
  }
  return sections
}

/**
 * Row height for every LOB section, scaled linearly from the smallest surface
 * (baseRowHeight) to the largest (baseRowHeight * maxFactor). When every
 * section has the same surface they all get the maximum height.
 */
export function computeLobRowHeights(
  tasks: LobTaskInput[],
  { baseRowHeight, maxFactor = 5 }: LobOptions
): Map<string, number> {
  const sections = findLobSections(tasks)
  const heights = new Map<string, number>()
  if (sections.size === 0) return heights

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const surfaces = [...sections].map((id) => byId.get(id)!.location_surface as number)
  const min = Math.min(...surfaces)
  const max = Math.max(...surfaces)
  const minHeight = baseRowHeight
  const maxHeight = baseRowHeight * maxFactor

  for (const id of sections) {
    const surface = byId.get(id)!.location_surface as number
    const height =
      max === min
        ? maxHeight
        : Math.round(minHeight + ((surface - min) / (max - min)) * (maxHeight - minHeight))
    heights.set(id, height)
  }
  return heights
}
