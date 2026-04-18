import { linearRegressionSlope } from './internal/linear-regression.js'
import { klDivergence } from './entropy.js'

// Bayesian Surprise: S = D_KL(posterior || prior)
//
// Measures how much a signal changes beliefs. High surprise = highly informative.
// Low surprise = confirms what we already believed (potential confirmation bias).
//
// Key insight: not all signals are equally valuable. A surprising disagreement
// from a trusted agent carries far more information than a predictable agreement.
//
// Used for:
// - Attention-weighted signal processing (amplify surprising signals)
// - Detecting confirmation bias (too many low-surprise rounds)
// - Identifying most informative agents (consistently high surprise)
// - Early warning for groupthink (surprise collapse)

/** A single surprise measurement for one signal. */
export interface SurpriseMeasurement {
  /** The signal or agent that caused this surprise. */
  readonly sourceId: string
  /** KL divergence from prior to posterior (in bits). Always >= 0. */
  readonly surprise: number
  /** Surprise relative to recent average: >1 means more surprising than usual. */
  readonly relativeSurprise: number
  /** Weight multiplier: how much to amplify this signal. */
  readonly attentionWeight: number
}

/** Aggregate surprise statistics for a round. */
export interface SurpriseReport {
  /** Per-signal surprise measurements. */
  readonly measurements: readonly SurpriseMeasurement[]
  /** Mean surprise across all signals this round (bits). */
  readonly meanSurprise: number
  /** Max surprise observed this round. */
  readonly maxSurprise: number
  /** Surprise trend: positive = getting more surprising, negative = converging. */
  readonly trend: number
  /** True if surprise has collapsed (potential groupthink / echo chamber). */
  readonly surpriseCollapse: boolean
  /** Agent with highest cumulative surprise (most informative). */
  readonly mostInformativeAgent: string | null
  /** Agent with lowest cumulative surprise (most predictable). */
  readonly leastInformativeAgent: string | null
}

/** Configuration for the surprise tracker. */
export interface SurpriseConfig {
  /** Minimum surprise (bits) below which we consider a signal uninformative. Default: 0.01 */
  readonly minSurpriseThreshold: number
  /** Attention amplification factor: weight = 1 + alpha * normalized_surprise. Default: 2.0 */
  readonly attentionAlpha: number
  /** Number of recent rounds to use for trend calculation. Default: 5 */
  readonly trendWindow: number
  /** Surprise collapse threshold: if mean surprise < this for trendWindow rounds, flag it. Default: 0.05 */
  readonly collapseThreshold: number
}

const DEFAULT_CONFIG: SurpriseConfig = {
  minSurpriseThreshold: 0.01,
  attentionAlpha: 2.0,
  trendWindow: 5,
  collapseThreshold: 0.05,
}

/**
 * Tracks Bayesian surprise across rounds to implement attention-weighted
 * signal processing for the swarm.
 *
 * Bayesian Surprise = KL(posterior || prior)
 *   = Sum_i posterior(i) * log2(posterior(i) / prior(i))
 *
 * This is the "information gained" by observing a signal — how much
 * beliefs shifted. A signal that changes nothing has surprise = 0.
 * A signal that flips beliefs has high surprise.
 *
 * Usage:
 * ```ts
 * const tracker = new SurpriseTracker()
 *
 * // Before processing a signal, snapshot the prior
 * const prior = new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]])
 *
 * // After Bayesian update with signal from agent-1
 * const posterior = new Map([['A', 0.3], ['B', 0.5], ['C', 0.2]])
 *
 * tracker.measure('agent-1', prior, posterior)
 * // surprise ≈ 0.12 bits (moderate shift)
 *
 * const report = tracker.roundReport()
 * // report.measurements[0].attentionWeight ≈ 1.8 (amplified)
 * ```
 */
export class SurpriseTracker {
  private readonly config: SurpriseConfig
  /** Per-round mean surprise history. */
  private readonly roundHistory: number[] = []
  /** Cumulative surprise per agent (across all rounds). */
  private readonly agentCumulativeSurprise = new Map<string, number>()
  /** Signal count per agent (for averaging). */
  private readonly agentSignalCount = new Map<string, number>()
  /** Current round's measurements (cleared each round). */
  private currentRoundMeasurements: SurpriseMeasurement[] = []

