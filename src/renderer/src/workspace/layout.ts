import type { DockviewApi } from 'dockview-react'

export interface PanelDef {
  id: string
  title: string
}

export const PANELS: PanelDef[] = [
  { id: 'gantt', title: 'Gantt' },
  { id: 'viewer', title: 'Visor 3D' },
  { id: 'calendar', title: 'Calendario' },
  { id: 'scurve', title: 'Curva S (panel)' }
]

export type PresetId = 'classic' | 'stacked' | 'bim' | 'gantt' | 'viewer'

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'classic', label: 'Lado a lado', hint: 'Gantt a la izquierda, visor 3D y herramientas a la derecha' },
  { id: 'stacked', label: 'Uno sobre otro', hint: 'Gantt arriba, visor 3D y herramientas abajo' },
  { id: 'bim', label: 'Visor arriba', hint: 'Visor 3D grande arriba, Gantt abajo' },
  { id: 'gantt', label: 'Solo Gantt', hint: 'Solo el cronograma' },
  { id: 'viewer', label: 'Solo visor', hint: 'Solo el modelo 3D y sus herramientas' }
]

const LAYOUT_KEY = 'ogbim.layout.v4'
const KNOWN = new Set(PANELS.map((p) => p.id))

const title = (id: string): string => PANELS.find((p) => p.id === id)?.title ?? id
const panel = (api: DockviewApi, id: string, extra: Record<string, unknown> = {}): void => {
  api.addPanel({ id, component: id, title: title(id), ...extra })
}

export function applyPreset(api: DockviewApi, preset: PresetId): void {
  api.clear()
  if (preset === 'viewer') {
    panel(api, 'viewer')
    return
  }
  panel(api, 'gantt')
  if (preset === 'gantt') return
  if (preset === 'classic') {
    panel(api, 'viewer', { position: { referencePanel: 'gantt', direction: 'right' }, initialWidth: 760 })
  } else if (preset === 'stacked') {
    panel(api, 'viewer', { position: { referencePanel: 'gantt', direction: 'below' }, initialHeight: 420 })
  } else {
    // 'bim': viewer first, gantt under it.
    api.clear()
    panel(api, 'viewer')
    panel(api, 'gantt', { position: { referencePanel: 'viewer', direction: 'below' }, initialHeight: 300 })
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
  if (id === 'scurve' && api.getPanel('gantt')) {
    // The curve is read against the timeline: put it right under the gantt.
    panel(api, id, { position: { referencePanel: 'gantt', direction: 'below' }, initialHeight: 260 })
  } else if (id === 'calendar' || !api.activePanel) {
    panel(api, id, { floating: { width: 360, height: 340, x: 80, y: 90 } })
  } else {
    panel(api, id, { position: { referencePanel: api.activePanel.id, direction: 'within' } })
  }
}
