import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal } from 'lucide-react'
import Tooltip from '../Tooltip'
import { SwitchRow } from '../gantt/GanttSettingsMenu'
import type { CameraFeel, ViewerSettings } from './viewerSettings'

const FEELS: { id: CameraFeel; label: string }[] = [
  { id: 'agile', label: 'Ágil' },
  { id: 'normal', label: 'Normal' },
  { id: 'smooth', label: 'Suave' }
]

/** The "Configuración" button of the 3D view: edges, hover outline and how the camera responds. */
export default function ViewerSettingsMenu({ settings, onChange }: { settings: ViewerSettings; onChange: (next: ViewerSettings) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return setPos(null)
    const r = button.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.min(r.left, window.innerWidth - 350), y: r.bottom + 6 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!button.current?.contains(t) && !t.closest('.viewer-settings-pop')) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <Tooltip label="Configuración del visor 3D" side="bottom">
        <button ref={button} className={`icon-btn${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Configuración del visor">
          <SlidersHorizontal size={16} />
        </button>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <div className="menu-pop viewer-settings-pop" role="dialog" aria-label="Configuración del visor" style={{ position: 'fixed', left: pos.x, top: pos.y, right: 'auto' }}>
            <div className="menu-title">Apariencia</div>
            <SwitchRow label="Bordes de los elementos" hint="Líneas que marcan las aristas, como un dibujo" on={settings.edges} onToggle={() => onChange({ ...settings, edges: !settings.edges })} />
            <SwitchRow label="Resaltar al pasar el mouse" hint="Marca el contorno del elemento bajo el cursor" on={settings.hover} onToggle={() => onChange({ ...settings, hover: !settings.hover })} />
            <div className="menu-sep" />
            <div className="menu-title">Cámara</div>
            <div className="switch-text" style={{ padding: '2px 8px 6px' }}>
              <span className="switch-label">Respuesta al mover el mouse</span>
              <span className="switch-hint">Ágil sigue al mouse sin retraso; Suave desliza al soltar</span>
            </div>
            <div className="bim-seg" role="radiogroup" aria-label="Respuesta de la cámara" style={{ padding: '0 8px 6px' }}>
              {FEELS.map((f) => (
                <button key={f.id} role="radio" aria-checked={settings.camera === f.id} className={settings.camera === f.id ? 'on' : ''} onClick={() => onChange({ ...settings, camera: f.id })}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
