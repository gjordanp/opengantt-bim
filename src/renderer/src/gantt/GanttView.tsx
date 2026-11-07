import { useEffect, useRef } from 'react'
import { Gantt, type GanttStatic } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import type { ProjectData } from '@shared/model'
import { computeLobRowHeights, findLobSections, type LobTaskInput } from '@shared/lob'
import { LobOverlay, colorsByName } from './lobLayer'
import './gantt.css'

const BASE_ROW_HEIGHT = 30

interface Props {
  project: ProjectData
  lobMode: boolean
}

function lobInputs(gantt: GanttStatic): LobTaskInput[] {
  const inputs: LobTaskInput[] = []
  gantt.eachTask((task: any) => {
    inputs.push({
      id: String(task.id),
      parent: String(task.parent),
      location_surface: Number(task.location_surface) || undefined
    })
  })
  return inputs
}

export default function GanttView({ project, lobMode }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<GanttStatic | null>(null)
  const overlayRef = useRef<LobOverlay | null>(null)
  // Read by the gantt callbacks, which are bound once at init.
  const lobSectionsRef = useRef<Set<string>>(new Set())
  const lobModeRef = useRef(lobMode)
  lobModeRef.current = lobMode

  // Create the gantt instance once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const gantt = Gantt.getGanttInstance()
    ganttRef.current = gantt

    gantt.config.date_format = '%Y-%m-%d'
    gantt.config.row_height = BASE_ROW_HEIGHT
    gantt.config.scale_height = 50
    gantt.config.columns = [
      { name: 'text', label: 'Tarea', tree: true, width: 220, resize: true },
      { name: 'start_date', label: 'Inicio', align: 'center', width: 90, resize: true },
      { name: 'duration', label: 'Días', align: 'center', width: 60, resize: true },
      { name: 'location_surface', label: 'Superficie', align: 'center', width: 80, resize: true }
    ]

    // A LOB section collapsed by LOB mode already shows its duration through
    // the diagonal fan, so its own summary bar would only duplicate/overlap it.
    gantt.config.type_renderers['project'] = (task: any, defaultRender: (t: any) => HTMLElement) => {
      if (lobModeRef.current && lobSectionsRef.current.has(String(task.id)) && !task.$open) {
        const empty = document.createElement('div')
        empty.style.display = 'none'
        return empty
      }
      return defaultRender(task)
    }

    gantt.init(host)
    // Handy for poking at the instance from the devtools console while developing.
    if (import.meta.env.DEV) (window as unknown as { __gantt: GanttStatic }).__gantt = gantt

    gantt.ext.zoom.init({
      levels: [
        { name: 'year', scale_height: 50, min_column_width: 80, scales: [{ unit: 'year', step: 1, format: '%Y' }] },
        {
          name: 'month',
          scale_height: 50,
          min_column_width: 90,
          scales: [
            { unit: 'year', step: 1, format: '%Y' },
            { unit: 'month', step: 1, format: '%M' }
          ]
        },
        {
          name: 'week',
          scale_height: 50,
          min_column_width: 50,
          scales: [
            { unit: 'month', step: 1, format: '%M %Y' },
            { unit: 'week', step: 1, format: 'Sem %W' }
          ]
        },
        {
          name: 'day',
          scale_height: 50,
          min_column_width: 40,
          scales: [
            { unit: 'month', step: 1, format: '%M %Y' },
            { unit: 'day', step: 1, format: '%d' }
          ]
        }
      ],
      useKey: 'ctrlKey',
      trigger: 'wheel',
      element: () => gantt.$root.querySelector('.gantt_task') as HTMLElement
    })
    gantt.ext.zoom.setLevel('month')

    return () => {
      overlayRef.current?.destroy()
      overlayRef.current = null
      ganttRef.current = null
      gantt.destructor()
    }
  }, [])

  // Load the project whenever it changes.
  useEffect(() => {
    const gantt = ganttRef.current
    if (!gantt) return
    gantt.clearAll()
    gantt.parse({ data: project.tasks, links: project.links })
  }, [project])

  // Apply / remove line-of-balance mode.
  useEffect(() => {
    const gantt = ganttRef.current
    if (!gantt) return

    const removeOverlay = (): void => {
      overlayRef.current?.destroy()
      overlayRef.current = null
    }

    const inputs = lobInputs(gantt)
    const sections = findLobSections(inputs)

    if (lobMode) {
      const heights = computeLobRowHeights(inputs, { baseRowHeight: BASE_ROW_HEIGHT })
      lobSectionsRef.current = sections

      for (const id of sections) {
        const task = gantt.getTask(id) as any
        if (task.$open) gantt.close(id)
        task.row_height = heights.get(id)
      }

      const names = [...sections].flatMap((id) =>
        gantt.getChildren(id).map((childId) => String((gantt.getTask(childId) as any).text))
      )
      removeOverlay()
      overlayRef.current = new LobOverlay(gantt, (id) => lobSectionsRef.current.has(String(id)), colorsByName(names))
      overlayRef.current.mount()
    } else {
      removeOverlay()
      for (const id of lobSectionsRef.current) {
        const task = gantt.getTask(id) as any
        delete task.row_height
        if (!task.$open) gantt.open(id)
      }
      lobSectionsRef.current = new Set()
    }

    gantt.render()
  }, [lobMode, project])

  return <div ref={hostRef} className="gantt-host" />
}
