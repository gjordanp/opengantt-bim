/** Days since the epoch (see scheduling/calendar `toDay`); `end` is exclusive, like in the schedule. */
export interface TaskSpan {
  id: string
  start: number
  end: number
}

export type Phase = 'pending' | 'building' | 'done'

export interface Phases {
  /** Not started yet (before the first of its tasks starts). */
  pending: Set<string>
  /** At least one of its tasks is in progress. */
  building: Set<string>
  /** Started, and none of its tasks is in progress. */
  done: Set<string>
}

/**
 * Where each element stands on `day`, given the tasks it is tied to.
 * Elements tied to no task are not part of the simulation and appear in no set.
 */
export function phasesAt(day: number, spans: TaskSpan[], guidsByTask: Map<string, Iterable<string>>): Phases {
  const firstStart = new Map<string, number>()
  const active = new Set<string>()
  for (const span of spans) {
    const guids = guidsByTask.get(span.id)
    if (!guids) continue
    const isActive = span.start <= day && day < span.end
    for (const guid of guids) {
      const prev = firstStart.get(guid)
      if (prev === undefined || span.start < prev) firstStart.set(guid, span.start)
      if (isActive) active.add(guid)
    }
  }
  const out: Phases = { pending: new Set(), building: new Set(), done: new Set() }
  for (const [guid, start] of firstStart) {
    if (day < start) out.pending.add(guid)
    else if (active.has(guid)) out.building.add(guid)
    else out.done.add(guid)
  }
  return out
}

/** First day and last day (exclusive end) covered by the tasks that have elements. */
export function spanRange(spans: TaskSpan[], withElements: Set<string>): { from: number; to: number } | null {
  let from = Infinity
  let to = -Infinity
  for (const s of spans) {
    if (!withElements.has(s.id)) continue
    from = Math.min(from, s.start)
    to = Math.max(to, s.end)
  }
  return Number.isFinite(from) ? { from, to } : null
}
