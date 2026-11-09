import type { GanttStatic } from 'dhtmlx-gantt'
import { previousDay } from '@shared/plan'
import { formatPredecessors, parsePredecessors, type PredecessorRef } from '@shared/predecessors'
import type { LinkType } from '@shared/model'
import { isPlaceholder } from './placeholder'

/** Row numbers as MS Project counts them: every task and group in table order, from 1 (the empty row excluded). */
type RowNumbers = { byId: Map<string, number>; byNum: Map<number, string> }
const numbersCache = new WeakMap<object, RowNumbers>()
export function rowNumbers(gantt: GanttStatic, fresh = false): RowNumbers {
  const hit = numbersCache.get(gantt)
  if (hit && !fresh) return hit
  const byId = new Map<string, number>()
  const byNum = new Map<number, string>()
  let n = 0
  gantt.eachTask((t: any) => {
    if (isPlaceholder(t)) return
    n++
    byId.set(String(t.id), n)
    byNum.set(n, String(t.id))
  })
  const out = { byId, byNum }
  numbersCache.set(gantt, out)
  return out
}

/** The predecessors of a task, written as `3, 5SS+2d`. */
export function predecessorsText(gantt: GanttStatic, id: string | number, nums = rowNumbers(gantt)): string {
  const refs: PredecessorRef[] = []
  for (const lid of gantt.getTask(id).$target ?? []) {
    const link = gantt.getLink(lid) as any
    const num = nums.byId.get(String(link.source))
    if (num) refs.push({ num, type: String(link.type) as LinkType, lag: Number(link.lag) || 0 })
  }
  return formatPredecessors(refs)
}

/**
 * Editing the cells of the table in place (name, start, end, duration, progress, surface), with the inline editors
 * of the gantt, the way the PRO edition does. Besides its own `text`, `date` and `number` editors, the table needs
 * a few that speak our units: an end date that is the last day of work, a duration in whole working days, progress
 * in percent and a surface with decimals.
 */
