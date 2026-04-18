// Lyapunov Stability Analyzer — formal stability analysis of swarm consensus.
//
// Answers: "is the consensus STABLE?" (not just "was consensus reached?")
//
// Lyapunov function V(t) = Σᵢ (beliefᵢ - consensus)²
//   V̇ < 0 consistently → asymptotically stable (will persist under perturbation)
//   V̇ ≈ 0              → marginally stable (fragile, any challenger breaks it)
//   V̇ > 0              → unstable (consensus is dissolving)
//
// Outputs:
//   - adjustedConfidence: confidence corrected for stability
//   - perturbationTolerance: max perturbation the consensus can absorb
//   - stabilityType: asymptotic | marginal | unstable

/** Stability classification. */
export type StabilityType = 'asymptotic' | 'marginal' | 'unstable'

/** Routh-Hurwitz algebraic stability test result. */
export interface RouthHurwitzResult {
  /** Characteristic polynomial coefficients [aₙ, aₙ₋₁, ..., a₀]. */
  readonly coefficients: readonly number[]
  /** First column of Routh array (sign changes = unstable roots). */
  readonly routhColumn: readonly number[]
  /** Number of sign changes in first column = number of RHP roots. */
  readonly signChanges: number
  /** Whether all roots have negative real parts (stable). */
  readonly stable: boolean
}

/** Full Lyapunov stability report. */
export interface LyapunovReport {
  /** Current Lyapunov function value V = Σ(beliefᵢ - consensus)². */
  readonly lyapunovV: number
  /** Time derivative estimate V̇ ≈ ΔV/Δt. Negative = converging. */
  readonly lyapunovDot: number
  /** Whether V̇ < 0 consistently. */
  readonly stable: boolean
  /** Stability classification. */
  readonly type: StabilityType
  /** Max perturbation magnitude the consensus can absorb (energy-based). */
  readonly perturbationTolerance: number
  /** Confidence adjusted for stability. Fragile consensus → lower confidence. */
  readonly adjustedConfidence: number
  /** Rate of convergence (exponential decay rate of V). Negative = converging. */
  readonly convergenceRate: number
  /** V history across rounds. */
  readonly history: readonly number[]
  /** Routh-Hurwitz algebraic stability test (null if insufficient data). */
  readonly routhHurwitz: RouthHurwitzResult | null
}

/** Configuration for Lyapunov stability analyzer. */
export interface LyapunovConfig {
  /** Number of rounds of negative V̇ required for asymptotic classification. Default: 2. */
  readonly stableWindowSize?: number
  /** V̇ below this is considered "effectively zero" for marginal classification. Default: 0.001. */
  readonly marginalThreshold?: number
}

/**
 * Analyzes Lyapunov stability of swarm consensus.
 *
 * Treats consensus as an equilibrium point and agent beliefs as state variables.
 * The Lyapunov function V = Σ(beliefᵢ - consensus)² is a natural energy measure:
 * - When agents converge toward consensus, V decreases (stable)
 * - When agents diverge, V increases (unstable)
 *
 * Usage:
 * ```ts
 * const lyapunov = new LyapunovStability()
 *
 * // Round 3: agents have beliefs, consensus is forming
 * lyapunov.observe(
 *   new Map([['a1', 0.9], ['a2', 0.7], ['a3', 0.8]]),
 *   0.8  // consensus value
 * )
 *
 * // Round 4: agents converge
 * lyapunov.observe(
 *   new Map([['a1', 0.85], ['a2', 0.75], ['a3', 0.8]]),
 *   0.8
 * )
 *
 * const report = lyapunov.report(0.82)
 * // report.type = 'asymptotic'
 * // report.adjustedConfidence = 0.90 (boosted: consensus is solid)
 * ```
 */
export class LyapunovStability {
  private readonly vHistory: number[] = []
  private readonly vDotHistory: number[] = []
  private readonly stableWindowSize: number
  private readonly marginalThreshold: number

  constructor(config?: LyapunovConfig) {
    this.stableWindowSize = config?.stableWindowSize ?? 2
    this.marginalThreshold = config?.marginalThreshold ?? 0.001
  }

