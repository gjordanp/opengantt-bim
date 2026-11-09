import type { ConstraintType } from './scheduling'

export type { ConstraintType }

/** Constraint types in the order the edit window lists them. */
export const CONSTRAINT_TYPES: { id: ConstraintType; short: string; label: string }[] = [
  { id: 'asap', short: 'ASAP', label: 'Lo antes posible' },
  { id: 'alap', short: 'ALAP', label: 'Lo más tarde posible' },
  { id: 'snet', short: 'SNET', label: 'No empezar antes del' },
  { id: 'snlt', short: 'SNLT', label: 'No empezar después del' },
  { id: 'fnet', short: 'FNET', label: 'No terminar antes del' },
  { id: 'fnlt', short: 'FNLT', label: 'No terminar después del' },
  { id: 'mso', short: 'MSO', label: 'Debe empezar el' },
  { id: 'mfo', short: 'MFO', label: 'Debe terminar el' }
]

/** Whether the type needs a date (all but ASAP and ALAP). */
export const constraintNeedsDate = (type: string | null | undefined): boolean =>
  !!type && type !== 'asap' && type !== 'alap' && CONSTRAINT_TYPES.some((t) => t.id === type)

/** Constraints on the end of the task: their date is the last day of work. */
export const constraintIsFinish = (type: string | null | undefined): boolean => type === 'fnet' || type === 'fnlt' || type === 'mfo'

export const constraintShort = (type: string | null | undefined): string => CONSTRAINT_TYPES.find((t) => t.id === type)?.short ?? ''

/**
 * What the scheduling engine receives for a constraint. The user's date for a finish constraint is the last
 * day of work; the engine (like Pro) takes an end, which is the day after.
 */
export function engineConstraint(type: string | null | undefined, date: string | null | undefined, nextDay: (iso: string) => string): { type: ConstraintType; date?: string } | undefined {
  if (!type || type === 'asap') return undefined
  if (type === 'alap') return { type: 'alap' }
  if (!constraintNeedsDate(type) || !date) return undefined
  return { type: type as ConstraintType, date: constraintIsFinish(type) ? nextDay(date) : date }
}
