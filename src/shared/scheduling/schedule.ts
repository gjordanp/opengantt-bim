import {
  type Calendar,
  countWorkDays,
  endFromStart,
  fromDay,
  nextWorkingDay,
  prevWorkingDay,
  shiftWorkDays,
  startFromEnd,
  toDay,
  weekCalendar
} from './calendar'

/** Finish-to-start `0`, start-to-start `1`, finish-to-finish `2`, start-to-finish `3`. */
export type LinkKind = '0' | '1' | '2' | '3'

/**
 * How a task is tied to a date, like the constraints of DHTMLX Pro / MS Project: as soon as possible (default),
 * as late as possible, start/finish no earlier/later than, must start/finish on.
 */
export type ConstraintType = 'asap' | 'alap' | 'snet' | 'snlt' | 'fnet' | 'fnlt' | 'mso' | 'mfo'

export interface SchedConstraint {
  type: ConstraintType
  /**
   * `YYYY-MM-DD`. Not used by `asap` and `alap`. For the finish constraints it is an end like the task's own
   * (exclusive: the day after the last working day), the way Pro reads it.
   */
  date?: string
}

export interface SchedTask {
  id: string
  /** `YYYY-MM-DD`. Only used for tasks with no predecessors (or in non-strict mode). */
  start: string
  /** Working days. */
  duration: number
  /** Parent id; absent or `'0'` for a root task. */
  parent?: string
  constraint?: SchedConstraint
}

export interface SchedLink {
  source: string
  target: string
  type: LinkKind
  /** Working days; negative = lead. */
  lag?: number
}

export interface ScheduleOptions {
  /** Default: Monday to Friday. */
  calendar?: Calendar
  /**
   * Strict (default): a task with predecessors always sits at the earliest date
   * they allow, even if that moves it earlier. Non-strict: it only moves later
   * when a predecessor would otherwise be violated.
   */
  strict?: boolean
  /**
   * Move the start of a task with no predecessors to the next working day.
   * Default `false`, like DHTMLX Pro: such a task keeps the start date it was
   * given (even on a weekend) and only its end is computed on the calendar.
   */
  snapFixedStarts?: boolean
  /**
   * A task with no explicit constraint (or ASAP) takes the one of its nearest parent that has one, like PRO's
   * `auto_scheduling_project_constraint`. Default `false`.
   */
  inheritConstraints?: boolean
  /**
   * `YYYY-MM-DD`. A task with no predecessors that starts before this date is moved to it (PRO's `project_start`).
   * With `strictProjectStart`, one that starts after it is moved back too.
   */
  projectStart?: string
  strictProjectStart?: boolean
  /**
   * Tasks the user has just edited or dragged: like PRO, which only reschedules what depends on an edited task,
   * they keep a start later than their predecessors ask for instead of going back to it.
   */
  pinned?: ReadonlySet<string>
  /**
   * `YYYY-MM-DD`, an end like the tasks' own (exclusive: the day after the last working day), as PRO's `project_end`.
   * A task with no successors that ends earlier is moved to end at it, when it is as late as possible.
   */
  projectEnd?: string
  /**
   * Schedule from the end (PRO's `schedule_from_end`): a task with no constraint (or none but ASAP) is as late as
   * possible, so the tasks line up against their successors and the project end.
   */
  scheduleFromEnd?: boolean
}

export interface ScheduledTask {
  id: string
  /** `YYYY-MM-DD` */
  start: string
  /** `YYYY-MM-DD`, exclusive (the day after the last working day). */
  end: string
  /** Working days. For summary tasks, the span of their children. */
  duration: number
  summary: boolean
  /** Latest start/finish that doesn't delay the project. Leaf tasks only. */
  lateStart?: string
  lateEnd?: string
  /** Working days the task can slip without delaying the project. Negative = already late. */
  totalFloat?: number
  critical: boolean
}

