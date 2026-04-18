// Replicator dynamics - evolutionary strategy balancing.
// x_i(t+1) = x_i(t) * f_i(t) / phi(t)
// Above-average fitness strategies grow, below-average shrink.

/** Fitness observation for a strategy in a round. */
export interface StrategyObservation {
  readonly strategy: string
  readonly fitness: number
  readonly frequency: number
}

/** Suggested shift in strategy distribution. */
export interface StrategyShift {
  readonly strategy: string
  readonly direction: 'increase' | 'decrease'
  /** How far from equilibrium (magnitude of correction needed). */
  readonly magnitude: number
}

/** Full evolutionary analysis report. */
export interface EvolutionaryReport {
  /** Current strategy frequency distribution. */
  readonly currentDistribution: ReadonlyMap<string, number>
  /** Current fitness values per strategy. */
  readonly fitnessValues: ReadonlyMap<string, number>
  /** Predicted ESS equilibrium frequencies. */
  readonly equilibrium: ReadonlyMap<string, number>
  /** KL divergence from current distribution to ESS. */
  readonly convergenceToESS: number
  /** Recommended strategy shifts. */
  readonly suggestedShifts: readonly StrategyShift[]
  /** Strategy with highest current fitness (null if no data). */
  readonly dominantStrategy: string | null
  /** Population average fitness. */
  readonly averageFitness: number
}

/** Max simulation steps for ESS computation. */
const MAX_ESS_STEPS = 500
/** Convergence threshold for ESS. */
const ESS_DELTA = 1e-6
/** Minimum frequency to prevent strategies from dying out completely. */
const MIN_FREQUENCY = 0.01

/**
 * Replicator dynamics for evolutionary strategy balancing.
 *
 * Usage:
 * ```ts
 * const rd = new ReplicatorDynamics(['analyze', 'propose', 'challenge', 'support'])
 *
 * // After round 1: too many proposals, challenges are rare but valuable
 * rd.observeRound(
 *   new Map([['analyze', 0.1], ['propose', 0.6], ['challenge', 0.1], ['support', 0.2]]),
 *   new Map([['analyze', 0.5], ['propose', 0.3], ['challenge', 0.9], ['support', 0.4]]),
 * )
 *
 * const report = rd.analyze()
 * // report.suggestedShifts -> [{ strategy: 'challenge', direction: 'increase', ... }]
 * // report.dominantStrategy -> 'challenge' (highest fitness)
 * ```
 */
export class ReplicatorDynamics {
  private readonly strategies: readonly string[]
  private frequencies: Map<string, number>
  private fitnessHistory: Map<string, number[]> = new Map()
  private currentFitness: Map<string, number> = new Map()
  private roundCount = 0

  constructor(strategies: readonly string[]) {
    this.strategies = strategies
    this.frequencies = new Map()

    // Initialize uniform distribution
    const uniform = 1 / strategies.length
    for (const s of strategies) {
      this.frequencies.set(s, uniform)
      this.fitnessHistory.set(s, [])
    }
  }

  /**
   * Record observed strategy frequencies and their fitness.
   *
   * @param frequencies - fraction of agents using each strategy (should sum to ~1)
   * @param fitness - average payoff/quality for each strategy this round
   */
  observeRound(
    frequencies: ReadonlyMap<string, number>,
    fitness: ReadonlyMap<string, number>,
  ): void {
    // Update frequencies
    for (const s of this.strategies) {
      const f = frequencies.get(s) ?? 0
      this.frequencies.set(s, Math.max(MIN_FREQUENCY, f))
    }
    normalizeMap(this.frequencies)

    // Update fitness
    for (const s of this.strategies) {
      const fit = fitness.get(s) ?? 0
      this.currentFitness.set(s, fit)
      this.fitnessHistory.get(s)?.push(fit)
    }

    this.roundCount++
  }

  /**
   * Simulate one replicator step - predict next round's frequencies.
   *
   *   x_i(t+1) = x_i(t) × f_i / φ
   *
   * Returns predicted frequency distribution.
   */
  step(
    freq?: Map<string, number>,
    fit?: ReadonlyMap<string, number>,
  ): Map<string, number> {
    const frequencies = freq ?? this.frequencies
    const fitness = fit ?? this.currentFitness

    // Population average fitness
    let phi = 0
    for (const s of this.strategies) {
      phi += (frequencies.get(s) ?? 0) * (fitness.get(s) ?? 0)
    }

    if (phi <= 0) return new Map(frequencies)

    const next = new Map<string, number>()
    for (const s of this.strategies) {
      const xi = frequencies.get(s) ?? 0
      const fi = fitness.get(s) ?? 0
      next.set(s, Math.max(MIN_FREQUENCY, (xi * fi) / phi))
    }

    normalizeMap(next)
    return next
  }

