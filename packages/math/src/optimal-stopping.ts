// Optimal stopping via CUSUM change detection + Secretary Problem.
// CUSUM: S_t = max(0, S_{t-1} + (k - x_t)), stop when S_t > h.
// Secretary: explore T/e rounds, then stop at first better-than-best.

/** CUSUM configuration. */
export interface CUSUMConfig {
  /** Minimum acceptable information gain per round. */
  readonly targetGain: number
  /** Decision threshold - higher = fewer false alarms. */
  readonly threshold: number
}

/** Result of a stopping decision. */
export interface StoppingDecision {
  /** Should the swarm stop? */
  readonly shouldStop: boolean
  /** 'continue' if not stopping. */
  readonly reason: 'cusum-change-detected' | 'secretary-threshold' | 'continue'
  /** Current CUSUM statistic value. */
  readonly cusumStatistic: number
  /** Whether the exploration phase (Secretary) is complete. */
  readonly explorationComplete: boolean
  /** Number of rounds observed so far. */
  readonly roundsObserved: number
  /** Best proposal quality seen during exploration phase. */
  readonly bestSeenDuringExploration: number
  /** Best proposal quality seen overall. */
  readonly bestSeen: number
}

const DEFAULT_CUSUM: CUSUMConfig = {
  targetGain: 0.05,
  threshold: 0.3,
}

/**
 * Optimal stopping using CUSUM change detection + Secretary Problem.
 *
 * Usage:
 * ```ts
 * const stopper = new OptimalStopping(10) // maxRounds = 10
 *
 * // After each round, feed metrics:
 * stopper.observeRound({
 *   informationGain: 0.15,
 *   bestProposalQuality: 0.7,
 *   round: 1,
 * })
 *
 * const decision = stopper.decide()
 * // decision.shouldStop - combined stopping decision
 * // decision.reason - which rule triggered (or 'continue')
 * ```
 */
export class OptimalStopping {
  private readonly maxRounds: number
  private readonly cusumConfig: CUSUMConfig
  private readonly explorationLength: number

  private cusumStat = 0
  private roundsObserved = 0
  private bestDuringExploration = -Infinity
  private bestOverall = -Infinity
  private changeDetected = false
  private secretaryTriggered = false

  constructor(
    maxRounds: number,
    cusumConfig?: Partial<CUSUMConfig>,
  ) {
    this.maxRounds = Math.max(1, maxRounds)
    this.cusumConfig = { ...DEFAULT_CUSUM, ...cusumConfig }

    // Secretary Problem: optimal exploration = T/e (≈ 37% of rounds)
    this.explorationLength = Math.max(
      1,
      Math.floor(this.maxRounds / Math.E),
    )
  }

  /**
   * Record a round's quality metrics.
   *
   * @param metrics.informationGain - how much information was gained this round
   * @param metrics.bestProposalQuality - quality of best proposal (e.g., MAP probability)
   * @param metrics.round - round number (1-based)
   */
  observeRound(metrics: {
    readonly informationGain: number
    readonly bestProposalQuality: number
    readonly round: number
  }): void {
    this.roundsObserved++

    // CUSUM: S rises when gain drops below target
    const deviation = this.cusumConfig.targetGain - metrics.informationGain
    this.cusumStat = Math.max(0, this.cusumStat + deviation)

    if (this.cusumStat > this.cusumConfig.threshold) {
      this.changeDetected = true
    }

    const quality = metrics.bestProposalQuality

    if (this.roundsObserved <= this.explorationLength) {
      // Exploration phase
      if (quality > this.bestDuringExploration) {
        this.bestDuringExploration = quality
      }
    } else {
      // Exploitation phase: stop if better than exploration best
      if (quality > this.bestDuringExploration) {
        this.secretaryTriggered = true
      }
    }

    if (quality > this.bestOverall) {
      this.bestOverall = quality
    }
  }

  /** Make a stopping decision based on all observed data. */
  decide(): StoppingDecision {
    // CUSUM has priority - it detects degradation
    if (this.changeDetected) {
      return {
        shouldStop: true,
        reason: 'cusum-change-detected',
        cusumStatistic: this.cusumStat,
        explorationComplete: this.roundsObserved > this.explorationLength,
        roundsObserved: this.roundsObserved,
        bestSeenDuringExploration: this.bestDuringExploration,
        bestSeen: this.bestOverall,
      }
    }

    // Secretary: found better-than-exploration proposal
    if (this.secretaryTriggered) {
      return {
        shouldStop: true,
        reason: 'secretary-threshold',
        cusumStatistic: this.cusumStat,
        explorationComplete: true,
        roundsObserved: this.roundsObserved,
        bestSeenDuringExploration: this.bestDuringExploration,
        bestSeen: this.bestOverall,
      }
    }

    return {
      shouldStop: false,
      reason: 'continue',
      cusumStatistic: this.cusumStat,
      explorationComplete: this.roundsObserved > this.explorationLength,
      roundsObserved: this.roundsObserved,
      bestSeenDuringExploration:
        this.bestDuringExploration === -Infinity
          ? 0
          : this.bestDuringExploration,
      bestSeen: this.bestOverall === -Infinity ? 0 : this.bestOverall,
    }
  }

  cusumValue(): number {
    return this.cusumStat
  }

  isChangeDetected(): boolean {
    return this.changeDetected
  }

  optimalExplorationLength(): number {
    return this.explorationLength
  }

  isExplorationComplete(): boolean {
    return this.roundsObserved > this.explorationLength
  }

  reset(): void {
    this.cusumStat = 0
    this.roundsObserved = 0
    this.bestDuringExploration = -Infinity
    this.bestOverall = -Infinity
    this.changeDetected = false
    this.secretaryTriggered = false
  }
}