export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>
  /** Ids of the tasks in a dependency cycle (they aren't scheduled), or `null`. */
  cycle: string[] | null
  /** Links ignored because an endpoint is missing or is a summary task. */
  skippedLinks: SchedLink[]
  /** End (exclusive) of the last task, or `null` for an empty project. */
  projectEnd: string | null
  /** Tasks that could not respect a constraint, or a link, at the same time as their constraint. */
  conflicts: Set<string>
}

const isRoot = (parent: string | undefined): boolean => parent === undefined || parent === '0' || parent === ''

/**
 * Earliest-dates scheduling (forward pass) with total float and critical tasks
 * (backward pass), plus summary roll-up.
 */
export function schedule(tasks: SchedTask[], links: SchedLink[], options: ScheduleOptions = {}): ScheduleResult {
  const cal = options.calendar ?? weekCalendar()
  const strict = options.strict ?? true
  const snapFixedStarts = options.snapFixedStarts ?? false
  const inherit = options.inheritConstraints ?? false
  const projectStart = options.projectStart ? toDay(options.projectStart) : null
  const limitEnd = options.projectEnd ? toDay(options.projectEnd) : null
  const fromEnd = options.scheduleFromEnd === true
  // The constraint a task has when it has none: ASAP, or ALAP when scheduling from the end.
  const defaultType: ConstraintType = fromEnd ? 'alap' : 'asap'

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const children = new Map<string, string[]>()
  for (const t of tasks) {
    if (isRoot(t.parent) || !byId.has(t.parent!)) continue
    const list = children.get(t.parent!)
    if (list) list.push(t.id)
    else children.set(t.parent!, [t.id])
  }
  const isSummary = (id: string): boolean => children.has(id)

  // The constraint that applies to a task: its own, or (with `inheritConstraints`, when it has none or ASAP) the one
  // of its nearest parent that has a constraint other than ASAP.
  const constraintOf = (task: SchedTask): SchedConstraint | undefined => {
    const own = task.constraint
    if (!inherit || (own && own.type !== defaultType)) return own
    for (let p = task.parent; !isRoot(p) && byId.has(p!); p = byId.get(p!)!.parent) {
      const c = byId.get(p!)!.constraint
      if (c && c.type !== defaultType) return c
    }
    return own
  }
  // Tasks that go as soon as possible; the rest are as late as possible (PRO: `isAsapTask`).
  const isAsap = (task: SchedTask): boolean => {
    const type = constraintOf(task)?.type
    return fromEnd ? type === 'asap' : type !== 'alap'
  }
  // The earliest and latest start a start/finish constraint allows (PRO's `processConstraint`).
  const constraintBounds = (task: SchedTask, duration: number): { earliest?: number; latest?: number } => {
    const c = constraintOf(task)
    if (!c || !c.date || c.type === 'asap' || c.type === 'alap') return {}
    const d = toDay(c.date)
    const byEnd = c.type === 'fnet' || c.type === 'fnlt' || c.type === 'mfo'
    const limit = byEnd ? startFromEnd(cal, d, duration) : d
    return {
      earliest: c.type === 'snet' || c.type === 'fnet' || c.type === 'mso' || c.type === 'mfo' ? limit : undefined,
      latest: c.type === 'snlt' || c.type === 'fnlt' || c.type === 'mso' || c.type === 'mfo' ? limit : undefined
    }
  }
  // The closest moment of working time, in the past or the future (PRO: `getClosestWorkTime`).
  const workingBoundary = (day: number, dir: 'past' | 'future'): number =>
    cal.isWorkingDay(day) ? day : dir === 'past' ? prevWorkingDay(cal, day) + 1 : nextWorkingDay(cal, day)

  // Only links between two leaf tasks drive the scheduling.
  const usable: SchedLink[] = []
  const skippedLinks: SchedLink[] = []
  for (const l of links) {
    if (byId.has(l.source) && byId.has(l.target) && !isSummary(l.source) && !isSummary(l.target)) usable.push(l)
    else skippedLinks.push(l)
  }

  const leaves = tasks.filter((t) => !isSummary(t.id))
  const incoming = new Map<string, SchedLink[]>()
  const outgoing = new Map<string, SchedLink[]>()
  const pending = new Map<string, number>()
  for (const t of leaves) {
    incoming.set(t.id, [])
    outgoing.set(t.id, [])
    pending.set(t.id, 0)
  }
  for (const l of usable) {
    incoming.get(l.target)!.push(l)
    outgoing.get(l.source)!.push(l)
    pending.set(l.target, pending.get(l.target)! + 1)
  }

  // Topological order (Kahn). Tasks left over are in, or behind, a cycle.
  const order: string[] = []
  const queue = leaves.filter((t) => pending.get(t.id) === 0).map((t) => t.id)
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const l of outgoing.get(id)!) {
      const left = pending.get(l.target)! - 1
      pending.set(l.target, left)
      if (left === 0) queue.push(l.target)
    }
  }
  const scheduledIds = new Set(order)
  const cycle = leaves.filter((t) => !scheduledIds.has(t.id)).map((t) => t.id)

  // Forward pass.
  const conflicts = new Set<string>()
  // What the links alone ask of each task's start (raw, `-Infinity` for none).
  const linkBound = new Map<string, number>()
  const start = new Map<string, number>()
  const end = new Map<string, number>()

  // The latest start of an as-late-as-possible task: its end can't pass the start of any successor (PRO looks at
  // that start only, whatever the link type), nor the project end for a task with no successors; `null` when
  // nothing moves it. `startOf` gives a successor's current start; `bound` is the earliest start its links allow.
  const alapStart = (id: string, startOf: (target: string) => number, bound: number): number | null => {
    const task = byId.get(id)!
    const duration = Math.max(0, task.duration)
    let latestEnd: number | null = null
    for (const l of outgoing.get(id)!) {
      let b = workingBoundary(startOf(l.target), 'past')
      // PRO turns SS, FF and SF links into finish-to-start ones with a longer lead: by the task's own duration
      // (SS), the successor's (FF) or both (SF).
      const own = Math.max(0, task.duration)
      const next = Math.max(0, byId.get(l.target)!.duration)
      const lag = (l.lag ?? 0) + (l.type === '1' ? -own : l.type === '2' ? -next : l.type === '3' ? -own - next : 0)
      if (lag) b = shiftWorkDays(cal, b, -lag)
      if (latestEnd === null || b < latestEnd) latestEnd = b
    }
    if (latestEnd === null && limitEnd !== null && countWorkDays(cal, endFromStart(cal, toDay(task.start), duration), limitEnd) > 0) latestEnd = limitEnd
    if (latestEnd === null) return null
    let s = duration > 0 ? startFromEnd(cal, workingBoundary(latestEnd, 'future'), duration) : workingBoundary(latestEnd, 'past')
    const limit = duration > 0 ? startFromEnd(cal, latestEnd, duration) : latestEnd
    if (s > limit) s = limit
    if (bound !== -Infinity && s < bound) s = bound
    return s
  }

  // Scheduling from the end: every task but the explicit ASAP ones is placed first, from the last one back.
  // An ASAP task's place is only a plan its predecessors look at; it is moved in the forward pass below.
  const plan = new Map<string, number>()
  if (fromEnd) {
    for (const id of [...order].reverse()) {
      const task = byId.get(id)!
      const duration = Math.max(0, task.duration)
      const own = toDay(task.start)
      const found = alapStart(id, (t) => plan.get(t) ?? toDay(byId.get(t)!.start), -Infinity)
      const { earliest, latest } = constraintBounds(task, duration)
      const effective = found ?? own
      let final = found
      if (earliest !== undefined && effective < earliest) final = earliest
      if (latest !== undefined && effective > latest) final = latest
      if (final !== null) plan.set(id, final)
      start.set(id, final ?? own)
      end.set(id, endFromStart(cal, final ?? own, duration))
    }
  }

  for (const id of order) {
    const task = byId.get(id)!
    if (fromEnd && !isAsap(task)) continue
    const duration = Math.max(0, task.duration)
    // Earliest start allowed by links that fix the start (FS, SS) and by links
    // that fix the end (FF, SF), kept apart for the milestone rule below.
    let fromStartLinks = -Infinity
    let fromEndLinks = -Infinity
    // For milestones: the same start-driven bounds, but only those without a
    // positive lag are moved to a working day (see below).
    let milestoneBound = -Infinity
    for (const l of incoming.get(id)!) {
      const lag = l.lag ?? 0
      const pStart = start.get(l.source)!
      const pEnd = end.get(l.source)!
      switch (l.type) {
        case '0': // FS
        case '1': {
          // SS
          const raw = shiftWorkDays(cal, l.type === '0' ? pEnd : pStart, lag)
          fromStartLinks = Math.max(fromStartLinks, raw)
          milestoneBound = Math.max(milestoneBound, lag > 0 ? raw : nextWorkingDay(cal, raw))
          break
        }
        case '2': // FF
          fromEndLinks = Math.max(fromEndLinks, startFromEnd(cal, shiftWorkDays(cal, pEnd, lag), duration))
          break
        default: // SF
          fromEndLinks = Math.max(fromEndLinks, startFromEnd(cal, shiftWorkDays(cal, pStart, lag), duration))
      }
    }
    const lower = Math.max(fromStartLinks, fromEndLinks)
    linkBound.set(id, lower)
    const own = toDay(task.start)
    let s: number
    // PRO's `project_start`: a task with no predecessors is moved up to it (strictly, also back to it), but only when
    // there is working time between the two dates (a Saturday start before a Monday project start stays).
    const toProjectStart = lower === -Infinity && projectStart !== null && (countWorkDays(cal, own, projectStart) > 0 || (options.strictProjectStart === true && countWorkDays(cal, projectStart, own) > 0))
    if (toProjectStart) s = duration > 0 ? nextWorkingDay(cal, projectStart!) : cal.isWorkingDay(projectStart!) ? projectStart! : prevWorkingDay(cal, projectStart!) + 1
    else if (lower === -Infinity) s = snapFixedStarts ? nextWorkingDay(cal, own) : own
    else if (duration === 0) {
      // A milestone takes no working time. Like DHTMLX Pro, a date forced by an
      // end-driven link (FF, SF), or by a start-driven link with a positive lag,
      // stays put (it may be a weekend); a start-driven link without lag moves
      // to the next working day.
      const found = Math.max(milestoneBound, fromEndLinks)
      s = strict && !options.pinned?.has(id) ? found : Math.max(own, found)
    } else {
      s = nextWorkingDay(cal, strict && !options.pinned?.has(id) ? lower : Math.max(own, lower))
    }
    const { earliest, latest } = constraintBounds(task, duration)
    if (earliest !== undefined || latest !== undefined) {
      // Like Pro: the start from the links (or the task's own start) is pushed to the earliest start the
      // constraint allows, or pulled back to the latest one. A pull-back may break a link: that is a conflict.
      const effective = lower === -Infinity && !toProjectStart ? own : s
      const from = s
      if (earliest !== undefined && effective < earliest) s = earliest
      if (latest !== undefined && effective > latest) s = latest
      if (lower !== -Infinity && s < from) conflicts.add(id)
    }
    start.set(id, s)
    end.set(id, endFromStart(cal, s, duration))
  }

  // Backward pass over the scheduled leaves.
  const projectEnd = order.length > 0 ? Math.max(...order.map((id) => end.get(id)!)) : null
  const lateStart = new Map<string, number>()
  const lateEnd = new Map<string, number>()
  for (const id of [...order].reverse()) {
    const duration = Math.max(0, byId.get(id)!.duration)
    // Like DHTMLX Pro, only a task with no successors is capped by the project
    // end; one with successors is bounded by what its links require.
    let lfBound = outgoing.get(id)!.length === 0 ? projectEnd! : Infinity
    let lsBound = Infinity
    for (const l of outgoing.get(id)!) {
      if (!lateStart.has(l.target)) continue
      const lag = l.lag ?? 0
      const tLS = lateStart.get(l.target)!
      const tLF = lateEnd.get(l.target)!
      switch (l.type) {
        case '0': // pred.end <= succ.start - lag
          lfBound = Math.min(lfBound, shiftWorkDays(cal, tLS, -lag))
          break
        case '1': // pred.start <= succ.start - lag
          lsBound = Math.min(lsBound, shiftWorkDays(cal, tLS, -lag))
          break
        case '2': // pred.end <= succ.end - lag
          lfBound = Math.min(lfBound, shiftWorkDays(cal, tLF, -lag))
          break
        default: // SF: pred.start <= succ.end - lag
          lsBound = Math.min(lsBound, shiftWorkDays(cal, tLF, -lag))
      }
    }
    if (lfBound === Infinity && lsBound === Infinity) lfBound = projectEnd! // successors in a cycle
    let ls = lfBound === Infinity ? prevWorkingDay(cal, lsBound) : startFromEnd(cal, lfBound, duration)
    if (lsBound !== Infinity) ls = Math.min(ls, prevWorkingDay(cal, lsBound))
    lateStart.set(id, ls)
    lateEnd.set(id, endFromStart(cal, ls, duration))
  }

  // Tasks set to "as late as possible" slide towards their successors (Pro's second pass, from the end).
  // Like Pro it looks at the successor's start only, whatever the link type; a task with no successor stays put
  // (unless the project end pulls it) and is only pushed by its predecessors.
  const early = new Map(start)
  if (!fromEnd) {
    for (const id of [...order].reverse()) {
      const task = byId.get(id)!
      if (isAsap(task)) continue
      const duration = Math.max(0, task.duration)
      // A task that has to move for its predecessors never moves back: it keeps its own start unless they push it.
      const bound = linkBound.get(id)! === -Infinity ? -Infinity : early.get(id)!
      const own = toDay(task.start)
      const found = alapStart(id, (t) => start.get(t)!, bound)
      const kept = bound !== -Infinity && own < bound ? bound : own
      const final = found ?? kept
      start.set(id, final)
      end.set(id, endFromStart(cal, final, duration))
    }
  }

  const result = new Map<string, ScheduledTask>()
  const floatOf = (id: string): number => {
    const es = early.get(id)!
    const ls = lateStart.get(id)!
    return ls >= es ? countWorkDays(cal, es, ls) : -countWorkDays(cal, ls, es)
  }
  for (const id of order) {
    const totalFloat = floatOf(id)
    result.set(id, {
      id,
      start: fromDay(start.get(id)!),
      end: fromDay(end.get(id)!),
      duration: byId.get(id)!.duration,
      summary: false,
      lateStart: fromDay(lateStart.get(id)!),
      lateEnd: fromDay(lateEnd.get(id)!),
      totalFloat,
      critical: totalFloat <= 0
    })
  }

  // Roll summaries up from their children, deepest first.
  const rollUp = (id: string): { start: number; end: number; critical: boolean } | null => {
    const kids = children.get(id)
    if (!kids) {
      const r = result.get(id)
      return r ? { start: toDay(r.start), end: toDay(r.end), critical: r.critical } : null
    }
    let s = Infinity
    let e = -Infinity
    let critical = false
    for (const kid of kids) {
      const r = rollUp(kid)
      if (!r) continue
      s = Math.min(s, r.start)
      e = Math.max(e, r.end)
      critical ||= r.critical
    }
    if (s === Infinity) return null
    result.set(id, {
      id,
      start: fromDay(s),
      end: fromDay(e),
      duration: countWorkDays(cal, s, e),
      summary: true,
      critical
    })
    return { start: s, end: e, critical }
  }
  for (const t of tasks) if (isRoot(t.parent) || !byId.has(t.parent!)) rollUp(t.id)

  return {
    tasks: result,
    cycle: cycle.length > 0 ? cycle : null,
    skippedLinks,
    projectEnd: projectEnd === null ? null : fromDay(projectEnd),
    conflicts
  }
}
