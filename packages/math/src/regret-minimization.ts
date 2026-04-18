// Regret Minimization: UCB1, Thompson Sampling, provable bounds
//
// The multi-armed bandit framework for strategy selection with guarantees.
// Unlike replicator dynamics (which finds equilibria heuristically),
// bandit algorithms provide provable regret bounds:
//
//   Regret(T) = Σ_{t=1}^{T} (μ* - μ_{a_t}) ≤ O(√(K·T·ln T))
//
// where μ* is the best strategy's reward and K is the number of strategies.
//
// UCB1: Upper Confidence Bound — optimistic exploration.
//   Select argmax_a [ μ̂_a + √(2·ln(t) / n_a) ]
//   The confidence bonus shrinks as we learn more about each arm.
//
// Thompson Sampling: Bayesian bandit — sample from posterior.
//   For each arm, sample θ ~ Beta(α, β) and select max θ.
//   Natural exploration-exploitation balance.
//
// Used for:
// - Strategy selection with provable optimality (upgrade replicator dynamics)
// - Agent activation decisions (which agents to wake up)
// - Exploration budget allocation (how many rounds to explore vs exploit)

/** A single arm (strategy) in the bandit. */
export interface BanditArm {
  /** Unique identifier for this strategy. */
  readonly id: string
  /** Number of times this arm has been pulled. */
  readonly pulls: number
  /** Total reward accumulated. */
  readonly totalReward: number
  /** Mean reward: totalReward / pulls. */
  readonly meanReward: number
  /** UCB1 upper confidence bound. */
  readonly ucbValue: number
  /** Thompson Sampling: Beta posterior α parameter (successes + 1). */
  readonly alpha: number
  /** Thompson Sampling: Beta posterior β parameter (failures + 1). */
  readonly beta: number
}

/** Result of arm selection. */
export interface ArmSelection {
  /** Selected arm ID. */
  readonly armId: string
  /** Selection method used. */
  readonly method: 'ucb1' | 'thompson' | 'exploration'
  /** Confidence in this selection (higher = more exploitation). */
  readonly confidence: number
  /** Current regret estimate. */
  readonly estimatedRegret: number
}

/** Report on bandit performance. */
export interface RegretReport {
  /** All arms with their statistics. */
  readonly arms: readonly BanditArm[]
  /** Total pulls across all arms. */
  readonly totalPulls: number
  /** Cumulative regret estimate. */
  readonly cumulativeRegret: number
  /** Theoretical regret bound: O(√(K·T·ln T)). */
  readonly theoreticalBound: number
  /** Regret efficiency: cumulativeRegret / theoreticalBound ∈ [0, 1+]. */
  readonly efficiency: number
  /** Best arm ID (highest mean reward). */
  readonly bestArm: string | null
  /** True if we're confident about the best arm (large gap in UCB bounds). */
  readonly converged: boolean
}

/**
 * Multi-armed bandit with UCB1 and Thompson Sampling.
 *
 * Provides provable regret bounds for strategy selection.
 * Use instead of (or alongside) replicator dynamics when you need
 * guarantees on exploration-exploitation balance.
 *
 * Usage:
 * ```ts
 * const bandit = new RegretMinimizer(['propose', 'challenge', 'support', 'analyze'])
 *
 * // Each round, select a strategy
 * const choice = bandit.selectArm('thompson')
 * // choice.armId = 'challenge' (sampled from posterior)
 *
 * // After observing outcome, update
 * bandit.update('challenge', 0.8) // reward in [0, 1]
 *
 * // Check performance
 * const report = bandit.report()
 * // report.cumulativeRegret = 2.1
 * // report.theoreticalBound = 8.3
 * // report.efficiency = 0.25 (very good — well below bound)
 * ```
 */
export class RegretMinimizer {
  private readonly arms: Map<string, MutableArm>
  private totalPulls = 0
  private cumulativeRegret = 0
  private bestObservedMean = 0

