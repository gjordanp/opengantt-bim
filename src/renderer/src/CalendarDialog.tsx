import { useEffect, useRef, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import type { ProjectData } from '@shared/model'

export interface CalendarValue {
  holidays: string[]
  workWeek: number[]
  projectStart?: string
  projectEnd?: string
  scheduleFromEnd?: boolean
}

/** The calendar and planning dates a project brings. */
export const calendarOf = (data: ProjectData): CalendarValue => ({
  holidays: data.holidays ?? [],
  workWeek: data.workWeek ?? [1, 2, 3, 4, 5],
  ...(data.projectStart ? { projectStart: data.projectStart } : {}),
  ...(data.projectEnd ? { projectEnd: data.projectEnd } : {}),
  ...(data.scheduleFromEnd ? { scheduleFromEnd: true } : {})
})

const DAYS = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
  [0, 'Dom']
] as const

const WEEK_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Lun–Vie', days: [1, 2, 3, 4, 5] },
  { label: 'Lun–Sáb', days: [1, 2, 3, 4, 5, 6] },
  { label: 'Todos los días', days: [1, 2, 3, 4, 5, 6, 0] }
]

const DATE = /^\d{4}-\d{2}-\d{2}$/
const parseHolidays = (text: string): { valid: string[]; invalid: string[] } => {
  const tokens = text.split(/[\s,;]+/).filter(Boolean)
  return { valid: [...new Set(tokens.filter((t) => DATE.test(t)))].sort(), invalid: tokens.filter((t) => !DATE.test(t)) }
}
const sameDays = (a: number[], b: number[]): boolean => a.length === b.length && a.every((d) => b.includes(d))

interface FormProps {
  value: CalendarValue
  onChange: (v: CalendarValue) => void
  /** Lets the owner flush the holiday text (it is applied on blur) before it closes the form. */
  flushRef?: React.MutableRefObject<(() => void) | null>
}

/** The calendar settings. Changes apply as they are made. */
export function CalendarForm({ value, onChange, flushRef }: FormProps): React.JSX.Element {
  const [text, setText] = useState(value.holidays.join('\n'))
  const latest = useRef({ value, text })
  latest.current = { value, text }

  const apply = (): void => {
    const { valid } = parseHolidays(latest.current.text)
    onChange({ ...latest.current.value, holidays: valid })
    setText(valid.join('\n'))
  }
  if (flushRef) flushRef.current = apply

  const toggle = (d: number): void => {
    const next = value.workWeek.includes(d) ? value.workWeek.filter((x) => x !== d) : [...value.workWeek, d]
    if (next.length > 0) onChange({ ...value, workWeek: next })
  }
  const { valid, invalid } = parseHolidays(text)

  return (
    <div className="calendar-form">
      <section className="cal-card">
        <h3>Días laborables</h3>
        <div className="weekdays">
          {DAYS.map(([d, label]) => (
            <label key={d} className={value.workWeek.includes(d) ? 'on' : ''}>
              <input type="checkbox" checked={value.workWeek.includes(d)} onChange={() => toggle(d)} />
              {label}
            </label>
          ))}
        </div>
        <div className="cal-presets">
          {WEEK_PRESETS.map((p) => (
            <button key={p.label} type="button" className={sameDays(p.days, value.workWeek) ? 'on' : ''} onClick={() => onChange({ ...value, workWeek: p.days })}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="cal-card">
        <h3>
          Feriados <span className="cal-count">{valid.length}</span>
        </h3>
        <textarea
          rows={5}
          value={text}
          placeholder={'2026-12-25\n2027-01-01'}
          onChange={(e) => setText(e.target.value)}
          onBlur={apply}
          aria-label="Feriados, uno por línea, AAAA-MM-DD"
        />
        <p className={`hint${invalid.length ? ' bad' : ''}`}>
          {invalid.length
            ? `No se entiende (se ignora): ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}. Usa AAAA-MM-DD.`
            : 'Uno por línea, con formato AAAA-MM-DD. Esos días no se trabajan.'}
        </p>
      </section>

      <section className="cal-card">
        <h3>Fechas del proyecto</h3>
        <div className="cal-dates">
          <label>
            Inicio
            <input type="date" value={value.projectStart ?? ''} onChange={(e) => onChange({ ...value, projectStart: e.target.value || undefined })} />
          </label>
          <label>
            Fin
            <input type="date" value={value.projectEnd ?? ''} onChange={(e) => onChange({ ...value, projectEnd: e.target.value || undefined })} />
          </label>
        </div>
        <p className="hint">Inicio: las tareas sin predecesora que empiezan antes se mueven a esta fecha. Fin: último día de trabajo.</p>
        <label className="cal-check">
          <input type="checkbox" checked={value.scheduleFromEnd === true} onChange={(e) => onChange({ ...value, scheduleFromEnd: e.target.checked || undefined })} />
          <span>
            Programar desde el fin
            <small>Las tareas sin restricción van lo más tarde posible: se alinean contra sus sucesoras y el fin del proyecto.</small>
          </span>
        </label>
      </section>
    </div>
  )
}

/** The calendar as a centered dialog. */
export default function CalendarDialog({ value, onChange, onClose }: { value: CalendarValue; onChange: (v: CalendarValue) => void; onClose: () => void }): React.JSX.Element {
  const flush = useRef<(() => void) | null>(null)
  const close = (): void => {
    flush.current?.()
    onClose()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal calendar-dialog" role="dialog" aria-labelledby="calendar-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="cal-head">
          <span className="cal-icon">
            <CalendarDays size={18} />
          </span>
          <div>
            <h2 id="calendar-title">Calendario laboral</h2>
            <p>Qué días se trabaja y qué fechas acotan el proyecto. Los cambios se aplican al instante.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>
        <CalendarForm value={value} onChange={onChange} flushRef={flush} />
        <div className="modal-actions">
          <button type="button" className="primary" onClick={close}>
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
