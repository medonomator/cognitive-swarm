// System Archetypes Detector — identifies structural pathological patterns.
//
// From Meadows/Senge systems theory. Detects three key archetypes:
//   1. Limits to Growth — info gain declining but signal volume increasing
//   2. Shifting the Burden — symptomatic fixes (spawned agents) don't solve root cause
//   3. Tragedy of the Commons — agents compete for attention, quality drowns in noise

import type { LeverageLevel } from './leverage-points.js'

/** Detected system archetype. */
export interface DetectedArchetype {
  /** Archetype name. */
  readonly name: 'limits-to-growth' | 'shifting-the-burden' | 'tragedy-of-the-commons'
  /** Confidence in detection ∈ [0, 1]. */
  readonly confidence: number
  /** Human-readable description of what's happening. */
  readonly description: string
  /** Recommended leverage point for intervention. */
  readonly leveragePoint: string
  /** Meadows' leverage level (1-12, lower = stronger). */
  readonly leverageLevel: LeverageLevel
}

/** Input metrics for archetype detection. */
export interface ArchetypeMetrics {
  /** Information gain trend (positive = learning, negative = stagnating). */
  readonly infoGainTrend: number
  /** Total signal volume this round. */
  readonly signalVolume: number
  /** Previous round signal volume. */
  readonly prevSignalVolume: number
  /** Number of evolved (spawned) agents. */
  readonly evolvedAgentCount: number
  /** Number of evolution spawns so far. */
  readonly totalSpawns: number
  /** Number of evolution dissolves so far. */
  readonly totalDissolves: number
  /** Average NMI (redundancy). */
  readonly averageNMI: number
  /** Shapley concentration (ratio of top contributor's value to mean). */
  readonly shapleyConcentration: number
  /** Whether the same gap that triggered spawning persists. */
  readonly persistentGap: boolean
}

/** Full archetype analysis report. */
export interface ArchetypeReport {
  /** All detected archetypes (may be multiple). */
  readonly detected: readonly DetectedArchetype[]
  /** Whether any archetype was detected. */
  readonly hasArchetypes: boolean
  /** Most critical archetype (highest confidence), if any. */
  readonly primary: DetectedArchetype | null
}

/** Configuration for archetype detection thresholds. */
export interface ArchetypeConfig {
  /** NMI above which agents are considered redundant (Tragedy of Commons). Default: 0.6. */
  readonly redundancyThreshold?: number
  /** Shapley concentration above which value is over-concentrated. Default: 2.0. */
  readonly concentrationThreshold?: number
  /** Minimum confidence to report an archetype. Default: 0.3. */
  readonly minConfidence?: number
}

/**
 * Detects system archetypes in swarm behavior.
 *
 * Usage:
 * ```ts
 * const detector = new ArchetypeDetector()
 *
 * detector.observe({
 *   infoGainTrend: -0.02,    // declining
 *   signalVolume: 15,         // but signals increasing
 *   prevSignalVolume: 10,
 *   evolvedAgentCount: 2,
 *   totalSpawns: 3,
 *   totalDissolves: 1,
 *   averageNMI: 0.7,
 *   shapleyConcentration: 2.5,
 *   persistentGap: true,
 * })
 *
 * const report = detector.report()
 * // report.detected includes 'limits-to-growth' and 'shifting-the-burden'
 * ```
 */
export class ArchetypeDetector {
  private readonly observations: ArchetypeMetrics[] = []
  private readonly redundancyThreshold: number
  private readonly concentrationThreshold: number
  private readonly minConfidence: number

  constructor(config?: ArchetypeConfig) {
    this.redundancyThreshold = config?.redundancyThreshold ?? 0.6
    this.concentrationThreshold = config?.concentrationThreshold ?? 2.0
    this.minConfidence = config?.minConfidence ?? 0.3
  }

  observe(metrics: ArchetypeMetrics): void {
    this.observations.push(metrics)
  }

  report(): ArchetypeReport {
    if (this.observations.length < 2) {
      return { detected: [], hasArchetypes: false, primary: null }
    }

    const detected: DetectedArchetype[] = []

    const ltg = this.detectLimitsToGrowth()
    if (ltg) detected.push(ltg)

    const stb = this.detectShiftingTheBurden()
    if (stb) detected.push(stb)

    const toc = this.detectTragedyOfCommons()
    if (toc) detected.push(toc)

    const primary = detected.length > 0
      ? detected.reduce((a, b) => a.confidence > b.confidence ? a : b)
      : null

    return { detected, hasArchetypes: detected.length > 0, primary }
  }

