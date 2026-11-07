import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
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
  type BimGroup
} from '@shared/bimGroups'
import { indexModel } from './indexModel'

export interface BimViewerHandle {
  /** Converts an IFC file to fragments in the browser and shows it. */
  loadIfc(file: File): Promise<void>
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
}

type Status = { kind: 'idle' } | { kind: 'loading'; name: string; progress: number } | { kind: 'error'; message: string }
type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>

const SELECT_COLOR = new THREE.Color('#f59e0b')
const MATCH_COLOR = new THREE.Color('#8b5cf6')
const TASK_COLOR = new THREE.Color('#22c55e')
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
  taskText
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const componentsRef = useRef<OBC.Components | null>(null)
  const worldRef = useRef<World | null>(null)
  const readyRef = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [elements, setElements] = useState<BimElement[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)

  // Search state.
  const [field, setField] = useState<RuleField>('category')
  const [text, setText] = useState('')
  const [isolate, setIsolate] = useState(false)
  const [groupName, setGroupName] = useState('')

  const elementsRef = useRef<BimElement[]>([])
  elementsRef.current = elements

  useEffect(() => {
    onElementsChange(elements)
  }, [elements, onElementsChange])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const components = new OBC.Components()
    componentsRef.current = components
    if (import.meta.env.DEV) (window as unknown as { __bim: OBC.Components }).__bim = components

    const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>()
    world.scene = new OBC.SimpleScene(components)
    world.scene.setup()
    world.scene.three.background = new THREE.Color(0xf4f4f5)
    world.renderer = new OBC.SimpleRenderer(components, host)
    world.camera = new OBC.OrthoPerspectiveCamera(components)
    worldRef.current = world
    components.init()
    components.get(OBC.Grids).create(world)

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
  }, [])

  useImperativeHandle(ref, () => ({
    async loadIfc(file: File) {
      const components = componentsRef.current
      const world = worldRef.current
      if (!components || !world || !readyRef.current) return
      setStatus({ kind: 'loading', name: file.name, progress: 0 })
      try {
        await readyRef.current
        const data = new Uint8Array(await file.arrayBuffer())
        const ifcLoader = components.get(OBC.IfcLoader)
        const modelId = `${file.name}-${Date.now()}`
        const model = await ifcLoader.load(data, true, modelId, {
          processData: { progressCallback: (progress: number) => setStatus({ kind: 'loading', name: file.name, progress }) }
        })
        const box = new THREE.Box3().setFromObject(model.object)
        if (!box.isEmpty()) await world.camera.controls.fitToBox(box, true)
        const indexed = await indexModel(model)
        setElements((prev) => [...prev, ...indexed])
        setStatus({ kind: 'idle' })
      } catch (error) {
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
  }))

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
  }, [results, isolate, taskSet, selected, elements])

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

  return (
    <div className="bim-viewer">
      <div className="bim-search">
        <select value={field} onChange={(e) => setField(e.target.value as RuleField)}>
          {FIELDS.map((f) => (
            <option key={f.field} value={f.field}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          list="bim-suggestions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buscar elementos…"
          disabled={elements.length === 0}
        />
        <datalist id="bim-suggestions">
          {suggestions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.count}
            </option>
          ))}
        </datalist>
        <label className="bim-isolate">
          <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} /> Aislar
        </label>
        <span className="bim-count">{query ? `${results.length} de ${elements.length}` : `${elements.length} elementos`}</span>
      </div>

      <div className="bim-stage">
        <div ref={hostRef} className="bim-canvas" />
        {status.kind === 'loading' && (
          <div className="bim-status">
            Convirtiendo {status.name}… {Math.round(status.progress * 100)}%
          </div>
        )}
        {status.kind === 'error' && <div className="bim-status error">No se pudo cargar el IFC: {status.message}</div>}
        {status.kind === 'idle' && elements.length === 0 && (
          <div className="bim-status">Importa un archivo .ifc para verlo aquí.</div>
        )}
        {selected && (
          <div className="bim-props">
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
        )}
      </div>

      <div className="bim-side">
        <div className="bim-section">
          <div className="bim-section-title">{task ? `Tarea: ${task.text}` : 'Selecciona una tarea en el Gantt para asignarle elementos'}</div>
          {task && (
            <>
              <div className="bim-chips">
                {(link?.groupIds ?? []).map((id) => {
                  const group = bim.groups.find((g) => g.id === id)
                  return group ? (
                    <span key={id} className="bim-chip" style={{ borderColor: group.color }}>
                      {group.name}
                      <button title="Quitar grupo" onClick={() => setLinks(removeGroupFromTask(links, task.id, id))}>
                        ×
                      </button>
                    </span>
                  ) : null
                })}
                {(link?.guids.length ?? 0) > 0 && (
                  <span className="bim-chip">
                    {link?.guids.length} elementos sueltos
                    <button title="Quitar elementos sueltos" onClick={() => setLinks(removeElementsFromTask(links, task.id, link?.guids ?? []))}>
                      ×
                    </button>
                  </span>
                )}
                {taskSet.size === 0 && <span className="bim-muted">Sin elementos asignados</span>}
                {taskSet.size > 0 && <span className="bim-muted">{taskSet.size} elementos en total (verde)</span>}
              </div>
              {query && results.length > 0 && (
                <button
                  onClick={() => setLinks(addElementsToTask(links, task.id, results.map((r) => r.guid)))}
                >
                  Asignar los {results.length} resultados a la tarea
                </button>
              )}
            </>
          )}
        </div>

        <div className="bim-section">
          <div className="bim-section-title">Grupos</div>
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
          {bim.groups.length === 0 && <div className="bim-muted">Busca algo y guárdalo como grupo.</div>}
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
              <button
                onClick={() => {
                  if (window.confirm(`¿Eliminar el grupo «${group.name}»? Se quita de todas las tareas.`)) {
                    onBimChange(deleteGroup(bim, group.id))
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