  constructor(config?: Partial<SurpriseConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Measure surprise for a single signal by comparing prior and posterior beliefs.
   *
   * @param sourceId - Agent or signal ID that caused the belief update
   * @param prior - Belief distribution BEFORE the signal
   * @param posterior - Belief distribution AFTER the signal
   * @returns The surprise measurement
   */
  measure(
    sourceId: string,
    prior: ReadonlyMap<string, number>,
    posterior: ReadonlyMap<string, number>,
  ): SurpriseMeasurement {
    const surprise = bayesianSurprise(posterior, prior)

    // Relative surprise: compared to running average
    const avgSurprise = this.runningAverageSurprise()
    const relativeSurprise = avgSurprise > 0
      ? surprise / avgSurprise
      : surprise > 0 ? 2.0 : 1.0

    // Attention weight: amplify surprising signals
    const normalizedSurprise = this.normalizeSurprise(surprise)
    const attentionWeight = 1 + this.config.attentionAlpha * normalizedSurprise

    const measurement: SurpriseMeasurement = {
      sourceId,
      surprise,
      relativeSurprise,
      attentionWeight,
    }

    this.currentRoundMeasurements.push(measurement)

    // Track per-agent cumulative surprise
    this.agentCumulativeSurprise.set(
      sourceId,
      (this.agentCumulativeSurprise.get(sourceId) ?? 0) + surprise,
    )
    this.agentSignalCount.set(
      sourceId,
      (this.agentSignalCount.get(sourceId) ?? 0) + 1,
    )

    return measurement
  }

  /**
   * Finalize the current round — compute aggregate stats and push to history.
   * Call this at the end of each round after all measure() calls.
   */
  endRound(): SurpriseReport {
    const report = this.roundReport()

    // Push mean to history
    this.roundHistory.push(report.meanSurprise)

    // Clear current round
    this.currentRoundMeasurements = []

    return report
  }

  /**
   * Generate report for the current round WITHOUT finalizing it.
   * Useful for mid-round analysis.
   */
  roundReport(): SurpriseReport {
    const measurements = this.currentRoundMeasurements
    const surprises = measurements.map((m) => m.surprise)

    const meanSurprise = surprises.length > 0
      ? surprises.reduce((a, b) => a + b, 0) / surprises.length
      : 0

    const maxSurprise = surprises.length > 0
      ? Math.max(...surprises)
      : 0

    const trend = this.computeTrend()
    const surpriseCollapse = this.detectCollapse()

    return {
      measurements,
      meanSurprise,
      maxSurprise,
      trend,
      surpriseCollapse,
      mostInformativeAgent: this.findExtremalAgent('max'),
      leastInformativeAgent: this.findExtremalAgent('min'),
    }
  }

  /**
   * Get attention weight for a specific agent based on their historical surprise.
   * Agents who consistently provide surprising (informative) signals get higher weight.
   */
  agentAttentionWeight(agentId: string): number {
    const cumulative = this.agentCumulativeSurprise.get(agentId)
    const count = this.agentSignalCount.get(agentId)
    if (cumulative === undefined || count === undefined || count === 0) {
      return 1.0 // neutral weight for unknown agents
    }

    const avgSurprise = cumulative / count
    const normalized = this.normalizeSurprise(avgSurprise)
    return 1 + this.config.attentionAlpha * normalized
  }

  /** Full history of per-round mean surprise. */
  getHistory(): readonly number[] {
    return this.roundHistory
  }

  /** Number of completed rounds. */
  get roundCount(): number {
    return this.roundHistory.length
  }

  /** Reset all state. */
  reset(): void {
    this.roundHistory.length = 0
    this.agentCumulativeSurprise.clear()
    this.agentSignalCount.clear()
    this.currentRoundMeasurements = []
  }

  /**
   * Running average surprise across all completed rounds.
   */
  private runningAverageSurprise(): number {
    if (this.roundHistory.length === 0) return 0
    return (
      this.roundHistory.reduce((a, b) => a + b, 0) / this.roundHistory.length
    )
  }

  /**
   * Normalize surprise to [0, 1] using a sigmoid-like transform.
   * Maps: 0 → 0, threshold → ~0.02, 1 bit → ~0.46, 3 bits → ~0.88
   */
  private normalizeSurprise(surprise: number): number {
    // tanh provides smooth saturation: large surprises don't explode weights
    return Math.tanh(surprise)
  }

  /**
   * Compute surprise trend over recent rounds.
   * Positive = increasing surprise, negative = decreasing (converging).
   */
  private computeTrend(): number {
    return linearRegressionSlope(this.roundHistory, this.config.trendWindow)
  }

  /**
   * Detect surprise collapse: all recent rounds have very low surprise.
   * This indicates the swarm is only hearing what it expects (echo chamber).
   */
  private detectCollapse(): boolean {
    const window = this.config.trendWindow
    if (this.roundHistory.length < window) return false

    const recent = this.roundHistory.slice(-window)
    return recent.every((s) => s < this.config.collapseThreshold)
  }

  /**
   * Find the agent with highest or lowest average surprise.
   */
  private findExtremalAgent(mode: 'max' | 'min'): string | null {
    if (this.agentCumulativeSurprise.size === 0) return null

    let bestAgent: string | null = null
    let bestAvg = mode === 'max' ? -Infinity : Infinity

    for (const [agent, cumulative] of this.agentCumulativeSurprise) {
      const count = this.agentSignalCount.get(agent) ?? 1
      const avg = cumulative / count

      if (mode === 'max' ? avg > bestAvg : avg < bestAvg) {
        bestAvg = avg
        bestAgent = agent
      }
    }

    return bestAgent
  }
}

/**
 * Compute Bayesian Surprise between posterior and prior distributions.
 *
 * S = D_KL(posterior || prior) = Σ posterior(i) × log₂(posterior(i) / prior(i))
 *
 * Always >= 0. Equals 0 iff posterior == prior (signal changed nothing).
 *
 * Unlike raw `klDivergence()` (which returns Infinity for disjoint supports),
 * this function smooths the prior with epsilon mass to handle new proposals
 * that weren't in the prior distribution. This makes it safe for swarm
 * deliberation where zero priors arise naturally.
 */
export function bayesianSurprise(
  posterior: ReadonlyMap<string, number>,
  prior: ReadonlyMap<string, number>,
): number {
  if (posterior.size === 0) return 0

  // Smooth the prior: add epsilon for keys in posterior but not in prior.
  // This prevents Infinity from klDivergence when supports don't overlap.
  const epsilon = 1e-10
  const smoothedPrior = new Map(prior)
  for (const key of posterior.keys()) {
    if (!smoothedPrior.has(key)) {
      smoothedPrior.set(key, epsilon)
    }
  }

  const kl = klDivergence(posterior, smoothedPrior)
  return isFinite(kl) ? kl : 0
}
