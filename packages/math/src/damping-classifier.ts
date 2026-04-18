// Damped Oscillation Classifier — characterizes convergence regime.
//
// From differential equations: second-order system y'' + 2ζωy' + ω²y = 0
//   ζ > 1:  overdamped  — converges too fast, may miss alternatives (groupthink risk)
//   ζ = 1:  critically damped — optimal convergence speed
//   ζ < 1:  underdamped — oscillates around equilibrium before settling
//
// Applied to swarm: fit damping model to entropy/opinion time series.
// Overdamped swarm = groupthink warning. Underdamped = expect more rounds.

/** Configuration for damping classification thresholds. */
export interface DampingConfig {
  /** ζ below this → underdamped. Default: 0.8. */
  readonly underdampedThreshold?: number
  /** ζ above this → overdamped. Default: 1.2. */
  readonly overdampedThreshold?: number
}

/** Damping regime classification. */
export type DampingRegime = 'overdamped' | 'critically-damped' | 'underdamped' | 'undetermined'

/** Full damping analysis report. */
export interface DampingReport {
  /** Damping ratio ζ. >1 = overdamped, =1 = critical, <1 = underdamped. */
  readonly dampingRatio: number
  /** Natural frequency ω (rate of convergence). */
  readonly naturalFrequency: number
  /** Classification. */
  readonly regime: DampingRegime
  /** Diagnostic message. */
  readonly diagnostic: string
  /** Number of zero-crossings (oscillation count). */
  readonly oscillationCount: number
  /** Estimated rounds to settle within 5% of equilibrium. */
  readonly settlingRounds: number | null
}

/**
 * Classifies the convergence regime of a swarm from time series data.
 *
 * Usage:
 * ```ts
 * const classifier = new DampingClassifier()
 *
 * // Feed entropy values each round
 * classifier.observe(0.9)  // high entropy, still exploring
 * classifier.observe(0.7)
 * classifier.observe(0.4)
 * classifier.observe(0.35)
 * classifier.observe(0.3)
 *
 * const report = classifier.report()
 * // report.regime = 'overdamped' — converged very fast
 * // report.diagnostic = 'Consensus reached too quickly...'
 * ```
 */
export class DampingClassifier {
  private readonly history: number[] = []
  private readonly underdampedThreshold: number
  private readonly overdampedThreshold: number

  constructor(config?: DampingConfig) {
    this.underdampedThreshold = config?.underdampedThreshold ?? 0.8
    this.overdampedThreshold = config?.overdampedThreshold ?? 1.2
  }

  /** Record a value (entropy, opinion variance, or any convergence metric). */
  observe(value: number): void {
    this.history.push(value)
  }

  /** Generate the damping analysis report. */
  report(): DampingReport {
    if (this.history.length < 4) {
      return {
        dampingRatio: 1,
        naturalFrequency: 0,
        regime: 'undetermined',
        diagnostic: 'Insufficient data (need at least 4 observations)',
        oscillationCount: 0,
        settlingRounds: null,
      }
    }

    // Estimate equilibrium as the last value (or mean of last 2)
    const n = this.history.length
    const equilibrium = (this.history[n - 1]! + this.history[n - 2]!) / 2

    // Compute deviations from equilibrium
    const deviations = this.history.map(v => v - equilibrium)

    // Count zero-crossings (sign changes in deviations)
    const oscillationCount = this.countZeroCrossings(deviations)

    // Estimate damping ratio from envelope decay and oscillation count
    const dampingRatio = this.estimateDampingRatio(deviations, oscillationCount)
    const naturalFrequency = this.estimateFrequency(deviations)

    const regime = this.classify(dampingRatio, oscillationCount)
    const diagnostic = this.diagnose(regime, dampingRatio, oscillationCount)
    const settlingRounds = this.estimateSettling(dampingRatio, naturalFrequency)

    return {
      dampingRatio,
      naturalFrequency,
      regime,
      diagnostic,
      oscillationCount,
      settlingRounds,
    }
  }

  get roundCount(): number {
    return this.history.length
  }

  reset(): void {
    this.history.length = 0
  }

  private countZeroCrossings(deviations: number[]): number {
    let crossings = 0
    for (let i = 1; i < deviations.length; i++) {
      if (deviations[i - 1]! * deviations[i]! < 0) crossings++
    }
    return crossings
  }

