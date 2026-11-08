import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DockviewApi } from 'dockview-react'
import GanttView, { type GanttHandle } from './gantt/GanttView'
import BimViewer, { type BimSlots, type BimViewerHandle } from './bim/BimViewer'
import type { AutoScheduleOutcome } from './gantt/autoSchedule'
import { sampleProject } from './sampleProject'
import type { ProjectData } from '@shared/model'
import { emptyBim, taskGuids, type BimData } from '@shared/bimGroups'
import type { BimElement } from '@shared/bimQuery'
import type { ProjectSummary } from '@shared/repository'
import type { DbStatus, UpdateStatus } from '@shared/api'
import logoUrl from './assets/logo.svg'
import Workspace from './workspace/Workspace'
import WindowsMenu from './workspace/WindowsMenu'
import { WorkspaceContext, type SlotKey, type WorkspaceCtx } from './workspace/WorkspaceContext'
import { PANELS, PRESETS, applyPreset, openPanel, resetLayout } from './workspace/layout'
import ProjectsHome from './projects/ProjectsHome'
import CommandPalette, { type Command } from './CommandPalette'
import Tooltip from './Tooltip'
import StatusBar from './StatusBar'
import { nextThemePref, setThemePref, useTheme, type ThemePref } from './theme'
import { Activity, CalendarDays, Flame, FolderKanban, Monitor, Moon, Redo2, Search, Sun, Undo2, Zap } from 'lucide-react'
import { buildTemplate, type TemplateId } from './projects/templates'

const AUTOSAVE_MS = 1000
type SaveState = 'idle' | 'pending' | 'saved' | 'error'
type View = 'home' | 'workspace'

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

