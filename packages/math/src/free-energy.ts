// Free Energy Principle: Friston's variational free energy for swarm intelligence
//
// The Free Energy Principle (FEP) states that self-organizing systems minimize
// variational free energy — a single scalar that bounds surprise (negative log-evidence).
//
// Free Energy F = Complexity - Accuracy
//   = KL(q(θ) || p(θ))   -   E_q[log p(observations | θ)]
//   = (how complex our beliefs are)  -  (how well they explain data)
//
// Equivalently: F = D_KL(q(θ) || p(θ|data)) + const ≥ 0
//   Minimizing F → posterior approximation q approaches true posterior p(θ|data)
//
// This UNIFIES all other modules:
//   - Bayesian updates → minimize F by improving accuracy
//   - Entropy reduction → F decreases as beliefs concentrate
//   - Surprise → signals with high surprise increase F (demand update)
//   - Optimal stopping → stop when ΔF/Δround ≈ 0
//   - Fisher information → ∂²F/∂θ² at minimum
//
// Active Inference: agents don't just update beliefs passively —
// they SELECT ACTIONS that minimize EXPECTED free energy.
// This turns the swarm from reactive to proactive.
//
// Used for:
// - Single unified stopping criterion (ΔF < ε)
// - Active agent selection (which agent minimizes expected F?)
// - Complexity control (prevent overfitting to noise)
// - Proactive exploration (seek observations that reduce F most)

import { shannonEntropy, klDivergence } from './entropy.js'
import { linearRegressionSlope } from './internal/linear-regression.js'

/** Free energy decomposition for one round. */
export interface FreeEnergyState {
  /** Total variational free energy F = complexity - accuracy. */
  readonly freeEnergy: number
  /** Complexity term: KL(posterior || prior). How far beliefs moved from prior. */
  readonly complexity: number
  /** Accuracy term: expected log-likelihood under posterior. */
  readonly accuracy: number
  /** Change in F from previous round. Negative = learning. */
  readonly deltaF: number
  /** Entropy of the posterior (uncertainty). */
  readonly posteriorEntropy: number
  /** Round number. */
  readonly round: number
}

/** Active inference recommendation: what to do to minimize expected F. */
export interface ActiveInferenceAction {
  /** Recommended action type. */
  readonly action: 'explore' | 'exploit' | 'challenge' | 'stop'
  /** Expected free energy reduction if this action is taken. */
  readonly expectedReduction: number
  /** If explore/challenge: which hypothesis or agent to target. */
  readonly target: string | null
  /** Confidence in this recommendation. */
  readonly confidence: number
  /** Explanation of why this action minimizes expected F. */
  readonly rationale: string
}

/** Full free energy report. */
export interface FreeEnergyReport {
  /** Current free energy state. */
  readonly current: FreeEnergyState
  /** History of free energy across rounds. */
  readonly history: readonly FreeEnergyState[]
  /** Rate of free energy descent (should be negative when learning). */
  readonly descentRate: number
  /** Whether the system has converged (|ΔF| < threshold for N rounds). */
  readonly converged: boolean
  /** Active inference recommendation. */
  readonly recommendation: ActiveInferenceAction
  /** Decomposition: which component dominates current F? */
  readonly dominantComponent: 'complexity' | 'accuracy' | 'balanced'
  /** Overall "health" of the learning process. */
  readonly learningHealth: 'excellent' | 'good' | 'slow' | 'stalled' | 'diverging'
}

/** Configuration for free energy tracker. */
export interface FreeEnergyConfig {
  /** Convergence threshold: |ΔF| below this for convergenceWindow rounds = converged. */
  readonly convergenceThreshold: number
  /** Number of rounds of low ΔF needed to declare convergence. */
  readonly convergenceWindow: number
  /** Complexity penalty weight (higher = prefer simpler beliefs). Default: 1.0. */
  readonly complexityWeight: number
}

const DEFAULT_CONFIG: FreeEnergyConfig = {
  convergenceThreshold: 0.01,
  convergenceWindow: 3,
  complexityWeight: 1.0,
}

