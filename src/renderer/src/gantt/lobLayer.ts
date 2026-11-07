import type { GanttStatic } from 'dhtmlx-gantt'

const PALETTE = ['#3498db', '#2ecc71', '#e74c3c', '#e67e22', '#9b59b6', '#85c1e9', '#27ae60', '#c0392b', '#f39c12', '#7d3c98']

/** Stable colour per activity name, so the same activity keeps its colour across sections. */
export function colorsByName(names: string[]): Record<string, string> {
  const colors: Record<string, string> = {}
  for (const name of names) {
    if (!(name in colors)) colors[name] = PALETTE[Object.keys(colors).length % PALETTE.length]
  }
  return colors
}

/** All descendants of `id` that have no children of their own, in display order. */
export function leafDescendants(gantt: GanttStatic, id: string | number): (string | number)[] {
  const leaves: (string | number)[] = []
  const walk = (parent: string | number): void => {
    for (const child of gantt.getChildren(parent)) {
      if (gantt.hasChild(child)) walk(child)
      else leaves.push(child)
    }
  }
  walk(id)
  return leaves
}

interface RowPosition {
  top: number
  height: number
  rowHeight: number
}

/**
 * One diagonal line for an activity inside a collapsed LOB section: it starts
 * at the section row's top at the activity's start and ends at the row's bottom
 * at the activity's end, so its slope reflects the activity's pace.
 */
function diagonal(
  row: RowPosition,
  child: { left: number; width: number },
  label: string,
  tooltip: string,
  color: string
): HTMLElement {
  const line = document.createElement('div')
  const angle = Math.atan2(row.rowHeight, child.width)

  line.className = 'lob-line'
  line.style.cssText = [
    'position:absolute',
    // `top` from getTaskPosition is the bar's top inside the row; step back to the row's top.
    `top:${row.top - (row.rowHeight - row.height) / 2}px`,
    `left:${child.left}px`,
    `width:${child.width / Math.cos(angle)}px`,
    'height:4px',
    'border-radius:1px',
    'transform-origin:left center',
    `transform:rotate(${angle}rad)`,
    `background:${color}`,
    'opacity:0.85',
    'pointer-events:auto'
  ].join(';')
  line.title = tooltip

  const text = document.createElement('span')
  text.textContent = label
  text.style.cssText = `position:absolute;left:0;top:6px;font-size:10px;font-weight:600;color:${color};white-space:nowrap`
  line.appendChild(text)
  return line
}

/**
 * Draws the fan of diagonals for every collapsed LOB section.
 *
 * The community gantt edition has no `addTaskLayer`, so this keeps its own
 * overlay inside the timeline data area (the element the bars live in, so it
 * scrolls with them) and redraws it after every gantt render.
 */
export class LobOverlay {
  private el: HTMLDivElement | null = null
  private eventId: string | null = null

  constructor(
    private readonly gantt: GanttStatic,
    private readonly isSection: (id: string | number) => boolean,
    private readonly colors: Record<string, string>
  ) {}

  mount(): void {
    this.eventId = this.gantt.attachEvent('onGanttRender', () => this.draw())
    this.draw()
  }

  destroy(): void {
    if (this.eventId) this.gantt.detachEvent(this.eventId)
    this.eventId = null
    this.el?.remove()
    this.el = null
  }

  private ensureElement(): HTMLDivElement | null {
    const host = this.gantt.$task_data as HTMLElement | undefined
    if (!host) return null
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.className = 'lob-overlay'
      this.el.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:5'
    }
    // The gantt can rebuild its data area; re-attach if we were dropped.
    if (this.el.parentElement !== host) host.appendChild(this.el)
    return this.el
  }

  private draw(): void {
    const el = this.ensureElement()
    if (!el) return
    el.replaceChildren()

    const format = this.gantt.date.date_to_str('%d/%m/%Y')
    this.gantt.eachTask((task: any) => {
      if (task.$open || !this.isSection(task.id)) return
      const row = this.gantt.getTaskPosition(task) as RowPosition

      for (const childId of leafDescendants(this.gantt, task.id)) {
        const child = this.gantt.getTask(childId) as any
        const pos = this.gantt.getTaskPosition(child) as { left: number; width: number }
        const tooltip = `${child.text}\nInicio: ${format(child.start_date)}\nTérmino: ${format(child.end_date)}`
        el.appendChild(diagonal(row, pos, child.text, tooltip, this.colors[child.text] ?? '#3498db'))
      }
    })
  }
}