  constructor(armIds: readonly string[]) {
    if (armIds.length === 0) {
      throw new Error('RegretMinimizer requires at least one arm')
    }

    this.arms = new Map(
      armIds.map((id) => [
        id,
        {
          id,
          pulls: 0,
          totalReward: 0,
          alpha: 1, // Beta(1,1) = uniform prior
          beta: 1,
        },
      ]),
    )
  }

  /**
   * Select an arm using the specified method.
   *
   * @param method - 'ucb1' for deterministic optimistic exploration,
   *                 'thompson' for Bayesian sampling (recommended)
   */
  selectArm(method: 'ucb1' | 'thompson' = 'thompson'): ArmSelection {
    // Force exploration: pull each arm at least once
    for (const [id, arm] of this.arms) {
      if (arm.pulls === 0) {
        return {
          armId: id,
          method: 'exploration',
          confidence: 0,
          estimatedRegret: this.cumulativeRegret,
        }
      }
    }

    let selectedId: string
    let confidence: number

    if (method === 'ucb1') {
      const result = this.selectUCB1()
      selectedId = result.id
      confidence = result.confidence
    } else {
      const result = this.selectThompson()
      selectedId = result.id
      confidence = result.confidence
    }

    return {
      armId: selectedId,
      method,
      confidence,
      estimatedRegret: this.cumulativeRegret,
    }
  }

  /**
   * Update an arm with observed reward.
   *
   * @param armId - Which arm was pulled
   * @param reward - Observed reward in [0, 1]
   */
  update(armId: string, reward: number): void {
    const arm = this.arms.get(armId)
    if (arm === undefined) return

    const clampedReward = Math.max(0, Math.min(1, reward))

    arm.pulls++
    arm.totalReward += clampedReward
    this.totalPulls++

    // Update Beta posterior for Thompson Sampling
    // Treat reward as Bernoulli probability: α += reward, β += (1 - reward)
    arm.alpha += clampedReward
    arm.beta += 1 - clampedReward

    // Update best observed mean
    const mean = arm.totalReward / arm.pulls
    if (mean > this.bestObservedMean) {
      this.bestObservedMean = mean
    }

    // Update cumulative regret estimate
    this.cumulativeRegret += this.bestObservedMean - clampedReward
  }

  /** Get full performance report. */
  report(): RegretReport {
    const armList = this.getArms()
    const k = armList.length
    const t = Math.max(1, this.totalPulls)

    // Theoretical UCB1 regret bound: 8·K·ln(T)/Δ + (1+π²/3)·K
    // Simplified: O(√(K·T·ln T))
    const theoreticalBound = Math.sqrt(k * t * Math.log(t + 1))

    let bestArm: string | null = null
    let bestMean = -Infinity
    for (const arm of armList) {
      if (arm.meanReward > bestMean) {
        bestMean = arm.meanReward
        bestArm = arm.id
      }
    }

    // Convergence: best arm's lower bound > second-best's upper bound
    const sorted = [...armList].sort((a, b) => b.meanReward - a.meanReward)
    const converged =
      sorted.length >= 2 &&
      sorted[0]!.pulls >= 10 &&
      sorted[0]!.meanReward - sorted[1]!.meanReward >
        2 * Math.sqrt(Math.log(t) / sorted[0]!.pulls)

    return {
      arms: armList,
      totalPulls: this.totalPulls,
      cumulativeRegret: this.cumulativeRegret,
      theoreticalBound,
      efficiency:
        theoreticalBound > 0 ? this.cumulativeRegret / theoreticalBound : 0,
      bestArm,
      converged,
    }
  }

  /** Get all arms with computed statistics. */
  getArms(): readonly BanditArm[] {
    const t = Math.max(1, this.totalPulls)

    return [...this.arms.values()].map((arm) => {
      const mean = arm.pulls > 0 ? arm.totalReward / arm.pulls : 0
      const ucbBonus =
        arm.pulls > 0 ? Math.sqrt((2 * Math.log(t)) / arm.pulls) : Infinity

      return {
        id: arm.id,
        pulls: arm.pulls,
        totalReward: arm.totalReward,
        meanReward: mean,
        ucbValue: mean + ucbBonus,
        alpha: arm.alpha,
        beta: arm.beta,
      }
    })
  }