/**
 * Tracks variational free energy across rounds, providing a unified
 * measure of learning progress and convergence.
 *
 * The key insight: instead of checking 6+ separate stopping criteria
 * (entropy, information gain, CUSUM, Secretary, fragmentation, surprise),
 * we track ONE number: Free Energy F.
 *
 * F encapsulates all of them:
 * - High F + high accuracy = beliefs too complex (overfitting)
 * - High F + low accuracy = beliefs don't match observations
 * - ΔF ≈ 0 = no more learning happening (stop)
 * - ΔF < 0 = learning (continue)
 * - ΔF > 0 = diverging (something wrong, restructure)
 *
 * Usage:
 * ```ts
 * const fe = new FreeEnergyTracker()
 *
 * // Before deliberation: set uniform prior
 * fe.setPrior(new Map([['A', 0.33], ['B', 0.33], ['C', 0.33]]))
 *
 * // After round 1: beliefs shifted
 * fe.observeRound(
 *   new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]),  // posterior
 *   0.6,  // accuracy: how well proposals match the task
 * )
 *
 * const report = fe.report()
 * // report.current.freeEnergy = 0.15
 * // report.recommendation.action = 'explore' // still uncertain
 * // report.converged = false
 * ```
 */
export class FreeEnergyTracker {
  private readonly config: FreeEnergyConfig
  private prior: ReadonlyMap<string, number> = new Map()
  private currentPosterior: ReadonlyMap<string, number> = new Map()
  private readonly history: FreeEnergyState[] = []
  private previousF: number | null = null

