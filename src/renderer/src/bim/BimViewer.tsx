import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import * as OBC from '@thatopen/components'
import * as THREE from 'three'
// Served from our own bundle: the default helper downloads the worker from a CDN.
import workerUrl from '@thatopen/fragments/worker?url'

export interface BimViewerHandle {
  /** Converts an IFC file to fragments in the browser and shows it. */
  loadIfc(file: File): Promise<void>
}

interface Props {
  ref?: Ref<BimViewerHandle>
}

type Status = { kind: 'idle' } | { kind: 'loading'; name: string; progress: number } | { kind: 'error'; message: string }

export default function BimViewer({ ref }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const componentsRef = useRef<OBC.Components | null>(null)
  const worldRef = useRef<OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer> | null>(
    null
  )
  const readyRef = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [models, setModels] = useState<string[]>([])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const components = new OBC.Components()
    componentsRef.current = components

    const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>()
    world.scene = new OBC.SimpleScene(components)
    world.scene.setup()
    world.scene.three.background = new THREE.Color(0xf4f4f5)
    world.renderer = new OBC.SimpleRenderer(components, host)
    world.camera = new OBC.OrthoPerspectiveCamera(components)
    worldRef.current = world
    components.init()

    const grids = components.get(OBC.Grids)
    grids.create(world)

    const fragments = components.get(OBC.FragmentsManager)
    readyRef.current = (async () => {
      fragments.init(workerUrl)
      world.camera.controls.addEventListener('update', () => fragments.core.update())
      world.onCameraChanged.add((camera) => {
        for (const [, model] of fragments.list) model.useCamera(camera.three)
        fragments.core.update(true)
      })
      fragments.list.onItemSet.add(({ value: model }) => {
        model.useCamera(world.camera.three)
        world.scene.three.add(model.object)
        fragments.core.update(true)
      })
      const ifcLoader = components.get(OBC.IfcLoader)
      // web-ifc.wasm is copied to /wasm by scripts/copy-wasm.mjs (no CDN).
      await ifcLoader.setup({
        autoSetWasm: false,
        wasm: { path: new URL('wasm/', document.baseURI).href, absolute: true }
      })
    })()

    return () => {
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
        setModels((m) => [...m, file.name])
        // Frame the new model.
        const box = new THREE.Box3().setFromObject(model.object)
        if (!box.isEmpty()) await world.camera.controls.fitToBox(box, true)
        setStatus({ kind: 'idle' })
      } catch (error) {
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
  }))

  return (
    <div className="bim-viewer">
      <div ref={hostRef} className="bim-canvas" />
      {status.kind === 'loading' && (
        <div className="bim-status">
          Convirtiendo {status.name}… {Math.round(status.progress * 100)}%
        </div>
      )}
      {status.kind === 'error' && <div className="bim-status error">No se pudo cargar el IFC: {status.message}</div>}
      {status.kind === 'idle' && models.length === 0 && (
        <div className="bim-status">Importa un archivo .ifc para verlo aquí.</div>
      )}
    </div>
  )
}
