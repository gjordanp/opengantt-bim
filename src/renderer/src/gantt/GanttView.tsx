import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { Gantt, type GanttStatic } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { installIgnoreTime } from './hideTime'
import type { ProjectData } from '@shared/model'
import { History } from '@shared/history'
import { computeLobRowHeights, findLobSections, type LobTaskInput } from '@shared/lob'
import { TodayLine } from './todayLine'
import { toDay, weekCalendar } from '@shared/scheduling'
import type { ColumnId, GanttSettings } from './ganttSettings'
import type { TaskSpan } from '@shared/bim4d'
import { computeSCurve, localTodayDay, type SCurveTask } from '@shared/scurve'
import { SCurveOverlay } from './scurveLayer'
import { LobOverlay, colorsByName } from './lobLayer'
import { autoSchedule, dateToIso, normalizeDuration, type AutoScheduleOutcome } from './autoSchedule'
import './theme-light.css'
import './gantt.css'

const BASE_ROW_HEIGHT = 30

interface Props {
  project: ProjectData
  lobMode: boolean
  /** Reschedule dependent tasks whenever tasks or links change. */
  autoScheduling: boolean
  /** Highlight the critical path. */
  showCritical: boolean
  /** Draw the planned / real progress curve over the timeline. */
  showScurve: boolean
  /** Volume each detail task is worth (task id -> volume). When given, the curve is by volume instead of by working days. */
  volumeWeights?: Map<string, number> | null
  /** Look of the gantt: hidden weekends and visible columns. */
  settings: GanttSettings
  /** Called after every scheduling run. */
  onScheduled?: (outcome: AutoScheduleOutcome) => void
  /** Called with a snapshot after every user edit (not on load). */
  onChange?: (data: ProjectData) => void
  /** Imperative undo/redo. */
  /** Non-working days and working weekdays; drive the scheduler. */
  holidays?: string[]
  workWeek?: number[]
  /** Called when the user selects a task (null when the selection is cleared). */
  onTaskSelect?: (task: { id: string; text: string } | null) => void
  /** Number of BIM elements tied to each task id; shown in the BIM column. */
  bimCounts?: Record<string, number>
  ref?: Ref<GanttHandle>
  /** Called when undo/redo availability changes. */
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void
}