  /**
   * Observe a round of agent beliefs.
   *
   * @param agentBeliefs - Map of agentId → belief strength (confidence in leading proposal)
   * @param consensusValue - Current consensus confidence/probability of leading proposal
   */
  observe(
    agentBeliefs: ReadonlyMap<string, number>,
    consensusValue: number,
  ): void {
    // V(t) = Σᵢ (beliefᵢ - consensus)²
    let v = 0
    for (const belief of agentBeliefs.values()) {
      const diff = belief - consensusValue
      v += diff * diff
    }

    // Normalize by agent count to make V comparable across different swarm sizes
    if (agentBeliefs.size > 0) {
      v /= agentBeliefs.size
    }

    this.vHistory.push(v)

    // V̇ ≈ ΔV/Δt = V(t) - V(t-1)
    if (this.vHistory.length >= 2) {
      const vDot = v - this.vHistory[this.vHistory.length - 2]!
      this.vDotHistory.push(vDot)
    }
  }

  /**
   * Generate the full stability report.
   *
   * @param rawConfidence - The swarm's raw confidence score (to be adjusted)
   */
  report(rawConfidence = 0.5): LyapunovReport {
    if (this.vHistory.length === 0) {
      return {
        lyapunovV: 0,
        lyapunovDot: 0,
        stable: false,
        type: 'marginal',
        perturbationTolerance: 0,
        adjustedConfidence: rawConfidence,
        convergenceRate: 0,
        history: [],
        routhHurwitz: null,
      }
    }

    const v = this.vHistory[this.vHistory.length - 1]!
    const vDot = this.vDotHistory.length > 0
      ? this.vDotHistory[this.vDotHistory.length - 1]!
      : 0

    const type = this.classifyStability()
    const convergenceRate = this.estimateConvergenceRate()
    const perturbationTolerance = this.estimatePerturbationTolerance(v, type)
    const adjustedConfidence = this.adjustConfidence(rawConfidence, type, v, convergenceRate)

    const routhHurwitz = this.vHistory.length >= 4
      ? this.routhHurwitzTest()
      : null

    return {
      lyapunovV: v,
      lyapunovDot: vDot,
      stable: type === 'asymptotic',
      type,
      perturbationTolerance,
      adjustedConfidence,
      convergenceRate,
      history: [...this.vHistory],
      routhHurwitz,
    }
  }

  get roundCount(): number {
    return this.vHistory.length
  }

  reset(): void {
    this.vHistory.length = 0
    this.vDotHistory.length = 0
  }

  // ── Routh-Hurwitz Criterion ────────────────────────────────────
  // Fits a characteristic polynomial to the V(t) time series:
  //   p(s) = s³ + a₂s² + a₁s + a₀
  // where coefficients come from finite differences of V.
  // All roots having negative real parts ↔ no sign changes in
  // the first column of the Routh array.

  private routhHurwitzTest(): RouthHurwitzResult | null {
    if (this.vHistory.length < 4) return null

    // Compute finite differences of V to get polynomial coefficients
    // ΔV, Δ²V, Δ³V approximate the dynamics
    const n = this.vHistory.length
    const recent = this.vHistory.slice(Math.max(0, n - 6))

    // First differences (velocity)
    const dv: number[] = []
    for (let i = 1; i < recent.length; i++) {
      dv.push(recent[i]! - recent[i - 1]!)
    }

    // Second differences (acceleration)
    const d2v: number[] = []
    for (let i = 1; i < dv.length; i++) {
      d2v.push(dv[i]! - dv[i - 1]!)
    }

    // Third differences (jerk)
    const d3v: number[] = []
    for (let i = 1; i < d2v.length; i++) {
      d3v.push(d2v[i]! - d2v[i - 1]!)
    }

    // Characteristic polynomial: s³ + a₂s² + a₁s + a₀
    // Map finite differences to coefficients
    const a2 = dv.length > 0 ? -dv.reduce((a, b) => a + b, 0) / dv.length : 0
    const a1 = d2v.length > 0 ? d2v.reduce((a, b) => a + b, 0) / d2v.length : 0
    const a0 = d3v.length > 0 ? -d3v.reduce((a, b) => a + b, 0) / d3v.length : 0

    const coefficients = [1, a2, a1, a0]

    // Build Routh array first column
    // Row 0: [1, a1]
    // Row 1: [a2, a0]
    // Row 2: [(a2*a1 - 1*a0)/a2, 0]
    // Row 3: [a0, 0]
    const routhColumn: number[] = []

    if (Math.abs(a2) < 1e-15) {
      // Degenerate case
      routhColumn.push(1, a2, a1, a0)
      return { coefficients, routhColumn, signChanges: 0, stable: false }
    }

    routhColumn.push(1) // s³ row
    routhColumn.push(a2) // s² row
    const b1 = (a2 * a1 - a0) / a2 // s¹ row
    routhColumn.push(b1)
    routhColumn.push(a0) // s⁰ row

    // Count sign changes
    let signChanges = 0
    for (let i = 1; i < routhColumn.length; i++) {
      if (routhColumn[i - 1]! * routhColumn[i]! < 0) signChanges++
    }

    return {
      coefficients,
      routhColumn,
      signChanges,
      stable: signChanges === 0 && routhColumn.every(v => v > -1e-10),
    }
  }

