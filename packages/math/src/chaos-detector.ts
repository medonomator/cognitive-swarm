// Chaos Detector — period analysis, Sharkovskii detection, Feigenbaum cascade.
//
// Extends basic Markov cycle detection with dynamical systems theory:
//   Period detection — exact cycle length from opinion history
//   Sharkovskii — period-3 implies cycles of ALL periods (Li-Yorke chaos)
//   Feigenbaum — period-doubling cascade (1→2→4→8→chaos), δ ≈ 4.669
//   Lyapunov exponent — positive = chaos, negative = stable orbit
//
// Key insight: chaos ≠ "stop everything". When multiple proposals oscillate,
// the right answer may be a SYNTHESIS of competing positions (trade-off),
// not forcing convergence on one.

/** Chaos risk level. */
export type ChaosRisk = 'none' | 'low' | 'moderate' | 'high' | 'critical'

/** Recommended action based on chaos analysis. */
export type ChaosRecommendation =
  | 'continue'       // no chaos detected, safe to continue
  | 'monitor'        // mild oscillation, watch closely
  | 'synthesize'     // competing positions are complementary — combine them
  | 'restructure'    // period-doubling cascade starting — change strategy
  | 'force-decision' // true chaos — pick best candidate and commit

/** Full chaos analysis report. */
export interface ChaosReport {
  /** Detected period of the dominant oscillation (0 = no cycle). */
  readonly period: number
  /** Whether Sharkovskii condition triggered (period-3 → all periods exist). */
  readonly sharkovskiiTriggered: boolean
  /** Whether period-doubling cascade detected. */
  readonly doublingDetected: boolean
  /** Period history for doubling detection. */
  readonly periodHistory: readonly number[]
  /** Approximate Feigenbaum ratio (converges to δ ≈ 4.669 at chaos onset). */
  readonly feigenbaumRatio: number | null
  /** Largest Lyapunov exponent estimate. Positive = chaos, negative = stable. */
  readonly lyapunovExponent: number
  /** Overall chaos risk assessment. */
  readonly chaosRisk: ChaosRisk
  /** Recommended action. */
  readonly recommendation: ChaosRecommendation
  /** Estimated rounds until full chaos (null if not approaching). */
  readonly estimatedRoundsToChaos: number | null
}

/**
 * Detects chaos in swarm opinion dynamics.
 *
 * Observes which proposal/stance dominates each round, builds
 * a discrete time series, and analyzes it for periodic behavior,
 * period-doubling cascades, and chaos onset.
 *
 * Usage:
 * ```ts
 * const detector = new ChaosDetector()
 *
 * // Each round: report which proposal is currently leading
 * detector.observeWinner('prop-A')  // round 1
 * detector.observeWinner('prop-B')  // round 2
 * detector.observeWinner('prop-A')  // round 3 — period-2 oscillation
 *
 * const report = detector.report()
 * // report.period = 2
 * // report.chaosRisk = 'low'
 * // report.recommendation = 'monitor'
 * ```
 */
export class ChaosDetector {
  private readonly history: string[] = []
  private readonly periodHistory: number[] = []
  private readonly confidenceHistory: number[] = []

  /**
   * Record the dominant proposal/stance for this round.
   *
   * @param winnerId - ID of the currently leading proposal
   * @param confidence - optional confidence of the lead (for Lyapunov)
   */
  observeWinner(winnerId: string, confidence?: number): void {
    this.history.push(winnerId)
    this.confidenceHistory.push(confidence ?? 0.5)

    // Detect period after enough data
    if (this.history.length >= 4) {
      const period = this.detectPeriod()
      if (period > 0) {
        const lastPeriod = this.periodHistory.length > 0
          ? this.periodHistory[this.periodHistory.length - 1]!
          : 0
        if (period !== lastPeriod) {
          this.periodHistory.push(period)
        }
      }
    }
  }

  /** Generate the full chaos analysis report. */
  report(): ChaosReport {
    if (this.history.length < 3) {
      return {
        period: 0,
        sharkovskiiTriggered: false,
        doublingDetected: false,
        periodHistory: [],
        feigenbaumRatio: null,
        lyapunovExponent: 0,
        chaosRisk: 'none',
        recommendation: 'continue',
        estimatedRoundsToChaos: null,
      }
    }

    const period = this.detectPeriod()
    const sharkovskii = this.checkSharkovskii()
    const doubling = this.checkPeriodDoubling()
    const feigenbaum = this.computeFeigenbaumRatio()
    const lyapunov = this.estimateLyapunovExponent()

    const chaosRisk = this.assessRisk(period, sharkovskii, doubling.detected, lyapunov)
    const recommendation = this.recommend(chaosRisk, period, sharkovskii)
    const roundsToChaos = this.estimateRoundsToChaos(doubling.detected, feigenbaum)

    return {
      period,
      sharkovskiiTriggered: sharkovskii,
      doublingDetected: doubling.detected,
      periodHistory: [...this.periodHistory],
      feigenbaumRatio: feigenbaum,
      lyapunovExponent: lyapunov,
      chaosRisk,
      recommendation,
      estimatedRoundsToChaos: roundsToChaos,
    }
  }

  get roundCount(): number {
    return this.history.length
  }

  reset(): void {
    this.history.length = 0
    this.periodHistory.length = 0
    this.confidenceHistory.length = 0
  }

  // ── Period Detection ──────────────────────────────────────────

  /**
   * Detect the period of the dominant oscillation.
   * Checks for repeating patterns of length 2, 3, 4, ... up to half the history.
   */
  private detectPeriod(): number {
    const h = this.history
    const n = h.length
    if (n < 4) return 0

    // Check candidate periods from smallest to largest
    const maxPeriod = Math.min(Math.floor(n / 2), 8)
    for (let p = 2; p <= maxPeriod; p++) {
      if (this.isPeriodic(p)) return p
    }
    return 0
  }

