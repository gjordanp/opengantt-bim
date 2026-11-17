/** A value that ends in a number, split so the number can be continued: `G3` is prefix `G`, number 3. */
const SERIES = /^(.*?)(\d+)(\D*)$/

interface Part {
  prefix: string
  n: number
  width: number
  suffix: string
}

function parts(source: readonly string[]): Part[] | null {
  const out: Part[] = []
  for (const v of source) {
    const m = SERIES.exec(v)
    if (!m) return null
    out.push({ prefix: m[1], n: parseInt(m[2], 10), width: m[2].length, suffix: m[3] })
  }
  return out
}

/**
 * Filling down, as a spreadsheet's fill handle does. Two or more values that count at a steady step continue the
 * series (`G1, G2` gives `G3, G4`, `10, 20` gives `30, 40`; `Ciclo 01, Ciclo 02` keeps its zero padding). Anything else
 * repeats: one value is copied as it is and several repeat as a pattern, starting over after the last.
 */
export function fillValues(source: readonly string[], count: number): string[] {
  if (source.length === 0 || count <= 0) return []
  const p = source.length >= 2 ? parts(source) : null
  if (p) {
    const step = p[1].n - p[0].n
    const same = p.every((x) => x.prefix === p[0].prefix && x.suffix === p[0].suffix)
    const steady = p.every((x, i) => i === 0 || x.n - p[i - 1].n === step)
    if (same && steady && step !== 0) {
      const width = p.some((x) => x.width > String(x.n).length) ? Math.max(...p.map((x) => x.width)) : 0
      const last = p[p.length - 1]
      return Array.from({ length: count }, (_, i) => {
        const n = last.n + step * (i + 1)
        if (n < 0) return source[i % source.length]
        return `${last.prefix}${String(n).padStart(width, '0')}${last.suffix}`
      })
    }
  }
  return Array.from({ length: count }, (_, i) => source[i % source.length])
}
