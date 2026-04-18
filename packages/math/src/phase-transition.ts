// Phase Transition Detector: Self-Organized Criticality for Swarm Intelligence
//
// At the critical point between order and disorder, collective systems exhibit:
//   - Maximum susceptibility χ (peak responsiveness to perturbation)
//   - Maximum information transmission (correlation length → ∞)
//   - Power-law distributed fluctuations (scale-free dynamics)
//   - Emergent collective intelligence
//
// Order parameter: m = MAP probability (consensus strength)
//   m → 1/K (uniform): disordered — no consensus, chaos
//   m → 1 (certain): ordered — full consensus, potential groupthink
//   critical: intermediate m, peak susceptibility
//
// Susceptibility: χ = Var(m) × N
//   Analogous to magnetic susceptibility in the Ising model.
//   Peaks at the phase transition. Low in both ordered/disordered phases.
//
// The swarm should self-tune to stay near criticality:
//   Too ordered → inject diversity (challenges, activate outlier agents)
//   Too disordered → focus signals (amplify leaders, narrow agent selection)
//   At criticality → maintain current dynamics (emergence is happening)
//
// Used for:
// - Detecting the optimal operating point for emergence
// - Controlling exploration/exploitation balance dynamically
// - Feedback signal for agent activation and signal injection

import { linearRegressionSlope } from './internal/linear-regression.js'

/** The phase of the swarm's collective dynamics. */
export type SwarmPhase = 'ordered' | 'critical' | 'disordered'

/** Current phase state of the swarm. */
export interface PhaseState {
  /** Current phase classification. */
  readonly phase: SwarmPhase
  /** Order parameter: consensus strength ∈ [1/K, 1]. */
  readonly orderParameter: number
  /** Susceptibility: χ = windowed variance of m × N. Peaks at criticality. */
  readonly susceptibility: number
  /** Criticality score ∈ [0, 1]: how close to the critical point. 1 = at criticality. */
  readonly criticalityScore: number
  /** Whether surprise distribution shows power-law signature (scale-free). */
  readonly scaleFreeSignature: boolean
  /** Susceptibility trend: positive = approaching criticality, negative = moving away. */
  readonly trend: number
}

/** Control recommendation to maintain or reach criticality. */
export interface PhaseControl {
  /** Recommended action. */
  readonly action: 'maintain' | 'increase-exploration' | 'decrease-exploration' | 'inject-challenge'
  /** How strongly to act ∈ [0, 1]. 0 = gentle nudge, 1 = strong intervention. */
  readonly intensity: number
  /** Why this action was recommended. */
  readonly rationale: string
  /** Suggested exploration multiplier for agent selection breadth. */
  readonly explorationMultiplier: number
}

/** Full phase transition report. */
export interface PhaseReport {
  /** Current phase state. */
  readonly state: PhaseState
  /** Control recommendation. */
  readonly control: PhaseControl
  /** History of order parameter values. */
  readonly orderHistory: readonly number[]
  /** History of susceptibility values. */
  readonly susceptibilityHistory: readonly number[]
  /** Peak susceptibility observed (estimate of critical point). */
  readonly peakSusceptibility: number
  /** Order parameter at peak susceptibility (estimated critical m). */
  readonly criticalOrderParameter: number
}

/** Configuration for the phase transition detector. */
export interface PhaseTransitionConfig {
  /** Window size for susceptibility (variance) computation. Default: 5. */
  readonly windowSize: number
  /** Order parameter threshold above which phase is 'ordered'. Default: 0.8. */
  readonly orderedThreshold: number
  /** Order parameter threshold below which phase is 'disordered'. Default: 0.35. */
  readonly disorderedThreshold: number
  /** Minimum rounds before phase detection is meaningful. Default: 3. */
  readonly warmupRounds: number
}

const DEFAULT_CONFIG: PhaseTransitionConfig = {
  windowSize: 5,
  orderedThreshold: 0.8,
  disorderedThreshold: 0.35,
  warmupRounds: 3,
}

