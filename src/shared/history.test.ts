import { describe, expect, it } from 'vitest'
import { History } from './history'

describe('History', () => {
  it('undoes and redoes in order', () => {
    const h = new History<string>()
    h.reset('a')
    h.push('b', 1000)
    h.push('c', 2000)
    expect(h.undo()).toBe('b')
    expect(h.undo()).toBe('a')
    expect(h.undo()).toBeUndefined()
    expect(h.redo()).toBe('b')
    expect(h.redo()).toBe('c')
    expect(h.canRedo).toBe(false)
  })

  it('drops the redo branch on a new edit', () => {
    const h = new History<string>()
    h.reset('a')
    h.push('b', 1000)
    h.undo()
    h.push('x', 5000)
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe('a')
  })

  it('merges pushes that arrive within the coalesce window', () => {
    const h = new History<string>(100, 300)
    h.reset('a')
    h.push('b', 1000)
    h.push('b2', 1100)
    expect(h.undo()).toBe('a')
    expect(h.canUndo).toBe(false)
  })

  it('never merges into the initial state', () => {
    const h = new History<string>()
    h.reset('a')
    h.push('b', 10)
    expect(h.undo()).toBe('a')
  })

  it('keeps at most `limit` entries', () => {
    const h = new History<number>(3, 0)
    h.reset(0)
    for (let i = 1; i <= 5; i++) h.push(i, i * 1000)
    expect(h.undo()).toBe(4)
    expect(h.undo()).toBe(3)
    expect(h.undo()).toBeUndefined()
  })

  it('does not merge right after an undo', () => {
    const h = new History<string>(100, 300)
    h.reset('a')
    h.push('b', 1000)
    h.undo()
    h.push('c', 1050)
    expect(h.undo()).toBe('a')
  })
})