  /**
   * Find ESS (Evolutionary Stable Strategy) via simulation to convergence.
   *
   * Starting from current frequencies and fitness, runs replicator dynamics
   * until the distribution stabilizes. The result is the equilibrium that
   * no agent can profitably deviate from.
   */
  findEquilibrium(maxSteps = MAX_ESS_STEPS): ReadonlyMap<string, number> {
    if (this.currentFitness.size === 0) return new Map(this.frequencies)

    let current = new Map(this.frequencies)

    for (let i = 0; i < maxSteps; i++) {
      const next = this.step(current, this.currentFitness)

      // Check convergence
      let maxDelta = 0
      for (const s of this.strategies) {
        const delta = Math.abs(
          (next.get(s) ?? 0) - (current.get(s) ?? 0),
        )
        maxDelta = Math.max(maxDelta, delta)
      }

      current = next

      if (maxDelta < ESS_DELTA) break
    }

    return current
  }

  /**
   * Is a given strategy ESS-stable?
   *
   * A strategy is stable if a small invasion (mutant) would be
   * driven back to zero by the replicator dynamics. We test by
   * perturbing the equilibrium and checking if it returns.
   */
  isESSStable(strategy: string): boolean {
    const eq = this.findEquilibrium()
    const eqFreq = eq.get(strategy) ?? 0

    // Perturb: increase this strategy by 10%
    const perturbed = new Map(eq)
    const boost = 0.1
    perturbed.set(strategy, eqFreq + boost)
    normalizeMap(perturbed)

    // Simulate a few steps
    let current = perturbed
    for (let i = 0; i < 20; i++) {
      current = this.step(current, this.currentFitness)
    }

    // Strategy is stable if it returns toward equilibrium
    const afterFreq = current.get(strategy) ?? 0
    return Math.abs(afterFreq - eqFreq) < Math.abs(eqFreq + boost - eqFreq)
  }

  /** Full evolutionary analysis. */
  analyze(): EvolutionaryReport {
    const equilibrium = this.findEquilibrium()
    const convergence = klDivergence(this.frequencies, equilibrium, this.strategies)
    const shifts = this.computeShifts(equilibrium)
    const avgFitness = this.computeAverageFitness()

    let dominantStrategy: string | null = null
    let maxFitness = -Infinity
    for (const s of this.strategies) {
      const f = this.currentFitness.get(s) ?? 0
      if (f > maxFitness) {
        maxFitness = f
        dominantStrategy = s
      }
    }

    if (this.currentFitness.size === 0) dominantStrategy = null

    return {
      currentDistribution: new Map(this.frequencies),
      fitnessValues: new Map(this.currentFitness),
      equilibrium,
      convergenceToESS: convergence,
      suggestedShifts: shifts,
      dominantStrategy,
      averageFitness: avgFitness,
    }
  }

  get rounds(): number {
    return this.roundCount
  }

  reset(): void {
    const uniform = 1 / this.strategies.length
    for (const s of this.strategies) {
      this.frequencies.set(s, uniform)
      this.fitnessHistory.set(s, [])
    }
    this.currentFitness.clear()
    this.roundCount = 0
  }

  private computeShifts(equilibrium: ReadonlyMap<string, number>): StrategyShift[] {
    const shifts: StrategyShift[] = []
    const THRESHOLD = 0.05

    for (const s of this.strategies) {
      const current = this.frequencies.get(s) ?? 0
      const target = equilibrium.get(s) ?? 0
      const diff = target - current

      if (Math.abs(diff) > THRESHOLD) {
        shifts.push({
          strategy: s,
          direction: diff > 0 ? 'increase' : 'decrease',
          magnitude: Math.abs(diff),
        })
      }
    }

    // Sort by magnitude descending
    shifts.sort((a, b) => b.magnitude - a.magnitude)
    return shifts
  }

  private computeAverageFitness(): number {
    let phi = 0
    for (const s of this.strategies) {
      phi += (this.frequencies.get(s) ?? 0) * (this.currentFitness.get(s) ?? 0)
    }
    return phi
  }
}

function normalizeMap(map: Map<string, number>): void {
  let sum = 0
  for (const v of map.values()) sum += v
  if (sum > 0) {
    for (const [k, v] of map) {
      map.set(k, v / sum)
    }
  }
}

/**
 * KL divergence: D_KL(P || Q).
 * Measures how far distribution P is from reference Q.
 */
function klDivergence(
  p: ReadonlyMap<string, number>,
  q: ReadonlyMap<string, number>,
  keys: readonly string[],
): number {
  let kl = 0
  for (const key of keys) {
    const pi = p.get(key) ?? MIN_FREQUENCY
    const qi = q.get(key) ?? MIN_FREQUENCY
    if (pi > 0 && qi > 0) {
      kl += pi * Math.log(pi / qi)
    }
  }
  return Math.max(0, kl)
}
