import type { GanttStatic } from 'dhtmlx-gantt'
import { clickSelection, emptySelection, type Selection } from '@shared/selection'
import { countWorkDays, fromDay, nextWorkingDay, prevWorkingDay, toDay, type Calendar } from '@shared/scheduling'
import { dateToIso, isoToDate } from './localDates'
import { startEditAt } from './inlineEditors'

export interface MultiSelect {
  /** Replaces the selection (empty list clears it). */
  set(ids: string[]): void
  destroy(): void
}

/**
 * Selecting several tasks (Ctrl/Cmd + click, Shift + click), with the same API as the PRO `multiselect`
 * extension: `getSelectedTasks`, `eachSelectedTask`, `isSelectedTask`, `getLastSelectedTask`,
 * `toggleTaskSelection`, `selectTask` (adds) and `unselectTask`, and the events `onTaskMultiSelect`,
 * `onTaskSelected` and `onTaskUnselected`. Community only knows one selected task.
 *
 * With `getSelectedTasks` defined, the gantt's own drag code (`drag_multiple`, which Community ships) moves
 * every selected task together.
 */
export function installMultiSelect(gantt: GanttStatic): MultiSelect {
  const g = gantt as any
  let state: Selection = emptySelection
  const store = g.$data.tasksStore

  const visibleOrder = (): string[] => {
    const order: string[] = []
    const count = g.getVisibleTaskCount()
    for (let i = 0; i < count; i++) {
      const task = g.getTaskByIndex(i)
      // The empty row at the end of the table can't be selected.
      if (task.type !== 'placeholder') order.push(String(task.id))
    }
    return order
  }
  const exists = (id: string): boolean => g.isTaskExists(id)
  const selectedIds = (): string[] => state.selected.filter(exists)
  const isSelected = (id: string | number): boolean => state.selected.includes(String(id)) && exists(String(id))

  // Rows and bars of selected tasks take the "selected" look through the store, as in the PRO edition.
  const nativeIsSelected = store.isSelected
  store.isSelected = (id: string | number): boolean => isSelected(id)

  const apply = (next: Selection, e: Event | null): void => {
    const before = new Set(state.selected)
    const after = new Set(next.selected)
    const previousLast = state.last
    state = next
    store.silent(() => (next.last && exists(next.last) ? store.select(next.last) : store.unselect(null)))
    for (const id of new Set([...before, ...after])) {
      if (before.has(id) === after.has(id) || !exists(id)) continue
      g.refreshTask(id)
      g.callEvent('onTaskMultiSelect', [id, after.has(id), e])
    }
    // The rest of the app follows the last selected task.
    if (next.last && next.last !== previousLast) g.callEvent('onTaskSelected', [next.last])
    else if (!next.last && previousLast) g.callEvent('onTaskUnselected', [previousLast])
  }

  const levelOf = (id: string): number => g.calculateTaskLevel(g.getTask(id))
  const click = (id: string, e: MouseEvent): void => {
    if (g.getTask(id)?.type === 'placeholder') return
    const oneLevel = Boolean(g.config.multiselect_one_level)
    apply(
      clickSelection(state, visibleOrder(), String(id), { toggle: e.ctrlKey || e.metaKey, shift: e.shiftKey }, { oneLevel, level: levelOf }),
      e
    )
  }

  const events = [
    g.attachEvent('onTaskClick', (id: string, e: MouseEvent) => {
      // The open/close arrow of a branch is not a selection.
      if ((e?.target as HTMLElement | undefined)?.closest?.('.gantt_tree_icon.gantt_open, .gantt_tree_icon.gantt_close')) return true
      click(id, e)
      // A plain click on an editable cell of the table edits it in place.
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && g.getTask(id)?.type !== 'placeholder') startEditAt(gantt, e.target)
      return true
    }),
    // A new project (or an undo) starts with nothing selected.
    g.attachEvent('onClear', () => {
      state = emptySelection
    })
  ]

  // The gantt's own code looks for this object: its presence turns off the single-selection click and its
  // `reset` runs on clearAll.
  g._multiselect = {
    reset: () => {
      state = emptySelection
    }
  }
  g.getSelectedTasks = (): string[] => selectedIds()
  g.eachSelectedTask = (callback: (id: string) => void): void => selectedIds().forEach(callback)
  g.isSelectedTask = isSelected
  g.getLastSelectedTask = (): string | null => (state.last && exists(state.last) ? state.last : null)
  g.selectTask = (id: string | number): string | number | false => {
    const key = String(id)
    if (!key || !exists(key)) return false
    const order = visibleOrder()
    const selected = new Set([...selectedIds(), key])
    apply({ selected: order.filter((x) => selected.has(x)).concat([...selected].filter((x) => !order.includes(x))), first: key, last: key }, null)
    return id
  }
  g.unselectTask = (id?: string | number): string | number | null => {
    const key = id === undefined ? state.last : String(id)
    if (!key) return null
    const selected = selectedIds().filter((x) => x !== key)
    const last = state.last === key ? (selected[selected.length - 1] ?? null) : state.last
    apply({ selected, first: last, last }, null)
    return key
  }
  g.toggleTaskSelection = (id: string | number): void => {
    if (isSelected(id)) g.unselectTask(id)
    else g.selectTask(id)
  }

  return {
    set: (ids) => {
      const keep = ids.filter(exists)
      const last = keep[keep.length - 1] ?? null
      apply({ selected: keep, first: keep[0] ?? null, last }, null)
    },
    destroy: () => {
      for (const id of events) g.detachEvent(id)
      store.isSelected = nativeIsSelected
    }
  }
}

