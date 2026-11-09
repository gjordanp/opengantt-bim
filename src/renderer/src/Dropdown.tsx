import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  /** Small secondary text on the right, e.g. a count. */
  hint?: string | number
  /** Heading shown above the first option of each group (options of a group must be together). */
  group?: string
}

type Box = { x: number; y: number; w: number }

/** Positions a floating list under an anchor element and closes it on outside click, Esc or resize. */
export function usePopover(anchor: React.RefObject<HTMLElement | null>, open: boolean, close: () => void): Box | null {
  const [box, setBox] = useState<Box | null>(null)
  useLayoutEffect(() => {
    if (!open) return setBox(null)
    const r = anchor.current?.getBoundingClientRect()
    if (r) setBox({ x: r.left, y: r.bottom + 4, w: r.width })
  }, [open, anchor])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!anchor.current?.contains(t) && !t.closest?.('.dd-list')) close()
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
  }, [open, anchor, close])
  return box
}

/** The floating list shared by Dropdown and SuggestInput. */
export function OptionList<T extends string>({
  box,
  options,
  value,
  active,
  onPick,
  onHover,
  header
}: {
  box: Box
  options: DropdownOption<T>[]
  value?: T
  active: number
  onPick: (v: T) => void
  onHover: (i: number) => void
  /** Content pinned above the options, e.g. a filter field. */
  header?: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const left = Math.max(8, Math.min(box.x, window.innerWidth - Math.max(box.w, 180) - 8))
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return createPortal(
    <div className="dd-list" role="listbox" ref={ref} style={{ left, top: box.y, minWidth: Math.min(Math.max(box.w, 180), window.innerWidth - left - 8), maxWidth: window.innerWidth - left - 8 }}>
      {header}
      {options.length === 0 && <div className="dd-empty">Sin resultados</div>}
      {options.map((o, i) => (
        <Fragment key={o.value}>
          {o.group && o.group !== options[i - 1]?.group && <div className="dd-group">{o.group}</div>}
        <div
          role="option"
          aria-selected={o.value === value}
          data-active={i === active}
          className={`dd-item${i === active ? ' active' : ''}`}
          onMouseMove={() => onHover(i)}
          // mousedown (not click) so a text field keeps its focus while the choice is made.
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(o.value)
          }}
        >
          <span className="dd-check">{o.value === value && <Check size={14} />}</span>
          <span className="dd-label">{o.label}</span>
          {o.hint !== undefined && <span className="dd-hint">{o.hint}</span>}
        </div>
        </Fragment>
      ))}
    </div>,
    document.body
  )
}

/** A styled replacement for the native <select>. */
export default function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  searchable,
  block
}: {
  value: T
  options: DropdownOption<T>[]
  onChange: (v: T) => void
  label: string
  /** Adds a filter field at the top of the list (for long lists). */
  searchable?: boolean
  /** Fills the width of its container. */
  block?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [filter, setFilter] = useState('')
  const shown =
    searchable && filter.trim() ? options.filter((o) => `${o.group ?? ''} ${o.label}`.toLowerCase().includes(filter.trim().toLowerCase())) : options
  const btn = useRef<HTMLButtonElement>(null)
  const close = (): void => setOpen(false)
  const box = usePopover(btn, open, close)
  const current = options.find((o) => o.value === value)

  const openList = (): void => {
    setFilter('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const pick = (v: T): void => {
    onChange(v)
    setOpen(false)
    btn.current?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, shown.length - 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) {
      if (shown[active]) pick(shown[active].value)
    } else return
    e.preventDefault()
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`dd-trigger${block ? ' block' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span>{current?.label ?? value}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && box && (
        <OptionList
          box={box}
          options={shown}
          value={value}
          active={Math.min(active, Math.max(0, shown.length - 1))}
          onPick={pick}
          onHover={setActive}
          header={
            searchable ? (
              <input
                className="dd-filter"
                autoFocus
                value={filter}
                placeholder="Filtrar…"
                aria-label="Filtrar"
                onChange={(e) => {
                  setFilter(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
              />
            ) : undefined
          }
        />
      )}
    </>
  )
}
