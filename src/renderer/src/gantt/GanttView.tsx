import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { Gantt, type GanttStatic } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { installIgnoreTime } from './hideTime'
import type { ProjectData } from '@shared/model'
import { History } from '@shared/history'
import { computeLobRowHeights, findLobSections, type LobTaskInput } from '@shared/lob'
import { TodayLine } from './todayLine'
import { installWorkTime } from './workTime'
import { installDragDurations, installMultiSelect, type MultiSelect } from './multiSelect'
import { PlanOverlay, parsePlanDates, planSideText, planTaskClasses } from './planLayer'
import { lateness, previousDay } from '@shared/plan'
import { CONSTRAINT_TYPES, constraintNeedsDate, constraintShort } from '@shared/constraints'
import { isoToDate } from './localDates'
import { toDay, weekCalendar } from '@shared/scheduling'
import type { ColumnId, GanttSettings } from './ganttSettings'
import type { TaskSpan } from '@shared/bim4d'
import { computeSCurve, localTodayDay, type SCurveTask } from '@shared/scurve'
import { SCurveOverlay } from './scurveLayer'
import { LobOverlay, colorsByName } from './lobLayer'
import { autoSchedule, dateToIso, type AutoScheduleOutcome } from './autoSchedule'
import './theme-light.css'
import './gantt.css'
import './lightbox.css'

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
  /**
   * Sets the baseline of every task from its current dates (`all`), only of those that have none (`missing`), or
   * removes every baseline (`clear`). Returns how many tasks changed. One undo step.
   */
  setBaselines(mode: 'all' | 'missing' | 'clear'): number
  /** How many tasks can have a baseline, and how many have one. */
  baselineInfo(): { tasks: number; withBaseline: number }
}

/**
 * A parent task drawn like MS Project's summary bar (and like the original Opengantt): a thin bar with a
 * triangle at each end. The element carries the task attribute so selecting and dragging keep working.
 */
