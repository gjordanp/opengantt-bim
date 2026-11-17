import type { GanttStatic } from 'dhtmlx-gantt'
import { isPlaceholder } from './placeholder'
import { fillValues } from '@shared/fill'

export interface CellNavOptions {
  /** Columns whose cells can be filled by dragging the corner of the selection. */
  fillable: ReadonlySet<string>
  /** The text a cell holds, as typed into its editor. */
  read(column: string, taskId: string): string
  /** Whether this task's cell takes a value (summary tasks derive theirs). */
  canFill(column: string, taskId: string): boolean
  /** Writes the values in one go (a single reschedule, a single undo step). */
  fill(column: string, entries: { id: string; value: string }[]): void
  /** The Gantt row follows the cell, so the rest of the app follows the task. */
  selectTask(taskId: string): void
}

const TYPING = /^[\p{L}\p{N}\-+.,]$/u
const isField = (el: Element | null): boolean => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)
const HANDLE = 10

/**
 * Working in the table like in a spreadsheet: a clicked cell is selected (not edited), the arrow keys move between
 * cells (Shift extends the selection down or up), Enter, F2, a double click or just typing edit the cell, and dragging
 * the small square at the corner of the selection fills the cells below with its values (one cell repeats, several
 * repeat their pattern).
 */
