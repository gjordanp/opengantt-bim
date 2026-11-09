import { describe, expect, it } from 'vitest'
import { formatPredecessors, parsePredecessors } from './predecessors'

describe('predecessors', () => {
  it('formats like MS Project', () => {
    expect(formatPredecessors([{ num: 5, type: '1', lag: 2 }, { num: 3, type: '0', lag: 0 }, { num: 7, type: '2', lag: -1 }, { num: 9, type: '0', lag: 3 }])).toBe('3, 5SS+2d, 7FF-1d, 9FS+3d')
    expect(formatPredecessors([{ num: 4, type: '3', lag: 0 }])).toBe('4SF')
  })
  it('parses what it formats, plus Spanish codes and spaces', () => {
    const r = parsePredecessors('3, 5ss + 2d; 7FF-1, 4cc')
    expect(r).toEqual({ ok: true, refs: [{ num: 3, type: '0', lag: 0 }, { num: 5, type: '1', lag: 2 }, { num: 7, type: '2', lag: -1 }, { num: 4, type: '1', lag: 0 }] })
    expect(parsePredecessors('')).toEqual({ ok: true, refs: [] })
  })
  it('reports bad input', () => {
    expect(parsePredecessors('abc').ok).toBe(false)
    expect(parsePredecessors('3XX').ok).toBe(false)
    expect(parsePredecessors('3, 3SS').ok).toBe(false)
  })
})