function bracketBar(gantt: GanttStatic, task: any): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(gantt.config.task_attribute, String(task.id))
  el.className = `custom-project${(gantt as any).isSelectedTask?.(task.id) ? ' gantt_selected' : ''}`
  el.innerHTML = "<div class='project-left'></div><div class='project-right'></div>"
  const size = gantt.getTaskPosition(task) as { left: number; top: number; width: number; height: number }
  el.style.left = `${size.left}px`
  el.style.width = `${size.width}px`
  // 6 px of bar plus 9 px of triangles, centred in the space of the normal bar.
  el.style.top = `${size.top + Math.round((size.height - 15) / 2)}px`
  return el
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
  const planRef = useRef<PlanOverlay | null>(null)
  const multiRef = useRef<MultiSelect | null>(null)
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
        ...(Number(t.location_surface) ? { location_surface: Number(t.location_surface) } : {}),
        ...(t.baseline_start && t.baseline_end ? { baseline_start: String(t.baseline_start), baseline_end: String(t.baseline_end) } : {}),
        ...(t.deadline ? { deadline: String(t.deadline) } : {}),
        ...(t.constraint_type && t.constraint_type !== 'asap'
          ? { constraint_type: String(t.constraint_type), ...(t.constraint_date ? { constraint_date: String(t.constraint_date) } : {}) }
          : {})
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
        ...(weights ? { weight: weights.get(String(t.id)) ?? 0 } : {}),
        // The baseline span, for a plan that follows it.
        ...(t.baseline_start && t.baseline_end
          ? { plannedStart: toDay(dateToIso(t.baseline_start)), plannedEnd: toDay(dateToIso(t.baseline_end)) }
          : {})
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
      multiRef.current?.set([id])
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
    setBaselines: (mode) => {
      const gantt = ganttRef.current
      if (!gantt) return 0
      let changed = 0
      gantt.eachTask((t: any) => {
        const has = Boolean(t.baseline_start && t.baseline_end)
        if (mode === 'clear') {
          if (!has) return
          t.baseline_start = null
          t.baseline_end = null
        } else {
          // A task with no span (a milestone) has nothing to draw a baseline over.
          if (!t.start_date || !t.end_date || t.end_date <= t.start_date || (mode === 'missing' && has)) return
          t.baseline_start = new Date(t.start_date)
          t.baseline_end = new Date(t.end_date)
        }
        changed++
      })
      if (changed) {
        gantt.render()
        emitChangeRef.current()
      }
      return changed
    },
    baselineInfo: () => {
      const gantt = ganttRef.current
      let tasks = 0
      let withBaseline = 0
      gantt?.eachTask((t: any) => {
        if (t.start_date && t.end_date && t.end_date > t.start_date) tasks++
        if (t.baseline_start && t.baseline_end) withBaseline++
      })
      return { tasks, withBaseline }
    },
    taskText: (id) => {
      const gantt = ganttRef.current
      return gantt && gantt.isTaskExists(id) ? String((gantt.getTask(id) as any).text ?? '') : undefined
    }
  }))
  const emitChangeRef = useRef(emitChange)
  emitChangeRef.current = emitChange
  const criticalRef = useRef<Set<string>>(new Set())
  const conflictsRef = useRef<Set<string>>(new Set())
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
      conflictsRef.current = outcome.conflicts
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
          task.end_date ? dateToIso(task.end_date > task.start_date ? previousDay(task.end_date) : task.end_date) : ''
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
      },
      {
        name: 'deadline',
        label: 'Plazo',
        align: 'center',
        width: 90,
        resize: true,
        template: (task: any) => {
          if (!task.deadline) return ''
          const late = lateness(task)?.kind === 'deadline'
          return `${late ? '<span class="overdue-mark" title="Fuera de plazo">!</span> ' : ''}${dateToIso(task.deadline)}`
        }
      },
      {
        name: 'constraint',
        label: 'Restricción',
        align: 'center',
        width: 120,
        resize: true,
        template: (task: any) => {
          if (!task.constraint_type || task.constraint_type === 'asap') return ''
          const conflict = conflictsRef.current.has(String(task.id)) ? '<span class="overdue-mark" title="En conflicto con sus vínculos">!</span> ' : ''
          const date = constraintNeedsDate(task.constraint_type) && task.constraint_date ? ` ${dateToIso(task.constraint_date)}` : ''
          return `${conflict}${constraintShort(task.constraint_type)}${date}`
        }
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
      if (ganttSettingsRef.current.summaryStyle === 'bracket') return bracketBar(gantt, task)
      return defaultRender(task)
    }
    // The text inside the bars can be switched off (the name is in the table anyway).
    gantt.templates.task_text = (_start: Date, _end: Date, task: any) => (ganttSettingsRef.current.barText ? String(task.text ?? '') : '')

    // Dates the gantt does not know about (baseline, deadline) arrive as text: turn them into dates.
    gantt.attachEvent('onTaskLoading', (task: any) => {
      parsePlanDates(gantt, task)
      return true
    })
    gantt.templates.task_class = (_start: Date, end: Date, task: any) => {
      const classes = planTaskClasses(end, task)
      if (showCriticalRef.current && criticalRef.current.has(String(task.id))) classes.unshift('critical-task')
      if (conflictsRef.current.has(String(task.id))) classes.push('constraint-conflict')
      return classes.join(' ')
    }
    gantt.templates.rightside_text = (_start: Date, end: Date, task: any) => planSideText(end, task)
    // Sections of the edit window for the baseline and the deadline (each can be set or removed).
    gantt.locale.labels.section_baseline = 'Línea base'
    gantt.locale.labels.section_deadline = 'Plazo'
    gantt.locale.labels.baseline_enable_button = 'Fijar'
    gantt.locale.labels.baseline_disable_button = 'Quitar'
    gantt.locale.labels.deadline_enable_button = 'Fijar'
    gantt.locale.labels.deadline_disable_button = 'Quitar'
    gantt.locale.labels.section_constraint = 'Restricción'
    // The rest of the edit window and the dates of the timeline, in Spanish.
    Object.assign(gantt.locale.labels, {
      section_description: 'Descripción',
      section_time: 'Período',
      gantt_save_btn: 'Guardar',
      gantt_cancel_btn: 'Cancelar',
      gantt_delete_btn: 'Eliminar',
      icon_save: 'Guardar',
      icon_cancel: 'Cancelar',
      icon_delete: 'Eliminar',
      message_ok: 'Aceptar',
      message_cancel: 'Cancelar',
      confirm_deleting: 'La tarea se eliminará definitivamente. ¿Continuar?',
      confirm_link_deleting: 'El vínculo se eliminará. ¿Continuar?',
      confirm_deleting_title: 'Eliminar',
      days: 'días, hasta el',
      hours: 'horas',
      minutes: 'minutos'
    })
    Object.assign(gantt.locale.date, {
      month_full: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
      month_short: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
      day_full: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
      day_short: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
    })
    // The edit window's constraint section: a type and, for most types, a date. The Community edition has none.
    ;(gantt as any).form_blocks.constraint = {
      render: (section: { name: string }) =>
        `<div class="gantt_cal_ltext gantt_section_${section.name} constraint-section" style="height:42px">` +
        `<select class="constraint-type">${CONSTRAINT_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</select>` +
        `<input type="date" class="constraint-date"></div>`,
      set_value: (node: HTMLElement, _value: unknown, task: any) => {
        const type = node.querySelector<HTMLSelectElement>('.constraint-type')!
        const date = node.querySelector<HTMLInputElement>('.constraint-date')!
        type.value = task.constraint_type || 'asap'
        date.value = task.constraint_date ? dateToIso(task.constraint_date) : ''
        const sync = (): void => {
          date.style.display = constraintNeedsDate(type.value) ? '' : 'none'
        }
        type.onchange = sync
        sync()
      },
      // The gantt maps the two fields of the returned object onto the task (`constraint_type`, `constraint_date`).
      get_value: (node: HTMLElement) => {
        const type = node.querySelector<HTMLSelectElement>('.constraint-type')!.value
        const date = node.querySelector<HTMLInputElement>('.constraint-date')!.value
        return {
          constraint_type: type === 'asap' ? null : type,
          constraint_date: constraintNeedsDate(type) && date ? isoToDate(date) : null
        }
      },
      focus: () => undefined
    }
    // The typings only know the plain sections; the optional-duration ones take an object for `map_to`.
    gantt.config.lightbox.sections = [
      { name: 'description', height: 70, map_to: 'text', type: 'textarea', focus: true },
      { name: 'time', map_to: 'auto', type: 'duration' },
      { name: 'constraint', height: 42, map_to: 'constraint_type', type: 'constraint' },
      { name: 'baseline', map_to: { start_date: 'baseline_start', end_date: 'baseline_end' }, button: true, type: 'duration_optional' },
      { name: 'deadline', map_to: { start_date: 'deadline' }, button: true, type: 'duration_optional', single_date: true }
    ] as unknown as typeof gantt.config.lightbox.sections

    gantt.init(host)
    installIgnoreTime(gantt)
    installWorkTime(gantt, () => calendarRef.current)
    multiRef.current = installMultiSelect(gantt)
    // The gantt only follows window resizes; its pane can also change size (BIM viewer).
    const resizeObserver = new ResizeObserver(() => {
      // A callback can still arrive after the instance was destroyed (remount).
      if (ganttRef.current === gantt) gantt.setSizes()
    })
    resizeObserver.observe(host)
    todayRef.current = new TodayLine(gantt)
    todayRef.current.mount()
    planRef.current = new PlanOverlay(gantt)
    planRef.current.mount()
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
    // Moving tasks by dragging keeps their working-day durations, several at once when several are selected.
    const stopDrag = installDragDurations(gantt, () => calendarRef.current, () => {
      if (!schedulingRef.current) reschedule()
    })

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
      stopDrag()
      multiRef.current?.destroy()
      multiRef.current = null
      overlayRef.current?.destroy()
      overlayRef.current = null
      scurveRef.current?.destroy()
      scurveRef.current = null
      todayRef.current?.destroy()
      todayRef.current = null
      planRef.current?.destroy()
      planRef.current = null
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
    const overlay = new SCurveOverlay(gantt, () => computeSCurve(collectRef.current(), calendarRef.current, localTodayDay(), ganttSettingsRef.current.scurvePlan))
    scurveRef.current = overlay
    overlay.mount()
    return () => {
      overlay.destroy()
      if (scurveRef.current === overlay) scurveRef.current = null
    }
  }, [showScurve, volumeWeights, settings.scurvePlan])


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
