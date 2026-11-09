/** A model element as the search sees it. `guid` (IFC GlobalId) is stable across model versions. */
export interface BimElement {
  modelId: string
  localId: number
  guid: string
  /** IFC class, e.g. `IFCWALL`. */
  category: string
  name: string
  /** Building storey the element sits on, or empty. */
  storey: string
  /** Volume computed from the element's mesh (model units, normally m³); absent when it has no solid geometry. */
  volume?: number
  /** Properties read from the IFC: attributes and property sets, keyed `Set.Property` (attributes under `Atributos`). */
  props?: Record<string, string>
}

/** Built-in fields, or a property key `Set.Property` read from the model. */
export type RuleField = 'category' | 'storey' | 'name' | 'guid' | 'volume' | (string & {})
export type RuleOp = 'eq' | 'neq' | 'contains' | 'notContains' | 'startsWith' | 'in' | 'exists' | 'notExists' | 'gt' | 'gte' | 'lt' | 'lte'

export const BUILTIN_FIELDS = ['category', 'storey', 'name', 'guid', 'volume'] as const

export interface Rule {
  field: RuleField
  op: RuleOp
  value: string | string[]
}

/** The value of a field on an element, as text ('' when it has none). */
export function fieldValue(el: BimElement, field: RuleField): string {
  switch (field) {
    case 'category':
    case 'storey':
    case 'name':
    case 'guid':
      return el[field as 'category' | 'storey' | 'name' | 'guid'] ?? ''
    case 'volume':
      return el.volume === undefined ? '' : String(el.volume)
    default:
      return el.props?.[field] ?? ''
  }
}

export interface Query {
  op: 'and' | 'or'
  rules: (Rule | Query)[]
}

const norm = (s: string): string => s.trim().toLowerCase()

const isQuery = (r: Rule | Query): r is Query => 'rules' in r

const num = (s: string): number => parseFloat(s.replace(',', '.'))

function matches(rule: Rule, el: BimElement): boolean {
  const raw = fieldValue(el, rule.field)
  const actual = norm(raw)
  const values = (Array.isArray(rule.value) ? rule.value : [rule.value]).map(norm)
  switch (rule.op) {
    case 'eq':
      return actual === values[0]
    case 'neq':
      return actual !== values[0]
    case 'contains':
      return actual.includes(values[0])
    case 'notContains':
      return !actual.includes(values[0])
    case 'startsWith':
      return actual.startsWith(values[0])
    case 'in':
      return values.includes(actual)
    case 'exists':
      return raw !== ''
    case 'notExists':
      return raw === ''
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = num(raw)
      const b = num(values[0] ?? '')
      if (isNaN(a) || isNaN(b)) return false
      return rule.op === 'gt' ? a > b : rule.op === 'gte' ? a >= b : rule.op === 'lt' ? a < b : a <= b
    }
  }
}

export function matchesQuery(query: Query, el: BimElement): boolean {
  // An empty AND matches everything; an empty OR matches nothing.
  const test = (r: Rule | Query): boolean => (isQuery(r) ? matchesQuery(r, el) : matches(r, el))
  return query.op === 'and' ? query.rules.every(test) : query.rules.some(test)
}

export function evaluate(query: Query, elements: BimElement[]): BimElement[] {
  return elements.filter((el) => matchesQuery(query, el))
}

/** Distinct values of a field with their counts, most frequent first (for search suggestions). */
export function facets(elements: BimElement[], field: RuleField): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const el of elements) {
    const v = fieldValue(el, field)
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Every property key found on the elements, with how many have it. */
export function propertyKeys(elements: BimElement[]): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const el of elements) if (el.props) for (const k of Object.keys(el.props)) counts.set(k, (counts.get(k) ?? 0) + 1)
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key))
}
