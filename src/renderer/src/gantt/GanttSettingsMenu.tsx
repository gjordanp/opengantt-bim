import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal } from 'lucide-react'
import Tooltip from '../Tooltip'
import { COLUMN_DEFS, type ColumnId, type GanttSettings } from './ganttSettings'

interface Props {
  settings: GanttSettings
  onChange: (next: GanttSettings) => void
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
          <div className="menu-pop gantt-settings-pop" role="menu" style={{ position: 'fixed', left: pos.x, top: pos.y, right: 'auto' }}>
            <div className="menu-title">Línea de tiempo</div>
            <button
              role="menuitemcheckbox"
              aria-checked={settings.hideWeekends}
              className="menu-item"
              onClick={() => onChange({ ...settings, hideWeekends: !settings.hideWeekends })}
            >
              <span className="menu-check">{settings.hideWeekends ? '✓' : ''}</span>
              Ocultar fines de semana
            </button>
            <p className="menu-hint">Quita de la escala los días que el calendario laboral no trabaja; la curva S deja de hacer escalones.</p>
            <div className="menu-sep" />
            <div className="menu-title">Columnas</div>
            <div className="menu-item menu-locked">
              <span className="menu-check">✓</span>
              Tarea
            </div>
            {COLUMN_DEFS.map((c) => (
              <button key={c.id} role="menuitemcheckbox" aria-checked={settings.columns[c.id]} className="menu-item" onClick={() => toggleColumn(c.id)}>
                <span className="menu-check">{settings.columns[c.id] ? '✓' : ''}</span>
                {c.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
