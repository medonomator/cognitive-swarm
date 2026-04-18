// Projection Consensus — weighted least-squares consensus via projection theorem.
//
// From functional analysis: in a Hilbert space, the nearest point
// in a closed subspace is the orthogonal projection (exists, unique).
//
// Consensus = projection of agent beliefs onto "feasible decisions":
//   c* = argmin_c Σᵢ wᵢ · ||beliefᵢ - c||²
//
// Solution (closed-form): c* = Σᵢ wᵢ·beliefᵢ / Σᵢ wᵢ
// This is a WEIGHTED AVERAGE — the simplest, fastest consensus.
// Faster than iterative Wasserstein barycenter but less general.

/** Projection consensus result. */
export interface ProjectionResult {
  /** Optimal consensus distribution (weighted average of beliefs). */
  readonly consensus: ReadonlyMap<string, number>
  /** Total residual: Σ wᵢ·||beliefᵢ - c*||². Lower = more agreement. */
  readonly totalResidual: number
  /** Per-agent residual (distance from consensus). */
  readonly agentResiduals: ReadonlyMap<string, number>
  /** Mean residual. */
  readonly meanResidual: number
  /** Whether consensus is "tight" (mean residual < threshold). */
  readonly tight: boolean
}

/**
 * Computes weighted least-squares consensus via projection theorem.
 *
 * Usage:
 * ```ts
 * const proj = new ProjectionConsensus()
 *
 * proj.setBeliefs('a1', new Map([['A', 0.8], ['B', 0.2]]), 1.0)
 * proj.setBeliefs('a2', new Map([['A', 0.3], ['B', 0.7]]), 0.5)
 *
 * const result = proj.compute()
 * // result.consensus = weighted avg favoring a1 (higher weight)
 * ```
 */
export class ProjectionConsensus {
  private readonly beliefs = new Map<string, ReadonlyMap<string, number>>()
  private readonly weights = new Map<string, number>()

  /**
   * Set an agent's beliefs with an optional reputation/confidence weight.
   */
  setBeliefs(
    agentId: string,
    belief: ReadonlyMap<string, number>,
    weight = 1.0,
  ): void {
    this.beliefs.set(agentId, belief)
    this.weights.set(agentId, weight)
  }

  /**
   * Compute the projection consensus (weighted least-squares).
   *
   * @param tightThreshold - mean residual below which consensus is "tight"
   */
  compute(tightThreshold = 0.05): ProjectionResult {
    if (this.beliefs.size === 0) {
      return {
        consensus: new Map(),
        totalResidual: 0,
        agentResiduals: new Map(),
        meanResidual: 0,
        tight: true,
      }
    }

    // Collect all proposal keys
    const allKeys = new Set<string>()
    for (const belief of this.beliefs.values()) {
      for (const key of belief.keys()) {
        allKeys.add(key)
      }
    }

    // c* = Σ wᵢ·beliefᵢ / Σ wᵢ  (per key)
    let totalWeight = 0
    for (const w of this.weights.values()) totalWeight += w
    if (totalWeight === 0) totalWeight = 1

    const consensus = new Map<string, number>()
    for (const key of allKeys) {
      let weightedSum = 0
      for (const [agentId, belief] of this.beliefs) {
        const w = this.weights.get(agentId) ?? 1
        weightedSum += w * (belief.get(key) ?? 0)
      }
      consensus.set(key, weightedSum / totalWeight)
    }

    // Normalize consensus to sum to 1 (probability distribution)
    let consSum = 0
    for (const v of consensus.values()) consSum += v
    if (consSum > 0) {
      for (const [key, val] of consensus) {
        consensus.set(key, val / consSum)
      }
    }

    // Compute residuals: rᵢ = wᵢ · Σₖ (beliefᵢ[k] - c*[k])²
    const agentResiduals = new Map<string, number>()
    let totalResidual = 0

    for (const [agentId, belief] of this.beliefs) {
      const w = this.weights.get(agentId) ?? 1
      let squaredDist = 0
      for (const key of allKeys) {
        const diff = (belief.get(key) ?? 0) - (consensus.get(key) ?? 0)
        squaredDist += diff * diff
      }
      const residual = w * squaredDist
      agentResiduals.set(agentId, residual)
      totalResidual += residual
    }

    const meanResidual = this.beliefs.size > 0
      ? totalResidual / this.beliefs.size
      : 0

    return {
      consensus,
      totalResidual,
      agentResiduals,
      meanResidual,
      tight: meanResidual < tightThreshold,
    }
  }

  get agentCount(): number {
    return this.beliefs.size
  }

  reset(): void {
    this.beliefs.clear()
    this.weights.clear()
  }
}
