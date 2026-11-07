import { useCallback, useEffect, useRef, useState } from 'react'
import GanttView, { type GanttHandle } from './gantt/GanttView'
import type { AutoScheduleOutcome } from './gantt/autoSchedule'
import { sampleProject } from './sampleProject'
import type { ProjectData } from '@shared/model'
import type { ProjectSummary } from '@shared/repository'
import type { DbStatus } from '@shared/api'

const AUTOSAVE_MS = 1000
type SaveState = 'idle' | 'pending' | 'saved' | 'error'

const DAYS = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
  [0, 'Dom']
] as const

interface CalendarValue {
  holidays: string[]
  workWeek: number[]
}

function CalendarPanel({
  value,
  onChange,
  onClose
}: {
  value: CalendarValue
  onChange: (v: CalendarValue) => void
  onClose: () => void
}): React.JSX.Element {
  const [text, setText] = useState(value.holidays.join('\n'))
  const toggle = (d: number): void => {
    const next = value.workWeek.includes(d) ? value.workWeek.filter((x) => x !== d) : [...value.workWeek, d]
    if (next.length > 0) onChange({ ...value, workWeek: next })
  }
  const applyHolidays = (): void => {
    const list = [...new Set(text.split(/[\s,;]+/).filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)))].sort()
    onChange({ ...value, holidays: list })
    setText(list.join('\n'))
  }
  return (
    <div className="calendar-panel">
      <div>
        <strong>Días laborables</strong>
        {DAYS.map(([d, label]) => (
          <label key={d}>
            <input type="checkbox" checked={value.workWeek.includes(d)} onChange={() => toggle(d)} /> {label}
          </label>
        ))}
      </div>
      <div>
        <strong>Feriados</strong> (uno por línea, AAAA-MM-DD)
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={applyHolidays} />
      </div>
      <button onClick={onClose}>Cerrar</button>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const api = window.api
  const [lobMode, setLobMode] = useState(false)
  const [autoScheduling, setAutoScheduling] = useState(true)
  const [showCritical, setShowCritical] = useState(false)
  const [cycle, setCycle] = useState<string[]>([])

  const [db, setDb] = useState<DbStatus | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectData>(sampleProject)
  const [calendar, setCalendar] = useState<{ holidays: string[]; workWeek: number[] }>({
    holidays: [],
    workWeek: [1, 2, 3, 4, 5]
  })
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const ganttRef = useRef<GanttHandle>(null)
  const [history, setHistory] = useState({ canUndo: false, canRedo: false })
  const latestRef = useRef<ProjectData | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const projectIdRef = useRef<string | null>(null)
  projectIdRef.current = projectId

  const refreshList = useCallback(async () => {
    if (!api) return
    setProjects(await api.projects.list())
  }, [api])

  const flush = useCallback(async () => {
    window.clearTimeout(timerRef.current)
    const id = projectIdRef.current
    const data = latestRef.current
    if (!api || !id || !data) return
    latestRef.current = null
    try {
      await api.projects.save(id, data)
      setSaveState('saved')
    } catch {
      latestRef.current = data
      setSaveState('error')
    }
  }, [api])

  const openProject = useCallback(
    async (id: string) => {
      if (!api) return
      await flush()
      const data = await api.projects.load(id)
      if (!data) return
      setProjectId(id)
      setCalendar({ holidays: data.holidays ?? [], workWeek: data.workWeek ?? [1, 2, 3, 4, 5] })
      setProject(data)
      setSaveState('idle')
    },
    [api, flush]
  )

  // Connect to the database status and open the first project (or create one).
  useEffect(() => {
    if (!api) return
    void (async () => {
      const status = await api.db.status()
      setDb(status)
      if (!status.connected) return
      let list = await api.projects.list()
      if (list.length === 0) {
        await api.projects.create(sampleProject.name, sampleProject)
        list = await api.projects.list()
      }
      setProjects(list)
      const data = await api.projects.load(list[0].id)
      if (data) {
        setProjectId(list[0].id)
        setCalendar({ holidays: data.holidays ?? [], workWeek: data.workWeek ?? [1, 2, 3, 4, 5] })
        setProject(data)
      }
    })()
  }, [api])

  // Save what's pending when the window goes away.
  useEffect(() => {
    const onHide = (): void => void flush()
    window.addEventListener('beforeunload', onHide)
    return () => window.removeEventListener('beforeunload', onHide)
  }, [flush])

  const onChange = useCallback(
    (data: ProjectData) => {
      if (!api || !projectIdRef.current) return
      latestRef.current = data
      setSaveState('pending')
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    },
    [api, flush]
  )

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z), except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) ganttRef.current?.undo()
      else if (k === 'y' || (k === 'z' && e.shiftKey)) ganttRef.current?.redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onScheduled = (outcome: AutoScheduleOutcome): void => {
    setCycle((prev) => (prev.join() === outcome.cycle.join() ? prev : outcome.cycle))
  }

  const newProject = async (): Promise<void> => {
    if (!api) return
    const name = window.prompt('Nombre del proyecto', 'Nuevo proyecto')
    if (!name) return
    await flush()
    const id = await api.projects.create(name)
    await refreshList()
    await openProject(id)
  }

  const deleteProject = async (): Promise<void> => {
    if (!api || !projectId) return
    if (!window.confirm(`¿Eliminar "${project.name}"? No se puede deshacer.`)) return
    latestRef.current = null
    window.clearTimeout(timerRef.current)
    await api.projects.remove(projectId)
    const list = await api.projects.list()
    setProjects(list)
    if (list.length > 0) await openProject(list[0].id)
    else {
      const id = await api.projects.create('Nuevo proyecto')
      await refreshList()
      await openProject(id)
    }
  }

  if (api && db && !db.connected) {
    return (
      <div className="app">
        <div className="toolbar">
          <span className="title">Opengantt BIM</span>
        </div>
        <div className="notice">
          <h2>No se pudo conectar a la base de datos</h2>
          <p>{db.error}</p>
          <button
            onClick={() => {
              setDb(null)
              void api.db.configure(db.settings).then((s) => setDb(s))
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const saveLabel = { idle: '', pending: 'Guardando…', saved: 'Guardado', error: 'Error al guardar' }[saveState]

  return (
    <div className="app">
      <div className="toolbar">
        <span className="title">Opengantt BIM</span>
        {api && (
          <>
            <select value={projectId ?? ''} onChange={(e) => void openProject(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={() => void newProject()}>Nuevo</button>
            <button onClick={() => void deleteProject()}>Eliminar</button>
          </>
        )}
        <button disabled={!history.canUndo} onClick={() => ganttRef.current?.undo()} title="Deshacer (Ctrl+Z)">
          Deshacer
        </button>
        <button disabled={!history.canRedo} onClick={() => ganttRef.current?.redo()} title="Rehacer (Ctrl+Y)">
          Rehacer
        </button>
        <button className={calendarOpen ? 'active' : ''} onClick={() => setCalendarOpen((v) => !v)}>
          Calendario
        </button>
        <button className={autoScheduling ? 'active' : ''} onClick={() => setAutoScheduling((v) => !v)}>
          Auto-schedule
        </button>
        <button className={showCritical ? 'active' : ''} onClick={() => setShowCritical((v) => !v)}>
          Ruta crítica
        </button>
        <button className={lobMode ? 'active' : ''} onClick={() => setLobMode((v) => !v)}>
          Línea de balance
        </button>
        {cycle.length > 0 && (
          <span className="warning">Dependencia circular en {cycle.length} tareas: no se programaron.</span>
        )}
        {saveLabel && <span className={`save-state ${saveState}`}>{saveLabel}</span>}
      </div>
      {calendarOpen && <CalendarPanel value={calendar} onChange={setCalendar} onClose={() => setCalendarOpen(false)} />}
      <GanttView
        holidays={calendar.holidays}
        workWeek={calendar.workWeek}
        ref={ganttRef}
        onHistoryChange={setHistory}
        project={project}
        lobMode={lobMode}
        autoScheduling={autoScheduling}
        showCritical={showCritical}
        onScheduled={onScheduled}
        onChange={onChange}
      />
    </div>
  )
}
