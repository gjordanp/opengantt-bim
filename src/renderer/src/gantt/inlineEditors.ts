import type { GanttStatic } from 'dhtmlx-gantt'
import { previousDay } from '@shared/plan'
import { isPlaceholder } from './placeholder'

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

  // The dates and progress of a parent task come from its children, and the empty row is not a task.
  const derived = new Set(['start_date', 'end_date', 'duration', 'progress'])
  const editors = g.ext.inlineEditors
  const guard = editors.attachEvent('onBeforeEditStart', (state: { id: string | number; columnName: string }) => {
    const task = g.getTask(state.id)
    if (isPlaceholder(task)) return false
    if (derived.has(state.columnName) && (g.hasChild(state.id) || task.type === g.config.types.project)) return false
    return true
  })
  return () => editors.detachEvent(guard)
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