/**
 * Detects phase transitions in swarm dynamics and recommends
 * control actions to maintain operation near the critical point.
 *
 * The critical point is where emergence happens — the swarm is
 * maximally responsive, information flows freely, and collective
 * intelligence peaks. Too far in either direction degrades performance:
 *
 *   DISORDERED ←── CRITICAL ──→ ORDERED
 *   (chaos)     (emergence)    (groupthink)
 *
 * Usage:
 * ```ts
 * const detector = new PhaseTransitionDetector()
 *
 * // Each round, feed the order parameter and per-signal surprises
 * detector.observeRound(0.45, [0.3, 0.1, 0.8, 0.02, 1.5])
 *
 * const state = detector.detect()
 * // state.phase = 'critical'
 * // state.criticalityScore = 0.85
 *
 * const control = detector.recommend()
 * // control.action = 'maintain'
 * // control.explorationMultiplier = 1.0
 * ```
 */
export class PhaseTransitionDetector {
  private readonly config: PhaseTransitionConfig
  private readonly orderHistory: number[] = []
  private readonly susceptibilityHistory: number[] = []
  private readonly surpriseBuffer: number[] = []
  private peakSusceptibility = 0
  private criticalOrderParam = 0.5

  constructor(config?: Partial<PhaseTransitionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Observe a round's order parameter and surprise values.
   *
   * @param orderParameter - Consensus strength ∈ [0, 1]. Typically MAP probability.
   * @param roundSurprises - Per-signal surprise values from this round (bits).
   */
  observeRound(orderParameter: number, roundSurprises: readonly number[]): void {
    this.orderHistory.push(orderParameter)
    this.surpriseBuffer.push(...roundSurprises)

    // Compute susceptibility for this round
    const chi = this.computeSusceptibility()
    this.susceptibilityHistory.push(chi)

    // Track peak susceptibility as estimate of critical point
    if (chi > this.peakSusceptibility) {
      this.peakSusceptibility = chi
      this.criticalOrderParam = orderParameter
    }
  }

  /** Detect current phase state. */
  detect(): PhaseState {
    if (this.orderHistory.length < this.config.warmupRounds) {
      return {
        phase: 'disordered',
        orderParameter: this.orderHistory[this.orderHistory.length - 1] ?? 0,
        susceptibility: 0,
        criticalityScore: 0,
        scaleFreeSignature: false,
        trend: 0,
      }
    }

    const m = this.orderHistory[this.orderHistory.length - 1]!
    const chi = this.susceptibilityHistory[this.susceptibilityHistory.length - 1]!
    const phase = this.classifyPhase(m, chi)
    const criticalityScore = this.computeCriticalityScore(chi)
    const scaleFreeSignature = this.testScaleFree()
    const trend = linearRegressionSlope(this.susceptibilityHistory, this.config.windowSize)

    return {
      phase,
      orderParameter: m,
      susceptibility: chi,
      criticalityScore,
      scaleFreeSignature,
      trend,
    }
  }

  /** Recommend control action to maintain or reach criticality. */
  recommend(): PhaseControl {
    const state = this.detect()

    if (state.phase === 'ordered') {
      // Too much consensus — risk of groupthink. Inject diversity.
      const intensity = Math.min(1, (state.orderParameter - this.config.orderedThreshold) * 3)
      return {
        action: intensity > 0.5 ? 'inject-challenge' : 'increase-exploration',
        intensity,
        rationale: `Order parameter ${state.orderParameter.toFixed(2)} exceeds threshold — consensus too strong. Inject diversity to approach criticality.`,
        // Broaden agent selection: activate more agents
        explorationMultiplier: 1 + intensity,
      }
    }

    if (state.phase === 'disordered') {
      // Too much chaos — no convergence. Focus signals.
      const intensity = Math.min(1, (this.config.disorderedThreshold - state.orderParameter) * 3)
      return {
        action: 'decrease-exploration',
        intensity,
        rationale: `Order parameter ${state.orderParameter.toFixed(2)} below threshold — too much disorder. Focus on leading proposals.`,
        // Narrow agent selection: only top agents
        explorationMultiplier: Math.max(0.3, 1 - intensity * 0.7),
      }
    }

    // Critical — maintain current dynamics
    return {
      action: 'maintain',
      intensity: 0,
      rationale: `At criticality (χ=${state.susceptibility.toFixed(3)}, m=${state.orderParameter.toFixed(2)}). Emergence conditions optimal.`,
      explorationMultiplier: 1.0,
    }
  }

  /** Full report. */
  report(): PhaseReport {
    return {
      state: this.detect(),
      control: this.recommend(),
      orderHistory: [...this.orderHistory],
      susceptibilityHistory: [...this.susceptibilityHistory],
      peakSusceptibility: this.peakSusceptibility,
      criticalOrderParameter: this.criticalOrderParam,
    }
  }

  /** Number of rounds observed. */
  get roundCount(): number {
    return this.orderHistory.length
  }

  /** Reset all state. */
  reset(): void {
    this.orderHistory.length = 0
    this.susceptibilityHistory.length = 0
    this.surpriseBuffer.length = 0
    this.peakSusceptibility = 0
    this.criticalOrderParam = 0.5
  }

  // ── Private ──

  /**
   * Compute susceptibility χ = Var(m) × N over sliding window.
   *
   * In statistical physics: χ = N × Var(m) = N × (<m²> - <m>²)
   * High χ = system is highly responsive to perturbation (criticality).
   * Low χ = system is stable (ordered or disordered).
   */
  private computeSusceptibility(): number {
    const window = this.config.windowSize
    const n = this.orderHistory.length
    if (n < 2) return 0

    const start = Math.max(0, n - window)
    const slice = this.orderHistory.slice(start)
    const N = slice.length

    const mean = slice.reduce((a, b) => a + b, 0) / N
    const variance = slice.reduce((sum, m) => sum + (m - mean) ** 2, 0) / (N - 1)

    return variance * N
  }

  /**
   * Classify phase based on order parameter and susceptibility.
   */
  private classifyPhase(m: number, chi: number): SwarmPhase {
    // If susceptibility is near its peak, we're at criticality
    // regardless of the exact order parameter value
    if (this.peakSusceptibility > 0 && chi > this.peakSusceptibility * 0.7) {
      return 'critical'
    }

    if (m > this.config.orderedThreshold) return 'ordered'
    if (m < this.config.disorderedThreshold) return 'disordered'
    return 'critical'
  }

  /**
   * Compute criticality score ∈ [0, 1].
   * 1.0 = exactly at critical point, 0.0 = far from it.
   */
  private computeCriticalityScore(chi: number): number {
    if (this.peakSusceptibility <= 0) return 0
    // Ratio of current susceptibility to peak
    return Math.min(1, chi / this.peakSusceptibility)
  }

  /**
   * Test whether surprise distribution shows scale-free (power-law) signature.
   *
   * At criticality, fluctuations follow power laws: P(S > s) ~ s^(-α).
   * We test this via the coefficient of variation (CV):
   *   - Power-law: CV > 1 (heavy tail, few large events, many small)
   *   - Normal: CV ≈ 0.1-0.5 (light tail, similar sizes)
   *   - Exponential: CV = 1
   *
   * Additionally check skewness > 1 (right-skewed = heavy tail).
   * Both together are a practical proxy for power-law at swarm scale (n < 100).
   */
  private testScaleFree(): boolean {
    if (this.surpriseBuffer.length < 10) return false

    const values = this.surpriseBuffer
    const n = values.length
    const mean = values.reduce((a, b) => a + b, 0) / n
    if (mean <= 0) return false

    // Coefficient of variation
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n
    const std = Math.sqrt(variance)
    const cv = std / mean

    // Skewness — guard against zero std (all values identical)
    if (std <= 0) return false
    const skewness = values.reduce((sum, v) => sum + ((v - mean) / std) ** 3, 0) / n

    // Power-law signature: high CV AND positive skew
    return cv > 1.0 && skewness > 1.0
  }
}