  /**
   * Estimate damping ratio ζ from the time series.
   *
   * For underdamped systems: ζ = -ln(A₂/A₁) / √(π² + ln²(A₂/A₁))
   *   where A₁, A₂ are successive peak amplitudes (logarithmic decrement).
   *
   * For overdamped: estimate from monotone decay rate.
   */
  private estimateDampingRatio(deviations: number[], oscillations: number): number {
    if (oscillations >= 2) {
      // Underdamped: use logarithmic decrement
      const peaks = this.findPeaks(deviations)
      if (peaks.length >= 2) {
        const a1 = Math.abs(peaks[0]!)
        const a2 = Math.abs(peaks[1]!)
        if (a1 > 1e-10 && a2 > 1e-10) {
          const delta = Math.log(a1 / a2) // logarithmic decrement
          return delta / Math.sqrt(4 * Math.PI * Math.PI + delta * delta)
        }
      }
      return 0.5 // default underdamped
    }

    if (oscillations === 1) {
      // Near-critical: one overshoot
      return 0.9
    }

    // No oscillations: overdamped or critically damped
    // Estimate from how quickly values approach equilibrium
    const totalRange = Math.abs(deviations[0]!)
    if (totalRange < 1e-10) return 1.0

    // Check if convergence is exponential (overdamped) or fast (critical)
    const halfwayIndex = this.findHalfDecayIndex(deviations, totalRange)
    const normalizedHalfway = halfwayIndex / deviations.length

    if (normalizedHalfway < 0.25) {
      // Very fast convergence: overdamped (high ζ)
      return 2.0 + (0.25 - normalizedHalfway) * 8
    } else if (normalizedHalfway < 0.4) {
      return 1.5
    } else {
      return 1.1
    }
  }

  private findPeaks(deviations: number[]): number[] {
    const peaks: number[] = []
    for (let i = 1; i < deviations.length - 1; i++) {
      const prev = Math.abs(deviations[i - 1]!)
      const curr = Math.abs(deviations[i]!)
      const next = Math.abs(deviations[i + 1]!)
      if (curr > prev && curr > next) {
        peaks.push(deviations[i]!)
      }
    }
    // Also include first point if it's the largest
    if (deviations.length > 0 && Math.abs(deviations[0]!) > Math.abs(deviations[1] ?? 0)) {
      peaks.unshift(deviations[0]!)
    }
    return peaks
  }

  private findHalfDecayIndex(deviations: number[], totalRange: number): number {
    const halfRange = totalRange / 2
    for (let i = 0; i < deviations.length; i++) {
      if (Math.abs(deviations[i]!) <= halfRange) return i
    }
    return deviations.length
  }

  private estimateFrequency(deviations: number[]): number {
    // Count zero crossings and convert to frequency
    const crossings = this.countZeroCrossings(deviations)
    if (crossings === 0) return 0
    // Each full cycle = 2 crossings
    return (crossings / 2) / deviations.length
  }

  private classify(zeta: number, oscillations: number): DampingRegime {
    if (oscillations >= 2 || zeta < this.underdampedThreshold) return 'underdamped'
    if (zeta > this.overdampedThreshold) return 'overdamped'
    return 'critically-damped'
  }

  private diagnose(regime: DampingRegime, zeta: number, oscillations: number): string {
    switch (regime) {
      case 'overdamped':
        return `Consensus converged very quickly (ζ=${zeta.toFixed(2)}). `
          + 'Risk: alternatives may not have been adequately explored. '
          + 'Consider adding challengers or extending exploration phase.'
      case 'critically-damped':
        return `Optimal convergence rate (ζ=${zeta.toFixed(2)}). `
          + 'Swarm balanced exploration and exploitation well.'
      case 'underdamped':
        return `Oscillating convergence (ζ=${zeta.toFixed(2)}, ${oscillations} oscillations). `
          + 'Agents are cycling between positions. '
          + 'May need more rounds or a synthesis of competing views.'
      case 'undetermined':
        return 'Insufficient data to classify convergence regime.'
    }
  }

  private estimateSettling(zeta: number, omega: number): number | null {
    if (omega <= 0 || zeta <= 0) return null
    // Settling time for 2nd-order system ≈ 3/(ζω) to reach 5% band
    // For discrete rounds, this is approximate
    const continuous = 3 / (zeta * omega)
    return Math.ceil(Math.max(1, continuous))
  }
}
