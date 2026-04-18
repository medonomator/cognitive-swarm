// Markov chain - signal flow prediction.
// Predicts convergence time, loop probability, and stationary distribution.

/** Prediction of convergence from Markov analysis. */
export interface ConvergencePrediction {
  /** Expected number of transitions to reach target state. */
  readonly expectedSteps: number
  /** Probability of reaching target within maxSteps. */
  readonly probability: number
  /** Current stationary distribution probabilities. */
  readonly stationaryDistribution: ReadonlyMap<string, number>
}

/** Report of a detected cycle in signal flow. */
export interface CycleReport {
  /** Whether a significant cycle was detected. */
  readonly detected: boolean
  /** States involved in the cycle. */
  readonly states: readonly string[]
  /** Fraction of time spent in the cycle (from stationary distribution). */
  readonly cycleMass: number
}

/**
 * Markov chain model for signal type transitions.
 * Learns transition probabilities from observed signal sequences
 * and predicts future swarm behavior.
 *
 * Usage:
 * ```ts
 * const mc = new MarkovChain()
 * mc.observe('task:new', 'discovery')
 * mc.observe('discovery', 'proposal')
 * mc.observe('discovery', 'doubt')
 * mc.observe('proposal', 'vote')
 *
 * mc.transitionProbability('discovery', 'proposal')  // 0.5
 * mc.predictConvergence('consensus:reached', 20)
 * mc.detectCycles()
 * ```
 */
export class MarkovChain {
  private readonly counts = new Map<string, Map<string, number>>()
  private readonly totals = new Map<string, number>()
  private readonly states = new Set<string>()

  observe(from: string, to: string): void {
    this.states.add(from)
    this.states.add(to)

    let row = this.counts.get(from)
    if (!row) {
      row = new Map()
      this.counts.set(from, row)
    }

    row.set(to, (row.get(to) ?? 0) + 1)
    this.totals.set(from, (this.totals.get(from) ?? 0) + 1)
  }

  /**
   * Observe a sequence of signal types.
   * Records transitions between consecutive elements.
   */
  observeSequence(sequence: readonly string[]): void {
    for (let i = 0; i < sequence.length - 1; i++) {
      this.observe(sequence[i]!, sequence[i + 1]!)
    }
  }

  /** Get P(to | from). */
  transitionProbability(from: string, to: string): number {
    const total = this.totals.get(from)
    if (!total) return 0

    const row = this.counts.get(from)
    if (!row) return 0

    return (row.get(to) ?? 0) / total
  }

  transitionRow(from: string): ReadonlyMap<string, number> {
    const result = new Map<string, number>()
    const total = this.totals.get(from)
    if (!total) return result

    const row = this.counts.get(from)
    if (!row) return result

    for (const [to, count] of row) {
      result.set(to, count / total)
    }
    return result
  }

  /**
   * Get the full transition matrix as a 2D structure.
   * Returns { states, matrix } where matrix[i][j] = P(j | i).
   */
  getTransitionMatrix(): {
    states: readonly string[]
    matrix: readonly (readonly number[])[]
  } {
    const stateList = [...this.states].sort()
    const stateIndex = new Map(stateList.map((s, i) => [s, i]))
    const n = stateList.length
    const matrix: number[][] = Array.from({ length: n }, () =>
      new Array<number>(n).fill(0),
    )

    for (const [from, row] of this.counts) {
      const i = stateIndex.get(from)
      if (i === undefined) continue
      const total = this.totals.get(from) ?? 1

      for (const [to, count] of row) {
        const j = stateIndex.get(to)
        if (j === undefined) continue
        matrix[i]![j] = count / total
      }
    }

    return { states: stateList, matrix }
  }

