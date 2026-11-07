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
}

export type RuleField = 'category' | 'storey' | 'name' | 'guid'
export type RuleOp = 'eq' | 'neq' | 'contains' | 'in'

export interface Rule {
  field: RuleField
  op: RuleOp
  value: string | string[]
}

export interface Query {
  op: 'and' | 'or'
  rules: (Rule | Query)[]
}

const norm = (s: string): string => s.trim().toLowerCase()

const isQuery = (r: Rule | Query): r is Query => 'rules' in r

function matches(rule: Rule, el: BimElement): boolean {
  const actual = norm(el[rule.field] ?? '')
  const values = (Array.isArray(rule.value) ? rule.value : [rule.value]).map(norm)
  switch (rule.op) {
    case 'eq':
      return actual === values[0]
    case 'neq':
      return actual !== values[0]
    case 'contains':
      return actual.includes(values[0])
    case 'in':
      return values.includes(actual)
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
    const v = el[field]
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}
