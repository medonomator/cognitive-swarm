import type { Signal, ConflictPair } from '@cognitive-swarm/core'

/**
 * Detects conflicting proposals from different agents.
 * A conflict occurs when two agents submit competing proposals
 * (different proposals from different sources).
 */
export class ConflictDetector {
  private readonly unresolved: ConflictPair[] = []

  /**
   * Check a new signal against recent proposals for conflicts.
   * Only proposal-type signals can conflict.
   */
  check(signal: Signal, history: readonly Signal[]): ConflictPair | null {
    if (signal.type !== 'proposal') return null

    for (const existing of history) {
      if (existing.type !== 'proposal') continue
      if (existing.source === signal.source) continue
      if (existing.id === signal.id) continue

      const conflict: ConflictPair = {
        signalA: existing,
        signalB: signal,
        detectedAt: Date.now(),
      }
      this.unresolved.push(conflict)
      return conflict
    }

    return null
  }

  /** Mark a conflict as resolved. */
  markResolved(signalAId: string, signalBId: string): void {
    const index = this.unresolved.findIndex(
      (c) =>
        (c.signalA.id === signalAId && c.signalB.id === signalBId) ||
        (c.signalA.id === signalBId && c.signalB.id === signalAId),
    )
    if (index !== -1) {
      this.unresolved.splice(index, 1)
    }
  }

  /** Get all unresolved conflicts. */
  getUnresolved(): readonly ConflictPair[] {
    return [...this.unresolved]
  }

  /** Clear all tracked conflicts. */
  clear(): void {
    this.unresolved.length = 0
  }
}
