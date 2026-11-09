import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Box, Check, ClipboardList, Eye, Info, Layers, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import Tooltip from '../Tooltip'
import ConfirmDialog from '../ConfirmDialog'
import { useTheme } from '../theme'
import SuggestInput from '../SuggestInput'
import Dropdown, { type DropdownOption } from '../Dropdown'
import * as OBC from '@thatopen/components'
import * as OBF from '@thatopen/components-front'
import ViewerSettingsMenu from './ViewerSettingsMenu'
import { CAMERA_FEEL, loadViewerSettings, saveViewerSettings, type ViewerSettings } from './viewerSettings'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from 'three'
// Served from our own bundle: the default helper downloads the worker from a CDN.
import workerUrl from '@thatopen/fragments/worker?url'
import { evaluate, facets, propertyKeys, type BimElement, type Query, type Rule, type RuleField, type RuleOp } from '@shared/bimQuery'
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
  type BimModelRef,
  type BimSearch
} from '@shared/bimGroups'
import { phasesAt, spanRange, type TaskSpan } from '@shared/bim4d'
import { fromDay } from '@shared/scheduling'
import { indexModel } from './indexModel'

/** Where each part of the BIM UI is drawn: the dock panels hand their elements over. */
export interface BimSlots {
  viewer: HTMLElement | null
}

export type BimTool = 'search' | 'task' | 'groups' | 'props' | 'models'

const TOOLS: { id: BimTool; label: string; icon: React.ReactNode }[] = [
  { id: 'search', label: 'Buscar elementos', icon: <Search size={16} /> },
  { id: 'task', label: 'Asignación a tareas', icon: <ClipboardList size={16} /> },
  { id: 'groups', label: 'Grupos guardados', icon: <Layers size={16} /> },
  { id: 'props', label: 'Propiedades del elemento', icon: <Info size={16} /> },
  { id: 'models', label: 'Modelos del proyecto', icon: <Box size={16} /> }
]
const PANEL_W = 320
const PANEL_GAP = 12
type Pos = { x: number; y: number }

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
type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBF.PostproductionRenderer>

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

const BUILTIN_LABELS: Record<string, string> = { category: 'Clase IFC', storey: 'Piso', name: 'Nombre', guid: 'GlobalId', volume: 'Volumen' }
const OPS: { op: RuleOp; label: string; needsValue: boolean }[] = [
  { op: 'eq', label: 'es igual a', needsValue: true },
  { op: 'neq', label: 'es distinto de', needsValue: true },
  { op: 'contains', label: 'contiene', needsValue: true },
  { op: 'notContains', label: 'no contiene', needsValue: true },
  { op: 'startsWith', label: 'empieza con', needsValue: true },
  { op: 'gt', label: 'es mayor que', needsValue: true },
  { op: 'gte', label: 'es mayor o igual que', needsValue: true },
  { op: 'lt', label: 'es menor que', needsValue: true },
  { op: 'lte', label: 'es menor o igual que', needsValue: true },
  { op: 'exists', label: 'está definido', needsValue: false },
  { op: 'notExists', label: 'no está definido', needsValue: false },
  { op: 'in', label: 'es uno de', needsValue: true }
]
const opLabel = (op: RuleOp): string => OPS.find((o) => o.op === op)?.label ?? op
const needsValue = (op: RuleOp): boolean => OPS.find((o) => o.op === op)?.needsValue ?? true
/** "Pset_WallCommon.FireRating" reads as "Pset_WallCommon › FireRating". */
const fieldLabel = (field: string): string => BUILTIN_LABELS[field] ?? field.replace('.', ' › ')

interface Draft {
  id: string
  field: RuleField
  op: RuleOp
  value: string
}
const newRule = (field: RuleField = 'name'): Draft => ({ id: newId(), field, op: 'contains', value: '' })
const toRule = (d: Draft): Rule | null => (needsValue(d.op) && !d.value.trim() ? null : { field: d.field, op: d.op, value: d.op === 'in' ? d.value.split(',').map((v) => v.trim()).filter(Boolean) : d.value })

/** A search in words: "Clase IFC es igual a «IFCWALL» y Piso contiene «Nivel 2»". */
function describeRules(rules: (Rule | Query)[], match: 'and' | 'or'): string {
  return rules
    .map((r) => {
      if ('rules' in r) return `(${describeRules(r.rules, r.op)})`
      const v = Array.isArray(r.value) ? r.value.join(', ') : r.value
      return `${fieldLabel(r.field)} ${opLabel(r.op)}${needsValue(r.op) ? ` «${v}»` : ''}`
    })
    .join(match === 'and' ? ' y ' : ' o ')
}

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

