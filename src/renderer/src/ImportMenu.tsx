import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, FileInput, FileSpreadsheet } from 'lucide-react'
import Tooltip from './Tooltip'

interface Props {
  /** Replaces the open Gantt with a MS Project file. */
  onMsProject: () => void
  /** Replaces the open Gantt with a schedule written by an AI assistant. */
  onAi: () => void
}

/** The import button of the Gantt toolbar: it opens a small menu with the ways to bring a schedule in. */
export default function ImportMenu({ onMsProject, onAi }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return setPos(null)
    const r = button.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.min(r.left, window.innerWidth - 330), y: r.bottom + 6 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!button.current?.contains(t) && !t.closest('.import-pop')) close()
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

  const pick = (run: () => void) => (): void => {
    setOpen(false)
    run()
  }

  return (
    <>
      <Tooltip label="Importar: reemplaza este Gantt con un cronograma de otra fuente">
        <button ref={button} className={`icon-btn${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Importar un cronograma">
          <FileInput size={16} />
        </button>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <div className="menu-pop import-pop" role="menu" aria-label="Importar un cronograma" style={{ position: 'fixed', left: pos.x, top: pos.y, right: 'auto' }}>
            <div className="menu-title">Importar y reemplazar desde…</div>
            <button type="button" role="menuitem" className="menu-item import-item" onClick={pick(onMsProject)}>
              <FileSpreadsheet size={16} />
              <span>
                <b>MS Project</b>
                <small>Un archivo .mpp o XML</small>
              </span>
            </button>
            <button type="button" role="menuitem" className="menu-item import-item" onClick={pick(onAi)}>
              <Bot size={16} />
              <span>
                <b>Una IA</b>
                <small>La respuesta de ChatGPT, Claude o Gemini</small>
              </span>
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
