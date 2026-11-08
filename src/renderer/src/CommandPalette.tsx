import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'

export interface Command {
  id: string
  label: string
  section: string
  /** Extra words that should also match, e.g. English names. */
  keywords?: string
  shortcut?: string
  disabled?: boolean
  run: () => void
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** VS Code-style command palette: type to filter, arrows to move, Enter to run, Esc to close. */
export default function CommandPalette({
  open,
  commands,
  onClose
}: {
  open: boolean
  commands: Command[]
  onClose: () => void
}): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
    }
  }, [open])

  const results = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean)
    return commands.filter((c) => {
      if (c.disabled) return false
      const hay = norm(`${c.label} ${c.section} ${c.keywords ?? ''}`)
      return terms.every((t) => hay.includes(t))
    })
  }, [commands, query])

  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index, results])

  // Esc closes the palette even if focus wandered off the input (e.g. after clicking its list).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const run = (c: Command | undefined): void => {
    if (!c) return
    onClose()
    // Let the palette unmount first so focus returns to the page before the command runs.
    window.setTimeout(c.run, 0)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, results.length - 1))
    else if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter') run(results[index])
    else if (e.key === 'Escape') onClose()
    else return
    e.preventDefault()
  }

  let lastSection = ''
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Paleta de comandos" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} aria-hidden />
          <input
            autoFocus
            value={query}
            placeholder="Escribe un comando o el nombre de un proyecto…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">Sin resultados</div>}
          {results.map((c, i) => {
            const header = c.section !== lastSection ? c.section : null
            lastSection = c.section
            return (
              <div key={c.id}>
                {header && <div className="palette-section">{header}</div>}
                <div
                  role="option"
                  aria-selected={i === index}
                  className={`palette-item${i === index ? ' selected' : ''}`}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  <span className="palette-label">{c.label}</span>
                  {c.shortcut && <kbd>{c.shortcut}</kbd>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>
              <CornerDownLeft size={11} aria-hidden />
            </kbd>{' '}
            ejecutar
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  )
}
