import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal } from 'lucide-react'
import Tooltip from '../Tooltip'
import { SwitchRow } from '../gantt/GanttSettingsMenu'
import type { AntiAliasing, CameraFeel, EdgeWidth, Shadows, ViewerSettings } from './viewerSettings'

const FEELS: { id: CameraFeel; label: string }[] = [
  { id: 'agile', label: 'Ágil' },
  { id: 'normal', label: 'Normal' },
  { id: 'smooth', label: 'Suave' }
]
const SHADOWS: { id: Shadows; label: string }[] = [
  { id: 'off', label: 'Sin' },
  { id: 'soft', label: 'Suaves' },
  { id: 'strong', label: 'Fuertes' }
]
const EDGE_WIDTHS: { id: EdgeWidth; label: string }[] = [
  { id: 'thin', label: 'Fino' },
  { id: 'normal', label: 'Normal' },
  { id: 'thick', label: 'Grueso' }
]
const AA: { id: AntiAliasing; label: string }[] = [
  { id: 'off', label: 'Sin' },
  { id: 'fast', label: 'Rápido' },
  { id: 'high', label: 'Alta calidad' }
]

/** A choice among a few options: its name, a line saying what it does, and the buttons. */
function Choice<T extends string>({ label, hint, value, options, onPick, disabled }: { label: string; hint: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void; disabled?: boolean }): React.JSX.Element {
  return (
    <div className={`viewer-choice${disabled ? ' disabled' : ''}`}>
      <span className="switch-label">{label}</span>
      <span className="switch-hint">{hint}</span>
      <div className="bim-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} disabled={disabled} className={value === o.id ? 'on' : ''} onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

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
            <Choice label="Grosor de los bordes" hint="Más fino se ve más técnico; más grueso, más marcado" value={settings.edgeWidth} options={EDGE_WIDTHS} disabled={!settings.edges} onPick={(edgeWidth) => onChange({ ...settings, edgeWidth })} />
            <Choice label="Sombras" hint="Oscurece las esquinas y huecos donde se juntan las superficies" value={settings.shadows} options={SHADOWS} onPick={(shadows) => onChange({ ...settings, shadows })} />
            <SwitchRow label="Resaltar al pasar el mouse" hint="Marca el contorno del elemento bajo el cursor" on={settings.hover} onToggle={() => onChange({ ...settings, hover: !settings.hover })} />
            <div className="menu-sep" />
            <div className="menu-title">Calidad</div>
            <Choice label="Suavizado de bordes (antialiasing)" hint="Quita los dientes de sierra en líneas y aristas; «Alta calidad» pide más a la tarjeta gráfica" value={settings.antialiasing} options={AA} onPick={(antialiasing) => onChange({ ...settings, antialiasing })} />
            <SwitchRow label="Mantener la fluidez" hint="Baja la resolución sola cuando el modelo es pesado y se entrecorta" on={settings.adaptive} onToggle={() => onChange({ ...settings, adaptive: !settings.adaptive })} />
            <div className="menu-sep" />
            <div className="menu-title">Cámara</div>
            <Choice label="Respuesta al mover el mouse" hint="Ágil sigue al mouse sin retraso; Suave desliza al soltar" value={settings.camera} options={FEELS} onPick={(camera) => onChange({ ...settings, camera })} />
          </div>,
          document.body
        )}
    </>
  )
}
