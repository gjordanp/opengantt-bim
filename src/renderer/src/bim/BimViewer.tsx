import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Box, ClipboardList, Info, Layers, PanelBottom, PanelRight, Upload, X } from 'lucide-react'
import Tooltip from '../Tooltip'
import Dropdown from '../Dropdown'
import ConfirmDialog from '../ConfirmDialog'
import { useTheme } from '../theme'
import SuggestInput from '../SuggestInput'
import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from 'three'
// Served from our own bundle: the default helper downloads the worker from a CDN.
import workerUrl from '@thatopen/fragments/worker?url'
import { evaluate, facets, type BimElement, type Query, type RuleField } from '@shared/bimQuery'
import {
  addElementsToTask,
  addGroupToTask,
  deleteGroup,
  removeElementsFromTask,
  removeGroupFromTask,
  resolveGroup,
  taskGuids,
  tasksForElement,
  type BimData,
  type BimGroup,
  type BimModelRef
} from '@shared/bimGroups'
import { phasesAt, spanRange, type TaskSpan } from '@shared/bim4d'
import { fromDay } from '@shared/scheduling'
import { indexModel } from './indexModel'

/** Where each part of the BIM UI is drawn: the dock panels hand their elements over. */
export interface BimSlots {
  viewer: HTMLElement | null
}

export type BimTool = 'task' | 'groups' | 'props' | 'models'

const TOOLS: { id: BimTool; label: string; icon: React.ReactNode }[] = [
  { id: 'task', label: 'Asignación a tareas', icon: <ClipboardList size={16} /> },
  { id: 'groups', label: 'Grupos guardados', icon: <Layers size={16} /> },
  { id: 'props', label: 'Propiedades del elemento', icon: <Info size={16} /> },
  { id: 'models', label: 'Modelos del proyecto', icon: <Box size={16} /> }
]
const SIDE_KEY = 'ogbim.toolsSide'

export interface BimViewerHandle {
  /** Converts an IFC file to fragments in the browser and shows it. */
  loadIfc(file: File): Promise<void>
  /** Opens one of the tools floating over the 3D view. */
  openTool(tool: BimTool): void
}

interface Props {
  ref?: Ref<BimViewerHandle>
  bim: BimData
  onBimChange: (next: BimData) => void
  /** The task selected in the gantt, if any. */
  task: { id: string; text: string } | null
  /** Reports the indexed elements (for per-task counts in the gantt). */
  onElementsChange: (elements: BimElement[]) => void
  onSelectTask: (taskId: string) => void
  taskText: (taskId: string) => string | undefined
  /** Start/end of every task, for the 4D simulation. */
  getSpans: () => TaskSpan[]
  /** Changes whenever task dates may have changed, so the 4D range is read again. */
  scheduleVersion: number
  /** Open project; its models are stored under this id. Null in the plain-browser build. */
  projectId: string | null
  slots: BimSlots
  /** Asks the app to open the .ifc file picker. */
  onImport: () => void
}

type Status = { kind: 'idle' } | { kind: 'loading'; name: string; progress: number } | { kind: 'error'; message: string }
type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>

/** The 3D view's background follows the theme (--canvas in styles.css). */
const canvasColor = (): string => getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#f4f4f5'

const SELECT_COLOR = new THREE.Color('#f59e0b')
const MATCH_COLOR = new THREE.Color('#8b5cf6')
const TASK_COLOR = new THREE.Color('#22c55e')
const BUILDING_COLOR = new THREE.Color('#f59e0b')
const DONE_COLOR = new THREE.Color('#38bdf8')
const GROUP_COLORS = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#64748b']

const highlightMaterial = (color: THREE.Color): FRAGS.MaterialDefinition => ({
  color,
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false
})

const FIELDS: { field: RuleField; label: string }[] = [
  { field: 'category', label: 'Clase IFC' },
  { field: 'storey', label: 'Piso' },
  { field: 'name', label: 'Nombre' }
]

interface Selected {
  element: BimElement
  attributes: [string, string][]
}