export interface GanttHandle {
  undo(): void
  redo(): void
  /** Selects a task and scrolls to it. */
  selectTask(id: string): void
  /** Name of a task, if it exists. */
  taskText(id: string): string | undefined
  /** Start and (exclusive) end of every task, in days since the epoch. */
  spans(): TaskSpan[]
  /** The detail tasks (no summaries or milestones) with their span and progress, for the S-curve. */
  progressTasks(): SCurveTask[]
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

export default function GanttView({ project, lobMode, autoScheduling, showCritical, showScurve, volumeWeights, settings, onScheduled, onChange, holidays, workWeek, onTaskSelect, bimCounts, ref, onHistoryChange }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<GanttStatic | null>(null)
  const overlayRef = useRef<LobOverlay | null>(null)
  const todayRef = useRef<TodayLine | null>(null)
  // Read by the gantt callbacks, which are bound once at init.
  const lobSectionsRef = useRef<Set<string>>(new Set())
  const lobModeRef = useRef(lobMode)
  lobModeRef.current = lobMode
  const autoSchedulingRef = useRef(autoScheduling)
  autoSchedulingRef.current = autoScheduling
  const showCriticalRef = useRef(showCritical)
  showCriticalRef.current = showCritical
  const scurveRef = useRef<SCurveOverlay | null>(null)
  const onScheduledRef = useRef(onScheduled)
  onScheduledRef.current = onScheduled
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const loadingRef = useRef(false)
  const onTaskSelectRef = useRef(onTaskSelect)
  onTaskSelectRef.current = onTaskSelect
  const bimCountsRef = useRef(bimCounts)
  bimCountsRef.current = bimCounts
  const calendar = weekCalendar({ holidays, workWeek: workWeek?.length ? workWeek : undefined })
  const calendarRef = useRef(calendar)
  calendarRef.current = calendar
  const settingsRef = useRef({ holidays, workWeek })
  settingsRef.current = { holidays, workWeek }
  const snapshot = (): ProjectData | null => {
    const gantt = ganttRef.current
    if (!gantt) return null
    const { data, links } = gantt.serialize() as { data: any[]; links: any[] }
    return {
      name: project.name,
      holidays: settingsRef.current.holidays ?? [],
      ...(settingsRef.current.workWeek ? { workWeek: settingsRef.current.workWeek } : {}),
      tasks: data.map((t) => ({
        id: String(t.id),
        text: String(t.text ?? ''),
        start_date: String(t.start_date),
        duration: Number(t.duration) || 0,
        progress: Number(t.progress) || 0,
        parent: String(t.parent ?? '0'),
        ...(t.type ? { type: t.type } : {}),
        ...(t.open !== undefined ? { open: Boolean(t.open) } : {}),
        ...(Number(t.location_surface) ? { location_surface: Number(t.location_surface) } : {})
      })),
      links: links.map((l) => ({
        id: String(l.id),
        source: String(l.source),
        target: String(l.target),
        type: String(l.type) as '0' | '1' | '2' | '3',
        ...(l.lag ? { lag: Number(l.lag) } : {})
      }))
    }
  }
  const historyRef = useRef(new History<ProjectData>())
  const onHistoryChangeRef = useRef(onHistoryChange)
  onHistoryChangeRef.current = onHistoryChange
  const notifyHistory = (): void =>
    onHistoryChangeRef.current?.({ canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo })
  const emitChange = (): void => {
    const snap = snapshot()
    if (!snap) return
    historyRef.current.push(snap)
    notifyHistory()
    onChangeRef.current?.(snap)
  }
  // Replaces the gantt's contents with a stored snapshot (undo/redo) and saves it.
  const restore = (snap: ProjectData | undefined): void => {
    const gantt = ganttRef.current
    if (!gantt || !snap) return
    loadingRef.current = true
    try {
      gantt.clearAll()
      gantt.parse({ data: structuredClone(snap.tasks), links: structuredClone(snap.links) })
      runScheduleRef.current()
      applyLobRef.current()
    } finally {
      loadingRef.current = false
    }
    notifyHistory()
    onChangeRef.current?.({ ...snap, holidays: settingsRef.current.holidays ?? [], workWeek: settingsRef.current.workWeek })
  }
  const allColumnsRef = useRef<any[]>([])
  const visibleColumns = (all: any[], s: GanttSettings): any[] => all.filter((c) => c.name === 'text' || s.columns[c.name as ColumnId] !== false)
  const ganttSettingsRef = useRef(settings)
  ganttSettingsRef.current = settings
  const volumeWeightsRef =useRef<Map<string, number> | null>(volumeWeights ?? null)
  volumeWeightsRef.current = volumeWeights ?? null
  // Detail tasks (no summaries, no milestones) with their span and progress: what the S-curve adds up.
  const collectProgressTasks = (): SCurveTask[] => {
    const gantt = ganttRef.current
    const out: SCurveTask[] = []
    gantt?.eachTask((t: any) => {
      if (gantt.hasChild(t.id) || t.type === 'project' || !t.start_date || !t.end_date) return
      const weights = volumeWeightsRef.current
      out.push({
        id: String(t.id),
        start: toDay(dateToIso(t.start_date)),
        end: toDay(dateToIso(t.end_date)),
        progress: Number(t.progress) || 0,
        // By volume: what the task's elements are worth; without a weight the curve falls back to working days.
        ...(weights ? { weight: weights.get(String(t.id)) ?? 0 } : {})
      })
    })
    return out
  }
  const collectRef = useRef(collectProgressTasks)
  collectRef.current = collectProgressTasks

  useImperativeHandle(ref, () => ({
    undo: () => restore(historyRef.current.undo()),
    redo: () => restore(historyRef.current.redo()),
    selectTask: (id) => {
      const gantt = ganttRef.current
      if (!gantt || !gantt.isTaskExists(id)) return
      gantt.showTask(id)
      gantt.selectTask(id)
    },
    spans: () => {
      const gantt = ganttRef.current
      const out: TaskSpan[] = []
      gantt?.eachTask((t: any) => {
        if (t.start_date && t.end_date) {
          out.push({ id: String(t.id), start: toDay(dateToIso(t.start_date)), end: toDay(dateToIso(t.end_date)) })
        }
      })
      return out
    },
    progressTasks: () => collectProgressTasks(),
    taskText: (id) => {
      const gantt = ganttRef.current
      return gantt && gantt.isTaskExists(id) ? String((gantt.getTask(id) as any).text ?? '') : undefined
    }
  }))
  const emitChangeRef = useRef(emitChange)
  emitChangeRef.current = emitChange
  const criticalRef = useRef<Set<string>>(new Set())
  // True while we write scheduled dates back, so the update events that
  // triggers don't start another scheduling run.
  const schedulingRef = useRef(false)

  const runSchedule = (): void => {
    const gantt = ganttRef.current
    if (!gantt || schedulingRef.current) return
    schedulingRef.current = true
    try {
      const outcome = autoSchedule(gantt, calendarRef.current)
      criticalRef.current = outcome.critical
      gantt.render()
      onScheduledRef.current?.(outcome)
    } finally {
      schedulingRef.current = false
    }
  }
  const runScheduleRef = useRef(runSchedule)
  runScheduleRef.current = runSchedule

  // Create the gantt instance once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const gantt = Gantt.getGanttInstance()
    ganttRef.current = gantt

    gantt.config.date_format = '%Y-%m-%d'
    gantt.config.row_height = BASE_ROW_HEIGHT
    gantt.config.scale_height = 50
    const allColumns = [
      { name: 'text', label: 'Tarea', tree: true, width: 220, resize: true },
      { name: 'start_date', label: 'Inicio', align: 'center', width: 100, resize: true },
      {
        name: 'end_date',
        label: 'Fin',
        align: 'center',
        width: 100,
        resize: true,
        // The gantt's end is exclusive: show the last day of work.
        template: (task: any) =>
          task.end_date ? dateToIso(task.end_date > task.start_date ? new Date(task.end_date.getTime() - 86400000) : task.end_date) : ''
      },
      { name: 'duration', label: 'Días', align: 'center', width: 60, resize: true },
      { name: 'progress', label: 'Avance', align: 'center', width: 70, resize: true, template: (task: any) => `${Math.round((Number(task.progress) || 0) * 100)}%` },
      { name: 'location_surface', label: 'Superficie', align: 'center', width: 80, resize: true },
      {
        name: 'bim',
        label: 'BIM',
        align: 'center',
        width: 60,
        template: (task: any) => String(bimCountsRef.current?.[String(task.id)] || '')
      }
    ]
    // The Community edition has no column `hide`: the table shows exactly the columns in this list.
    allColumnsRef.current = allColumns
    gantt.config.columns = visibleColumns(allColumns, ganttSettingsRef.current)

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

    gantt.templates.task_class = (_start: Date, _end: Date, task: any) =>
      showCriticalRef.current && criticalRef.current.has(String(task.id)) ? 'critical-task' : ''

    gantt.init(host)
    installIgnoreTime(gantt)
    // The gantt only follows window resizes; its pane can also change size (BIM viewer).
    const resizeObserver = new ResizeObserver(() => {
      // A callback can still arrive after the instance was destroyed (remount).
      if (ganttRef.current === gantt) gantt.setSizes()
    })
    resizeObserver.observe(host)
    todayRef.current = new TodayLine(gantt)
    todayRef.current.mount()
    // Handy for poking at the instance from the devtools console while developing.
    if (import.meta.env.DEV) (window as unknown as { __gantt: GanttStatic }).__gantt = gantt

    // Reschedule when the structure or the data changes.
    const reschedule = (): void => {
      if (schedulingRef.current || loadingRef.current) return
      if (autoSchedulingRef.current) runScheduleRef.current()
      emitChangeRef.current()
    }
    const eventNames = [
      'onAfterTaskAdd',
      'onAfterTaskUpdate',
      'onAfterTaskDelete',
      'onAfterLinkAdd',
      'onAfterLinkUpdate',
      'onAfterLinkDelete'
    ] as const
    const eventIds = eventNames.map((name) => gantt.attachEvent(name, reschedule))
    // A dragged/resized bar comes back with a calendar-day duration; convert it first.
    eventIds.push(
      gantt.attachEvent('onTaskSelected', (id: string | number) => {
        onTaskSelectRef.current?.({ id: String(id), text: String((gantt.getTask(id) as any).text ?? '') })
      }),
      gantt.attachEvent('onTaskUnselected', () => {
        onTaskSelectRef.current?.(null)
      })
    )
    eventIds.push(
      gantt.attachEvent('onAfterTaskDrag', (id: string | number) => {
        if (schedulingRef.current) return
        normalizeDuration(gantt, id, calendarRef.current)
        reschedule()
      })
    )

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
      for (const id of eventIds) gantt.detachEvent(id)
      overlayRef.current?.destroy()
      overlayRef.current = null
      scurveRef.current?.destroy()
      scurveRef.current = null
      todayRef.current?.destroy()
      todayRef.current = null
      ganttRef.current = null
      gantt.destructor()
    }
  }, [])

  // Non-working days and columns, whenever the settings (or the calendar they depend on) change.
  useEffect(() => {
    const gantt = ganttRef.current
    if (!gantt) return
    gantt.config.columns = visibleColumns(allColumnsRef.current, settings)
    // Hide every day the project calendar does not work (weekends and holidays), as the calendar's own rule says.
    gantt.ignore_time = settings.hideWeekends
      ? (date: Date) => !calendarRef.current.isWorkingDay(Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000))
      : () => false
    gantt.render()
  }, [settings, workWeek, holidays])

  // The curve drawn over the timeline, while it is switched on. Declared after the effect that creates the
  // gantt: a gantt created with the curve already on (a new layout) must find it to draw on.
  useEffect(() => {
    const gantt = ganttRef.current
    if (!gantt || !showScurve) return
    const overlay = new SCurveOverlay(gantt, () => computeSCurve(collectRef.current(), calendarRef.current, localTodayDay()))
    scurveRef.current = overlay
    overlay.mount()
    return () => {
      overlay.destroy()
      if (scurveRef.current === overlay) scurveRef.current = null
    }
  }, [showScurve, volumeWeights])


  // Load the project whenever it changes, then lay it out on the calendar.
  useEffect(() => {
    const gantt = ganttRef.current
    if (!gantt) return
    loadingRef.current = true
    try {
      gantt.clearAll()
      // The gantt keeps and mutates the objects it's given; hand it copies so the
      // project data (and a remount in React StrictMode) always starts clean.
      gantt.parse({ data: structuredClone(project.tasks), links: structuredClone(project.links) })
      runScheduleRef.current()
      const snap = snapshot()
      if (snap) historyRef.current.reset(snap)
      notifyHistory()
    } finally {
      loadingRef.current = false
    }
  }, [project])

  // Turning auto-scheduling on applies it right away; the critical path
  // highlight only needs a repaint.
  useEffect(() => {
    if (autoScheduling) runScheduleRef.current()
  }, [autoScheduling])

  useEffect(() => {
    ganttRef.current?.render()
  }, [showCritical, bimCounts])

  // A calendar change reschedules and is saved like any other edit.
  const calendarKey = `${holidays?.join(',') ?? ''}|${workWeek?.join(',') ?? ''}`
  const calendarProjectRef = useRef(project)
  useEffect(() => {
    // Opening another project brings its own calendar: that's a load, not an edit.
    if (calendarProjectRef.current !== project) {
      calendarProjectRef.current = project
      return
    }
    if (autoSchedulingRef.current) runScheduleRef.current()
    emitChangeRef.current()
  }, [calendarKey])

  // Apply / remove line-of-balance mode.
  const applyLob = (): void => {
    const gantt = ganttRef.current
    if (!gantt) return
    const lobMode = lobModeRef.current

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
  }
  const applyLobRef = useRef(applyLob)
  applyLobRef.current = applyLob
  useEffect(() => {
    applyLobRef.current()
  }, [lobMode, project])

  return <div ref={hostRef} className="gantt-host" />
}
