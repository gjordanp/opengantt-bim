import type { GanttStatic } from 'dhtmlx-gantt'

export const PLACEHOLDER_TYPE = 'placeholder'

export const isPlaceholder = (task: { type?: unknown } | null | undefined): boolean => task?.type === PLACEHOLDER_TYPE

export interface PlaceholderOptions {
  /** Text of the empty row. */
  label: string
  /** What a new task starts with besides its name (parent, dates, duration). Called when the empty row is filled in. */
  defaults?: () => Record<string, unknown>
}

export interface Placeholder {
  /** Puts the empty row back at the end (after a load, an undo, an added or deleted task). */
  ensure(): void
  /** Starts typing the name in the row; Enter creates the task. */
  edit(): void
  destroy(): void
}

/**
 * The empty row at the end of the table, like the DHTMLX PRO `placeholder_task` (Community leaves it out):
 * it is always the last row; filling it in turns it into a real task and a new empty row appears below.
 * Same event flow as PRO: after the row is edited it is replaced by a copy that is a normal task.
 */
export function installPlaceholder(gantt: GanttStatic, options: PlaceholderOptions): Placeholder {
  const g = gantt as any
  g.config.types.placeholder = PLACEHOLDER_TYPE
  const ids: string[] = []
  let editing = false

  const rows = (): any[] => g.getTaskBy('type', PLACEHOLDER_TYPE)

  const ensure = (): void => {
    if (!g.isTaskExists) return
    const found = rows()
    // Already there and last: nothing to do.
    if (found.length === 1) {
      const last = g.getTaskByIndex(g.getTaskCount() - 1)
      if (last && last.id === found[0].id) return
    }
    g.silent(() => {
      for (const p of found) if (g.isTaskExists(p.id)) g.deleteTask(p.id)
      g.addTask({ id: g.uid(), type: PLACEHOLDER_TYPE, text: options.label, start_date: new Date(), duration: 0, parent: 0 })
    })
    g.render()
  }

  const convert = (id: string | number): void => {
    const item = g.getTask(id)
    if (!isPlaceholder(item)) return
    g.batchUpdate(() => {
      const task = g.copy(item)
      g.silent(() => g.deleteTask(item.id))
      delete task['!nativeeditor_status']
      task.type = g.config.types.task
      task.id = g.uid()
      Object.assign(task, options.defaults?.() ?? {})
      // Adding it triggers `onAfterTaskAdd`, which puts a new empty row at the end.
      g.addTask(task, task.parent)
    })
  }

  ids.push(
    g.attachEvent('onAfterTaskUpdate', (id: string | number) => {
      convert(id)
      return true
    }),
    g.attachEvent('onAfterTaskAdd', (_id: string | number, task: { type?: unknown }) => {
      if (!isPlaceholder(task)) ensure()
      return true
    }),
    g.attachEvent('onAfterTaskDelete', (_id: string | number, task: { type?: unknown }) => {
      if (!isPlaceholder(task)) ensure()
      return true
    }),
    g.attachEvent('onParse', () => {
      ensure()
      return true
    }),
    // The row can be neither opened in the edit window nor deleted.
    g.attachEvent('onBeforeLightbox', (id: string | number) => !isPlaceholder(g.getTask(id))),
    g.attachEvent('onBeforeTaskDelete', (id: string | number) => !isPlaceholder(g.getTask(id)))
  )

  const edit = (): void => {
    const row = rows()[0]
    if (!row || editing) return
    const cell = g.$grid_data?.querySelector(`.gantt_row[data-task-id="${row.id}"] .gantt_tree_content`) as HTMLElement | null
    if (!cell) return
    editing = true
    const input = document.createElement('input')
    input.className = 'placeholder-input'
    input.placeholder = 'Nombre de la nueva tarea'
    input.setAttribute('aria-label', 'Nombre de la nueva tarea')
    let done = false
    const finish = (commit: boolean): void => {
      if (done) return
      done = true
      editing = false
      const text = input.value.trim()
      if (commit && text) {
        row.text = text
        g.updateTask(row.id)
      } else if (g.isTaskExists(row.id)) {
        g.refreshTask(row.id)
      }
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') finish(true)
      else if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => finish(true))
    input.addEventListener('mousedown', (e) => e.stopPropagation())
    cell.replaceChildren(input)
    input.focus()
  }

  ids.push(
    g.attachEvent('onTaskClick', (id: string | number) => {
      if (!isPlaceholder(g.getTask(id))) return true
      edit()
      return false
    })
  )

  return {
    ensure,
    edit,
    destroy: () => ids.forEach((x) => g.detachEvent(x))
  }
}
