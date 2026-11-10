import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal } from 'lucide-react'
import Tooltip from '../Tooltip'
import { SwitchRow } from '../gantt/GanttSettingsMenu'
import { EDGE_COLORS, ELEMENT_COLORS, type ViewerSettings } from './viewerSettings'

/** A row of color swatches plus a free color picker. */
function ColorRow({ label, value, colors, onPick }: { label: string; value: string; colors: string[]; onPick: (hex: string) => void }): React.JSX.Element {
  return (
    <div className="viewer-choice">
      <span className="switch-label">{label}</span>
      <div className="viewer-colors" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button key={c} role="radio" aria-checked={value.toLowerCase() === c} aria-label={c} className={`bim-swatch${value.toLowerCase() === c ? ' on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} />
        ))}
        <label className="viewer-color-custom" title="Otro color">
          <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={`${label}: otro color`} />
        </label>
      </div>
    </div>
  )
}

/** The "Configuración" button of the 3D view: edges, colors, hover outline and quality. */
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
            <div className="menu-title">Colores</div>
            <ColorRow label="Color de los bordes" value={settings.edgeColor} colors={EDGE_COLORS} onPick={(edgeColor) => onChange({ ...settings, edgeColor })} />
            <SwitchRow label="Colores del modelo" hint="Apagado, todos los elementos se pintan de un solo color" on={settings.modelColors} onToggle={() => onChange({ ...settings, modelColors: !settings.modelColors })} />
            {!settings.modelColors && <ColorRow label="Color de los elementos" value={settings.elementColor} colors={ELEMENT_COLORS} onPick={(elementColor) => onChange({ ...settings, elementColor })} />}
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