export function installCellNav(gantt: GanttStatic, host: HTMLElement, opts: CellNavOptions): () => void {
  const g = gantt as any
  const editors = g.ext.inlineEditors
  let col: string | null = null
  let anchor: string | null = null // where the selection started
  let active: string | null = null // the cell with the cursor (the other end)
  let fillTo: number | null = null // while dragging: the last row (index) that will be filled
  // The gantt opens an editor on a plain click; here a click only selects. Edits we start ourselves are let through.
  let fromMouse = false
  let allow = false

  const ids = (): string[] => {
    const out: string[] = []
    const n = g.getVisibleTaskCount()
    for (let i = 0; i < n; i++) {
      const t = g.getTaskByIndex(i)
      if (!isPlaceholder(t)) out.push(String(t.id))
    }
    return out
  }
  const columns = (): string[] => g.getGridColumns().map((c: { name: string }) => c.name)
  const range = (): { from: number; to: number; rows: string[] } | null => {
    if (!col || !anchor || !active) return null
    const rows = ids()
    const a = rows.indexOf(anchor)
    const b = rows.indexOf(active)
    if (a < 0 || b < 0) return null
    return { from: Math.min(a, b), to: Math.max(a, b), rows }
  }

  // ---- looks: classes on the cells, put back whenever the gantt redraws its rows ----
  const clearClasses = (): void => {
    host.querySelectorAll('.cn-sel, .cn-active, .cn-first, .cn-last, .cn-fill, .cn-handle').forEach((el) => el.classList.remove('cn-sel', 'cn-active', 'cn-first', 'cn-last', 'cn-fill', 'cn-handle'))
  }
  const cellOf = (id: string, column: string): HTMLElement | null =>
    host.querySelector(`.gantt_grid_data .gantt_row[data-task-id="${CSS.escape(id)}"] .gantt_cell[data-column-name="${CSS.escape(column)}"]`)
  let paintQueued = false
  const paint = (): void => {
    paintQueued = false
    clearClasses()
    const r = range()
    if (!r || !col) return
    const last = fillTo !== null ? Math.max(fillTo, r.to) : r.to
    for (let i = r.from; i <= last; i++) {
      const el = cellOf(r.rows[i], col)
      if (!el) continue
      el.classList.add('cn-sel')
      if (i > r.to) el.classList.add('cn-fill')
      if (i === r.from) el.classList.add('cn-first')
      if (i === last) {
        el.classList.add('cn-last')
        if (opts.fillable.has(col) && fillTo === null) el.classList.add('cn-handle')
      }
    }
    if (active) cellOf(active, col)?.classList.add('cn-active')
  }
  const queuePaint = (): void => {
    if (paintQueued) return
    paintQueued = true
    requestAnimationFrame(paint)
  }
  const data = (): HTMLElement | null => host.querySelector('.gantt_grid_data')
  // The gantt rebuilds rows as it scrolls and redraws.
  const observer = new MutationObserver(queuePaint)
  const observe = (): void => {
    const d = data()
    if (d) observer.observe(d, { childList: true })
  }
  observe()
  const renderEvent = g.attachEvent('onGanttRender', () => {
    observer.disconnect()
    observe()
    queuePaint()
    return true
  })

  const select = (id: string, column: string, extend: boolean): void => {
    if (!extend || column !== col || !anchor) anchor = id
    col = column
    active = id
    queuePaint()
  }
  const reveal = (id: string): void => {
    const d = data()
    if (!d) return
    const top = g.getTaskTop(id)
    const h = g.config.row_height
    const view = g.getScrollState()
    if (top < view.y) g.scrollTo(null, top)
    else if (top + h > view.y + d.clientHeight) g.scrollTo(null, top + h - d.clientHeight)
  }
  const move = (dRow: number, dCol: number, extend: boolean): void => {
    if (!col || !active) return
    const rows = ids()
    const cols = columns()
    const r = Math.max(0, Math.min(rows.length - 1, rows.indexOf(active) + dRow))
    const c = Math.max(0, Math.min(cols.length - 1, cols.indexOf(col) + dCol))
    const nextCol = cols[c]
    // A selection spans one column: moving sideways starts over.
    select(rows[r], nextCol, extend && dCol === 0)
    reveal(rows[r])
    if (!extend) opts.selectTask(rows[r])
  }
  const edit = (initial?: string): void => {
    if (!col || !active || !editors.getEditorConfig(col)) return
    anchor = active
    allow = true
    try {
      editors.startEdit(active, col)
    } finally {
      allow = false
    }
    if (initial !== undefined) {
      window.setTimeout(() => {
        const input = host.querySelector<HTMLInputElement>('.gantt_grid_data input, .gantt_grid_editor_placeholder input')
        if (!input) return
        input.value = initial
        input.setSelectionRange(initial.length, initial.length)
      }, 0)
    }
  }
  const focusHost = (): void => {
    if (!isField(document.activeElement)) host.focus({ preventScroll: true })
  }

  // ---- mouse: select, edit on double click, fill ----
  const cellAt = (target: EventTarget | null): { id: string; column: string; el: HTMLElement } | null => {
    const el = (target as HTMLElement | null)?.closest?.('.gantt_grid_data .gantt_cell[data-column-name]') as HTMLElement | null
    const row = el?.closest('.gantt_row[data-task-id]')
    const id = row?.getAttribute('data-task-id')
    if (!el || !id || !g.isTaskExists(id) || isPlaceholder(g.getTask(id))) return null
    return { id, column: el.getAttribute('data-column-name')!, el }
  }
  const rowIndexAt = (y: number): number => {
    const rows = ids()
    let best = -1
    for (const row of host.querySelectorAll<HTMLElement>('.gantt_grid_data .gantt_row[data-task-id]')) {
      const rect = row.getBoundingClientRect()
      const i = rows.indexOf(row.getAttribute('data-task-id')!)
      if (i < 0) continue
      if (y >= rect.top && y < rect.bottom) return i
      if (y >= rect.bottom) best = Math.max(best, i)
    }
    return best
  }
  const onMouseDown = (e: MouseEvent): void => {
    // The left button, or the right one (whose menu is not shown if it was used to drag a selection).
    if (e.button !== 0 && e.button !== 2) return
    fromMouse = true
    if ((e.target as HTMLElement).closest('.gantt_tree_icon.gantt_open, .gantt_tree_icon.gantt_close')) return
    const hit = cellAt(e.target)
    if (!hit) return
    // The corner square of the selection starts a fill.
    if (hit.el.classList.contains('cn-handle')) {
      const rect = hit.el.getBoundingClientRect()
      if (e.clientX >= rect.right - HANDLE && e.clientY >= rect.bottom - HANDLE) {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        startFill()
        return
      }
    }
    // A click inside an open editor is for the editor.
    if (isField(e.target as Element)) return
    select(hit.id, hit.column, e.shiftKey)
    focusHost()
    startDragSelect(e.button)
  }
  // Dragging across rows widens the selection (within the column where it started).
  let suppressMenu = false
  const startDragSelect = (button: number): void => {
    let moved = false
    const stopText = (ev: Event): void => ev.preventDefault()
    const move = (ev: MouseEvent): void => {
      const i = rowIndexAt(ev.clientY)
      const rows = ids()
      if (i < 0 || !col || rows[i] === active) return
      moved = true
      active = rows[i]
      queuePaint()
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
      document.removeEventListener('selectstart', stopText, true)
      if (moved && button === 2) {
        suppressMenu = true
        window.setTimeout(() => (suppressMenu = false), 300)
      }
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
    document.addEventListener('selectstart', stopText, true)
  }
  const onContextMenu = (e: MouseEvent): void => {
    if (!suppressMenu) return
    e.preventDefault()
    e.stopPropagation()
  }
  const startFill = (): void => {
    const r = range()
    if (!r || !col) return
    const column = col
    const move = (ev: MouseEvent): void => {
      const i = rowIndexAt(ev.clientY)
      fillTo = i > r.to ? i : null
      queuePaint()
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move, true)
      window.removeEventListener('mouseup', up, true)
      const to = fillTo
      fillTo = null
      if (to !== null && to > r.to) {
        const source = r.rows.slice(r.from, r.to + 1).map((id) => opts.read(column, id))
        // Rows that can't take a value are skipped without using up a step of the series.
        const targets = r.rows.slice(r.to + 1, to + 1).filter((id) => opts.canFill(column, id))
        const values = fillValues(source, targets.length)
        const entries = targets.map((id, k) => ({ id, value: values[k] }))
        if (entries.length > 0) opts.fill(column, entries)
        active = r.rows[to]
      }
      queuePaint()
    }
    window.addEventListener('mousemove', move, true)
    window.addEventListener('mouseup', up, true)
  }
  const dbl = g.attachEvent('onTaskDblClick', (_id: string, e: MouseEvent) => {
    const hit = cellAt(e?.target)
    if (!hit || !editors.getEditorConfig(hit.column)) return true
    select(hit.id, hit.column, false)
    edit()
    return false // not the edit window
  })

  // ---- keyboard ----
  const onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement
    if (isField(target)) {
      // Inside the cell editor: Enter and the vertical arrows save it and move on, like a spreadsheet.
      if (!editors.isVisible() || !host.contains(target) || e.ctrlKey || e.metaKey || e.altKey) return
      const dRow = e.key === 'Enter' ? (e.shiftKey ? -1 : 1) : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      if (dRow === 0) return
      e.preventDefault()
      e.stopPropagation()
      editors.save()
      // A value that is refused leaves the editor open: stay there.
      if (!editors.isVisible()) {
        move(dRow, 0, false)
        window.setTimeout(focusHost, 0)
      }
      return
    }
    if (!col || !active || e.ctrlKey || e.metaKey || e.altKey) return
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        move(e.key === 'ArrowDown' ? 1 : -1, 0, e.shiftKey)
        break
      case 'ArrowLeft':
      case 'ArrowRight':
        move(0, e.key === 'ArrowRight' ? 1 : -1, false)
        break
      case 'Tab':
        move(0, e.shiftKey ? -1 : 1, false)
        break
      case 'Enter':
      case 'F2':
        edit()
        break
      case 'Escape':
        anchor = active
        queuePaint()
        return
      default:
        if (TYPING.test(e.key) && editors.getEditorConfig(col)) {
          edit(e.key)
          break
        }
        return
    }
    e.preventDefault()
    e.stopPropagation()
  }
  const onClick = (): void => void window.setTimeout(() => (fromMouse = false), 0)
  const guard = editors.attachEvent('onBeforeEditStart', () => allow || !fromMouse)
  const editEnd = editors.attachEvent('onEditEnd', () => {
    window.setTimeout(focusHost, 0)
    queuePaint()
  })

  host.addEventListener('mousedown', onMouseDown, true)
  host.addEventListener('keydown', onKeyDown, true)
  host.addEventListener('click', onClick, true)
  host.addEventListener('contextmenu', onContextMenu, true)
  host.tabIndex = -1
  return () => {
    host.removeEventListener('mousedown', onMouseDown, true)
    host.removeEventListener('keydown', onKeyDown, true)
    host.removeEventListener('click', onClick, true)
    host.removeEventListener('contextmenu', onContextMenu, true)
    editors.detachEvent(guard)
    g.detachEvent(renderEvent)
    g.detachEvent(dbl)
    editors.detachEvent(editEnd)
    observer.disconnect()
    clearClasses()
  }
}
