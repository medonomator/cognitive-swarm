// Bayesian inference - belief updates via Bayes' theorem:
//   P(H|E) = P(E|H) * P(H) / P(E)

/** A single piece of evidence that updates beliefs. */
export interface Evidence {
  /** Which hypothesis this evidence relates to. */
  readonly hypothesisId: string
  /** Likelihood ratio: how much more likely is this evidence if H is true vs false.
   *  > 1 supports H, < 1 opposes H, = 1 uninformative. */
  readonly likelihoodRatio: number
  /** Weight of this evidence (e.g., voter confidence × agent weight). */
  readonly weight: number
}

/** Snapshot of beliefs across all hypotheses. */
export interface BeliefState {
  /** Map from hypothesis ID to posterior probability. Sums to 1. */
  readonly posteriors: ReadonlyMap<string, number>
  /** Number of evidence updates applied. */
  readonly evidenceCount: number
}

/**
 * Maintains a probability distribution over hypotheses
 * and updates it via Bayesian inference as evidence arrives.
 *
 * Usage:
 * ```ts
 * const net = new BeliefNetwork(['proposal-A', 'proposal-B', 'proposal-C'])
 * net.update({ hypothesisId: 'proposal-A', likelihoodRatio: 3.0, weight: 1.0 })
 * net.posterior('proposal-A') // ~0.6 (was 0.333, shifted toward A)
 * ```
 */
export class BeliefNetwork {
  /** Log-space beliefs: log P(H_i). We work in log-space for numerical stability. */
  private logBeliefs: Map<string, number>
  private _evidenceCount = 0

  constructor(hypothesisIds: readonly string[]) {
    if (hypothesisIds.length === 0) {
      throw new Error('BeliefNetwork requires at least one hypothesis')
    }

    // Uniform prior: P(H_i) = 1/N -> log P(H_i) = -log(N)
    const logPrior = -Math.log(hypothesisIds.length)
    this.logBeliefs = new Map(
      hypothesisIds.map((id) => [id, logPrior]),
    )
  }

  /**
   * Update beliefs with new evidence via Bayes' theorem.
   *
   * For the target hypothesis:
   *   log P(H|E) ∝ log P(H) + weight × log(likelihoodRatio)
   *
   * All posteriors are then renormalized to sum to 1.
   */
  update(evidence: Evidence): void {
    const current = this.logBeliefs.get(evidence.hypothesisId)
    if (current === undefined) return

    // Apply weighted log-likelihood to target hypothesis
    const logLR = Math.log(Math.max(evidence.likelihoodRatio, 1e-10))
    this.logBeliefs.set(
      evidence.hypothesisId,
      current + evidence.weight * logLR,
    )

    // Renormalize in log-space using log-sum-exp trick
    this.renormalize()
    this._evidenceCount++
  }

  /**
   * Apply multiple evidence updates at once.
   * More efficient than calling update() repeatedly
   * (only one renormalization at the end).
   */
  updateBatch(evidences: readonly Evidence[]): void {
    for (const evidence of evidences) {
      const current = this.logBeliefs.get(evidence.hypothesisId)
      if (current === undefined) continue

      const logLR = Math.log(Math.max(evidence.likelihoodRatio, 1e-10))
      this.logBeliefs.set(
        evidence.hypothesisId,
        current + evidence.weight * logLR,
      )
    }

    this.renormalize()
    this._evidenceCount += evidences.length
  }

  /** Get posterior probability for a hypothesis. */
  posterior(hypothesisId: string): number {
    const logP = this.logBeliefs.get(hypothesisId)
    if (logP === undefined) return 0
    return Math.exp(logP)
  }

  /** Get the hypothesis with highest posterior probability. */
  mapEstimate(): { hypothesisId: string; probability: number } {
    let bestId = ''
    let bestLogP = -Infinity

    for (const [id, logP] of this.logBeliefs) {
      if (logP > bestLogP) {
        bestLogP = logP
        bestId = id
      }
    }

    return { hypothesisId: bestId, probability: Math.exp(bestLogP) }
  }

  /** Get full belief state snapshot. */
  getState(): BeliefState {
    const posteriors = new Map<string, number>()
    for (const [id, logP] of this.logBeliefs) {
      posteriors.set(id, Math.exp(logP))
    }
    return { posteriors, evidenceCount: this._evidenceCount }
  }

  /** Number of evidence updates applied so far. */
  get evidenceCount(): number {
    return this._evidenceCount
  }

  /** Number of hypotheses being tracked. */
  get hypothesisCount(): number {
    return this.logBeliefs.size
  }

  /**
   * Add a new hypothesis with a specified prior probability.
   * Existing beliefs are scaled down proportionally to make room.
   */
  addHypothesis(id: string, prior: number): void {
    if (this.logBeliefs.has(id)) return

    // Scale existing beliefs: multiply each by (1 - prior)
    const logScale = Math.log(Math.max(1 - prior, 1e-10))
    for (const [existingId, logP] of this.logBeliefs) {
      this.logBeliefs.set(existingId, logP + logScale)
    }

    this.logBeliefs.set(id, Math.log(Math.max(prior, 1e-10)))
    this.renormalize()
  }

  /**
   * Renormalize log-beliefs so they represent a valid probability distribution.
   * Uses log-sum-exp trick to avoid numerical underflow/overflow.
   */
  private renormalize(): void {
    // Find max for numerical stability
    let maxLogP = -Infinity
    for (const logP of this.logBeliefs.values()) {
      if (logP > maxLogP) maxLogP = logP
    }

    // log-sum-exp: log(Σ exp(x_i)) = max + log(Σ exp(x_i - max))
    let sumExp = 0
    for (const logP of this.logBeliefs.values()) {
      sumExp += Math.exp(logP - maxLogP)
    }
    const logNorm = maxLogP + Math.log(sumExp)

    // Subtract normalizer from each
    for (const [id, logP] of this.logBeliefs) {
      this.logBeliefs.set(id, logP - logNorm)
    }
  }
}

/**
 * Converts a vote stance + weight into a Bayesian likelihood ratio.
 *
 * - agree with weight w  -> LR = 1 + w (evidence FOR)
 * - disagree with weight w -> LR = 1 / (1 + w) (evidence AGAINST)
 * - abstain -> LR = 1 (uninformative)
 */
export function voteToLikelihoodRatio(
  stance: 'agree' | 'disagree' | 'abstain',
  weight: number,
): number {
  switch (stance) {
    case 'agree':
      return 1 + weight
    case 'disagree':
      return 1 / (1 + weight)
    case 'abstain':
      return 1
  }
}
