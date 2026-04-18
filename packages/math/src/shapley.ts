// Shapley values - fair contribution scoring via marginal value to coalitions.
// Exact: O(2^n) for n <= 15, Monte Carlo: O(m * n) for larger swarms.

/** Result of Shapley value computation. */
export interface ShapleyResult {
  /** Shapley value per agent. Values sum to v(N). */
  readonly values: ReadonlyMap<string, number>
  /** Value of the grand coalition v(N). */
  readonly totalValue: number
}

/** Default Monte Carlo sample count. */
const DEFAULT_SAMPLES = 1000

/**
 * Computes Shapley values for agent contribution assessment.
 *
 * Usage:
 * ```ts
 * const sv = new ShapleyValuator(['agent-1', 'agent-2', 'agent-3'])
 *
 * // Define value function: coalition -> quality score
 * sv.setValueFunction((coalition) => {
 *   // e.g., consensus confidence when only these agents participate
 *   return computeQuality(coalition)
 * })
 *
 * // Or set individual coalition values
 * sv.setCoalitionValue(['agent-1'], 0.4)
 * sv.setCoalitionValue(['agent-1', 'agent-2'], 0.7)
 * sv.setCoalitionValue(['agent-1', 'agent-2', 'agent-3'], 0.9)
 *
 * const result = sv.computeExact() // or computeApproximate()
 * // result.values -> Map { 'agent-1' => 0.35, 'agent-2' => 0.3, 'agent-3' => 0.25 }
 * ```
 */
export class ShapleyValuator {
  private readonly agents: readonly string[]
  private readonly coalitionValues = new Map<string, number>()
  private valueFn: ((coalition: readonly string[]) => number) | null = null

  constructor(agents: readonly string[]) {
    this.agents = [...agents]
  }

  setCoalitionValue(coalition: readonly string[], value: number): void {
    const key = coalitionKey(coalition)
    this.coalitionValues.set(key, value)
  }

  /**
   * Set a value function that computes coalition quality.
   * This is called for each subset during computation.
   */
  setValueFunction(fn: (coalition: readonly string[]) => number): void {
    this.valueFn = fn
  }

  /**
   * Compute exact Shapley values.
   *
   * Enumerates all 2^n subsets. Feasible for n ≤ 15.
   * For larger swarms, use computeApproximate().
   */
  computeExact(): ShapleyResult {
    const n = this.agents.length
    if (n === 0) return { values: new Map(), totalValue: 0 }

    const values = new Map<string, number>()
    for (const agent of this.agents) {
      values.set(agent, 0)
    }

    // For each agent, compute marginal contribution to each subset
    // that doesn't contain the agent
    const totalSubsets = 1 << n // 2^n

    for (let mask = 0; mask < totalSubsets; mask++) {
      const subset = this.maskToAgents(mask)
      const subsetSize = subset.length
      const vSubset = this.getValue(subset)

      // For each agent NOT in this subset, compute marginal contribution
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) continue // agent already in subset

        const agent = this.agents[i]!
        const withAgent = [...subset, agent]
        const vWithAgent = this.getValue(withAgent)

        // Shapley weight: |S|! × (n-|S|-1)! / n!
        const weight =
          factorial(subsetSize) * factorial(n - subsetSize - 1) /
          factorial(n)

        const marginal = vWithAgent - vSubset
        values.set(agent, values.get(agent)! + weight * marginal)
      }
    }

    const totalValue = this.getValue(this.agents)

    return { values, totalValue }
  }

  /**
   * Monte Carlo approximation of Shapley values.
   *
   * Samples random permutations and averages marginal contributions.
   * O(samples × n). Suitable for any swarm size.
   *
   * @param samples - number of random permutations (default: 1000)
   */
  computeApproximate(samples = DEFAULT_SAMPLES): ShapleyResult {
    const n = this.agents.length
    if (n === 0) return { values: new Map(), totalValue: 0 }

    const totals = new Map<string, number>()
    for (const agent of this.agents) {
      totals.set(agent, 0)
    }

    for (let s = 0; s < samples; s++) {
      // Random permutation (Fisher-Yates)
      const perm = [...this.agents]
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = perm[i]!
        perm[i] = perm[j]!
        perm[j] = tmp
      }

      // Walk through permutation, computing marginal contributions
      const preceding: string[] = []
      for (const agent of perm) {
        const vBefore = this.getValue(preceding)
        preceding.push(agent)
        const vAfter = this.getValue(preceding)

        totals.set(agent, totals.get(agent)! + (vAfter - vBefore))
      }
    }

    // Average
    const values = new Map<string, number>()
    for (const [agent, total] of totals) {
      values.set(agent, total / samples)
    }

    const totalValue = this.getValue(this.agents)

    return { values, totalValue }
  }

  shapleyValue(agentId: string): number {
    const result = this.agents.length <= 15
      ? this.computeExact()
      : this.computeApproximate()
    return result.values.get(agentId) ?? 0
  }

  /**
   * Find agents whose marginal contribution is below threshold.
   * These agents could be removed without significantly hurting quality.
   */
  findRedundant(threshold: number): readonly string[] {
    const result = this.agents.length <= 15
      ? this.computeExact()
      : this.computeApproximate()

    const redundant: string[] = []
    for (const [agent, value] of result.values) {
      if (value < threshold) {
        redundant.push(agent)
      }
    }

    return redundant
  }

  /**
   * Greedy selection of top-k agents by Shapley value.
   *
   * Returns the k agents with highest marginal contribution.
   * Useful for forming optimal sub-teams.
   */
  optimalCoalition(k: number): readonly string[] {
    const result = this.agents.length <= 15
      ? this.computeExact()
      : this.computeApproximate()

    return [...result.values.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(k, this.agents.length))
      .map(([agent]) => agent)
  }

  get agentCount(): number {
    return this.agents.length
  }

  reset(): void {
    this.coalitionValues.clear()
    this.valueFn = null
  }

  private getValue(coalition: readonly string[]): number {
    if (coalition.length === 0) return 0

    // Try explicit value first
    const key = coalitionKey(coalition)
    const explicit = this.coalitionValues.get(key)
    if (explicit !== undefined) return explicit

    // Try value function
    if (this.valueFn !== null) {
      const value = this.valueFn(coalition)
      // Cache for performance
      this.coalitionValues.set(key, value)
      return value
    }

    return 0
  }

  private maskToAgents(mask: number): string[] {
    const result: string[] = []
    for (let i = 0; i < this.agents.length; i++) {
      if (mask & (1 << i)) {
        result.push(this.agents[i]!)
      }
    }
    return result
  }
}

/** Canonical key for a coalition (sorted agent IDs joined). */
function coalitionKey(coalition: readonly string[]): string {
  return [...coalition].sort().join(',')
}

const factorialCache = new Map<number, number>([[0, 1], [1, 1]])

function factorial(n: number): number {
  if (n < 0) return 1
  const cached = factorialCache.get(n)
  if (cached !== undefined) return cached
  const result = n * factorial(n - 1)
  factorialCache.set(n, result)
  return result
}