const same = (a: BimElement, b: BimElement): boolean => a.modelId === b.modelId && a.localId === b.localId
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
const CLASS_NAMES: Record<string, string> = {
  wall: 'muro', wallstandardcase: 'muro', slab: 'losa', column: 'pilar', beam: 'viga', door: 'puerta', window: 'ventana',
  stair: 'escalera', stairflight: 'tramo de escalera', roof: 'techo', footing: 'fundación', pile: 'pilote', covering: 'revestimiento',
  railing: 'baranda', plate: 'placa', member: 'miembro', curtainwall: 'muro cortina', buildingelementproxy: 'elemento genérico',
  furnishingelement: 'mobiliario', opening: 'abertura', ramp: 'rampa', space: 'espacio'
}
const className = (c: string): string => {
  const key = c.replace(/^IFC/i, '').toLowerCase()
  return CLASS_NAMES[key] ?? (key || 'elemento')
}

/** "2 wall · 1 slab · Piso 1": what a set of elements is, in a few words. */
function describeElements(els: BimElement[]): string {
  const byClass = new Map<string, number>()
  const storeys = new Set<string>()
  for (const e of els) {
    byClass.set(className(e.category), (byClass.get(className(e.category)) ?? 0) + 1)
    if (e.storey) storeys.add(e.storey)
  }
  const top = [...byClass].sort((a, b) => b[1] - a[1])
  const parts = top.slice(0, 3).map(([c, n]) => `${n} × ${c}`)
  if (top.length > 3) parts.push(`+${top.length - 3} más`)
  const floors = [...storeys]
  const where = floors.length === 0 ? '' : floors.length <= 2 ? floors.join(', ') : `${floors.length} pisos`
  return [parts.join(' · '), where].filter(Boolean).join(' — ')
}

