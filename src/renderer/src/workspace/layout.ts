import type { DockviewApi } from 'dockview-react'

export interface PanelDef {
  id: string
  title: string
}

export const PANELS: PanelDef[] = [
  { id: 'gantt', title: 'Gantt' },
  { id: 'viewer', title: 'Visor 3D' },
  { id: 'task', title: 'Asignación' },
  { id: 'groups', title: 'Grupos' },
  { id: 'props', title: 'Propiedades' },
  { id: 'models', title: 'Modelos' },
  { id: 'calendar', title: 'Calendario' }
]

export type PresetId = 'classic' | 'stacked' | 'bim' | 'gantt'

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'classic', label: 'Gantt | Visor', hint: 'Gantt a la izquierda, visor y herramientas a la derecha' },
  { id: 'stacked', label: 'Gantt / Visor', hint: 'Gantt arriba, visor y herramientas abajo' },
  { id: 'bim', label: 'Visor grande', hint: 'Visor 3D protagonista, Gantt abajo' },
  { id: 'gantt', label: 'Solo Gantt', hint: 'Solo el cronograma' }
]

const LAYOUT_KEY = 'ogbim.layout.v2'
const KNOWN = new Set(PANELS.map((p) => p.id))

const title = (id: string): string => PANELS.find((p) => p.id === id)?.title ?? id
const panel = (api: DockviewApi, id: string, extra: Record<string, unknown> = {}): void => {
  api.addPanel({ id, component: id, title: title(id), ...extra })
}

/** Tabs that share one group: the BIM tools. */
function addTools(api: DockviewApi, first: Record<string, unknown>): void {
  panel(api, 'task', first)
  panel(api, 'groups', { position: { referencePanel: 'task', direction: 'within' } })
  panel(api, 'props', { position: { referencePanel: 'task', direction: 'within' } })
  panel(api, 'models', { position: { referencePanel: 'task', direction: 'within' } })
  api.getPanel('task')?.api.setActive()
}

export function applyPreset(api: DockviewApi, preset: PresetId): void {
  api.clear()
  panel(api, 'gantt')
  if (preset === 'gantt') return
  if (preset === 'classic') {
    panel(api, 'viewer', { position: { referencePanel: 'gantt', direction: 'right' }, initialWidth: 640 })
    addTools(api, { position: { referencePanel: 'viewer', direction: 'below' }, initialHeight: 260 })
  } else if (preset === 'stacked') {
    panel(api, 'viewer', { position: { referencePanel: 'gantt', direction: 'below' }, initialHeight: 420 })
    addTools(api, { position: { referencePanel: 'viewer', direction: 'right' }, initialWidth: 420 })
  } else {
    // 'bim': viewer first, gantt under it.
    api.clear()
    panel(api, 'viewer')
    panel(api, 'gantt', { position: { referencePanel: 'viewer', direction: 'below' }, initialHeight: 300 })
    addTools(api, { position: { referencePanel: 'viewer', direction: 'right' }, initialWidth: 380 })
  }
}

export function saveLayout(api: DockviewApi): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
  } catch {
    /* storage unavailable: the layout just won't be remembered */
  }
}

/** Restores the saved layout; false when there is none or it can't be used. */
export function restoreLayout(api: DockviewApi): boolean {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return false
    const saved = JSON.parse(raw) as { panels?: Record<string, { contentComponent?: string }> }
    const panels = Object.values(saved.panels ?? {})
    if (panels.length === 0 || !panels.every((p) => p.contentComponent && KNOWN.has(p.contentComponent))) return false
    api.fromJSON(saved as never)
    return api.panels.length > 0
  } catch {
    return false
  }
}

export function resetLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_KEY)
  } catch {
    /* ignore */
  }
}

/** Opens a closed panel next to the active one, or floats it. */
export function openPanel(api: DockviewApi, id: string): void {
  const existing = api.getPanel(id)
  if (existing) {
    existing.api.setActive()
    return
  }
  if (id === 'calendar' || !api.activePanel) {
    panel(api, id, { floating: { width: 360, height: 340, x: 80, y: 90 } })
  } else {
    panel(api, id, { position: { referencePanel: api.activePanel.id, direction: 'within' } })
  }
}
