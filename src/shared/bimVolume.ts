/** A detail task as the volume split sees it. `duration` is in working days. */
export interface VolumeTask {
  id: string
  duration: number
}

export interface TaskVolumes {
  /** Volume each task is worth: the sum, over its elements, of the element's volume times the task's share of it. */
  byTask: Map<string, number>
  /** Sum of the volume of the elements that ended up in the split (never counted twice). */
  assignedVolume: number
  /** Elements tied to a task, but left out: no volume, or every task they belong to has no duration. */
  excluded: { noVolume: string[]; noTime: string[] }
  /** Elements of the model that no task uses (only known when the model's elements are given). */
  unassigned: string[]
  /** Volume of the unassigned elements and of the whole model (given the model's elements). */
  unassignedVolume: number
  modelVolume: number
}

/**
 * Splits each element's volume among the tasks it belongs to, in proportion to the tasks' durations:
 * an element built by a 10-day task and a 2-day task is 10/12 of the first and 2/12 of the second.
 * Every element is counted exactly once, so the task volumes add up to the volume of the assigned
 * elements, whatever the overlaps.
 *
 * @param tasks         the detail tasks (summaries and milestones left out by the caller)
 * @param guidsByTask   the elements (GlobalIds) tied to each task, groups already resolved
 * @param volumeOf      the volume of an element, or null/undefined when unknown
 * @param modelGuids    every element of the model, to report what no task uses (optional)
 */
export function splitVolumes(
  tasks: VolumeTask[],
  guidsByTask: Map<string, Iterable<string>>,
  volumeOf: (guid: string) => number | null | undefined,
  modelGuids?: Iterable<string>
): TaskVolumes {
  const duration = new Map(tasks.map((t) => [t.id, Math.max(0, t.duration)]))
  // element -> the tasks it belongs to (each task at most once)
  const tasksOf = new Map<string, Set<string>>()
  for (const t of tasks) {
    for (const guid of guidsByTask.get(t.id) ?? []) {
      if (!guid) continue
      let set = tasksOf.get(guid)
      if (!set) tasksOf.set(guid, (set = new Set()))
      set.add(t.id)
    }
  }

  const byTask = new Map<string, number>(tasks.map((t) => [t.id, 0]))
  const noVolume: string[] = []
  const noTime: string[] = []
  let assignedVolume = 0

  for (const [guid, ids] of tasksOf) {
    const volume = volumeOf(guid)
    if (volume === null || volume === undefined || !(volume > 0)) {
      noVolume.push(guid)
      continue
    }
    let time = 0
    for (const id of ids) time += duration.get(id) ?? 0
    if (time <= 0) {
      noTime.push(guid)
      continue
    }
    for (const id of ids) {
      const d = duration.get(id) ?? 0
      if (d > 0) byTask.set(id, (byTask.get(id) ?? 0) + (volume * d) / time)
    }
    assignedVolume += volume
  }

  const unassigned: string[] = []
  let unassignedVolume = 0
  let modelVolume = 0
  if (modelGuids) {
    for (const guid of modelGuids) {
      if (!guid) continue
      const volume = volumeOf(guid)
      const v = volume !== null && volume !== undefined && volume > 0 ? volume : 0
      modelVolume += v
      if (!tasksOf.has(guid)) {
        unassigned.push(guid)
        unassignedVolume += v
      }
    }
  }

  return { byTask, assignedVolume, excluded: { noVolume, noTime }, unassigned, unassignedVolume, modelVolume }
}
