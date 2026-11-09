import { describe, expect, it } from 'vitest'
import { clickSelection, emptySelection, type Selection } from './selection'

const order = ['a', 'b', 'c', 'd', 'e', 'f']
const plain = { toggle: false, shift: false }
const ctrl = { toggle: true, shift: false }
const shift = { toggle: false, shift: true }

const run = (clicks: Array<[string, typeof plain]>, from: Selection = emptySelection): Selection =>
  clicks.reduce((state, [id, keys]) => clickSelection(state, order, id, keys), from)

describe('clickSelection', () => {
  it('a plain click selects only that task', () => {
    expect(run([['b', plain], ['d', plain]])).toEqual({ selected: ['d'], first: 'd', last: 'd' })
  })

  it('Ctrl adds and removes', () => {
    const s = run([['b', plain], ['d', ctrl], ['e', ctrl]])
    expect(s.selected).toEqual(['b', 'd', 'e'])
    expect(s.last).toBe('e')
    const removed = clickSelection(s, order, 'd', ctrl)
    expect(removed.selected).toEqual(['b', 'e'])
    expect(removed.last).toBe('e')
  })

  it('removing the last one hands "last" to the lowest remaining task', () => {
    const s = run([['b', plain], ['f', ctrl], ['d', ctrl]])
    expect(clickSelection(s, order, 'd', ctrl).last).toBe('f')
  })

  it('removing everything clears the selection', () => {
    expect(run([['b', plain], ['b', ctrl]])).toEqual({ selected: [], first: null, last: null })
  })

  it('Shift selects the block from the first selected task', () => {
    const s = run([['b', plain], ['e', shift]])
    expect(s.selected).toEqual(['b', 'c', 'd', 'e'])
    expect(s.first).toBe('b')
    expect(s.last).toBe('e')
  })

  it('a second Shift click replaces the previous block', () => {
    expect(run([['b', plain], ['e', shift], ['c', shift]]).selected).toEqual(['b', 'c'])
  })

  it('Shift works upwards and flips over the anchor', () => {
    expect(run([['d', plain], ['b', shift]]).selected).toEqual(['b', 'c', 'd'])
    expect(run([['d', plain], ['b', shift], ['f', shift]]).selected).toEqual(['d', 'e', 'f'])
  })

  it('tasks added with Ctrl stay when the Shift block changes', () => {
    const s = run([['a', plain], ['f', ctrl], ['b', ctrl], ['d', shift]])
    expect(s.selected).toContain('a')
    expect(s.selected).toContain('f')
  })

  it('Shift with nothing selected selects just the task', () => {
    expect(run([['c', shift]])).toEqual({ selected: ['c'], first: 'c', last: 'c' })
  })

  it('forgets tasks that are no longer visible', () => {
    const s: Selection = { selected: ['b', 'x'], first: 'x', last: 'x' }
    expect(clickSelection(s, order, 'd', ctrl).selected).toEqual(['b', 'd'])
  })

  it('one level only: tasks of another level are ignored', () => {
    const level = (id: string): number => (id === 'c' ? 2 : 1)
    const s = clickSelection({ selected: ['b'], first: 'b', last: 'b' }, order, 'c', ctrl, { oneLevel: true, level })
    expect(s.selected).toEqual(['b'])
    const block = clickSelection({ selected: ['a'], first: 'a', last: 'a' }, order, 'e', shift, { oneLevel: true, level })
    expect(block.selected).toEqual(['a', 'b', 'd', 'e'])
  })
})
