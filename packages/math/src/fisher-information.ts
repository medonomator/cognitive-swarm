import { linearRegressionSlope } from './internal/linear-regression.js'

// Fisher Information: learning efficiency & Cramér-Rao bound
//
// Fisher Information I(θ) measures how much information observations carry
// about the unknown parameter θ. The Cramér-Rao bound states:
//
//   Var(θ̂) ≥ 1 / I(θ)
//
// This gives us the THEORETICAL MINIMUM variance — the best possible
// estimate precision given the data we have. Comparing actual variance
// to this bound tells us how efficiently the swarm is learning:
//
//   efficiency = Cramér-Rao bound / actual variance ∈ [0, 1]
//     1.0 = perfectly efficient (impossible in practice)
//     0.5 = learning at half theoretical maximum
//     0.1 = 90% of observations are wasted
//
// Used for:
// - Measuring learning efficiency (are we using signals optimally?)
// - Diagnosing bottlenecks (why is convergence slow?)
// - Adaptive round allocation (spend more rounds where Fisher info is high)
// - Detecting diminishing returns (Fisher info approaching zero)

/** Fisher information analysis for a single parameter. */
export interface FisherAnalysis {
  /** Estimated Fisher information I(θ) for the leading hypothesis. */
  readonly fisherInformation: number
  /** Cramér-Rao lower bound: 1/I(θ) — minimum achievable variance. */
  readonly cramerRaoBound: number
  /** Actual variance of the posterior estimate. */
  readonly actualVariance: number
  /** Learning efficiency: cramerRaoBound / actualVariance ∈ [0, 1]. */
  readonly efficiency: number
  /** Effective sample size: how many independent observations this is worth. */
  readonly effectiveSampleSize: number
}

/** Full report on swarm learning efficiency. */
export interface LearningEfficiencyReport {
  /** Per-hypothesis Fisher analysis. */
  readonly perHypothesis: Readonly<Record<string, FisherAnalysis>>
  /** Overall learning efficiency (weighted average). */
  readonly overallEfficiency: number
  /** True if efficiency is below 0.3 for 3+ rounds (swarm is stuck). */
  readonly learningStalled: boolean
  /** Recommended action based on Fisher analysis. */
  readonly recommendation: LearningRecommendation
  /** Fisher information trend: positive = improving, negative = diminishing. */
  readonly trend: number
  /** History of per-round overall efficiency. */
  readonly history: readonly number[]
}

export type LearningRecommendation =
  | 'continue'          // efficiency > 0.5, learning well
  | 'diversify-agents'  // efficiency < 0.3, signals too correlated
  | 'add-exploration'   // Fisher info near zero, no new information
  | 'reduce-agents'     // effective sample size << actual agent count
  | 'stop-early'        // Fisher info ≈ 0, nothing left to learn

/**
 * Tracks Fisher Information and learning efficiency across rounds.
 *
 * For categorical distributions (which we use for proposal posteriors),
 * the Fisher information matrix has entries:
 *
 *   I_ij = Σ_k (1/p_k) × (∂p_k/∂θ_i) × (∂p_k/∂θ_j)
 *
 * For the scalar case (confidence in leading hypothesis θ = p_max):
 *
 *   I(θ) ≈ n / (θ × (1 - θ))
 *
 * where n is the effective number of independent observations.
 *
 * Usage:
 * ```ts
 * const tracker = new FisherTracker()
 *
 * // After each round, feed the posterior distribution
 * tracker.observeRound(new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]))
 * tracker.observeRound(new Map([['A', 0.7], ['B', 0.2], ['C', 0.1]]))
 *
 * const report = tracker.report()
 * // report.overallEfficiency = 0.65
 * // report.recommendation = 'continue'
 * ```
 */
export class FisherTracker {
  /** History of posterior distributions per round. */
  private readonly posteriorHistory: Map<string, number>[] = []
  /** History of per-round overall efficiency. */
  private readonly efficiencyHistory: number[] = []
  /** Consecutive rounds with low efficiency. */
  private stalledRounds = 0
  /** Threshold for "stalled" (efficiency below this). */
  private readonly stallThreshold: number
  /** Consecutive stalled rounds before flagging. */
  private readonly stallWindowSize: number

  constructor(stallThreshold = 0.3, stallWindowSize = 3) {
    this.stallThreshold = stallThreshold
    this.stallWindowSize = stallWindowSize
  }

  /**
   * Record a new posterior distribution (call once per round).
   */
  observeRound(posteriors: ReadonlyMap<string, number>): void {
    this.posteriorHistory.push(new Map(posteriors))

    // Compute efficiency for this round and update tracking
    if (this.posteriorHistory.length >= 2) {
      const efficiency = this.computeOverallEfficiency()
      this.efficiencyHistory.push(efficiency)

      if (efficiency < this.stallThreshold) {
        this.stalledRounds++
      } else {
        this.stalledRounds = 0
      }
    }
  }

