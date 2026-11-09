import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal } from 'lucide-react'
import Tooltip from '../Tooltip'
import { COLUMN_DEFS, type ColumnId, type GanttSettings } from './ganttSettings'

interface Props {
  settings: GanttSettings
  onChange: (next: GanttSettings) => void
}

/** A setting that is on or off: its name, a line saying what it does, and a switch. */
export function SwitchRow({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={on} className="switch-row" onClick={onToggle}>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        <span className="switch-hint">{hint}</span>
      </span>
      <span className="switch" aria-hidden="true" />
    </button>
  )
}

/** The "Configuración" button of the gantt: timeline options and the columns of the table. */
export default function GanttSettingsMenu({ settings, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return setPos(null)
    const r = button.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left, y: r.bottom + 6 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!button.current?.contains(t) && !t.closest('.gantt-settings-pop')) close()
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

  const toggleColumn = (id: ColumnId): void => onChange({ ...settings, columns: { ...settings.columns, [id]: !settings.columns[id] } })

  return (
    <>
      <Tooltip label="Configuración del Gantt: línea de tiempo y columnas">
        <button
          ref={button}
          className={`icon-btn${open ? ' active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Configuración del Gantt"
        >
          <SlidersHorizontal size={16} />
        </button>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <div className="menu-pop gantt-settings-pop" role="dialog" aria-label="Configuración del Gantt" style={{ position: 'fixed', left: pos.x, top: pos.y, right: 'auto' }}>
            <div className="menu-title">Vista</div>
            <SwitchRow
              label="Mostrar la tabla"
              hint="Si la ocultas, el gráfico usa todo el ancho"
              on={!settings.tableCollapsed}
              onToggle={() => onChange({ ...settings, tableCollapsed: !settings.tableCollapsed })}
            />
            <SwitchRow
              label="Nombre dentro de las barras"
              hint="Si la apagas, quedan solo las barras"
              on={settings.barText}
              onToggle={() => onChange({ ...settings, barText: !settings.barText })}
            />
            <SwitchRow
              label="Padres como resumen"
              hint="Barra delgada con triángulos, como MS Project"
              on={settings.summaryStyle === 'bracket'}
              onToggle={() => onChange({ ...settings, summaryStyle: settings.summaryStyle === 'bracket' ? 'bar' : 'bracket' })}
            />
            <SwitchRow
              label="Ocultar días no laborables"
              hint="Quita fines de semana y feriados de la escala"
              on={settings.hideWeekends}
              onToggle={() => onChange({ ...settings, hideWeekends: !settings.hideWeekends })}
            />
            <div className="menu-sep" />
            <div className="menu-title">Curva S</div>
            <SwitchRow
              label="Plan según la línea base"
              hint="La curva planificada no se corre con los atrasos"
              on={settings.scurvePlan === 'baseline'}
              onToggle={() => onChange({ ...settings, scurvePlan: settings.scurvePlan === 'baseline' ? 'current' : 'baseline' })}
            />
            <div className="menu-sep" />
            <div className="menu-title">Columnas de la tabla</div>
            <div className="col-chips" role="group" aria-label="Columnas">
              <span className="chip locked" title="La columna Tarea siempre se muestra">
                Tarea
              </span>
              {COLUMN_DEFS.map((c) => (
                <button key={c.id} type="button" className={`chip${settings.columns[c.id] ? ' on' : ''}`} aria-pressed={settings.columns[c.id]} onClick={() => toggleColumn(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
