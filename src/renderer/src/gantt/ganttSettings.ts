/** Columns of the gantt's table that can be shown or hidden ("Tarea" is always there). */
export const COLUMN_DEFS = [
  { id: 'start_date', label: 'Inicio' },
  { id: 'end_date', label: 'Fin' },
  { id: 'duration', label: 'Días' },
  { id: 'progress', label: 'Avance %' },
  { id: 'location_surface', label: 'Superficie' },
  { id: 'bim', label: 'BIM' },
  { id: 'deadline', label: 'Plazo' },
  { id: 'constraint', label: 'Restricción' }
] as const

export type ColumnId = (typeof COLUMN_DEFS)[number]['id']

/** How the gantt looks, kept on this computer (not part of the project). */
export interface GanttSettings {
  /** Leave the non-working weekdays of the calendar out of the timeline. */
  hideWeekends: boolean
  columns: Record<ColumnId, boolean>
  /** What the S-curve's planned line follows: the tasks' current dates (like PRO) or their baseline. */
  scurvePlan: 'current' | 'baseline'
}

export const DEFAULT_GANTT_SETTINGS: GanttSettings = {
  hideWeekends: false,
  scurvePlan: 'current',
  columns: { start_date: true, end_date: false, duration: true, progress: false, location_surface: true, bim: true, deadline: false, constraint: false }
}

const KEY = 'ogbim.ganttSettings'

export function loadGanttSettings(): GanttSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GanttSettings> | null
    if (!raw) return DEFAULT_GANTT_SETTINGS
    return {
      hideWeekends: raw.hideWeekends === true,
      scurvePlan: raw.scurvePlan === 'baseline' ? 'baseline' : 'current',
      // Columns added later keep their default.
      columns: { ...DEFAULT_GANTT_SETTINGS.columns, ...(raw.columns ?? {}) }
    }
  } catch {
    return DEFAULT_GANTT_SETTINGS
  }
}

export function saveGanttSettings(settings: GanttSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private window or blocked storage: the settings just last for this session.
  }
}