function CalendarPanel({ value, onChange }: { value: CalendarValue; onChange: (v: CalendarValue) => void }): React.JSX.Element {
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
      <div className="field">
        <span>Días laborables</span>
        <div className="weekdays">
          {DAYS.map(([d, label]) => (
            <label key={d} className={value.workWeek.includes(d) ? 'on' : ''}>
              <input type="checkbox" checked={value.workWeek.includes(d)} onChange={() => toggle(d)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Feriados (uno por línea, AAAA-MM-DD)</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} onBlur={applyHolidays} />
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const api = window.api
  const [view, setView] = useState<View>(api ? 'home' : 'workspace')
  const [lobMode, setLobMode] = useState(false)
  const [autoScheduling, setAutoScheduling] = useState(true)
  const [showCritical, setShowCritical] = useState(false)
  const [cycle, setCycle] = useState<string[]>([])

  const [db, setDb] = useState<DbStatus | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectData>(sampleProject)
  const [projectName, setProjectName] = useState(sampleProject.name)
  const [calendar, setCalendar] = useState<CalendarValue>({ holidays: [], workWeek: [1, 2, 3, 4, 5] })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [dock, setDock] = useState<DockviewApi | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const { pref: themePref } = useTheme()
  // Bumped whenever the gantt reports a change, so views that read task dates can refresh.
  const [scheduleVersion, setScheduleVersion] = useState(0)

  useEffect(() => {
    if (!api) return
    void api.updates.status().then(setUpdate)
    return api.updates.onStatus(setUpdate)
  }, [api])
  const [slots, setSlots] = useState<BimSlots>({ viewer: null })

  const ganttRef = useRef<GanttHandle>(null)
  const bimRef = useRef<BimViewerHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [history, setHistory] = useState({ canUndo: false, canRedo: false })
  const [bim, setBim] = useState<BimData>(emptyBim())
  const bimDataRef = useRef<BimData>(bim)
  const [bimElements, setBimElements] = useState<BimElement[]>([])
  const [selectedTask, setSelectedTask] = useState<{ id: string; text: string } | null>(null)
  // The last full snapshot of the open project, so a BIM-only change can be saved on its own.
  const lastDataRef = useRef<ProjectData | null>(null)
  const latestRef = useRef<ProjectData | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const projectIdRef = useRef<string | null>(null)
  projectIdRef.current = projectId
  const nameRef = useRef(projectName)
  nameRef.current = projectName

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

  const loadBim = (data: ProjectData): void => {
    const next = data.bim ?? emptyBim()
    bimDataRef.current = next
    lastDataRef.current = data
    setBim(next)
    setSelectedTask(null)
  }

  const openProject = useCallback(
    async (id: string) => {
      if (!api) return
      await flush()
      const data = await api.projects.load(id)
      if (!data) return
      setProjectId(id)
      setProjectName(data.name)
      setCalendar({ holidays: data.holidays ?? [], workWeek: data.workWeek ?? [1, 2, 3, 4, 5] })
      loadBim(data)
      setProject(data)
      setSaveState('idle')
      setView('workspace')
    },
    [api, flush]
  )

  // Connect to the database and list the projects; the user picks one from the home screen.
  useEffect(() => {
    if (!api) return
    void (async () => {
      const status = await api.db.status()
      setDb(status)
      if (status.connected) setProjects(await api.projects.list())
    })()
  }, [api])

  // Save what's pending when the window goes away.
  useEffect(() => {
    const onHide = (): void => void flush()
    window.addEventListener('beforeunload', onHide)
    return () => window.removeEventListener('beforeunload', onHide)
  }, [flush])

  const schedule = useCallback(
    (full: ProjectData) => {
      lastDataRef.current = full
      latestRef.current = full
      setSaveState('pending')
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    },
    [flush]
  )

  const onChange = useCallback(
    (data: ProjectData) => {
      // Task dates may have moved (edits, auto-schedule, undo): the 4D simulation re-reads them.
      setScheduleVersion((v) => v + 1)
      if (!api || !projectIdRef.current) return
      schedule({ ...data, name: nameRef.current, bim: bimDataRef.current })
    },
    [api, schedule]
  )

  const onBimChange = useCallback(
    (next: BimData) => {
      bimDataRef.current = next
      setBim(next)
      const base = latestRef.current ?? lastDataRef.current
      if (!api || !projectIdRef.current || !base) return
      schedule({ ...base, bim: next })
    },
    [api, schedule]
  )

  const getSpans = useCallback(() => ganttRef.current?.spans() ?? [], [])

  // Elements tied to each task, for the BIM column of the gantt.
  const bimCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of bim.links) counts[l.taskId] = taskGuids(l, bim.groups, bimElements).size
    return counts
  }, [bim, bimElements])

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

  // Ctrl+K or Ctrl+Shift+P opens the command palette, even while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'k' || (k === 'p' && e.shiftKey)) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onScheduled = (outcome: AutoScheduleOutcome): void => {
    setCycle((prev) => (prev.join() === outcome.cycle.join() ? prev : outcome.cycle))
  }

  // ---- projects ----
  const createProject = async (name: string, start: string, template: TemplateId): Promise<void> => {
    if (!api) return
    await flush()
    const id = await api.projects.create(name, buildTemplate(template, name, start))
    await refreshList()
    await openProject(id)
  }

  const renameProject = async (id: string, name: string): Promise<void> => {
    if (!api) return
    if (id === projectIdRef.current) {
      setProjectName(name)
      nameRef.current = name
      const base = latestRef.current ?? lastDataRef.current
      if (base && base.name !== name) schedule({ ...base, name })
    } else {
      await api.projects.rename(id, name)
    }
    await refreshList()
  }

  const duplicateProject = async (id: string): Promise<void> => {
    if (!api) return
    if (id === projectIdRef.current) await flush()
    const source = projects.find((p) => p.id === id)
    await api.projects.duplicate(id, `${source?.name ?? 'Proyecto'} (copia)`)
    await refreshList()
  }

  const deleteProject = async (id: string): Promise<void> => {
    if (!api) return
    if (id === projectIdRef.current) {
      latestRef.current = null
      window.clearTimeout(timerRef.current)
      setProjectId(null)
      setSaveState('idle')
    }
    await api.projects.remove(id)
    await refreshList()
  }

  const setSlot = useCallback((key: SlotKey, el: HTMLElement | null) => {
    setSlots((prev) => (prev[key] === el ? prev : { ...prev, [key]: el }))
  }, [])

  const ganttToolbar = (
    <>
      <Tooltip label="Deshacer" shortcut="Ctrl+Z">
        <button className="icon-btn" disabled={!history.canUndo} onClick={() => ganttRef.current?.undo()} aria-label="Deshacer">
          <Undo2 size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Rehacer" shortcut="Ctrl+Y">
        <button className="icon-btn" disabled={!history.canRedo} onClick={() => ganttRef.current?.redo()} aria-label="Rehacer">
          <Redo2 size={16} />
        </button>
      </Tooltip>
      <span className="sep" />
      <Tooltip label="Auto-schedule: reprograma las tareas dependientes al editar">
        <button className={`icon-btn${autoScheduling ? ' active' : ''}`} onClick={() => setAutoScheduling((v) => !v)} aria-label="Auto-schedule" aria-pressed={autoScheduling}>
          <Zap size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Ruta crítica">
        <button className={`icon-btn${showCritical ? ' active' : ''}`} onClick={() => setShowCritical((v) => !v)} aria-label="Ruta crítica" aria-pressed={showCritical}>
          <Flame size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Línea de balance">
        <button className={`icon-btn${lobMode ? ' active' : ''}`} onClick={() => setLobMode((v) => !v)} aria-label="Línea de balance" aria-pressed={lobMode}>
          <Activity size={16} />
        </button>
      </Tooltip>
      <span className="sep" />
      <Tooltip label="Calendario laboral y feriados">
        <button className="icon-btn" onClick={() => dock && openPanel(dock, 'calendar')} aria-label="Calendario">
          <CalendarDays size={16} />
        </button>
      </Tooltip>
      {cycle.length > 0 && <span className="warning">Dependencia circular en {cycle.length} tareas: no se programaron.</span>}
    </>
  )

  const workspaceCtx: WorkspaceCtx = {
    setSlot,
    ganttToolbar,
    calendar: <CalendarPanel value={calendar} onChange={setCalendar} />,
    gantt: (
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
        onTaskSelect={setSelectedTask}
        bimCounts={bimCounts}
      />
    )
  }

  if (api && db && !db.connected) {
    return (
      <div className="app">
        <div className="topbar">
          <span className="brand">
          <img src={logoUrl} alt="" width={18} height={18} />
          Opengantt BIM
        </span>
        </div>
        <div className="notice">
          <h2>No se pudo conectar a la base de datos</h2>
          <p>{db.error}</p>
          <button
            className="primary"
            onClick={() => {
              setDb(null)
              void api.db.configure(db.settings).then(async (s) => {
                setDb(s)
                if (s.connected) setProjects(await api.projects.list())
              })
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const inWorkspace = view === 'workspace'

  const updateCommands: Command[] = api
    ? [
        update.state === 'ready'
          ? { id: 'update-install', section: 'Aplicación', label: `Reiniciar e instalar la versión ${update.version}`, keywords: 'actualizar update', run: () => void flush().then(() => api.updates.install()) }
          : { id: 'update-check', section: 'Aplicación', label: 'Buscar actualizaciones', keywords: 'update version', run: () => void api.updates.check() }
      ]
    : []

  const THEME_LABEL: Record<ThemePref, string> = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' }
  const themeCommands: Command[] = (['system', 'light', 'dark'] as const).map((t) => ({
    id: `theme-${t}`,
    section: 'Aplicación',
    label: `Tema: ${THEME_LABEL[t]}`,
    keywords: 'apariencia oscuro claro dark light',
    run: () => setThemePref(t)
  }))

  const goHome = (): void => void flush().then(() => setView('home'))
  const commands: Command[] = [
    ...updateCommands,
    ...themeCommands,
    ...(api
      ? [
          { id: 'home', section: 'Proyectos', label: 'Ir a proyectos', run: goHome },
          ...(projectId ? [{ id: 'back', section: 'Proyectos', label: `Volver a «${projectName}»`, run: () => setView('workspace') }] : []),
          ...projects.map((p) => ({
            id: `open-${p.id}`,
            section: 'Proyectos',
            label: `Abrir: ${p.name}`,
            run: () => (p.id === projectId ? setView('workspace') : void openProject(p.id))
          }))
        ]
      : []),
    ...(inWorkspace
      ? [
          { id: 'undo', section: 'Edición', label: 'Deshacer', shortcut: 'Ctrl+Z', disabled: !history.canUndo, run: () => ganttRef.current?.undo() },
          { id: 'redo', section: 'Edición', label: 'Rehacer', shortcut: 'Ctrl+Y', disabled: !history.canRedo, run: () => ganttRef.current?.redo() },
          { id: 'auto', section: 'Planificación', label: `${autoScheduling ? 'Desactivar' : 'Activar'} auto-schedule`, keywords: 'programar automatico', run: () => setAutoScheduling((v) => !v) },
          { id: 'critical', section: 'Planificación', label: `${showCritical ? 'Ocultar' : 'Mostrar'} ruta crítica`, keywords: 'critical path', run: () => setShowCritical((v) => !v) },
          { id: 'lob', section: 'Planificación', label: `${lobMode ? 'Ocultar' : 'Mostrar'} línea de balance`, keywords: 'lob balance', run: () => setLobMode((v) => !v) },
          { id: 'ifc', section: 'BIM', label: 'Importar IFC…', keywords: 'modelo cargar abrir', run: () => fileInputRef.current?.click() },
          ...(dock
            ? [
                ...PANELS.map((pn) => ({
                  id: `panel-${pn.id}`,
                  section: 'Ventanas',
                  label: `Mostrar panel: ${pn.title}`,
                  keywords: 'abrir ventana panel',
                  run: () => openPanel(dock, pn.id)
                })),
                ...(['task', 'groups', 'props', 'models'] as const).map((t, i) => ({
                  id: `tool-${t}`,
                  section: 'BIM',
                  label: `Herramienta: ${['Asignación a tareas', 'Grupos guardados', 'Propiedades', 'Modelos'][i]}`,
                  keywords: 'bim visor panel',
                  run: () => {
                    openPanel(dock, 'viewer')
                    bimRef.current?.openTool(t)
                  }
                })),
                ...PRESETS.map((pr) => ({ id: `preset-${pr.id}`, section: 'Ventanas', label: `Distribución: ${pr.label}`, keywords: pr.hint, run: () => applyPreset(dock, pr.id) })),
                {
                  id: 'reset-layout',
                  section: 'Ventanas',
                  label: 'Restablecer ventanas',
                  run: () => {
                    resetLayout()
                    applyPreset(dock, 'classic')
                  }
                }
              ]
            : [])
        ]
      : [])
  ]

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          <img src={logoUrl} alt="" width={18} height={18} />
          Opengantt BIM
        </span>
        {api && (
          <Tooltip label="Proyectos">
            <button className={`icon-btn${view === 'home' ? ' active' : ''}`} onClick={goHome} aria-label="Proyectos">
              <FolderKanban size={16} />
            </button>
          </Tooltip>
        )}
        {inWorkspace && api && projectId && (
          <input
            className="project-name"
            value={projectName}
            aria-label="Nombre del proyecto"
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={() => {
              const name = projectName.trim()
              if (!name) setProjectName(project.name)
              else void renameProject(projectId, name)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
        <button className="palette-trigger" onClick={() => setPaletteOpen(true)} aria-label="Abrir paleta de comandos">
          <Search size={14} aria-hidden />
          <span>Buscar comandos y proyectos</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="topbar-right">
          {update.state === 'ready' && api && (
            <Tooltip label="Se reiniciará la aplicación para instalarla">
              <button className="primary update-btn" onClick={() => void flush().then(() => api.updates.install())}>
                Actualizar a v{update.version}
              </button>
            </Tooltip>
          )}
          <Tooltip label={`Tema: ${THEME_LABEL[themePref]} (clic para cambiar)`}>
            <button className="icon-btn" onClick={() => setThemePref(nextThemePref(themePref))} aria-label="Cambiar tema">
              {themePref === 'system' ? <Monitor size={16} /> : themePref === 'light' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </Tooltip>
          {inWorkspace && <WindowsMenu api={dock} />}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void bimRef.current?.loadIfc(file)
        }}
      />
      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />

      <div className="main">
        {api && (
          <div className={`view${view === 'home' ? '' : ' hidden'}`}>
            <ProjectsHome
              projects={projects}
              currentId={projectId}
              onOpen={(id) => (id === projectId ? setView('workspace') : void openProject(id))}
              onCreate={createProject}
              onRename={renameProject}
              onDuplicate={duplicateProject}
              onDelete={deleteProject}
            />
          </div>
        )}
        <div className={`view${inWorkspace ? '' : ' hidden'}`}>
          <WorkspaceContext.Provider value={workspaceCtx}>
            <Workspace onApi={setDock} />
          </WorkspaceContext.Provider>
        </div>
      </div>

      <StatusBar
        db={db}
        projectName={projectId ? projectName : null}
        modelCount={(bim.models ?? []).length}
        elementCount={bimElements.length}
        saveState={saveState}
        update={update}
      />

      <BimViewer
        ref={bimRef}
        slots={slots}
        onImport={() => fileInputRef.current?.click()}
        bim={bim}
        onBimChange={onBimChange}
        task={selectedTask}
        onElementsChange={setBimElements}
        onSelectTask={(id) => ganttRef.current?.selectTask(id)}
        taskText={(id) => ganttRef.current?.taskText(id)}
        getSpans={getSpans}
        scheduleVersion={scheduleVersion}
        projectId={api ? projectId : null}
      />
    </div>
  )
}
