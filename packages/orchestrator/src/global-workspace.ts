import type { Signal, SignalType } from '@cognitive-swarm/core'

/**
 * Global Workspace — conscious broadcast mechanism.
 *
 * Implements the core insight from Global Workspace Theory (Baars):
 * many signals compete for access to a limited workspace. Only signals
 * that cross the "ignition threshold" get broadcast to ALL agents,
 * regardless of type subscription. Sub-threshold signals follow normal
 * type-based routing.
 *
 * This creates two processing streams:
 * - "Conscious": high-scoring signals broadcast globally (ignited)
 * - "Unconscious": normal signals routed by type subscription
 *
 * Scoring: confidence × novelty × relevance
 *
 * Theoretical basis: Lesson 11 (Global Workspace Theory), LIDA architecture.
 */

export interface GlobalWorkspaceConfig {
  /** Enable the workspace (default: true). */
  readonly enabled?: boolean
  /** Score threshold for global broadcast (default: 0.6). */
  readonly ignitionThreshold?: number
  /** Decay factor for repeated content types from same source (default: 0.7). */
  readonly noveltyDecayFactor?: number
  /** Max signals that can ignite per round (default: 3). */
  readonly maxIgnitedPerRound?: number
}

export interface ResolvedGlobalWorkspaceConfig {
  readonly enabled: boolean
  readonly ignitionThreshold: number
  readonly noveltyDecayFactor: number
  readonly maxIgnitedPerRound: number
}

export interface WorkspacePartition {
  /** Signals that crossed ignition threshold — deliver to ALL agents. */
  readonly ignited: readonly Signal[]
  /** Sub-threshold signals — deliver via normal type-based routing. */
  readonly normal: readonly Signal[]
}

/** Signal types that are infrastructural and always broadcast (bypass workspace). */
const INFRASTRUCTURE_TYPES: ReadonlySet<SignalType> = new Set([
  'task:new',
  'consensus:reached',
  'memory:shared',
])

/** Signal types with inherently higher relevance to the task. */
const RELEVANCE_WEIGHTS: Partial<Record<SignalType, number>> = {
  'proposal': 1.0,
  'challenge': 0.9,
  'discovery': 0.8,
  'doubt': 0.7,
  'vote': 0.5,
  'conflict': 0.6,
  'tool:result': 0.4,
  'escalate': 0.3,
}

export class GlobalWorkspace {
  private readonly config: ResolvedGlobalWorkspaceConfig
  /**
   * Tracks how many times a (source, type) pair has appeared recently.
   * Used to compute novelty — repeated content from the same source is less novel.
   */
  private readonly recentEmissions = new Map<string, number>()
  private totalSignalsProcessed = 0

  constructor(config?: GlobalWorkspaceConfig) {
    this.config = {
      enabled: config?.enabled ?? true,
      ignitionThreshold: config?.ignitionThreshold ?? 0.6,
      noveltyDecayFactor: config?.noveltyDecayFactor ?? 0.7,
      maxIgnitedPerRound: config?.maxIgnitedPerRound ?? 3,
    }
  }

  /**
   * Partition signals into ignited (global broadcast) and normal (type-based routing).
   * Infrastructure signals always go to normal routing (they already broadcast).
   */
  partition(signals: readonly Signal[]): WorkspacePartition {
    if (!this.config.enabled) {
      return { ignited: [], normal: signals }
    }

    const scored: { signal: Signal; score: number }[] = []
    const normal: Signal[] = []

    for (const signal of signals) {
      // Infrastructure signals bypass workspace (already delivered to all)
      if (INFRASTRUCTURE_TYPES.has(signal.type)) {
        normal.push(signal)
        continue
      }

      const score = this.computeWorkspaceScore(signal)
      scored.push({ signal, score })
    }

    // Sort by score descending, take top N above threshold
    scored.sort((a, b) => b.score - a.score)

    const ignited: Signal[] = []
    for (const item of scored) {
      if (item.score >= this.config.ignitionThreshold && ignited.length < this.config.maxIgnitedPerRound) {
        ignited.push(item.signal)
      } else {
        normal.push(item.signal)
      }
    }

    // Update emission tracking
    for (const signal of signals) {
      const key = `${signal.source}:${signal.type}`
      this.recentEmissions.set(key, (this.recentEmissions.get(key) ?? 0) + 1)
      this.totalSignalsProcessed++
    }

    return { ignited, normal }
  }

  /**
   * Compute workspace score: confidence × novelty × relevance.
   * Range: [0, 1] approximately (can exceed 1 in theory but rare).
   */
  private computeWorkspaceScore(signal: Signal): number {
    const confidence = signal.confidence
    const novelty = this.computeNovelty(signal)
    const relevance = this.computeRelevance(signal)
    return confidence * novelty * relevance
  }

  /**
   * Novelty: how fresh is this signal?
   * Signals of the same type from the same source decay with each repetition.
   * First signal of its kind: novelty = 1.0
   * Second: novelty = 0.7 (with default decay)
   * Third: novelty = 0.49, etc.
   */
  private computeNovelty(signal: Signal): number {
    const key = `${signal.source}:${signal.type}`
    const priorCount = this.recentEmissions.get(key) ?? 0
    if (priorCount === 0) return 1.0
    return Math.pow(this.config.noveltyDecayFactor, priorCount)
  }

  /**
   * Relevance: how important is this signal type for the task?
   * Proposals and challenges are more relevant than tool results.
   * Also considers reply depth — direct replies to task are more relevant.
   */
  private computeRelevance(signal: Signal): number {
    const typeWeight = RELEVANCE_WEIGHTS[signal.type] ?? 0.5

    // Signals with higher priority metadata get relevance boost
    const priorityBoost = signal.metadata?.priority
      ? Math.min(0.3, signal.metadata.priority * 0.1)
      : 0

    // Causal level boost: counterfactual reasoning is more valuable
    let causalBoost = 0
    if (signal.metadata?.causalLevel === 'counterfactual') causalBoost = 0.15
    else if (signal.metadata?.causalLevel === 'intervention') causalBoost = 0.05

    return Math.min(1.0, typeWeight + priorityBoost + causalBoost)
  }

  /** Reset emission tracking between rounds. Called between solve() calls. */
  reset(): void {
    this.recentEmissions.clear()
    this.totalSignalsProcessed = 0
  }

  /** Decay emission counts between rounds (partial memory). */
  decayEmissions(): void {
    for (const [key, count] of this.recentEmissions) {
      const decayed = Math.floor(count * 0.5)
      if (decayed <= 0) {
        this.recentEmissions.delete(key)
      } else {
        this.recentEmissions.set(key, decayed)
      }
    }
  }
}

export function resolveGlobalWorkspaceConfig(
  config?: GlobalWorkspaceConfig,
): ResolvedGlobalWorkspaceConfig {
  return {
    enabled: config?.enabled ?? true,
    ignitionThreshold: config?.ignitionThreshold ?? 0.6,
    noveltyDecayFactor: config?.noveltyDecayFactor ?? 0.7,
    maxIgnitedPerRound: config?.maxIgnitedPerRound ?? 3,
  }
}
