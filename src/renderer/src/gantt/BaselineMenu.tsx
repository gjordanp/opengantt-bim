import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkCheck } from 'lucide-react'
import Tooltip from '../Tooltip'

interface Props {
  /** How many tasks can have a baseline and how many have one now. */
  info: () => { tasks: number; withBaseline: number }
  /** Applies the action and returns how many tasks changed. */
  apply: (mode: 'all' | 'missing' | 'clear') => number
}

/** The "Línea base" button of the gantt: set or remove the baseline of the whole project at once. */
export default function BaselineMenu({ info, apply }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [counts, setCounts] = useState({ tasks: 0, withBaseline: 0 })
  const button = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return setPos(null)
    setCounts(info())
    const r = button.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left, y: r.bottom + 6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!button.current?.contains(t) && !t.closest('.baseline-pop')) close()
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

  const run = (mode: 'all' | 'missing' | 'clear'): void => {
    apply(mode)
    setOpen(false)
  }
  const missing = counts.tasks - counts.withBaseline

  return (
    <>
      <Tooltip label="Línea base del proyecto: guardar o quitar el plan original de todas las tareas">
        <button ref={button} className={`icon-btn${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Línea base">
          <BookmarkCheck size={16} />
        </button>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <div className="menu-pop baseline-pop" role="menu" style={{ position: 'fixed', left: pos.x, top: pos.y, right: 'auto' }}>
            <div className="menu-title">Línea base</div>
            <p className="menu-hint">
              Guarda las fechas actuales como el plan original. {counts.withBaseline} de {counts.tasks} tareas tienen línea base. Se puede deshacer con Ctrl+Z.
            </p>
            <button role="menuitem" className="menu-item" onClick={() => run('all')} disabled={counts.tasks === 0}>
              Fijar en todo el proyecto
            </button>
            <button role="menuitem" className="menu-item" onClick={() => run('missing')} disabled={missing <= 0}>
              Fijar solo en las tareas sin línea base{missing > 0 ? ` (${missing})` : ''}
            </button>
            <div className="menu-sep" />
            <button role="menuitem" className="menu-item" onClick={() => run('clear')} disabled={counts.withBaseline === 0}>
              Quitar la línea base de todo el proyecto
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
