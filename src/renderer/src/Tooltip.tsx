import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  label: string
  /** Optional shortcut shown next to the label, e.g. "Ctrl+Z". */
  shortcut?: string
  side?: 'top' | 'bottom' | 'left'
  children: React.ReactNode
}

const SHOW_DELAY_MS = 400

/** A small dark tooltip with a delay, in place of the browser's native one. Shows on hover and on keyboard focus. */
export default function Tooltip({ label, shortcut, side = 'bottom', children }: Props): React.JSX.Element {
  const host = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const hide = (): void => {
    window.clearTimeout(timer.current)
    setPos(null)
  }
  const show = (): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const r = host.current?.getBoundingClientRect()
      if (!r) return
      if (side === 'left') setPos({ x: r.left - 8, y: r.top + r.height / 2 })
      else setPos({ x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90), y: side === 'top' ? r.top - 8 : r.bottom + 8 })
    }, SHOW_DELAY_MS)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])
  // A tooltip must never outlive the thing it describes (e.g. a click that removes the button).
  useEffect(() => {
    if (!pos) return
    window.addEventListener('keydown', hide, { once: true })
    return () => window.removeEventListener('keydown', hide)
  }, [pos])

  return (
    <span ref={host} className="tt" onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos &&
        createPortal(
          <div className={`tooltip tooltip-${side}`} role="tooltip" style={{ left: pos.x, top: pos.y }}>
            {label}
            {shortcut && <kbd>{shortcut}</kbd>}
          </div>,
          document.body
        )}
    </span>
  )
}
