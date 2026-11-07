import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from 'three'
// Served from our own bundle: the default helper downloads the worker from a CDN.
import workerUrl from '@thatopen/fragments/worker?url'
import { evaluate, facets, type BimElement, type Query, type RuleField } from '@shared/bimQuery'
import { indexModel } from './indexModel'

export interface BimViewerHandle {
  /** Converts an IFC file to fragments in the browser and shows it. */
  loadIfc(file: File): Promise<void>
}

interface Props {
  ref?: Ref<BimViewerHandle>
}

type Status = { kind: 'idle' } | { kind: 'loading'; name: string; progress: number } | { kind: 'error'; message: string }
type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>

const SELECT_COLOR = new THREE.Color('#f59e0b')
const MATCH_COLOR = new THREE.Color('#8b5cf6')
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

export default function BimViewer({ ref }: Props): React.JSX.Element {
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

  const elementsRef = useRef<BimElement[]>([])
  elementsRef.current = elements

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
      for (const [, model] of manager.list) await model.resetHighlight()
      if (!hit) {
        setSelected(null)
        manager.core.update(true)
        return
      }
      await hit.model.highlight([hit.localId], highlightMaterial(SELECT_COLOR))
      manager.core.update(true)
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

  // Paint the matches (and optionally hide everything else) whenever the search changes.
  useEffect(() => {
    const manager = componentsRef.current?.get(OBC.FragmentsManager)
    if (!manager || !manager.initialized) return
    void (async () => {
      for (const [modelId, model] of manager.list) {
        const ids = results.filter((r) => r.modelId === modelId).map((r) => r.localId)
        await model.resetHighlight()
        await model.resetVisible()
        if (ids.length > 0) {
          await model.highlight(ids, highlightMaterial(MATCH_COLOR))
          if (isolate) {
            const keep = new Set(ids)
            const hide = elementsRef.current.filter((e) => e.modelId === modelId && !keep.has(e.localId)).map((e) => e.localId)
            await model.setVisible(hide, false)
          }
        }
      }
      manager.core.update(true)
    })()
  }, [results, isolate])

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
    </div>
  )
}
