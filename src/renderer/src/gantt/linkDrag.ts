import type { GanttStatic } from 'dhtmlx-gantt'

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** What each kind of link is called, from the side of the first task to the side of the second. */
const KIND: Record<string, string> = {
  '0': 'Fin a inicio',
  '1': 'Inicio a inicio',
  '2': 'Fin a fin',
  '3': 'Inicio a fin'
}

/**
 * Creating a link by dragging from the handle of a bar:
 *
 * - The dashed line starts at the centre of the handle. The gantt starts it where the mouse was pressed (plus half the
 *   handle), so pressing off-centre drew it off the node. The press is replayed at the handle's corner, which puts
 *   the start at its centre whatever part of it was pressed.
 * - The label that follows the mouse says, in Spanish, from where to where, what kind of link it makes, and whether
 *   it is allowed, instead of the library's English "Ciclo 2 (end)".
 */
export function installLinkDrag(gantt: GanttStatic, host: HTMLElement, labelOf: (taskId: string) => string): () => void {
  const g = gantt as any
  const previous = g.templates.drag_link

  g.templates.drag_link = (from: string, fromStart: boolean, to: string | null, toStart: boolean): string => {
    const side = (start: boolean): string => (start ? 'inicio' : 'fin')
    const row = (key: string, id: string, start: boolean): string =>
      `<div class="lk-row"><span class="lk-key">${key}</span><b>${esc(labelOf(id))}</b><span class="lk-side">${side(start)}</span></div>`
    let html = row('Desde', from, fromStart)
    if (!to) return html + '<div class="lk-hint">Suelta sobre el inicio o el fin de otra tarea</div>'
    html += row('Hasta', to, toStart)
    const type = g._get_link_type(fromStart, toStart)
    const allowed = g.isLinkAllowed(from, to, fromStart, toStart)
    return html + (allowed ? `<div class="lk-kind">${KIND[String(type)] ?? ''}</div>` : '<div class="lk-deny">No se puede: ya existe o cierra un ciclo</div>')
  }

  let replaying = false
  const onDown = (e: MouseEvent): void => {
    if (replaying || e.button !== 0) return
    const point = (e.target as HTMLElement | null)?.closest?.('.gantt_link_point') as HTMLElement | null
    if (!point || e.target !== point) return
    const rect = point.getBoundingClientRect()
    e.preventDefault()
    e.stopImmediatePropagation()
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: rect.left,
      clientY: rect.top,
      screenX: e.screenX - (e.clientX - rect.left),
      screenY: e.screenY - (e.clientY - rect.top),
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    }
    replaying = true
    try {
      point.dispatchEvent(new MouseEvent('mousedown', init))
    } finally {
      replaying = false
    }
  }
  host.addEventListener('mousedown', onDown, true)

  return () => {
    host.removeEventListener('mousedown', onDown, true)
    g.templates.drag_link = previous
  }
}