  /**
   * Predict convergence to a target state using simulation.
   *
   * Runs Monte Carlo simulations from the current state distribution
   * to estimate expected steps and probability of reaching target.
   *
   * @param targetState - the absorbing state to reach (e.g., 'consensus:reached')
   * @param maxSteps - maximum steps to simulate
   * @param simulations - number of Monte Carlo runs (default: 1000)
   * @param startState - starting state (if undefined, uses most recent state)
   */
  predictConvergence(
    targetState: string,
    maxSteps: number,
    simulations = 1000,
    startState?: string,
  ): ConvergencePrediction {
    const start = startState ?? this.mostLikelyCurrentState()
    if (!start) {
      return {
        expectedSteps: Infinity,
        probability: 0,
        stationaryDistribution: new Map(),
      }
    }

    let totalSteps = 0
    let reached = 0

    for (let sim = 0; sim < simulations; sim++) {
      let current = start
      let steps = 0

      while (steps < maxSteps && current !== targetState) {
        const next = this.sampleTransition(current)
        if (!next) break
        current = next
        steps++
      }

      if (current === targetState) {
        reached++
        totalSteps += steps
      } else {
        totalSteps += maxSteps
      }
    }

    return {
      expectedSteps: totalSteps / simulations,
      probability: reached / simulations,
      stationaryDistribution: this.computeStationaryDistribution(),
    }
  }

  /**
   * Compute stationary distribution π where πP = π.
   * Uses power iteration (multiply distribution by transition matrix repeatedly).
   */
  computeStationaryDistribution(
    iterations = 100,
  ): ReadonlyMap<string, number> {
    const { states: stateList, matrix } = this.getTransitionMatrix()
    const n = stateList.length
    if (n === 0) return new Map()

    // Start with uniform distribution
    let dist = new Array<number>(n).fill(1 / n)

    for (let iter = 0; iter < iterations; iter++) {
      const next = new Array<number>(n).fill(0)
      // π_next = π × P (row vector × matrix)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          next[j]! += dist[i]! * matrix[i]![j]!
        }
      }

      // Check convergence
      let maxDiff = 0
      for (let i = 0; i < n; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(next[i]! - dist[i]!))
      }
      dist = next

      if (maxDiff < 1e-10) break
    }

    const result = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      result.set(stateList[i]!, dist[i]!)
    }
    return result
  }

  /**
   * Detect cycles in the signal flow.
   *
   * A cycle exists when a set of states have high mutual transition
   * probabilities and collectively absorb significant probability mass
   * in the stationary distribution.
   */
  detectCycles(massThreshold = 0.5): CycleReport {
    const stationary = this.computeStationaryDistribution()
    const stateList = [...this.states]

    // Find strongly connected groups:
    // states where P(A->B) > 0.1 AND P(B->A) > 0.1
    const cycleStates: string[] = []
    const visited = new Set<string>()

    for (const a of stateList) {
      if (visited.has(a)) continue
      const group = [a]
      visited.add(a)

      for (const b of stateList) {
        if (visited.has(b)) continue
        const pAB = this.transitionProbability(a, b)
        const pBA = this.transitionProbability(b, a)

        if (pAB > 0.1 && pBA > 0.1) {
          group.push(b)
          visited.add(b)
        }
      }

      if (group.length > 1) {
        cycleStates.push(...group)
      }
    }

    // Compute mass of cycle states in stationary distribution
    let cycleMass = 0
    for (const state of cycleStates) {
      cycleMass += stationary.get(state) ?? 0
    }

    return {
      detected: cycleStates.length > 1 && cycleMass > massThreshold,
      states: cycleStates,
      cycleMass,
    }
  }

  get observedStates(): ReadonlySet<string> {
    return this.states
  }

  get transitionCount(): number {
    let total = 0
    for (const t of this.totals.values()) total += t
    return total
  }

  reset(): void {
    this.counts.clear()
    this.totals.clear()
    this.states.clear()
  }

  /**
   * Find the state with most outgoing transitions
   * (proxy for "most recent active state").
   */
  private mostLikelyCurrentState(): string | undefined {
    let bestState: string | undefined
    let bestCount = 0

    for (const [state, total] of this.totals) {
      if (total > bestCount) {
        bestCount = total
        bestState = state
      }
    }

    return bestState
  }

  /**
   * Sample a next state from the transition distribution of `from`.
   * Uses inverse CDF sampling.
   */
  private sampleTransition(from: string): string | undefined {
    const row = this.counts.get(from)
    const total = this.totals.get(from)
    if (!row || !total) return undefined

    const r = Math.random() * total
    let cumulative = 0

    for (const [to, count] of row) {
      cumulative += count
      if (r <= cumulative) return to
    }

    // Shouldn't happen, but return last state
    return [...row.keys()].pop()
  }
}