  get observationCount(): number {
    return this.observations.length
  }

  reset(): void {
    this.observations.length = 0
  }

  /**
   * Limits to Growth: reinforcing loop creates growth (signals, activity),
   * but a balancing loop limits actual progress (info gain).
   *
   * Pattern: signal volume increasing + info gain declining.
   */
  private detectLimitsToGrowth(): DetectedArchetype | null {
    const recent = this.observations.slice(-3)
    if (recent.length < 2) return null

    const infoGainDeclining = recent.every(m => m.infoGainTrend < 0)
    const volumeIncreasing = recent.length >= 2 &&
      recent[recent.length - 1]!.signalVolume > recent[0]!.signalVolume

    if (!infoGainDeclining || !volumeIncreasing) return null

    // Confidence based on how strong the divergence is
    const gainDecline = Math.abs(recent[recent.length - 1]!.infoGainTrend)
    const volumeGrowth = recent[recent.length - 1]!.signalVolume / Math.max(1, recent[0]!.signalVolume)
    const confidence = Math.min(1, (gainDecline * 10 + (volumeGrowth - 1)) / 2)

    if (confidence < this.minConfidence) return null

    return {
      name: 'limits-to-growth',
      confidence,
      description: 'Signal volume is increasing but information gain is declining. '
        + 'The swarm is generating more activity without making progress. '
        + 'The limiting factor may be problem structure, not agent effort.',
      leveragePoint: 'Identify and address the constraining balancing loop — '
        + 'e.g., problem decomposition, new perspectives, or early stopping.',
      leverageLevel: 4, // Self-organization: change how the system structures itself
    }
  }

  /**
   * Shifting the Burden: symptomatic solution (spawning agents) instead
   * of addressing the root cause (agent configuration, task framing).
   *
   * Pattern: multiple spawns + dissolves for same gap, gap persists.
   */
  private detectShiftingTheBurden(): DetectedArchetype | null {
    const latest = this.observations[this.observations.length - 1]!

    // Need at least 2 spawns to see the pattern
    if (latest.totalSpawns < 2) return null

    // Key signal: gap persists despite spawning new agents
    if (!latest.persistentGap) return null

    // Stronger signal: dissolves happened too (agents were tried and failed)
    const spawnCycleRatio = latest.totalDissolves / Math.max(1, latest.totalSpawns)
    const confidence = Math.min(1, 0.4 + spawnCycleRatio * 0.4 + (latest.totalSpawns > 3 ? 0.2 : 0))

    if (confidence < this.minConfidence) return null

    return {
      name: 'shifting-the-burden',
      confidence,
      description: `Spawned ${latest.totalSpawns} agents (dissolved ${latest.totalDissolves}) `
        + 'but the underlying gap persists. Adding agents is a symptomatic fix — '
        + 'the root cause may be in task framing or base agent configuration.',
      leveragePoint: 'Address root cause: restructure the task, change agent personalities, '
        + 'or reframe the problem — not spawn more of the same.',
      leverageLevel: 3, // System goals: change what the system is trying to achieve
    }
  }

  /**
   * Tragedy of the Commons: agents individually optimize (emit signals)
   * but collectively degrade the shared resource (attention/signal quality).
   *
   * Pattern: high redundancy (NMI) + Shapley concentration (few agents dominate value).
   */
  private detectTragedyOfCommons(): DetectedArchetype | null {
    const latest = this.observations[this.observations.length - 1]!

    // High redundancy: agents saying similar things
    const highRedundancy = latest.averageNMI > this.redundancyThreshold

    // Shapley concentration: most value comes from few agents
    const highConcentration = latest.shapleyConcentration > this.concentrationThreshold

    if (!highRedundancy && !highConcentration) return null

    const confidence = Math.min(1,
      (highRedundancy ? 0.4 : 0) +
      (highConcentration ? 0.4 : 0) +
      (highRedundancy && highConcentration ? 0.2 : 0),
    )

    if (confidence < this.minConfidence) return null

    return {
      name: 'tragedy-of-the-commons',
      confidence,
      description: 'Agents are producing highly redundant signals '
        + `(avg NMI: ${latest.averageNMI.toFixed(2)}) while few contribute unique value `
        + `(Shapley concentration: ${latest.shapleyConcentration.toFixed(1)}×). `
        + 'Collective signal quality is degraded by noise.',
      leveragePoint: 'Reduce agent count, enforce signal diversity rules, '
        + 'or use topology to restrict who sees whom.',
      leverageLevel: 5, // Rules of the system
    }
  }
}
