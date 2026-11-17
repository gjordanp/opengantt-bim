import type { GanttStatic } from 'dhtmlx-gantt'

/**
 * Moving around the chart by dragging with the wheel pressed (the middle button), horizontally and vertically.
 *
 * The gantt library has a `drag_timeline` plugin for this (it works in the Community build too), but it drags with
 * any button, the left one included, which would fight with selecting, editing and moving bars. Here only the middle
 * button pans. Over the table it moves the rows up and down only.
 */
export function installPanDrag(gantt: GanttStatic, host: HTMLElement): () => void {
  const g = gantt as any
  let start: { x: number; y: number; sx: number; sy: number; vertical: boolean } | null = null

  const onDown = (e: MouseEvent): void => {
    if (e.button !== 1) return
    const target = e.target as HTMLElement
    const inChart = !!target.closest('.gantt_task')
    const inTable = !!target.closest('.gantt_grid')
    if (!inChart && !inTable) return
    // The browser would start its own auto-scroll with the middle button.
    e.preventDefault()
    const s = g.getScrollState()
    start = { x: e.clientX, y: e.clientY, sx: s.x, sy: s.y, vertical: !inChart }
    host.classList.add('panning')
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
  }
  const onMove = (e: MouseEvent): void => {
    if (!start) return
    // Dropped the button outside the window: stop instead of dragging with nothing pressed.
    if ((e.buttons & 4) === 0) return onUp()
    g.scrollTo(start.vertical ? null : Math.max(0, start.sx - (e.clientX - start.x)), Math.max(0, start.sy - (e.clientY - start.y)))
  }
  function onUp(): void {
    start = null
    host.classList.remove('panning')
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mouseup', onUp, true)
  }
  // A middle click would otherwise also "click" the element under it.
  const onAux = (e: MouseEvent): void => {
    if (e.button === 1) e.preventDefault()
  }

  host.addEventListener('mousedown', onDown, true)
  host.addEventListener('auxclick', onAux, true)
  return () => {
    host.removeEventListener('mousedown', onDown, true)
    host.removeEventListener('auxclick', onAux, true)
    onUp()
  }
}
