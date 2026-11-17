import { SwitchRow } from '../gantt/GanttSettingsMenu'
import { EDGE_COLORS, ELEMENT_COLORS, VIEW_MODES, type ViewMode, type ViewerSettings } from './viewerSettings'

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

const MODE_LABELS: Record<ViewMode, string> = { normal: 'Sólido', shaded: 'Sombreado', lines: 'Solo líneas', xray: 'Rayos X' }

/** The settings of the 3D view (modes, transparency, edges, colors and quality), the content of its floating window. */
export default function ViewerSettingsPanel({ settings, onChange }: { settings: ViewerSettings; onChange: (next: ViewerSettings) => void }): React.JSX.Element {
  return (
    <div className="viewer-settings-body">
      <div className="menu-title">Vista</div>
      <div className="viewer-choice">
        <span className="switch-label">Modo</span>
        <div className="bim-seg wrap" role="radiogroup" aria-label="Modo de vista">
          {VIEW_MODES.map((m) => (
            <button key={m} role="radio" aria-checked={settings.mode === m} className={settings.mode === m ? 'on' : ''} onClick={() => onChange({ ...settings, mode: m })}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="viewer-choice">
        <span className="switch-label">Transparencia del modelo</span>
        <div className="viewer-opacity">
          {/* The slider shows transparency (0 % solid, the right end almost see-through); the setting stores the opacity. */}
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={Math.round((1 - settings.opacity) * 100)}
            aria-label="Transparencia del modelo"
            onChange={(e) => onChange({ ...settings, opacity: Math.round((1 - Number(e.target.value) / 100) * 100) / 100 })}
          />
          <span>{Math.round((1 - settings.opacity) * 100)}%</span>
        </div>
      </div>
      <div className="menu-sep" />
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
    </div>
  )
}
