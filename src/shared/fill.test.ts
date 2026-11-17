import { describe, expect, it } from 'vitest'
import { fillValues } from './fill'

describe('fillValues', () => {
  it('repeats a single value', () => {
    expect(fillValues(['G1'], 3)).toEqual(['G1', 'G1', 'G1'])
  })
  it('continues a series that counts at a steady step', () => {
    expect(fillValues(['G1', 'G2'], 4)).toEqual(['G3', 'G4', 'G5', 'G6'])
    expect(fillValues(['10', '20'], 3)).toEqual(['30', '40', '50'])
    expect(fillValues(['G2', 'G4'], 2)).toEqual(['G6', 'G8'])
    expect(fillValues(['Ciclo 01', 'Ciclo 02'], 2)).toEqual(['Ciclo 03', 'Ciclo 04'])
  })
  it('repeats a pattern that is not a series', () => {
    expect(fillValues(['50', '0'], 5)).toEqual(['50', '0', '50', '0', '50'])
    expect(fillValues(['G1', 'H2'], 3)).toEqual(['G1', 'H2', 'G1'])
    expect(fillValues(['G1, G2', 'G3'], 3)).toEqual(['G1, G2', 'G3', 'G1, G2'])
    expect(fillValues(['5', '5'], 2)).toEqual(['5', '5'])
  })
  it('does not count below zero', () => {
    expect(fillValues(['30', '20', '10'], 3)).toEqual(['0', '20', '10'])
  })
  it('gives nothing for nothing to fill', () => {
    expect(fillValues([], 3)).toEqual([])
    expect(fillValues(['a'], 0)).toEqual([])
  })
})
