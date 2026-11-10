import { describe, expect, it } from 'vitest'
import { roundValue } from './formatValue'

describe('roundValue', () => {
  it('rounds decimals to 3 places and drops trailing zeros', () => {
    expect(roundValue('98.41795836116049')).toBe('98.418')
    expect(roundValue('2824.9999999999995')).toBe('2825')
    expect(roundValue('0.6306200495721209')).toBe('0.631')
    expect(roundValue('-5.00004')).toBe('-5')
    expect(roundValue('1.2')).toBe('1.2')
  })
  it('handles exponents and tiny values', () => {
    expect(roundValue('1.5e-7')).toBe('0')
    expect(roundValue('1.2345e3')).toBe('1234.5')
  })
  it('leaves everything else as it is', () => {
    expect(roundValue('2525443')).toBe('2525443')
    expect(roundValue('Floor:LHA25 - 11° Piso_2')).toBe('Floor:LHA25 - 11° Piso_2')
    expect(roundValue('2FZPhA45jEqPdAVS$Q8BrB')).toBe('2FZPhA45jEqPdAVS$Q8BrB')
    expect(roundValue('2026-05-01')).toBe('2026-05-01')
    expect(roundValue('')).toBe('')
    expect(roundValue('true')).toBe('true')
  })
})