  // ── Stability Classification ──────────────────────────────────

  private classifyStability(): StabilityType {
    if (this.vDotHistory.length < this.stableWindowSize) return 'marginal'

    // Check last `stableWindowSize` values of V̇
    const recent = this.vDotHistory.slice(-this.stableWindowSize)

    const allNegative = recent.every(d => d < -this.marginalThreshold)
    if (allNegative) return 'asymptotic'

    const anyPositive = recent.some(d => d > this.marginalThreshold)
    if (anyPositive) return 'unstable'

    return 'marginal'
  }

  // ── Convergence Rate ──────────────────────────────────────────
  // Estimate exponential decay rate: V(t) ≈ V₀·e^(λt)
  // λ < 0 means exponential convergence

  private estimateConvergenceRate(): number {
    if (this.vHistory.length < 3) return 0

    const recent = this.vHistory.slice(-4)
    let sumRatio = 0
    let count = 0

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1]!
      const curr = recent[i]!
      if (prev > 1e-10 && curr > 1e-10) {
        sumRatio += Math.log(curr / prev)
        count++
      }
    }

    return count > 0 ? sumRatio / count : 0
  }

  // ── Perturbation Tolerance ────────────────────────────────────
  // Based on current V and stability type.
  // For asymptotically stable systems: tolerance ∝ rate of V decay.
  // For marginal: very low. For unstable: zero.

  private estimatePerturbationTolerance(v: number, type: StabilityType): number {
    if (type === 'unstable') return 0
    if (type === 'marginal') return Math.max(0, 0.05 - v)

    // Asymptotic: tolerance is proportional to how quickly V is decreasing.
    // If V is already small and decreasing fast, high tolerance.
    if (this.vDotHistory.length === 0) return 0.1

    const recentDots = this.vDotHistory.slice(-3)
    const avgDot = recentDots.reduce((a, b) => a + b, 0) / recentDots.length
    const decayStrength = Math.min(1, Math.abs(avgDot) * 10)

    // Base tolerance from low V + strong decay
    const vFactor = Math.max(0, 1 - v * 5)
    return Math.min(1, vFactor * 0.5 + decayStrength * 0.5)
  }

  // ── Confidence Adjustment ─────────────────────────────────────
  // Modulate raw confidence based on stability:
  //   asymptotic + low V → boost confidence (consensus is solid)
  //   marginal → keep as-is
  //   unstable → penalize (don't trust this consensus)

  private adjustConfidence(
    raw: number,
    type: StabilityType,
    v: number,
    convergenceRate: number,
  ): number {
    let multiplier = 1.0

    switch (type) {
      case 'asymptotic': {
        // Boost: up to 15% for low V and fast convergence
        const vBonus = Math.max(0, 0.1 * (1 - v * 5))
        const rateBonus = Math.max(0, 0.05 * Math.min(1, Math.abs(convergenceRate) * 5))
        multiplier = 1.0 + vBonus + rateBonus
        break
      }
      case 'marginal':
        // Slight penalty for marginal stability
        multiplier = 0.95
        break
      case 'unstable':
        // Significant penalty — this consensus might not hold
        multiplier = 0.7 + 0.2 * Math.max(0, 1 - v * 3)
        break
    }

    return Math.min(1, Math.max(0, raw * multiplier))
  }
}