export function installInlineEditors(gantt: GanttStatic): () => void {
  const g = gantt as any
  const types = g.config.editor_types
  const { date, number } = types

  const nextDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)

  // End date: the table shows (and takes) the last day of work; the gantt keeps the day after it.
  const lastDay = Object.create(date)
  lastDay.set_value = function (value: unknown, id: unknown, column: unknown, node: unknown): void {
    date.set_value.call(this, value instanceof Date ? previousDay(value) : value, id, column, node)
  }
  lastDay.get_value = function (id: unknown, column: unknown, node: unknown): Date | null {
    const picked = date.get_value.call(this, id, column, node) as Date | null
    return picked && !isNaN(picked.getTime()) ? nextDay(picked) : picked
  }
  types.lastDay = lastDay

  // Duration in whole working days.
  const days = Object.create(number)
  days.get_value = function (id: unknown, column: unknown, node: unknown): number | string {
    const raw = number.get_value.call(this, id, column, node)
    return raw === '' ? '' : parseInt(String(raw), 10)
  }
  types.days = days

  // Progress: stored from 0 to 1, typed from 0 to 100.
  const percent = Object.create(number)
  percent.set_value = function (value: unknown, id: unknown, column: unknown, node: unknown): void {
    number.set_value.call(this, Math.round((Number(value) || 0) * 100), id, column, node)
  }
  percent.get_value = function (id: unknown, column: unknown, node: unknown): number | string {
    const raw = number.get_value.call(this, id, column, node)
    if (raw === '') return ''
    return Math.min(1, Math.max(0, parseFloat(String(raw)) / 100))
  }
  percent.is_valid = (value: unknown): boolean => value !== '' && !isNaN(Number(value))
  percent.is_changed = function (value: unknown, id: unknown, column: unknown, node: unknown): boolean {
    return Math.abs((Number(this.get_value(id, column, node)) || 0) - (Number(value) || 0)) > 1e-9
  }
  types.percent = percent

  // Surface in square metres, with decimals.
  const decimal = Object.create(number)
  decimal.show = function (id: unknown, column: { name: string }, config: { min?: number }, placeholder: HTMLElement): void {
    placeholder.innerHTML = `<div role='cell'><input type='number' min='${config.min ?? 0}' step='any' name='${column.name}' title='${column.name}'></div>`
  }
  decimal.get_value = function (id: unknown, column: unknown, node: unknown): number | string {
    const raw = number.get_value.call(this, id, column, node)
    return raw === '' ? '' : parseFloat(String(raw))
  }
  decimal.is_valid = (value: unknown): boolean => value !== '' && !isNaN(Number(value)) && Number(value) >= 0
  decimal.is_changed = function (value: unknown, id: unknown, column: unknown, node: unknown): boolean {
    return (Number(this.get_value(id, column, node)) || 0) !== (Number(value) || 0)
  }
  types.decimal = decimal

  // Predecessors: typed as `3, 5SS+2d` (row numbers, as in MS Project); saving rewrites the task's incoming links.
  const text = types.text
  const preds = Object.create(text)
  preds.set_value = function (_value: unknown, id: unknown, column: unknown, node: unknown): void {
    text.set_value.call(this, predecessorsText(gantt, id as string), id, column, node)
  }
  // Valid when it reads, every number is a task, and no link would close a loop.
  preds.is_valid = function (value: string, id: string): boolean {
    const r = parsePredecessors(String(value ?? ''))
    if (!r.ok) return false
    const nums = rowNumbers(gantt, true)
    for (const ref of r.refs) {
      const source = nums.byNum.get(ref.num)
      if (!source || source === String(id) || g.hasChild(source) || g.hasChild(id)) return false
      if (g.isCircularLink && g.isCircularLink({ source, target: id, type: ref.type })) return false
    }
    return true
  }
  preds.is_changed = function (value: string, id: string, column: unknown, node: unknown): boolean {
    return String(this.get_value(id, column, node)).replace(/\s/g, '') !== String(value ?? '').replace(/\s/g, '')
  }
  types.predecessors = preds

  // The dates and progress of a parent task come from its children, and the empty row is not a task.
  const derived = new Set(['start_date', 'end_date', 'duration', 'progress'])
  const noLinks = (task: any, id: string | number): boolean => g.hasChild(id) || task.type === g.config.types.project
  const editors = g.ext.inlineEditors
  // Row numbers change when the table is redrawn (rows added, moved, folded away).
  const renumber = g.attachEvent('onBeforeGanttRender', () => {
    numbersCache.delete(gantt)
    return true
  })
  const guard = editors.attachEvent('onBeforeEditStart', (state: { id: string | number; columnName: string }) => {
    const task = g.getTask(state.id)
    if (isPlaceholder(task)) return false
    if (state.columnName === 'predecessors' && noLinks(task, state.id)) return false
    if (derived.has(state.columnName) && (g.hasChild(state.id) || task.type === g.config.types.project)) return false
    return true
  })
  // The column holds no field of the task: apply the typed text to the links instead of storing it.
  const save = editors.attachEvent('onBeforeSave', (state: { id: string | number; columnName: string; newValue: unknown }) => {
    if (state.columnName !== 'predecessors') return true
    const r = parsePredecessors(String(state.newValue ?? ''))
    if (!r.ok || !preds.is_valid(String(state.newValue ?? ''), state.id)) return false
    const nums = rowNumbers(gantt, true)
    const wanted = r.refs.map((ref) => ({ source: nums.byNum.get(ref.num)!, type: ref.type, lag: ref.lag }))
    const target = state.id
    const task = g.getTask(target)
    for (const lid of [...(task.$target ?? [])]) {
      const link = g.getLink(lid)
      const same = wanted.find((w) => w.source === String(link.source) && w.type === String(link.type) && w.lag === (Number(link.lag) || 0))
      if (!same) g.deleteLink(lid)
    }
    for (const w of wanted) {
      const exists = (g.getTask(target).$target ?? []).some((lid: string) => {
        const l = g.getLink(lid)
        return String(l.source) === w.source && String(l.type) === w.type && (Number(l.lag) || 0) === w.lag
      })
      if (!exists) g.addLink({ source: w.source, target, type: w.type, lag: w.lag })
    }
    return false
  })
  return () => {
    editors.detachEvent(guard)
    editors.detachEvent(save)
    g.detachEvent(renumber)
  }
}

/** Opens the editor of the cell under a plain click, if its column has one. */
export function startEditAt(gantt: GanttStatic, target: EventTarget | null): void {
  const editors = (gantt as any).ext.inlineEditors
  const cell = editors.locateCell(target)
  if (!cell || !editors.getEditorConfig(cell.columnName)) return
  const state = editors.getState()
  if (editors.isVisible() && state.id == cell.id && state.columnName == cell.columnName) return
  editors.startEdit(cell.id, cell.columnName)
}