/**
 * Keeps the duration (in working days) of every task that is moved by dragging: the gantt moves the dates
 * by calendar days, which would change how many working days a task spans. Resizing is the one case where
 * the duration really changes, and then it is counted from the new dates.
 *
 * With `correct` (the PRO `correct_work_time`), a task dropped on a non-working day starts on the next
 * working day, and a bar resized to end on one ends on the last working day before it.
 */
export function installDragDurations(
  gantt: GanttStatic,
  getCalendar: () => Calendar,
  after: (moved: string[]) => void,
  options: { correct?: boolean } = {}
): () => void {
  const g = gantt as any
  const correct = options.correct ?? true
  const durations = new Map<string, number>()
  let startBefore = 0
  const dayOf = (d: Date): number => toDay(dateToIso(d))
  const ids = [
    g.attachEvent('onBeforeTaskDrag', (id: string) => {
      durations.clear()
      for (const x of new Set<string>([String(id), ...(g.getSelectedTasks?.() ?? [])])) {
        const task = g.getTask(x)
        if (task) durations.set(x, Number(task.duration) || 0)
      }
      startBefore = dayOf(g.getTask(id).start_date)
      return true
    }),
    g.attachEvent('onAfterTaskDrag', (id: string, mode: string) => {
      const calendar = getCalendar()
      const dragged = g.getTask(id)
      if (mode === g.config.drag_mode.move) {
        for (const [x, duration] of durations) {
          const task = g.getTask(x)
          if (!task || task.type === g.config.types.project) continue
          if (correct) task.start_date = isoToDate(fromDay(nextWorkingDay(calendar, dayOf(task.start_date))))
          task.duration = duration
          task.end_date = g.calculateEndDate({ start_date: task.start_date, duration, unit: 'day', task })
        }
      } else if (mode === g.config.drag_mode.resize && dragged?.start_date && dragged?.end_date) {
        if (correct) {
          if (dayOf(dragged.start_date) !== startBefore) {
            dragged.start_date = isoToDate(fromDay(nextWorkingDay(calendar, dayOf(dragged.start_date))))
          } else {
            const last = prevWorkingDay(calendar, dayOf(dragged.end_date) - 1)
            if (last >= dayOf(dragged.start_date)) dragged.end_date = isoToDate(fromDay(last + 1))
          }
        }
        dragged.duration = countWorkDays(calendar, dayOf(dragged.start_date), dayOf(dragged.end_date))
      }
      const moved = [...durations.keys()]
      if (!moved.includes(String(id))) moved.push(String(id))
      durations.clear()
      after(moved)
      return true
    })
  ]
  return () => ids.forEach((x) => g.detachEvent(x))
}
