import { useEffect, useReducer, useRef, useState } from 'react'
import type { DockviewApi } from 'dockview-react'
import { LayoutPanelLeft } from 'lucide-react'
import Tooltip from '../Tooltip'
import { PANELS, PRESETS, applyPreset, openPanel, resetLayout, type PresetId } from './layout'

/** A small drawing of a layout: the Gantt (bars) and the 3D viewer (a cube) in their places. */
function LayoutThumb({ id }: { id: PresetId }): React.JSX.Element {
  const W = 52
  const H = 34
  // [x, y, w, h] of each pane inside the frame.
  const frame = 2
  const iw = W - frame * 2
  const ih = H - frame * 2
  const panes: Record<PresetId, { gantt?: number[]; viewer?: number[] }> = {
    classic: { gantt: [frame, frame, iw * 0.45 - 1, ih], viewer: [frame + iw * 0.45 + 1, frame, iw * 0.55 - 1, ih] },
    stacked: { gantt: [frame, frame, iw, ih * 0.45 - 1], viewer: [frame, frame + ih * 0.45 + 1, iw, ih * 0.55 - 1] },
    bim: { viewer: [frame, frame, iw, ih * 0.6 - 1], gantt: [frame, frame + ih * 0.6 + 1, iw, ih * 0.4 - 1] },
    gantt: { gantt: [frame, frame, iw, ih] },
    viewer: { viewer: [frame, frame, iw, ih] }
  }
  const { gantt, viewer } = panes[id]
  return (
    <svg className="layout-thumb" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="4" fill="none" stroke="currentColor" strokeOpacity="0.45" />
      {gantt && (
        <g>
          <rect x={gantt[0]} y={gantt[1]} width={gantt[2]} height={gantt[3]} rx="2" fill="currentColor" fillOpacity="0.08" />
          {(gantt[3] > 20 ? [0.22, 0.5, 0.78] : [0.3, 0.7]).map((f, i) => (
            <rect key={i} x={gantt[0] + 3 + i * (gantt[2] * 0.1)} y={gantt[1] + gantt[3] * f - 1.5} width={Math.max(4, Math.min(gantt[2] * 0.45, gantt[2] - 6 - i * (gantt[2] * 0.1)))} height={3} rx="1.5" fill="var(--brand)" />
          ))}
        </g>
      )}
      {viewer && (
        <g>
          <rect x={viewer[0]} y={viewer[1]} width={viewer[2]} height={viewer[3]} rx="2" fill="currentColor" fillOpacity="0.16" />
          <path
            d={`M${viewer[0] + viewer[2] / 2} ${viewer[1] + viewer[3] / 2 - 5} l6 3.2 v6.4 l-6 3.2 l-6 -3.2 v-6.4 z M${viewer[0] + viewer[2] / 2} ${viewer[1] + viewer[3] / 2 - 1.8} v6.4 M${viewer[0] + viewer[2] / 2} ${viewer[1] + viewer[3] / 2 - 1.8} l-6 -3.2 M${viewer[0] + viewer[2] / 2} ${viewer[1] + viewer[3] / 2 - 1.8} l6 -3.2`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  )
}

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
          <div className="layout-grid">
            {PRESETS.map((p) => (
              <Tooltip key={p.id} label={p.hint} side="top">
                <button role="menuitem" className="layout-card" onClick={() => preset(p.id)} aria-label={`${p.label}: ${p.hint}`}>
                  <LayoutThumb id={p.id} />
                  <span>{p.label}</span>
                </button>
              </Tooltip>
            ))}
          </div>
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
