import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal } from 'lucide-react'
import Tooltip from '../Tooltip'
import { SwitchRow } from '../gantt/GanttSettingsMenu'
import type { ViewerSettings } from './viewerSettings'

/** The "Configuración" button of the 3D view: edges, shadows, hover outline and quality. */
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
            <SwitchRow label="Sombras" hint="Oscurece las esquinas y huecos donde se juntan las superficies" on={settings.shadows} onToggle={() => onChange({ ...settings, shadows: !settings.shadows })} />
            <SwitchRow label="Resaltar al pasar el mouse" hint="Marca el contorno del elemento bajo el cursor" on={settings.hover} onToggle={() => onChange({ ...settings, hover: !settings.hover })} />
            <div className="menu-sep" />
            <div className="menu-title">Calidad</div>
            <SwitchRow label="Suavizado de bordes" hint="Quita los dientes de sierra en líneas y aristas" on={settings.antialiasing} onToggle={() => onChange({ ...settings, antialiasing: !settings.antialiasing })} />
            <SwitchRow label="Mantener la fluidez" hint="Baja la resolución sola cuando el modelo es pesado y se entrecorta" on={settings.adaptive} onToggle={() => onChange({ ...settings, adaptive: !settings.adaptive })} />
          </div>,
          document.body
        )}
    </>
  )
}