  /**
   * Add a new arm dynamically (e.g., new strategy discovered).
   * Starts with uniform prior.
   */
  addArm(id: string): void {
    if (this.arms.has(id)) return
    this.arms.set(id, {
      id,
      pulls: 0,
      totalReward: 0,
      alpha: 1,
      beta: 1,
    })
  }

  /** Number of arms. */
  get armCount(): number {
    return this.arms.size
  }

  /** Total rounds played. */
  get rounds(): number {
    return this.totalPulls
  }

  /** Reset all state. */
  reset(): void {
    for (const arm of this.arms.values()) {
      arm.pulls = 0
      arm.totalReward = 0
      arm.alpha = 1
      arm.beta = 1
    }
    this.totalPulls = 0
    this.cumulativeRegret = 0
    this.bestObservedMean = 0
  }

  // ── Private ──

  private selectUCB1(): { id: string; confidence: number } {
    const t = Math.max(1, this.totalPulls)
    let bestId = ''
    let bestUCB = -Infinity
    let bestMean = 0

    for (const arm of this.arms.values()) {
      const mean = arm.pulls > 0 ? arm.totalReward / arm.pulls : 0
      const bonus =
        arm.pulls > 0 ? Math.sqrt((2 * Math.log(t)) / arm.pulls) : Infinity
      const ucb = mean + bonus

      if (ucb > bestUCB) {
        bestUCB = ucb
        bestId = arm.id
        bestMean = mean
      }
    }

    // Confidence: ratio of mean to UCB (1.0 when exploration bonus is 0)
    const confidence = bestUCB > 0 ? bestMean / bestUCB : 0

    return { id: bestId, confidence: Math.max(0, Math.min(1, confidence)) }
  }

  private selectThompson(): { id: string; confidence: number } {
    let bestId = ''
    let bestSample = -Infinity
    const samples: number[] = []

    for (const arm of this.arms.values()) {
      // Sample from Beta(α, β) posterior
      const sample = sampleBeta(arm.alpha, arm.beta)
      samples.push(sample)

      if (sample > bestSample) {
        bestSample = sample
        bestId = arm.id
      }
    }

    // Confidence: gap between best and second-best sample
    samples.sort((a, b) => b - a)
    const gap =
      samples.length >= 2 ? samples[0]! - samples[1]! : samples[0]! ?? 0
    const confidence = Math.min(1, gap * 2) // scale gap to [0, 1]

    return { id: bestId, confidence }
  }
}

// ── Helpers ──

interface MutableArm {
  readonly id: string
  pulls: number
  totalReward: number
  alpha: number
  beta: number
}

/**
 * Sample from Beta(α, β) distribution using the Jöhnk algorithm.
 *
 * For α, β ≥ 1 (our case after at least one observation),
 * we use the ratio-of-uniforms method which is efficient.
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use the gamma method: Beta(α,β) = Gamma(α,1) / (Gamma(α,1) + Gamma(β,1))
  const x = sampleGamma(alpha)
  const y = sampleGamma(beta)
  return x / (x + y)
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia & Tsang's method.
 * Efficient for shape >= 1. For shape < 1, uses the boost.
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Gamma(α) = Gamma(α+1) × U^(1/α)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  }

  // Marsaglia & Tsang
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)

  for (;;) {
    let x: number
    let v: number

    do {
      x = standardNormal()
      v = 1 + c * x
    } while (v <= 0)

    v = v * v * v
    const u = Math.random()

    // Squeeze test
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/** Standard normal via Box-Muller transform. */
function standardNormal(): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) *
    Math.cos(2 * Math.PI * u2)
}
