import type { LinkType } from './model'

/**
 * Predecessors written the way MS Project shows them: the row number of the predecessor, the link type when it is
 * not finish-to-start and the lag, e.g. `3`, `5SS+2d`, `7FF-1d`, joined by commas.
 */
const CODES: Record<LinkType, string> = { '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF' }
const FROM_CODE: Record<string, LinkType> = { FS: '0', SS: '1', FF: '2', SF: '3', FC: '0', CC: '1', CF: '3' }

export interface PredecessorRef {
  /** Row number of the predecessor task. */
  num: number
  type: LinkType
  /** Lag in working days (negative = lead). */
  lag: number
}

export function formatPredecessors(refs: PredecessorRef[]): string {
  return [...refs]
    .sort((a, b) => a.num - b.num)
    .map((r) => {
      const lag = r.lag ? `${r.lag > 0 ? '+' : '-'}${Math.abs(r.lag)}d` : ''
      const code = r.type === '0' && !lag ? '' : CODES[r.type]
      return `${r.num}${code}${lag}`
    })
    .join(', ')
}

/** Reads `3, 5SS+2d, 7FF-1d`. Returns the references, or a message saying what is wrong. */
export function parsePredecessors(text: string): { ok: true; refs: PredecessorRef[] } | { ok: false; error: string } {
  const refs: PredecessorRef[] = []
  const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    const m = /^(\d+)\s*([A-Za-z]{2})?\s*(?:([+-])\s*(\d+(?:[.,]\d+)?)\s*(?:d|dias|días|day|days)?)?$/i.exec(part)
    if (!m) return { ok: false, error: `No entiendo "${part}". Ejemplo: 3, 5SS+2d` }
    const type = m[2] ? FROM_CODE[m[2].toUpperCase()] : '0'
    if (!type) return { ok: false, error: `Tipo de vínculo desconocido: ${m[2]} (usa FS, SS, FF o SF)` }
    const lag = m[3] ? (m[3] === '-' ? -1 : 1) * Math.round(parseFloat(m[4].replace(',', '.'))) : 0
    const num = parseInt(m[1], 10)
    if (refs.some((r) => r.num === num)) return { ok: false, error: `La tarea ${num} está repetida` }
    refs.push({ num, type, lag })
  }
  return { ok: true, refs }
}
