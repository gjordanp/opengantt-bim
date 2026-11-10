import { evaluate, fieldValue, type BimElement, type Query, type Rule, type RuleField } from './bimQuery'

/** One group of a split: the values it stands for, the query that finds it and how many elements it has now. */
export interface SplitGroup {
  /** The value of each field, in the order the fields were given. */
  values: string[]
  name: string
  query: Query
  count: number
}

export interface SplitResult {
  groups: SplitGroup[]
  /** Elements of the search that have no value in one of the fields, so they belong to no group. */
  skipped: number
}

const norm = (s: string): string => s.trim().toLowerCase()

/**
 * Splits what a search finds by one or more fields: one group per combination of values that actually occurs.
 * With "Ciclo" and "Nivel" that is "Ciclo 01 · Nivel 3", "Ciclo 01 · Nivel 4", "Ciclo 02 · Nivel 3"…
 * Each group's query is the search plus one "is equal to" condition per field, so it keeps following the model.
 */
export function splitBy(base: Query, elements: BimElement[], fields: RuleField[], labelOf: (field: RuleField) => string): SplitResult {
  const found = new Map<string, { values: string[]; count: number }>()
  let skipped = 0
  for (const el of evaluate(base, elements)) {
    const values = fields.map((f) => fieldValue(el, f).trim())
    if (values.some((v) => v === '')) {
      skipped++
      continue
    }
    // "01" and " 01 " are the same group (the "is equal to" condition ignores case and spaces too).
    const key = values.map(norm).join('\u0000')
    const entry = found.get(key)
    if (entry) entry.count++
    else found.set(key, { values, count: 1 })
  }

  const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
  const groups = [...found.values()]
    .sort((a, b) => {
      for (let i = 0; i < fields.length; i++) {
        const c = collator.compare(a.values[i], b.values[i])
        if (c !== 0) return c
      }
      return 0
    })
    .map(({ values, count }): SplitGroup => {
      const conditions: Rule[] = fields.map((field, i) => ({ field, op: 'eq', value: values[i] }))
      // An AND search just gets the conditions added; an OR one stays whole inside the AND.
      const rules = base.op === 'and' ? [...base.rules, ...conditions] : [base, ...conditions]
      return {
        values,
        name: fields.map((f, i) => `${labelOf(f)} ${values[i]}`).join(' · '),
        query: { op: 'and', rules },
        count
      }
    })
  return { groups, skipped }
}
