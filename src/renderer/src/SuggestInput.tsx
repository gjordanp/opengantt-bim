import { useMemo, useRef, useState } from 'react'
import { OptionList, usePopover, type DropdownOption } from './Dropdown'

const MAX_SHOWN = 60

/** A text field that suggests values while typing (a styled replacement for <input list>). */
export default function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled
}: {
  value: string
  onChange: (v: string) => void
  suggestions: { value: string; count: number }[]
  placeholder?: string
  disabled?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrap = useRef<HTMLDivElement>(null)
  const close = (): void => setOpen(false)
  const box = usePopover(wrap, open, close)

  const options: DropdownOption<string>[] = useMemo(() => {
    const q = value.trim().toLowerCase()
    return suggestions
      .filter((s) => !q || s.value.toLowerCase().includes(q))
      .slice(0, MAX_SHOWN)
      .map((s) => ({ value: s.value, label: s.value, hint: s.count }))
  }, [suggestions, value])

  const pick = (v: string): void => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div className="suggest" ref={wrap}>
      <input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value)
          setActive(-1)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            setOpen(true)
            setActive((i) => Math.min(i + 1, options.length - 1))
          } else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
          else if (e.key === 'Enter' && open && active >= 0) pick(options[active].value)
          else if (e.key === 'Escape') setOpen(false)
          else return
          e.preventDefault()
        }}
      />
      {open && box && options.length > 0 && <OptionList box={box} options={options} active={active} onPick={pick} onHover={setActive} />}
    </div>
  )
}