function flatten(data: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = []
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'value' in value) {
      const v = (value as { value: unknown }).value
      if (v !== null && v !== undefined && v !== '') rows.push([key, String(v)])
    }
  }
  return rows
}

const newId = (): string => `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export default function BimViewer({
  ref,
  bim,
  onBimChange,
  task,
  onElementsChange,
  onSelectTask,
  taskText,
  getSpans,
  scheduleVersion,
  projectId,
  slots,
  onImport
}: Props): React.JSX.Element {
  // The canvas lives in a detached element so the 3D scene survives panels being moved or closed.
  const [hostEl] = useState(() => {
    const el = document.createElement('div')
    el.className = 'bim-canvas'
    return el
  })
  const attachHost = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && hostEl.parentElement !== el) el.prepend(hostEl)
    },
    [hostEl]
  )
  const componentsRef = useRef<OBC.Components | null>(null)
  const worldRef = useRef<World | null>(null)
  const readyRef = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const { theme } = useTheme()
  useEffect(() => {
    const scene = worldRef.current?.scene.three
    if (scene) scene.background = new THREE.Color(canvasColor())
  }, [theme])
  // The tools float over the 3D view, along its right edge or its bottom edge.
  const [tool, setTool] = useState<BimTool | null>(null)
  const [side, setSide] = useState<'right' | 'bottom'>(() => {
    try {
      return localStorage.getItem(SIDE_KEY) === 'bottom' ? 'bottom' : 'right'
    } catch {
      return 'right'
    }
  })
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null)
  const changeSide = (next: 'right' | 'bottom'): void => {
    setSide(next)
    try {
      localStorage.setItem(SIDE_KEY, next)
    } catch {
      /* the choice just won't be remembered */
    }
  }
  const [elements, setElements] = useState<BimElement[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)

  // Search state.
  const [field, setField] = useState<RuleField>('category')
  const [text, setText] = useState('')
  const [isolate, setIsolate] = useState(false)
  const [groupName, setGroupName] = useState('')

  // 4D simulation.
  const [sim, setSim] = useState(false)
  const [simDay, setSimDay] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hideUnlinked, setHideUnlinked] = useState(false)

  // Models kept with the project: loaded ids, and a token that cancels stale restores.
  const loadedRef = useRef<Set<string>>(new Set())
  const syncTokenRef = useRef(0)
  const bimRef = useRef(bim)
  bimRef.current = bim
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const elementsRef = useRef<BimElement[]>([])
  elementsRef.current = elements

  useEffect(() => {
    onElementsChange(elements)
  }, [elements, onElementsChange])

  useEffect(() => {
    const host = hostEl
    const components = new OBC.Components()
    componentsRef.current = components
    if (import.meta.env.DEV) (window as unknown as { __bim: OBC.Components }).__bim = components

    const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>()
    world.scene = new OBC.SimpleScene(components)
    world.scene.setup()
    world.scene.three.background = new THREE.Color(canvasColor())
    world.renderer = new OBC.SimpleRenderer(components, host)
    // Clean viewport: That Open's own switch for its corner logo (credited in THIRD_PARTY_NOTICES.md).
    world.renderer.showLogo = false
    world.camera = new OBC.OrthoPerspectiveCamera(components)
    worldRef.current = world
    components.init()
    // No ground grid: it fades into a horizon line that distracts from the model.

    const manager = components.get(OBC.FragmentsManager)
    readyRef.current = (async () => {
      manager.init(workerUrl)
      world.camera.controls.addEventListener('update', () => manager.core.update())
      world.onCameraChanged.add((camera) => {
        for (const [, model] of manager.list) model.useCamera(camera.three)
        manager.core.update(true)
      })
      manager.list.onItemSet.add(({ value: model }) => {
        model.useCamera(world.camera.three)
        world.scene.three.add(model.object)
        manager.core.update(true)
      })
      const ifcLoader = components.get(OBC.IfcLoader)
      // web-ifc.wasm is copied to /wasm by scripts/copy-wasm.mjs (no CDN).
      await ifcLoader.setup({
        autoSetWasm: false,
        wasm: { path: new URL('wasm/', document.baseURI).href, absolute: true }
      })
    })()

    // A click (not a drag) selects the element under the cursor.
    const canvas = world.renderer.three.domElement
    let down: { x: number; y: number } | null = null
    const pick = async (e: PointerEvent): Promise<void> => {
      const mouse = new THREE.Vector2(e.clientX, e.clientY)
      let hit: { model: FRAGS.FragmentsModel; localId: number } | null = null
      let best = Infinity
      for (const [, model] of manager.list) {
        const r = await model.raycast({ camera: world.camera.three, mouse, dom: canvas })
        if (r && r.distance < best) {
          best = r.distance
          hit = { model, localId: r.localId }
        }
      }
      if (!hit) {
        setSelected(null)
        return
      }
      const [data] = await hit.model.getItemsData([hit.localId], { attributesDefault: true })
      const rows = flatten((data ?? {}) as Record<string, unknown>)
      const known = elementsRef.current.find((el) => el.modelId === hit.model.modelId && el.localId === hit.localId)
      setSelected({
        element: known ?? {
          modelId: hit.model.modelId,
          localId: hit.localId,
          guid: rows.find(([k]) => k === '_guid')?.[1] ?? '',
          category: rows.find(([k]) => k === '_category')?.[1] ?? '',
          name: '',
          storey: ''
        },
        attributes: rows.filter(([k]) => !k.startsWith('_'))
      })
    }
    const onDown = (e: PointerEvent): void => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent): void => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
      void pick(e)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      readyRef.current = null
      worldRef.current = null
      componentsRef.current = null
      components.dispose()
    }
  }, [hostEl])

  useImperativeHandle(ref, () => ({
    openTool(next: BimTool) {
      setTool(next)
    },
    async loadIfc(file: File) {
      const components = componentsRef.current
      const world = worldRef.current
      if (!components || !world || !readyRef.current) return
      setStatus({ kind: 'loading', name: file.name, progress: 0 })
      try {
        await readyRef.current
        const data = new Uint8Array(await file.arrayBuffer())
        const ifcLoader = components.get(OBC.IfcLoader)
        const modelId = crypto.randomUUID()
        const model = await ifcLoader.load(data, true, modelId, {
          processData: { progressCallback: (progress: number) => setStatus({ kind: 'loading', name: file.name, progress }) }
        })
        const box = new THREE.Box3().setFromObject(model.object)
        if (!box.isEmpty()) await world.camera.controls.fitToBox(box, true)
        const indexed = await indexModel(model)
        loadedRef.current.add(modelId)
        setElements((prev) => [...prev, ...indexed])
        // Keep the converted model with the project so it opens next time without the .ifc.
        const api = window.api
        const pid = projectIdRef.current
        if (api && pid) {
          const bytes = new Uint8Array(await model.getBuffer(false))
          const ref = await api.models.save(pid, modelId, file.name, bytes)
          onBimChange({ ...bimRef.current, models: [...(bimRef.current.models ?? []), ref] })
        }
        setStatus({ kind: 'idle' })
      } catch (error) {
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
  }))

  // Open the models stored with the project (and drop the ones that are gone).
  const modelKey = (bim.models ?? []).map((m) => m.id).join(',')
  useEffect(() => {
    const api = window.api
    const world = worldRef.current
    if (!api || !projectId || !world) return
    const token = ++syncTokenRef.current
    void (async () => {
      await readyRef.current
      const manager = componentsRef.current?.get(OBC.FragmentsManager)
      if (!manager || token !== syncTokenRef.current) return
      const want = new Map((bimRef.current.models ?? []).map((m: BimModelRef) => [m.id, m]))
      for (const id of [...loadedRef.current]) {
        if (want.has(id)) continue
        loadedRef.current.delete(id)
        await manager.core.disposeModel(id).catch(() => undefined)
        setElements((prev) => prev.filter((e) => e.modelId !== id))
      }
      let first = loadedRef.current.size === 0
      for (const ref of want.values()) {
        if (loadedRef.current.has(ref.id)) continue
        const bytes = await api.models.load(projectId, ref.id)
        if (token !== syncTokenRef.current) return
        if (!bytes) continue
        loadedRef.current.add(ref.id)
        const model = await manager.core.load(bytes, { modelId: ref.id })
        const indexed = await indexModel(model)
        if (token !== syncTokenRef.current) return
        setElements((prev) => [...prev, ...indexed])
        if (first) {
          first = false
          const box = new THREE.Box3().setFromObject(model.object)
          if (!box.isEmpty()) await world.camera.controls.fitToBox(box, true)
        }
      }
    })()
  }, [projectId, modelKey])

  const removeModel = async (ref: BimModelRef): Promise<void> => {
    loadedRef.current.delete(ref.id)
    await componentsRef.current?.get(OBC.FragmentsManager).core.disposeModel(ref.id).catch(() => undefined)
    setElements((prev) => prev.filter((e) => e.modelId !== ref.id))
    if (window.api && projectId) await window.api.models.remove(projectId, ref.id)
    onBimChange({ ...bim, models: (bim.models ?? []).filter((m) => m.id !== ref.id) })
  }

  // Destructive actions ask first, in an in-app dialog.
  const [pendingRemoval, setPendingRemoval] = useState<{ kind: 'model'; ref: BimModelRef } | { kind: 'group'; id: string; name: string } | null>(null)

  // ---- search ----
  const query: Query | null = useMemo(
    () => (text.trim() ? { op: 'and', rules: [{ field, op: 'contains', value: text }] } : null),
    [field, text]
  )
  const results = useMemo(() => (query ? evaluate(query, elements) : []), [query, elements])
  const suggestions = useMemo(() => facets(elements, field).slice(0, 200), [elements, field])

  // ---- task <-> elements ----
  const link = task ? bim.links.find((l) => l.taskId === task.id) : undefined
  const taskSet = useMemo(() => taskGuids(link, bim.groups, elements), [link, bim.groups, elements])
  const selectedTasks = useMemo(
    () => (selected ? tasksForElement(selected.element.guid, bim, elements) : []),
    [selected, bim, elements]
  )

  // ---- 4D ----
  const guidsByTask = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of bim.links) map.set(l.taskId, taskGuids(l, bim.groups, elements))
    return map
  }, [bim, elements])
  const range = useMemo(() => {
    if (!sim) return null
    const withElements = new Set([...guidsByTask].filter(([, g]) => g.size > 0).map(([id]) => id))
    return spanRange(getSpans(), withElements)
  }, [sim, guidsByTask, getSpans, scheduleVersion])
  const phases = useMemo(
    () => (sim && range ? phasesAt(simDay, getSpans(), guidsByTask) : null),
    [sim, range, simDay, guidsByTask, getSpans, scheduleVersion]
  )
  useEffect(() => {
    if (range && (simDay < range.from || simDay > range.to)) setSimDay(range.from)
  }, [range, simDay])
  useEffect(() => {
    if (!playing || !range) return
    const timer = window.setInterval(() => {
      setSimDay((d) => {
        if (d >= range.to) {
          setPlaying(false)
          return d
        }
        return d + 1
      })
    }, 150)
    return () => window.clearInterval(timer)
  }, [playing, range])

  // Paint, lowest to highest priority: search matches, the task's elements, the clicked element.
  useEffect(() => {
    const manager = componentsRef.current?.get(OBC.FragmentsManager)
    if (!manager || !manager.initialized) return
    const byGuid = new Map<string, BimElement>()
    for (const el of elements) byGuid.set(el.guid, el)
    void (async () => {
      for (const [modelId, model] of manager.list) {
        const searchIds = results.filter((r) => r.modelId === modelId).map((r) => r.localId)
        const taskIds = [...taskSet]
          .map((g) => byGuid.get(g))
          .filter((e): e is BimElement => !!e && e.modelId === modelId)
          .map((e) => e.localId)
        await model.resetHighlight()
        await model.resetVisible()
        if (phases) {
          const local = (guids: Set<string>): number[] =>
            [...guids]
              .map((g) => byGuid.get(g))
              .filter((e): e is BimElement => !!e && e.modelId === modelId)
              .map((e) => e.localId)
          const inSim = new Set<string>([...phases.pending, ...phases.building, ...phases.done])
          const hide = [...local(phases.pending)]
          if (hideUnlinked) {
            for (const e of elements) if (e.modelId === modelId && !inSim.has(e.guid)) hide.push(e.localId)
          }
          if (hide.length > 0) await model.setVisible(hide, false)
          const done = local(phases.done)
          const building = local(phases.building)
          if (done.length > 0) await model.highlight(done, highlightMaterial(DONE_COLOR))
          if (building.length > 0) await model.highlight(building, highlightMaterial(BUILDING_COLOR))
          if (selected && selected.element.modelId === modelId) {
            await model.highlight([selected.element.localId], highlightMaterial(SELECT_COLOR))
          }
          continue
        }
        if (searchIds.length > 0) {
          await model.highlight(searchIds, highlightMaterial(MATCH_COLOR))
          if (isolate) {
            const keep = new Set(searchIds)
            const hide = elements.filter((e) => e.modelId === modelId && !keep.has(e.localId)).map((e) => e.localId)
            await model.setVisible(hide, false)
          }
        }
        if (taskIds.length > 0) await model.highlight(taskIds, highlightMaterial(TASK_COLOR))
        if (selected && selected.element.modelId === modelId) {
          await model.highlight([selected.element.localId], highlightMaterial(SELECT_COLOR))
        }
      }
      manager.core.update(true)
    })()
  }, [results, isolate, taskSet, selected, elements, phases, hideUnlinked])

  // ---- actions ----
  const saveGroup = (): void => {
    if (!query || !groupName.trim()) return
    const group: BimGroup = {
      id: newId(),
      name: groupName.trim(),
      color: GROUP_COLORS[bim.groups.length % GROUP_COLORS.length],
      query,
      manualInclude: [],
      manualExclude: []
    }
    onBimChange({ ...bim, groups: [...bim.groups, group] })
    setGroupName('')
  }
  const links = bim.links
  const setLinks = (next: typeof links): void => onBimChange({ ...bim, links: next })

  const viewerUi = (
    <div className="bim-viewer">
      <div className="bim-search">
        <span className="panel-title">Visor 3D</span>
        <Tooltip label="Importar modelo IFC…">
          <button className="icon-btn" onClick={onImport} aria-label="Importar IFC">
            <Upload size={16} />
          </button>
        </Tooltip>
        <Dropdown label="Buscar por" value={field} onChange={(v) => setField(v)} options={FIELDS.map((f) => ({ value: f.field, label: f.label }))} />
        <SuggestInput value={text} onChange={setText} suggestions={suggestions} placeholder="Buscar elementos…" disabled={elements.length === 0} />
        <label className="bim-isolate">
          <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} /> Aislar
        </label>
        <button
          className={sim ? 'active' : ''}
          onClick={() => {
            setSim((v) => !v)
            setPlaying(false)
          }}
        >
          4D
        </button>
        <span className="bim-count">{query ? `${results.length} de ${elements.length}` : `${elements.length} elementos`}</span>
      </div>

      <div className="bim-stage" ref={attachHost}>
        <div className="bim-overlay" ref={setOverlayEl} />
        {status.kind === 'loading' && (
          <div className="bim-status">
            Convirtiendo {status.name}… {Math.round(status.progress * 100)}%
          </div>
        )}
        {status.kind === 'error' && <div className="bim-status error">No se pudo cargar el IFC: {status.message}</div>}
        {status.kind === 'idle' && elements.length === 0 && (
          <div className="bim-status">Importa un archivo .ifc para verlo aquí.</div>
        )}
      </div>

      {sim && (
        <div className="bim-4d">
          {range ? (
            <>
              <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pausa' : 'Reproducir'}</button>
              <input
                type="range"
                min={range.from}
                max={range.to}
                value={Math.min(Math.max(simDay, range.from), range.to)}
                onChange={(e) => {
                  setPlaying(false)
                  setSimDay(Number(e.target.value))
                }}
              />
              <strong>{fromDay(simDay)}</strong>
              <span className="bim-muted">
                {phases ? phases.done.size + ' listos · ' + phases.building.size + ' en obra · ' + phases.pending.size + ' pendientes' : ''}
              </span>
              <label className="bim-isolate">
                <input type="checkbox" checked={hideUnlinked} onChange={(e) => setHideUnlinked(e.target.checked)} /> Ocultar sin tarea
              </label>
            </>
          ) : (
            <span className="bim-muted">Asigna elementos a tareas para simular la construcción.</span>
          )}
        </div>
      )}
    </div>
  )

  const propsUi = selected ? (
    <div className="panel-body bim-props">
      <div className="bim-props-head">
        <strong>{selected.element.name || selected.element.category || 'Elemento'}</strong>
        <button onClick={() => setSelected(null)}>×</button>
      </div>
      {task && (
        <div className="bim-props-actions">
          {link?.guids.includes(selected.element.guid) ? (
            <button onClick={() => setLinks(removeElementsFromTask(links, task.id, [selected.element.guid]))}>
              Quitar de la tarea
            </button>
          ) : (
            <button
              disabled={!selected.element.guid}
              onClick={() => setLinks(addElementsToTask(links, task.id, [selected.element.guid]))}
            >
              Asignar a «{task.text}»
            </button>
          )}
        </div>
      )}
      {selectedTasks.length > 0 && (
        <div className="bim-props-tasks">
          Tareas:{' '}
          {selectedTasks.map((id) => (
            <button key={id} className="link" onClick={() => onSelectTask(id)}>
              {taskText(id) ?? id}
            </button>
          ))}
        </div>
      )}
      <dl>
        <dt>Clase</dt>
        <dd>{selected.element.category}</dd>
        {selected.element.storey && (
          <>
            <dt>Piso</dt>
            <dd>{selected.element.storey}</dd>
          </>
        )}
        <dt>GlobalId</dt>
        <dd>{selected.element.guid}</dd>
        {selected.attributes.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  ) : (
    <div className="panel-body bim-muted">Haz clic en un elemento del visor para ver sus propiedades.</div>
  )

  const modelsUi = (
    <div className="panel-body">
      {(bim.models ?? []).length === 0 && <div className="bim-muted">Sin modelos guardados en este proyecto.</div>}
      {(bim.models ?? []).map((m) => (
        <div key={m.id} className="bim-group">
          <span className="bim-group-name">
            {m.name} <span className="bim-muted">({(m.size / 1e6).toFixed(1)} MB)</span>
          </span>
          <button onClick={() => setPendingRemoval({ kind: 'model', ref: m })}>Quitar</button>
        </div>
      ))}
    </div>
  )

  const taskUi = (
    <div className="panel-body">
      {!task && <div className="bim-muted">Selecciona una tarea en el Gantt para asignarle elementos.</div>}
      {task && (
        <>
          <div className="bim-section-title">{task.text}</div>
          <div className="bim-chips">
            {(link?.groupIds ?? []).map((id) => {
              const group = bim.groups.find((g) => g.id === id)
              return group ? (
                <span key={id} className="bim-chip" style={{ borderColor: group.color }}>
                  {group.name}
                  <Tooltip label="Quitar grupo de la tarea">
                    <button aria-label="Quitar grupo" onClick={() => setLinks(removeGroupFromTask(links, task.id, id))}>
                      ×
                    </button>
                  </Tooltip>
                </span>
              ) : null
            })}
            {(link?.guids.length ?? 0) > 0 && (
              <span className="bim-chip">
                {link?.guids.length} elementos sueltos
                <Tooltip label="Quitar elementos sueltos">
                  <button aria-label="Quitar elementos sueltos" onClick={() => setLinks(removeElementsFromTask(links, task.id, link?.guids ?? []))}>
                    ×
                  </button>
                </Tooltip>
              </span>
            )}
            {taskSet.size === 0 && <span className="bim-muted">Sin elementos asignados</span>}
            {taskSet.size > 0 && <span className="bim-muted">{taskSet.size} elementos en total (verde)</span>}
          </div>
          {query && results.length > 0 && (
            <button onClick={() => setLinks(addElementsToTask(links, task.id, results.map((r) => r.guid)))}>
              Asignar los {results.length} resultados a la tarea
            </button>
          )}
        </>
      )}
    </div>
  )

  const groupsUi = (
    <div className="panel-body">
      {query && (
        <div className="bim-newgroup">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nombre del grupo para esta búsqueda"
            onKeyDown={(e) => e.key === 'Enter' && saveGroup()}
          />
          <button disabled={!groupName.trim()} onClick={saveGroup}>
            Guardar grupo
          </button>
        </div>
      )}
      {bim.groups.length === 0 && <div className="bim-muted">Busca algo en el visor y guárdalo como grupo.</div>}
      {bim.groups.map((group) => (
        <div key={group.id} className="bim-group">
          <span className="bim-swatch" style={{ background: group.color }} />
          <span className="bim-group-name">
            {group.name} <span className="bim-muted">({resolveGroup(group, elements).size})</span>
          </span>
          <button
            disabled={!task || link?.groupIds.includes(group.id)}
            onClick={() => task && setLinks(addGroupToTask(links, task.id, group.id))}
          >
            Asignar
          </button>
          <button onClick={() => setPendingRemoval({ kind: 'group', id: group.id, name: group.name })}>Eliminar</button>
        </div>
      ))}
    </div>
  )

  return (
    <>
      {pendingRemoval && (
        <ConfirmDialog
          title={pendingRemoval.kind === 'model' ? 'Quitar modelo' : 'Eliminar grupo'}
          message={
            pendingRemoval.kind === 'model'
              ? `¿Quitar el modelo «${pendingRemoval.ref.name}» del proyecto? Se borra el archivo convertido guardado con el proyecto.`
              : `¿Eliminar el grupo «${pendingRemoval.name}»? Se quita de todas las tareas.`
          }
          confirmLabel={pendingRemoval.kind === 'model' ? 'Quitar' : 'Eliminar'}
          danger
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            const target = pendingRemoval
            setPendingRemoval(null)
            if (target.kind === 'model') void removeModel(target.ref)
            else onBimChange(deleteGroup(bim, target.id))
          }}
        />
      )}
      {slots.viewer && createPortal(viewerUi, slots.viewer)}
      {overlayEl &&
        createPortal(
          <>
            <div className={`bim-tools bim-tools-${side}`} role="toolbar" aria-label="Herramientas BIM">
              {TOOLS.map((t) => (
                <Tooltip key={t.id} label={t.label} side={side === 'right' ? 'left' : 'top'}>
                  <button
                    className={`icon-btn${tool === t.id ? ' active' : ''}`}
                    aria-label={t.label}
                    aria-pressed={tool === t.id}
                    onClick={() => setTool((cur) => (cur === t.id ? null : t.id))}
                  >
                    {t.icon}
                  </button>
                </Tooltip>
              ))}
              <span className="sep" />
              <Tooltip label={side === 'right' ? 'Mover la barra abajo' : 'Mover la barra a la derecha'} side={side === 'right' ? 'left' : 'top'}>
                <button className="icon-btn" aria-label="Mover la barra de herramientas" onClick={() => changeSide(side === 'right' ? 'bottom' : 'right')}>
                  {side === 'right' ? <PanelBottom size={16} /> : <PanelRight size={16} />}
                </button>
              </Tooltip>
            </div>
            {tool && (
              <div className={`bim-tool-panel bim-tool-panel-${side}`} role="dialog" aria-label={TOOLS.find((t) => t.id === tool)?.label}>
                <div className="bim-tool-head">
                  <b>{TOOLS.find((t) => t.id === tool)?.label}</b>
                  <button className="icon-btn" aria-label="Cerrar" onClick={() => setTool(null)}>
                    <X size={14} />
                  </button>
                </div>
                <div className="bim-tool-body">{{ task: taskUi, groups: groupsUi, props: propsUi, models: modelsUi }[tool]}</div>
              </div>
            )}
          </>,
          overlayEl
        )}
    </>
  )
}