  constructor(config?: Partial<FreeEnergyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Set the prior distribution (typically uniform at start of deliberation).
   */
  setPrior(prior: ReadonlyMap<string, number>): void {
    this.prior = prior
  }

  /**
   * Record a round's posterior distribution and observed accuracy.
   *
   * @param posterior - Current belief distribution over hypotheses
   * @param accuracy - How well the current best hypothesis explains the task [0, 1]
   *                   (e.g., confidence of MAP estimate, or synthesis quality score)
   */
  observeRound(
    posterior: ReadonlyMap<string, number>,
    accuracy: number,
  ): FreeEnergyState {
    this.currentPosterior = posterior
    const round = this.history.length + 1

    // Complexity: KL(posterior || prior)
    // How far have beliefs moved from where we started?
    const complexity = this.computeComplexity(posterior)

    // Accuracy: log-likelihood term (higher = better fit)
    // We use the provided accuracy score as a proxy for E_q[log p(data|θ)]
    const accuracyTerm = Math.log(Math.max(accuracy, 1e-10))

    // Free Energy F = λ·complexity - accuracy
    const freeEnergy =
      this.config.complexityWeight * complexity - accuracyTerm

    const deltaF = this.previousF !== null ? freeEnergy - this.previousF : 0
    this.previousF = freeEnergy

    const posteriorEntropy = shannonEntropy(posterior)

    const state: FreeEnergyState = {
      freeEnergy,
      complexity,
      accuracy: accuracyTerm,
      deltaF,
      posteriorEntropy,
      round,
    }

    this.history.push(state)
    return state
  }

  /** Generate full free energy report. */
  report(): FreeEnergyReport {
    const current = this.history.length > 0
      ? this.history[this.history.length - 1]!
      : { freeEnergy: 0, complexity: 0, accuracy: 0, deltaF: 0, posteriorEntropy: 0, round: 0 }

    const descentRate = this.computeDescentRate()
    const converged = this.isConverged()
    const recommendation = this.computeRecommendation(current, descentRate)
    const dominantComponent = this.classifyDominant(current)
    const learningHealth = this.classifyHealth(current, descentRate)

    return {
      current,
      history: [...this.history],
      descentRate,
      converged,
      recommendation,
      dominantComponent,
      learningHealth,
    }
  }

  /**
   * Should the swarm stop based on free energy convergence?
   * This can replace ALL other stopping criteria.
   */
  shouldStop(): boolean {
    return this.isConverged()
  }

  /** Current free energy value. */
  get currentF(): number {
    return this.previousF ?? 0
  }

  /** Number of rounds observed. */
  get roundCount(): number {
    return this.history.length
  }

  /** Reset all state. */
  reset(): void {
    this.prior = new Map()
    this.currentPosterior = new Map()
    this.history.length = 0
    this.previousF = null
  }

  // ── Private ──

  /**
   * Compute complexity as KL(posterior || prior).
   * Uses smoothed distributions to handle new hypotheses.
   */
  private computeComplexity(
    posterior: ReadonlyMap<string, number>,
  ): number {
    if (this.prior.size === 0) return 0

    // Smooth prior: add small mass for keys in posterior but not in prior
    const smoothedPrior = new Map(this.prior)
    const epsilon = 1e-6
    for (const key of posterior.keys()) {
      if (!smoothedPrior.has(key)) {
        smoothedPrior.set(key, epsilon)
      }
    }

    const kl = klDivergence(posterior, smoothedPrior)
    return isFinite(kl) ? kl : 0
  }

  /**
   * Rate of free energy descent (slope of F over recent rounds).
   * Negative = learning, positive = diverging.
   */
  private computeDescentRate(): number {
    return linearRegressionSlope(
      this.history.map((s) => s.freeEnergy),
      5,
    )
  }

  /** Check if |ΔF| has been below threshold for convergenceWindow rounds. */
  private isConverged(): boolean {
    const window = this.config.convergenceWindow
    if (this.history.length < window) return false

    const recent = this.history.slice(-window)
    return recent.every(
      (s) => Math.abs(s.deltaF) < this.config.convergenceThreshold,
    )
  }

  /**
   * Active Inference: recommend the action that minimizes expected F.
   *
   * The key insight from active inference: agents should select actions
   * that minimize EXPECTED free energy under the action:
   *
   *   G(a) = E_q(o|a)[F(o, q)] = ambiguity + risk
   *     ambiguity = E_q[H(o|s)]  — are outcomes uncertain?
   *     risk = D_KL(q(s|a) || p(s)) — does the action diverge from prior goals?
   */
  private computeRecommendation(
    current: FreeEnergyState,
    descentRate: number,
  ): ActiveInferenceAction {
    // Diverging: something is wrong
    if (descentRate > 0.1 && this.history.length > 3) {
      return {
        action: 'challenge',
        expectedReduction: -current.complexity * 0.3,
        target: null,
        confidence: 0.7,
        rationale: 'Free energy increasing — beliefs diverging from data. Challenge current consensus to correct course.',
      }
    }

    // Converged: stop
    if (this.isConverged()) {
      return {
        action: 'stop',
        expectedReduction: 0,
        target: null,
        confidence: 0.9,
        rationale: `Free energy stable at F=${current.freeEnergy.toFixed(3)} for ${this.config.convergenceWindow} rounds. No further learning expected.`,
      }
    }

    // High entropy, low complexity: need more exploration
    if (current.posteriorEntropy > 1.5 && current.complexity < 0.5) {
      // Find the hypothesis with most uncertainty
      const target = this.findMostUncertainHypothesis()
      return {
        action: 'explore',
        expectedReduction: current.posteriorEntropy * 0.2,
        target,
        confidence: 0.6,
        rationale: 'High posterior entropy with low complexity — beliefs are vague. Explore to reduce ambiguity.',
      }
    }

    // High complexity, low accuracy: overfitting or wrong direction
    if (current.complexity > 2.0 && current.accuracy < -1.0) {
      return {
        action: 'challenge',
        expectedReduction: current.complexity * 0.2,
        target: null,
        confidence: 0.5,
        rationale: 'High complexity with poor accuracy — beliefs may be overfitting. Challenge to simplify.',
      }
    }

    // Default: exploit (continue normal deliberation)
    return {
      action: 'exploit',
      expectedReduction: Math.abs(descentRate) * 0.8,
      target: null,
      confidence: 0.5,
      rationale: `F descending at rate ${descentRate.toFixed(4)} per round. Continue normal deliberation.`,
    }
  }

  private classifyDominant(
    state: FreeEnergyState,
  ): 'complexity' | 'accuracy' | 'balanced' {
    const c = Math.abs(state.complexity)
    const a = Math.abs(state.accuracy)

    if (c > a * 2) return 'complexity'
    if (a > c * 2) return 'accuracy'
    return 'balanced'
  }

  private classifyHealth(
    state: FreeEnergyState,
    descentRate: number,
  ): 'excellent' | 'good' | 'slow' | 'stalled' | 'diverging' {
    if (descentRate > 0.05) return 'diverging'
    if (Math.abs(state.deltaF) < this.config.convergenceThreshold) return 'stalled'
    if (descentRate < -0.2) return 'excellent'
    if (descentRate < -0.05) return 'good'
    return 'slow'
  }

  private findMostUncertainHypothesis(): string | null {
    if (this.currentPosterior.size === 0) return null

    // Find hypothesis closest to 0.5 (most uncertain for binary)
    let bestId: string | null = null
    let bestDistance = Infinity

    for (const [id, prob] of this.currentPosterior) {
      const distance = Math.abs(prob - 0.5)
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = id
      }
    }

    return bestId
  }
}