  /**
   * Check if the last `checkLength` entries exhibit period `p`.
   * Requires at least 2 full cycles to confirm.
   * Must have at least `p` distinct values in the cycle to avoid
   * false positives from constant sequences.
   */
  private isPeriodic(p: number): boolean {
    const h = this.history
    const n = h.length
    const checkLength = Math.min(n, p * 3) // need at least 2 full cycles

    if (checkLength < p * 2) return false

    // A period-p cycle must contain at least 2 distinct values
    const cycleWindow = h.slice(n - p)
    const distinct = new Set(cycleWindow)
    if (distinct.size < 2) return false

    let matches = 0
    let checks = 0
    for (let i = n - checkLength; i < n - p; i++) {
      checks++
      if (h[i] === h[i + p]) matches++
    }

    // Allow small tolerance for noise (>80% match)
    return checks > 0 && matches / checks > 0.8
  }

  // ── Sharkovskii's Theorem ─────────────────────────────────────
  // If a continuous map has a period-3 point, it has periodic points
  // of ALL periods. This is the strongest chaos indicator.

  private checkSharkovskii(): boolean {
    const period = this.detectPeriod()
    if (period === 3) return true

    // Also check if period-3 appeared in history
    return this.periodHistory.includes(3)
  }

  // ── Period-Doubling (Feigenbaum Cascade) ──────────────────────
  // 1 → 2 → 4 → 8 → 16 → ... → chaos
  // The ratio of successive doubling intervals converges to δ ≈ 4.669

  private checkPeriodDoubling(): { detected: boolean } {
    if (this.periodHistory.length < 2) return { detected: false }

    // Look for consecutive doublings: p, 2p, 4p, ...
    for (let i = 0; i < this.periodHistory.length - 1; i++) {
      const p1 = this.periodHistory[i]!
      const p2 = this.periodHistory[i + 1]!
      if (p2 === p1 * 2) return { detected: true }
    }

    return { detected: false }
  }

  private computeFeigenbaumRatio(): number | null {
    // Need at least 3 period values to compute a ratio
    if (this.periodHistory.length < 3) return null

    const periods = this.periodHistory
    const n = periods.length

    // Look for last 3 consecutive doublings
    for (let i = n - 3; i >= 0; i--) {
      const p1 = periods[i]!
      const p2 = periods[i + 1]!
      const p3 = periods[i + 2]!

      if (p2 === p1 * 2 && p3 === p2 * 2) {
        // Feigenbaum ratio = (p2 - p1) / (p3 - p2) → 1/δ
        // But for period values: δ ≈ (interval_n-1) / (interval_n)
        const interval1 = p2 - p1
        const interval2 = p3 - p2
        if (interval2 > 0) {
          return interval1 / interval2
        }
      }
    }

    return null
  }

  // ── Lyapunov Exponent ─────────────────────────────────────────
  // λ > 0: nearby trajectories diverge exponentially (chaos)
  // λ < 0: trajectories converge (stable orbit)
  // λ ≈ 0: marginally stable

  private estimateLyapunovExponent(): number {
    if (this.confidenceHistory.length < 4) return 0

    // Use confidence values as continuous proxy.
    // Estimate λ from average log|derivative| along trajectory.
    const h = this.confidenceHistory
    const n = h.length
    let sumLogDeriv = 0
    let count = 0

    for (let i = 1; i < n; i++) {
      const diff = Math.abs(h[i]! - h[i - 1]!)
      if (diff > 1e-10) {
        // Finite difference approximation of derivative
        sumLogDeriv += Math.log(diff)
        count++
      }
    }

    if (count === 0) return -1 // constant → very stable

    // Normalize by number of iterations
    return sumLogDeriv / count
  }

  // ── Risk Assessment ───────────────────────────────────────────

  private assessRisk(
    period: number,
    sharkovskii: boolean,
    doubling: boolean,
    lyapunov: number,
  ): ChaosRisk {
    if (sharkovskii) return 'critical'
    if (doubling && lyapunov > 0) return 'high'
    if (doubling) return 'moderate'
    if (period === 2 && lyapunov < 0) return 'low'
    if (period >= 2) return 'moderate'
    return 'none'
  }

  private recommend(
    risk: ChaosRisk,
    period: number,
    sharkovskii: boolean,
  ): ChaosRecommendation {
    switch (risk) {
      case 'none':
        return 'continue'
      case 'low':
        return 'monitor'
      case 'moderate':
        // Period-2 oscillation between proposals = competing perspectives
        // Better to synthesize than to force one
        return period === 2 ? 'synthesize' : 'monitor'
      case 'high':
        return 'restructure'
      case 'critical':
        // Sharkovskii: period-3 = all periods exist, true chaos.
        // But: if only 2-3 proposals are cycling, synthesis may work.
        return sharkovskii ? 'force-decision' : 'synthesize'
    }
  }

  private estimateRoundsToChaos(
    doubling: boolean,
    feigenbaum: number | null,
  ): number | null {
    if (!doubling) return null

    // Rough estimate: each doubling takes fewer rounds than the previous.
    // With Feigenbaum ratio δ ≈ 4.669, intervals shrink geometrically.
    // If we've seen 2→4, next doubling (4→8) comes in ~1/4.669 of the previous interval.
    if (feigenbaum !== null && feigenbaum > 1) {
      return Math.ceil(3 / feigenbaum)
    }

    // Default: ~3 rounds to next doubling without Feigenbaum data
    return 3
  }
}
