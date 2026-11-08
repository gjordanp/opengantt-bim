import { useEffect, useReducer, useRef, useState } from 'react'
import type { DockviewApi } from 'dockview-react'
import { LayoutPanelLeft } from 'lucide-react'
import Tooltip from '../Tooltip'
import { PANELS, PRESETS, applyPreset, openPanel, resetLayout, type PresetId } from './layout'

/** "Ventanas" menu: show or hide each panel, switch between layouts, or start over. */
export default function WindowsMenu({ api }: { api: DockviewApi | null }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!api) return
    const a = api.onDidAddPanel(refresh)
    const b = api.onDidRemovePanel(refresh)
    return () => {
      a.dispose()
      b.dispose()
    }
  }, [api])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const preset = (id: PresetId): void => {
    if (!api) return
    applyPreset(api, id)
    setOpen(false)
  }

  return (
    <div className="menu" ref={root}>
      <Tooltip label="Ventanas y distribución">
        <button
          className={`icon-btn${open ? ' active' : ''}`}
          disabled={!api}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Ventanas"
        >
          <LayoutPanelLeft size={16} />
        </button>
      </Tooltip>
      {open && api && (
        <div className="menu-pop" role="menu">
          <div className="menu-title">Paneles</div>
          {PANELS.map((p) => {
            const panel = api.getPanel(p.id)
            return (
              <button
                key={p.id}
                role="menuitemcheckbox"
                aria-checked={!!panel}
                className="menu-item"
                onClick={() => (panel ? panel.api.close() : openPanel(api, p.id))}
              >
                <span className="menu-check">{panel ? '✓' : ''}</span>
                {p.title}
              </button>
            )
          })}
          <div className="menu-sep" />
          <div className="menu-title">Distribución</div>
          {PRESETS.map((p) => (
            <button key={p.id} role="menuitem" className="menu-item" title={p.hint} onClick={() => preset(p.id)}>
              <span className="menu-check" />
              {p.label}
            </button>
          ))}
          <div className="menu-sep" />
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => {
              resetLayout()
              preset('classic')
            }}
          >
            <span className="menu-check" />
            Restablecer ventanas
          </button>
          <p className="menu-hint">Arrastra una pestaña a un borde para dividir, o suéltala fuera para flotarla.</p>
        </div>
      )}
    </div>
  )
}
