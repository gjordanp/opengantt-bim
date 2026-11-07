/**
 * Snapshot-based undo/redo. Each recorded state is a full, immutable snapshot;
 * pushes that arrive close together (one user gesture often fires several
 * change events) are merged into a single step.
 */
export class History<T> {
  private states: T[] = []
  private index = -1
  private lastPushAt = 0

  constructor(
    private readonly limit = 100,
    private readonly coalesceMs = 300
  ) {}

  /** Starts over with `state` as the only entry. */
  reset(state: T): void {
    this.states = [state]
    this.index = 0
    this.lastPushAt = 0
  }

  push(state: T, now = Date.now()): void {
    if (this.index < 0) return this.reset(state)
    // Recording a new edit discards whatever could have been redone.
    this.states.length = this.index + 1
    if (this.index > 0 && now - this.lastPushAt < this.coalesceMs) {
      this.states[this.index] = state
    } else {
      this.states.push(state)
      this.index++
      if (this.states.length > this.limit) {
        this.states.shift()
        this.index--
      }
    }
    this.lastPushAt = now
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index >= 0 && this.index < this.states.length - 1
  }

  undo(): T | undefined {
    if (!this.canUndo) return undefined
    this.lastPushAt = 0
    return this.states[--this.index]
  }

  redo(): T | undefined {
    if (!this.canRedo) return undefined
    this.lastPushAt = 0
    return this.states[++this.index]
  }
}