/** What defines a saved group, in words. */
function describeGroup(group: BimGroup): string {
  const manual = group.manualInclude.length
  if (group.query.rules.length === 0) return manual > 0 ? 'Selección manual' : 'Sin criterio'
  return `${describeRules(group.query.rules, group.query.op)}${manual ? ` + ${manual} a mano` : ''}`
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
  // How the view looks and responds (edges, hover outline, camera feel), kept on this computer.
  const [viewer, setViewerState] = useState<ViewerSettings>(loadViewerSettings)
  const viewerRef = useRef(viewer)
  viewerRef.current = viewer
  const changeViewer = (next: ViewerSettings): void => {
    setViewerState(next)
    saveViewerSettings(next)
  }
  const outlinerRef = useRef<OBF.Outliner | null>(null)
  const clearHoverRef = useRef<() => void>(() => undefined)

  // Edges: the postproduction style adds pen lines over the colors.
  useEffect(() => {
    const pp = worldRef.current?.renderer?.postproduction
    if (!pp) return
    pp.style = viewer.edges ? OBF.PostproductionAspect.COLOR_PEN : OBF.PostproductionAspect.COLOR
  }, [viewer.edges])
  // Camera feel: how much the controls smooth the mouse motion.
  useEffect(() => {
    const controls = worldRef.current?.camera.controls
    if (!controls) return
    const feel = CAMERA_FEEL[viewer.camera]
    controls.smoothTime = feel.smoothTime
    controls.draggingSmoothTime = feel.draggingSmoothTime
  }, [viewer.camera])
  useEffect(() => {
    if (!viewer.hover) clearHoverRef.current()
  }, [viewer.hover])
  // The tools float over the 3D view, along its right edge or its bottom edge.
  // The tools open as floating windows over the 3D view: any number at once, each draggable.
  const [openTools, setOpenTools] = useState<BimTool[]>([]) // stacking order, last on top
  const [toolPos, setToolPos] = useState<Partial<Record<BimTool, Pos>>>({})
  const movedTools = useRef<Set<BimTool>>(new Set()) // windows the user dragged keep their place
  const panelRefs = useRef<Partial<Record<BimTool, HTMLDivElement | null>>>({})
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null)
  const [overlaySize, setOverlaySize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!overlayEl) return
    const read = (): void => setOverlaySize({ w: overlayEl.clientWidth, h: overlayEl.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(overlayEl)
    return () => ro.disconnect()
  }, [overlayEl])
  const clampPos = (p: Pos, w: number, h: number): Pos => ({
    x: Math.max(0, Math.min(p.x, Math.max(0, overlaySize.w - w))),
    y: Math.max(0, Math.min(p.y, Math.max(0, overlaySize.h - Math.min(h, 60))))
  })
  /** Where a window opens: the first free column from the right edge, else cascaded from the last one. */
  const placeTool = (id: BimTool, open: BimTool[], positions: Partial<Record<BimTool, Pos>>): Pos => {
    if (movedTools.current.has(id) && positions[id]) return clampPos(positions[id]!, PANEL_W, 80)
    const taken = open
      .map((t) => ({ p: positions[t], el: panelRefs.current[t] }))
      .filter((r): r is { p: Pos; el: HTMLDivElement } => !!r.p && !!r.el)
      .map((r) => ({ x: r.p.x, y: r.p.y, w: r.el.offsetWidth, h: r.el.offsetHeight }))
    for (let k = 0; ; k++) {
      const x = overlaySize.w - PANEL_GAP - PANEL_W - k * (PANEL_W + PANEL_GAP)
      if (x < PANEL_GAP) break
      if (!taken.some((r) => r.x < x + PANEL_W && r.x + r.w > x)) return { x, y: PANEL_GAP }
    }
    const last = taken[taken.length - 1]
    return clampPos({ x: (last?.x ?? overlaySize.w - PANEL_W - PANEL_GAP) - 28, y: (last?.y ?? PANEL_GAP) + 32 }, PANEL_W, 80)
  }
  const raiseTool = (id: BimTool): void => setOpenTools((cur) => (cur[cur.length - 1] === id ? cur : [...cur.filter((t) => t !== id), id]))
  const showTool = (id: BimTool): void => {
    if (openTools.includes(id)) return raiseTool(id)
    setToolPos((pos) => ({ ...pos, [id]: placeTool(id, openTools, pos) }))
    setOpenTools((cur) => [...cur, id])
  }
  const hideTool = (id: BimTool): void => setOpenTools((cur) => cur.filter((t) => t !== id))
  const toggleTool = (id: BimTool): void => (openTools.includes(id) ? hideTool(id) : showTool(id))
  // A window never ends up out of view when the 3D area shrinks.
  useEffect(() => {
    setToolPos((pos) => {
      let changed = false
      const next = { ...pos }
      for (const id of openTools) {
        const p = pos[id]
        const el = panelRefs.current[id]
        if (!p || !el) continue
        const c = clampPos(p, el.offsetWidth, el.offsetHeight)
        if (c.x !== p.x || c.y !== p.y) {
          next[id] = c
          changed = true
        }
      }
      return changed ? next : pos
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlaySize.w, overlaySize.h])
  const startDrag = (id: BimTool) => (e: React.PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('button')) return
    const el = panelRefs.current[id]
    const start = toolPos[id]
    if (!el || !start) return
    e.preventDefault()
    raiseTool(id)
    const origin = { x: e.clientX, y: e.clientY }
    el.classList.add('dragging')
    const move = (ev: PointerEvent): void => {
      const next = clampPos({ x: start.x + ev.clientX - origin.x, y: start.y + ev.clientY - origin.y }, el.offsetWidth, el.offsetHeight)
      setToolPos((pos) => ({ ...pos, [id]: next }))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.classList.remove('dragging')
      movedTools.current.add(id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const [elements, setElements] = useState<BimElement[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)
  // Everything picked in the 3D view (Ctrl/Shift+click adds or removes); `selected` is the last one clicked, with its attributes.
  const [picked, setPicked] = useState<BimElement[]>([])
  const pickedRef = useRef<BimElement[]>([])
  pickedRef.current = picked
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const say = (message: string): void => {
    setFlash(message)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 3500)
  }

  // Search state.
  const [drafts, setDrafts] = useState<Draft[]>([newRule()])
  const [match, setMatch] = useState<'and' | 'or'>('and')
  const [searchName, setSearchName] = useState('')
  const [isolate, setIsolate] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupSource, setGroupSource] = useState<'selection' | 'search'>('selection')
  const [groupColor, setGroupColor] = useState<string | null>(null)

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

    const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBF.PostproductionRenderer>()
    world.scene = new OBC.SimpleScene(components)
    world.scene.setup()
    world.scene.three.background = new THREE.Color(canvasColor())
    // The postproduction renderer draws the pen-line edges and the hover outline.
    world.renderer = new OBF.PostproductionRenderer(components, host)
    // That renderer makes its container `position: relative`, which would collapse our absolutely-sized canvas holder.
    host.style.position = 'absolute'
    host.style.inset = '0'
    world.renderer.resize()
    // Clean viewport: That Open's own switch for its corner logo (credited in THIRD_PARTY_NOTICES.md).
    world.renderer.showLogo = false
    world.camera = new OBC.OrthoPerspectiveCamera(components)
    worldRef.current = world
    components.init()
    // The outline pass lives in the postproduction pipeline, so that has to be up before the Outliner is used.
    world.renderer.postproduction.enabled = true
    world.renderer.postproduction.style = viewerRef.current.edges ? OBF.PostproductionAspect.COLOR_PEN : OBF.PostproductionAspect.COLOR
    const outliner = components.get(OBF.Outliner)
    outliner.world = world
    outliner.enabled = true
    outliner.create('hover', { color: new THREE.Color('#8b5cf6'), thickness: 3, fillColor: new THREE.Color('#8b5cf6'), fillOpacity: 0.12, priority: 1 })
    outlinerRef.current = outliner
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
    const hitAt = async (e: PointerEvent): Promise<{ model: FRAGS.FragmentsModel; localId: number } | null> => {
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
      return hit
    }
    const pick = async (e: PointerEvent): Promise<void> => {
      const hit = await hitAt(e)
      const additive = e.ctrlKey || e.shiftKey || e.metaKey
      if (!hit) {
        // A click on empty space clears the selection; with Ctrl/Shift held it leaves it alone.
        if (!additive) {
          setSelected(null)
          setPicked([])
        }
        return
      }
      const [data] = await hit.model.getItemsData([hit.localId], { attributesDefault: true })
      const rows = flatten((data ?? {}) as Record<string, unknown>)
      const known = elementsRef.current.find((el) => el.modelId === hit.model.modelId && el.localId === hit.localId)
      const element: BimElement = known ?? {
          modelId: hit.model.modelId,
          localId: hit.localId,
          guid: rows.find(([k]) => k === '_guid')?.[1] ?? '',
          category: rows.find(([k]) => k === '_category')?.[1] ?? '',
          name: '',
          storey: ''
        }
      const was = pickedRef.current.some((p) => same(p, element))
      if (additive && was) {
        setPicked((prev) => prev.filter((p) => !same(p, element)))
        setSelected(null)
        return
      }
      setPicked((prev) => (additive ? [...prev, element] : [element]))
      setSelected({ element, attributes: rows.filter(([k]) => !k.startsWith('_')) })
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

    // Hover: outline the element under the cursor. One pick at a time, always for the latest cursor position,
    // and none while a button is held (orbiting or panning).
    let hovered: { modelId: string; localId: number } | null = null
    let hoverBusy = false
    let hoverPending: PointerEvent | null = null
    const clearHover = (): void => {
      hoverPending = null
      if (hovered) {
        hovered = null
        outliner.clean('hover')
      }
    }
    clearHoverRef.current = clearHover
    const runHover = async (): Promise<void> => {
      hoverBusy = true
      while (hoverPending) {
        const ev = hoverPending
        hoverPending = null
        const hit = await hitAt(ev)
        if (!viewerRef.current.hover) continue
        const next = hit ? { modelId: hit.model.modelId, localId: hit.localId } : null
        if (next?.modelId === hovered?.modelId && next?.localId === hovered?.localId) continue
        outliner.clean('hover')
        hovered = next
        if (next) await outliner.addItems({ [next.modelId]: new Set([next.localId]) }, 'hover')
      }
      hoverBusy = false
    }
    const onMove = (e: PointerEvent): void => {
      if (!viewerRef.current.hover) return
      if (e.buttons !== 0) return clearHover()
      hoverPending = e
      if (!hoverBusy) void runHover()
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', clearHover)
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'Escape' || pickedRef.current.length === 0) return
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      setPicked([])
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', clearHover)
      window.removeEventListener('keydown', onKey)
      readyRef.current = null
      worldRef.current = null
      componentsRef.current = null
      components.dispose()
    }
  }, [hostEl])

  useImperativeHandle(ref, () => ({
    openTool(next: BimTool) {
      showTool(next)
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
  const query: Query | null = useMemo(() => {
    const rules = drafts.map(toRule).filter((r): r is Rule => r !== null)
    return rules.length > 0 ? { op: match, rules } : null
  }, [drafts, match])
  const results = useMemo(() => (query ? evaluate(query, elements) : []), [query, elements])
  const propKeys = useMemo(() => propertyKeys(elements), [elements])
  const queryText = query ? describeRules(query.rules, query.op) : ''
  const setDraft = (id: string, change: Partial<Draft>): void => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...change } : d)))
  const clearSearch = (): void => {
    setDrafts([newRule()])
    setMatch('and')
  }
  const savedSearches = bim.searches ?? []
  const saveSearch = (): void => {
    const name = searchName.trim()
    if (!name || !query) return
    const search: BimSearch = { id: newId(), name, match, rules: query.rules.filter((r): r is Rule => !('rules' in r)) }
    onBimChange({ ...bim, searches: [...savedSearches, search] })
    setSearchName('')
    say(`Búsqueda «${name}» guardada`)
  }
  const loadSearch = (s: BimSearch): void => {
    setMatch(s.match)
    setDrafts(s.rules.map((r) => ({ id: newId(), field: r.field, op: r.op, value: Array.isArray(r.value) ? r.value.join(', ') : r.value })))
  }
  const deleteSearch = (id: string): void => onBimChange({ ...bim, searches: savedSearches.filter((x) => x.id !== id) })

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
        const pickedIds = picked.filter((p) => p.modelId === modelId).map((p) => p.localId)
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
          if (pickedIds.length > 0) await model.highlight(pickedIds, highlightMaterial(SELECT_COLOR))
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
        if (pickedIds.length > 0) await model.highlight(pickedIds, highlightMaterial(SELECT_COLOR))
      }
      manager.core.update(true)
    })()
  }, [results, isolate, taskSet, picked, elements, phases, hideUnlinked])

  // ---- actions ----
  const links = bim.links
  const setLinks = (next: typeof links): void => onBimChange({ ...bim, links: next })
  const pickedGuids = picked.map((p) => p.guid).filter(Boolean)
  const allPickedAssigned = pickedGuids.length > 0 && pickedGuids.every((g) => link?.guids.includes(g))
  const assignPicked = (): void => {
    if (!task || pickedGuids.length === 0) return
    setLinks(addElementsToTask(links, task.id, pickedGuids))
    say(`${plural(pickedGuids.length, 'elemento asignado', 'elementos asignados')} a «${task.text}»`)
  }
  const unassignPicked = (): void => {
    if (!task) return
    setLinks(removeElementsFromTask(links, task.id, pickedGuids))
    say(`${plural(pickedGuids.length, 'elemento quitado', 'elementos quitados')} de «${task.text}»`)
  }
  const clearPicked = (): void => {
    setPicked([])
    setSelected(null)
  }
  /** Shows these elements as the current selection in the 3D view. */
  const selectGuids = (guids: Iterable<string>, label: string): void => {
    const set = new Set(guids)
    const els = elements.filter((e) => set.has(e.guid))
    setPicked(els)
    setSelected(null)
    say(els.length > 0 ? `${label}: ${plural(els.length, 'elemento seleccionado', 'elementos seleccionados')}` : `${label}: no hay elementos en los modelos cargados`)
  }
  // A new group comes from what is picked, or from the search, whichever the user chose (the selection when only one exists).
  const groupFrom: 'selection' | 'search' | null =
    picked.length > 0 && (groupSource === 'selection' || !query) ? 'selection' : query ? 'search' : null
  const nextColor = GROUP_COLORS[bim.groups.length % GROUP_COLORS.length]
  const saveGroup = (): void => {
    const name = groupName.trim()
    if (!name || !groupFrom) return
    const fromPicked = groupFrom === 'selection'
    const group: BimGroup = {
      id: newId(),
      name,
      color: groupColor ?? nextColor,
      query: fromPicked ? { op: 'or', rules: [] } : query!,
      manualInclude: fromPicked ? pickedGuids : [],
      manualExclude: []
    }
    onBimChange({ ...bim, groups: [...bim.groups, group] })
    setGroupName('')
    setGroupColor(null)
    say(`Grupo «${name}» creado con ${plural(resolveGroup(group, elements).size, 'elemento', 'elementos')}`)
  }

  const selectionBar =
    picked.length > 0 || flash ? (
      <div className="bim-selbar" role="status">
        {picked.length > 0 && (
          <>
            <div className="bim-selbar-main">
              <span className="bim-selbar-dot" />
              <div className="bim-selbar-text">
                <b>{plural(picked.length, 'elemento seleccionado', 'elementos seleccionados')}</b>
                <span>{describeElements(picked)}</span>
              </div>
              <Tooltip label="Quitar la selección (Esc)">
                <button className="icon-btn" aria-label="Quitar la selección" onClick={clearPicked}>
                  <X size={14} />
                </button>
              </Tooltip>
            </div>
            <div className="bim-selbar-actions">
              {task ? (
                allPickedAssigned ? (
                  <button onClick={unassignPicked}>Quitar de «{task.text}»</button>
                ) : (
                  <button className="primary" onClick={assignPicked}>
                    Asignar a «{task.text}»
                  </button>
                )
              ) : (
                <span className="bim-muted">Elige una tarea en el Gantt para asignarla</span>
              )}
              <button
                onClick={() => {
                  setGroupSource('selection')
                  showTool('groups')
                }}
              >
                Crear grupo
              </button>
            </div>
            <div className="bim-selbar-hint">Ctrl + clic suma o quita · clic en vacío o Esc deselecciona</div>
          </>
        )}
        {flash && (
          <div className="bim-selbar-flash">
            <Check size={14} /> {flash}
          </div>
        )}
      </div>
    ) : null

  const viewerUi = (
    <div className="bim-viewer">
      <div className="bim-search">
        <span className="panel-title">Visor 3D</span>
        <Tooltip label="Importar modelo IFC…">
          <button className="icon-btn" onClick={onImport} aria-label="Importar IFC">
            <Upload size={16} />
          </button>
        </Tooltip>
        <span className="sep" />
        <div className="bim-toolbar" role="toolbar" aria-label="Herramientas BIM">
          {TOOLS.map((t) => (
            <Tooltip key={t.id} label={t.label} side="bottom">
              <button className={`icon-btn${openTools.includes(t.id) ? ' active' : ''}`} aria-label={t.label} aria-pressed={openTools.includes(t.id)} onClick={() => toggleTool(t.id)}>
                {t.icon}
              </button>
            </Tooltip>
          ))}
        </div>
        <ViewerSettingsMenu settings={viewer} onChange={changeViewer} />
        {query ? (
          <button className="bim-searchbtn" onClick={() => showTool('search')}>
            <Search size={14} /> <span className="bim-searchbtn-text">{queryText}</span>
          </button>
        ) : (
          <span className="bim-spacer" />
        )}
        {query && (
          <Tooltip label="Quitar la búsqueda">
            <button className="icon-btn" aria-label="Quitar la búsqueda" onClick={clearSearch}>
              <X size={14} />
            </button>
          </Tooltip>
        )}
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
        <button onClick={clearPicked}>Deseleccionar</button>
      </div>
      {picked.length > 1 && <div className="bim-muted">Con {picked.length} elementos seleccionados; aquí se muestra el último que tocaste.</div>}
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

  // Properties for the field picker: the built-in ones, then each property set's, grouped under its name.
  const fieldChoices: DropdownOption<string>[] = [
    ...Object.entries(BUILTIN_LABELS).map(([value, label]) => ({ value, label, group: 'General' })),
    ...propKeys.map(({ key }) => {
      const set = key.split('.')[0]
      return { value: key, label: key.slice(set.length + 1), group: set }
    })
  ]
  const opChoices = (current: RuleOp): DropdownOption<string>[] => OPS.filter((o) => o.op !== 'in' || current === 'in').map((o) => ({ value: o.op, label: o.label }))

  const searchUi = (
    <div className="panel-body bim-search-panel">
      <div className="bim-seg" role="radiogroup" aria-label="Cómo combinar las condiciones">
        <button role="radio" aria-checked={match === 'and'} className={match === 'and' ? 'on' : ''} onClick={() => setMatch('and')}>
          Cumplir todas (Y)
        </button>
        <button role="radio" aria-checked={match === 'or'} className={match === 'or' ? 'on' : ''} onClick={() => setMatch('or')}>
          Cumplir alguna (O)
        </button>
      </div>
      {drafts.map((d) => (
        <div key={d.id} className="bim-rule">
          <Dropdown
            block
            searchable
            label="Propiedad"
            value={d.field}
            options={fieldChoices.some((o) => o.value === d.field) ? fieldChoices : [{ value: d.field, label: fieldLabel(d.field), group: 'Otras' }, ...fieldChoices]}
            onChange={(v) => setDraft(d.id, { field: v, value: '' })}
          />
          <div className="bim-rule-row">
            <Dropdown block label="Condición" value={d.op} options={opChoices(d.op)} onChange={(v) => setDraft(d.id, { op: v as RuleOp })} />
            <Tooltip label="Quitar esta condición">
              <button className="icon-btn" aria-label="Quitar condición" onClick={() => setDrafts((ds) => (ds.length > 1 ? ds.filter((x) => x.id !== d.id) : [newRule()]))}>
                <X size={14} />
              </button>
            </Tooltip>
          </div>
          {needsValue(d.op) && <SuggestInput value={d.value} onChange={(v) => setDraft(d.id, { value: v })} suggestions={facets(elements, d.field).slice(0, 200)} placeholder="Valor…" />}
        </div>
      ))}
      <button className="bim-addrule" onClick={() => setDrafts((ds) => [...ds, newRule()])}>
        <Plus size={13} /> Agregar condición
      </button>

      <div className="bim-results">
        <b>{query ? `${results.length} de ${elements.length} elementos` : 'Completa una condición'}</b>
        <div className="bim-group-actions">
          <button className="primary" disabled={results.length === 0} onClick={() => selectGuids(results.map((r) => r.guid), 'Búsqueda')}>
            Seleccionar resultados
          </button>
          <button
            disabled={results.length === 0}
            onClick={() => {
              setGroupSource('search')
              showTool('groups')
            }}
          >
            Crear grupo
          </button>
          <button onClick={clearSearch}>Limpiar</button>
        </div>
        <label className="bim-isolate">
          <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} /> Aislar los resultados en el modelo
        </label>
      </div>

      <div className="bim-label">Guardar esta búsqueda</div>
      <div className="bim-newgroup">
        <input value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Nombre, p. ej. Muros F60" onKeyDown={(e) => e.key === 'Enter' && saveSearch()} />
        <button disabled={!query || !searchName.trim()} onClick={saveSearch}>
          Guardar
        </button>
      </div>

      <div className="bim-label">Búsquedas guardadas ({savedSearches.length})</div>
      {savedSearches.length === 0 && <div className="bim-muted">Las que guardes quedan en el proyecto.</div>}
      {savedSearches.map((s) => (
        <div key={s.id} className="bim-group-card">
          <div className="bim-group-top">
            <span className="bim-group-name">
              <b>{s.name}</b> <span className="bim-muted">· {plural(evaluate({ op: s.match, rules: s.rules }, elements).length, 'resultado', 'resultados')}</span>
            </span>
            <Tooltip label="Eliminar la búsqueda">
              <button className="icon-btn" aria-label={`Eliminar ${s.name}`} onClick={() => deleteSearch(s.id)}>
                <Trash2 size={14} />
              </button>
            </Tooltip>
          </div>
          <span className="bim-muted bim-group-desc">{describeRules(s.rules, s.match)}</span>
          <div className="bim-group-actions">
            <button className="primary" onClick={() => loadSearch(s)}>
              Aplicar
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  const groupOf = (id: string): BimGroup | undefined => bim.groups.find((g) => g.id === id)
  const looseCount = link?.guids.length ?? 0
  const unassignedGroups = bim.groups.filter((g) => !link?.groupIds.includes(g.id))

  const taskUi = (
    <div className="panel-body bim-task">
      {!task ? (
        <div className="bim-empty">
          <b>Ninguna tarea elegida</b>
          <span>Haz clic en una tarea del Gantt y aquí podrás asignarle elementos del modelo.</span>
        </div>
      ) : (
        <>
          <div className="bim-task-card">
            <span className="bim-muted">Tarea elegida en el Gantt</span>
            <b>{task.text}</b>
            <span className="bim-task-total">
              {taskSet.size === 0 ? 'Sin elementos asignados' : `${plural(taskSet.size, 'elemento', 'elementos')} (se ven en verde)`}
            </span>
            {taskSet.size > 0 && (
              <button onClick={() => selectGuids(taskSet, `«${task.text}»`)}>
                <Eye size={13} /> Ver en el visor
              </button>
            )}
          </div>

          {(link?.groupIds.length ?? 0) + looseCount > 0 && (
            <>
              <div className="bim-label">Asignado por</div>
              <div className="bim-chips">
                {(link?.groupIds ?? []).map((id) => {
                  const group = groupOf(id)
                  return group ? (
                    <span key={id} className="bim-chip" style={{ borderColor: group.color }}>
                      {group.name} · {resolveGroup(group, elements).size}
                      <Tooltip label="Quitar este grupo de la tarea">
                        <button aria-label="Quitar grupo" onClick={() => setLinks(removeGroupFromTask(links, task.id, id))}>
                          ×
                        </button>
                      </Tooltip>
                    </span>
                  ) : null
                })}
                {looseCount > 0 && (
                  <span className="bim-chip">
                    {plural(looseCount, 'elemento suelto', 'elementos sueltos')}
                    <Tooltip label="Ver estos elementos en el visor">
                      <button aria-label="Ver elementos sueltos" onClick={() => selectGuids(link?.guids ?? [], 'Sueltos')}>
                        <Eye size={12} />
                      </button>
                    </Tooltip>
                    <Tooltip label="Quitar los elementos sueltos de la tarea">
                      <button aria-label="Quitar elementos sueltos" onClick={() => setLinks(removeElementsFromTask(links, task.id, link?.guids ?? []))}>
                        ×
                      </button>
                    </Tooltip>
                  </span>
                )}
              </div>
            </>
          )}

          <div className="bim-label">Agregar a la tarea</div>
          <div className="bim-adds">
            <div className="bim-add">
              <div>
                <b>Lo que tienes seleccionado</b>
                <span className="bim-muted">{picked.length > 0 ? `${plural(picked.length, 'elemento', 'elementos')} · ${describeElements(picked)}` : 'Haz clic en el modelo (Ctrl + clic suma más)'}</span>
              </div>
              <button className="primary" disabled={picked.length === 0 || allPickedAssigned} onClick={assignPicked}>
                {allPickedAssigned ? 'Ya asignado' : 'Asignar'}
              </button>
            </div>
            <div className="bim-add">
              <div>
                <b>Resultado de la búsqueda</b>
                <span className="bim-muted">{query ? `${plural(results.length, 'elemento', 'elementos')} · ${queryText}` : 'Define una búsqueda en «Buscar elementos»'}</span>
              </div>
              <button
                disabled={!query || results.length === 0}
                onClick={() => {
                  setLinks(addElementsToTask(links, task.id, results.map((r) => r.guid)))
                  say(`${plural(results.length, 'elemento asignado', 'elementos asignados')} a «${task.text}»`)
                }}
              >
                Asignar
              </button>
            </div>
            {unassignedGroups.length > 0 && (
              <div className="bim-add bim-add-groups">
                <b>Un grupo guardado</b>
                <div className="bim-chips">
                  {unassignedGroups.map((g) => (
                    <button key={g.id} className="bim-chip bim-chip-add" style={{ borderColor: g.color }} onClick={() => setLinks(addGroupToTask(links, task.id, g.id))}>
                      <Plus size={12} /> {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

  const groupsUi = (
    <div className="panel-body bim-groups">
      <div className="bim-label">Crear un grupo</div>
      <div className="bim-newgroup-card">
        {groupFrom === null ? (
          <span className="bim-muted">Un grupo guarda un conjunto de elementos con un nombre. Selecciona elementos en el modelo (Ctrl + clic para varios) o define una búsqueda, y vuelve aquí.</span>
        ) : (
          <>
            {picked.length > 0 && query && (
              <div className="bim-seg" role="radiogroup" aria-label="Origen del grupo">
                <button role="radio" aria-checked={groupFrom === 'selection'} className={groupFrom === 'selection' ? 'on' : ''} onClick={() => setGroupSource('selection')}>
                  Mi selección ({picked.length})
                </button>
                <button role="radio" aria-checked={groupFrom === 'search'} className={groupFrom === 'search' ? 'on' : ''} onClick={() => setGroupSource('search')}>
                  Mi búsqueda ({results.length})
                </button>
              </div>
            )}
            <span className="bim-muted">
              {groupFrom === 'selection'
                ? `Se guardarán estos ${plural(picked.length, 'elemento', 'elementos')}: ${describeElements(picked)}`
                : `Reúne todo lo que cumpla: ${queryText}. Se actualiza si cambia el modelo.`}
            </span>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Nombre del grupo, p. ej. Muros piso 1" onKeyDown={(e) => e.key === 'Enter' && saveGroup()} />
            <div className="bim-colors" role="radiogroup" aria-label="Color del grupo">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={(groupColor ?? nextColor) === c}
                  className={(groupColor ?? nextColor) === c ? 'on' : ''}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => setGroupColor(c)}
                />
              ))}
            </div>
            <button className="primary" disabled={!groupName.trim()} onClick={saveGroup}>
              Guardar grupo
            </button>
          </>
        )}
      </div>

      <div className="bim-label">Grupos guardados ({bim.groups.length})</div>
      {bim.groups.length === 0 && <div className="bim-muted">Aún no hay grupos.</div>}
      {bim.groups.map((group) => {
        const count = resolveGroup(group, elements).size
        const assigned = !!link?.groupIds.includes(group.id)
        return (
          <div key={group.id} className="bim-group-card">
            <div className="bim-group-top">
              <span className="bim-swatch" style={{ background: group.color }} />
              <span className="bim-group-name">
                <b>{group.name}</b> <span className="bim-muted">· {plural(count, 'elemento', 'elementos')}</span>
              </span>
              <Tooltip label="Eliminar el grupo">
                <button className="icon-btn" aria-label={`Eliminar ${group.name}`} onClick={() => setPendingRemoval({ kind: 'group', id: group.id, name: group.name })}>
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </div>
            <span className="bim-muted bim-group-desc">{describeGroup(group)}</span>
            <div className="bim-group-actions">
              <button onClick={() => selectGuids(resolveGroup(group, elements), group.name)}>
                <Eye size={13} /> Ver
              </button>
              {task &&
                (assigned ? (
                  <button onClick={() => setLinks(removeGroupFromTask(links, task.id, group.id))}>
                    <Check size={13} /> En «{task.text}» · quitar
                  </button>
                ) : (
                  <button className="primary" onClick={() => setLinks(addGroupToTask(links, task.id, group.id))}>
                    Asignar a «{task.text}»
                  </button>
                ))}
              {!task && <span className="bim-muted">Elige una tarea para asignarlo</span>}
            </div>
          </div>
        )
      })}
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
            {selectionBar}
            {openTools.map((id, i) => {
              const def = TOOLS.find((t) => t.id === id)!
              const pos = toolPos[id] ?? { x: Math.max(0, overlaySize.w - PANEL_W - PANEL_GAP), y: PANEL_GAP }
              return (
                <div
                  key={id}
                  ref={(el) => {
                    panelRefs.current[id] = el
                  }}
                  className="bim-tool-panel"
                  style={{ left: pos.x, top: pos.y, zIndex: 10 + i, maxHeight: Math.max(160, overlaySize.h - 24) }}
                  role="dialog"
                  aria-label={def.label}
                  onPointerDown={() => raiseTool(id)}
                >
                  <div className="bim-tool-head" onPointerDown={startDrag(id)}>
                    <b>
                      {def.icon} {def.label}
                    </b>
                    <button className="icon-btn" aria-label="Cerrar" onClick={() => hideTool(id)}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="bim-tool-body">{{ search: searchUi, task: taskUi, groups: groupsUi, props: propsUi, models: modelsUi }[id]}</div>
                </div>
              )
            })}
          </>,
          overlayEl
        )}
    </>
  )
}