  /** Generate full learning efficiency report. */
  report(): LearningEfficiencyReport {
    const perHypothesis: Record<string, FisherAnalysis> = {}

    if (this.posteriorHistory.length >= 2) {
      const latest = this.posteriorHistory[this.posteriorHistory.length - 1]!
      for (const id of latest.keys()) {
        perHypothesis[id] = this.analyzeHypothesis(id)
      }
    }

    const overallEfficiency = this.computeOverallEfficiency()
    const learningStalled = this.stalledRounds >= this.stallWindowSize
    const recommendation = this.computeRecommendation(
      overallEfficiency,
      learningStalled,
    )
    const trend = this.computeTrend()

    return {
      perHypothesis,
      overallEfficiency,
      learningStalled,
      recommendation,
      trend,
      history: [...this.efficiencyHistory],
    }
  }

  /** Number of rounds observed. */
  get roundCount(): number {
    return this.posteriorHistory.length
  }

  /** Reset all state. */
  reset(): void {
    this.posteriorHistory.length = 0
    this.efficiencyHistory.length = 0
    this.stalledRounds = 0
  }

  // ── Private ──

  /**
   * Analyze Fisher information for a single hypothesis.
   *
   * For Bernoulli-like parameter θ = P(hypothesis):
   *   I(θ) = n / (θ(1-θ))
   * where n is effective sample size.
   *
   * Cramér-Rao: Var(θ̂) ≥ θ(1-θ)/n
   */
  private analyzeHypothesis(hypothesisId: string): FisherAnalysis {
    const n = this.posteriorHistory.length
    if (n < 2) {
      return {
        fisherInformation: 0,
        cramerRaoBound: Infinity,
        actualVariance: Infinity,
        efficiency: 0,
        effectiveSampleSize: 0,
      }
    }

    // Extract time series of this hypothesis's probability
    const series: number[] = []
    for (const posterior of this.posteriorHistory) {
      series.push(posterior.get(hypothesisId) ?? 0)
    }

    // Current estimate (latest posterior)
    const theta = series[series.length - 1]!
    const thetaClamped = Math.max(0.01, Math.min(0.99, theta))

    // Actual variance of the estimate (from posterior history)
    const mean = series.reduce((a, b) => a + b, 0) / series.length
    const actualVariance =
      series.reduce((sum, p) => sum + (p - mean) ** 2, 0) / (series.length - 1)

    // Effective sample size: how much the posterior has concentrated
    // estimated via the ratio of prior variance to posterior variance
    const priorVariance = 1 / 12 // Uniform prior variance
    const effectiveSampleSize =
      actualVariance > 0
        ? Math.max(1, priorVariance / actualVariance)
        : series.length

    // Fisher information for Bernoulli parameter
    const fisherInformation =
      effectiveSampleSize / (thetaClamped * (1 - thetaClamped))

    // Cramér-Rao bound
    const cramerRaoBound =
      fisherInformation > 0 ? 1 / fisherInformation : Infinity

    // Efficiency
    const efficiency =
      actualVariance > 0 && cramerRaoBound < Infinity
        ? Math.min(1, cramerRaoBound / actualVariance)
        : 0

    return {
      fisherInformation,
      cramerRaoBound,
      actualVariance: Math.max(0, actualVariance),
      efficiency,
      effectiveSampleSize,
    }
  }

  /**
   * Overall efficiency: weighted average across hypotheses,
   * weighted by posterior probability (focus on leading hypotheses).
   */
  private computeOverallEfficiency(): number {
    if (this.posteriorHistory.length < 2) return 0

    const latest = this.posteriorHistory[this.posteriorHistory.length - 1]!
    let totalWeight = 0
    let weightedEfficiency = 0

    for (const [id, prob] of latest) {
      const analysis = this.analyzeHypothesis(id)
      weightedEfficiency += prob * analysis.efficiency
      totalWeight += prob
    }

    return totalWeight > 0 ? weightedEfficiency / totalWeight : 0
  }

  private computeRecommendation(
    efficiency: number,
    stalled: boolean,
  ): LearningRecommendation {
    if (stalled && efficiency < 0.1) return 'stop-early'
    if (stalled) return 'diversify-agents'
    if (efficiency < 0.2) return 'add-exploration'
    if (efficiency > 0.5) return 'continue'
    return 'continue'
  }

  /** Compute efficiency trend via linear regression slope. */
  private computeTrend(): number {
    return linearRegressionSlope(this.efficiencyHistory)
  }
}
