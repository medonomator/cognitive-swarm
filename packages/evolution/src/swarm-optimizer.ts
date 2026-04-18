import type { PersonalityVector } from '@cognitive-swarm/core'
import type {
  MergeSuggestion,
  PersonalityTuning,
  OptimizerConfig,
  ResolvedOptimizerConfig,
} from './types.js'

// Analyzes swarm composition and produces optimization suggestions.
//
// 1. Detect redundancy - agents too similar (high NMI) -> suggest merging
// 2. Tune personality - adjust traits based on performance data
// 3. Optimal size - are there too many or too few agents?
//
// Pure analysis engine - produces suggestions,
// the orchestrator decides whether to apply them.

/** Agent data fed to the optimizer. */
export interface AgentProfile {
  readonly id: string
  readonly role: string
  readonly personality: PersonalityVector
  /** Performance accuracy ∈ [0, 1]. */
  readonly accuracy: number
  /** Number of contributions. */
  readonly contributions: number
}

/** Pairwise similarity data (from RedundancyDetector). */
export interface PairwiseSimilarity {
  readonly agentA: string
  readonly agentB: string
  /** Normalized mutual information ∈ [0, 1]. */
  readonly nmi: number
}

/**
 * Analyzes swarm composition and suggests optimizations.
 *
 * Usage:
 * ```ts
 * const optimizer = new SwarmOptimizer()
 *
 * const merges = optimizer.detectRedundancy(pairwiseNMI, profiles)
 * const tunings = optimizer.tunePersonalities(profiles)
 * const size = optimizer.suggestOptimalSize(profiles, pairwiseNMI)
 * ```
 */
export class SwarmOptimizer {
  private readonly config: ResolvedOptimizerConfig

  constructor(config?: OptimizerConfig) {
    this.config = resolveOptimizerConfig(config)
  }

  /**
   * Find agent pairs that are too similar and suggest merges.
   *
   * Uses normalized mutual information from RedundancyDetector.
   * High NMI means agents say the same things -> waste of resources.
   */
  detectRedundancy(
    similarities: readonly PairwiseSimilarity[],
    profiles: readonly AgentProfile[],
  ): readonly MergeSuggestion[] {
    const profileMap = new Map<string, AgentProfile>()
    for (const p of profiles) profileMap.set(p.id, p)

    const suggestions: MergeSuggestion[] = []

    for (const sim of similarities) {
      if (sim.nmi < this.config.redundancyThreshold) continue

      const profileA = profileMap.get(sim.agentA)
      const profileB = profileMap.get(sim.agentB)
      if (!profileA || !profileB) continue

      // Merge personality: weighted average by contribution count
      const totalContributions =
        profileA.contributions + profileB.contributions
      const weightA =
        totalContributions > 0
          ? profileA.contributions / totalContributions
          : 0.5
      const weightB = 1 - weightA

      const mergedPersonality: PersonalityVector = {
        curiosity:
          profileA.personality.curiosity * weightA +
          profileB.personality.curiosity * weightB,
        caution:
          profileA.personality.caution * weightA +
          profileB.personality.caution * weightB,
        conformity:
          profileA.personality.conformity * weightA +
          profileB.personality.conformity * weightB,
        verbosity:
          profileA.personality.verbosity * weightA +
          profileB.personality.verbosity * weightB,
      }

      suggestions.push({
        agentA: sim.agentA,
        agentB: sim.agentB,
        similarity: sim.nmi,
        mergedPersonality,
        mergedRole: `${profileA.role} + ${profileB.role}`,
      })
    }

    // Sort by similarity descending (most redundant first)
    suggestions.sort((a, b) => b.similarity - a.similarity)
    return suggestions
  }

  /**
   * Suggest personality adjustments based on performance.
   *
   * Rules:
   * - High caution + low accuracy -> lower caution, raise curiosity
   *   (too careful, missing things)
   * - Low conformity + low accuracy -> raise conformity
   *   (too contrarian, not aligning with truth)
   * - High verbosity + low contributions -> lower verbosity
   *   (talking too much, doing too little)
   */
  tunePersonalities(
    profiles: readonly AgentProfile[],
  ): readonly PersonalityTuning[] {
    const tunings: PersonalityTuning[] = []

    for (const profile of profiles) {
      // Need minimum contributions to judge
      if (profile.contributions < 5) continue

      const p = profile.personality
      const delta = this.config.tuningThreshold
      let suggested: PersonalityVector | null = null
      let reason = ''

      if (p.caution > 0.7 && profile.accuracy < 0.5) {
        // Too cautious, missing things
        suggested = {
          ...p,
          caution: Math.max(0, p.caution - delta),
          curiosity: Math.min(1, p.curiosity + delta),
        }
        reason = 'High caution with low accuracy - agent is too careful'
      } else if (p.conformity < 0.3 && profile.accuracy < 0.4) {
        // Too contrarian
        suggested = {
          ...p,
          conformity: Math.min(1, p.conformity + delta),
        }
        reason = 'Low conformity with low accuracy - agent is too contrarian'
      } else if (
        p.verbosity > 0.7 &&
        profile.contributions < 3
      ) {
        // Talks too much, does too little
        suggested = {
          ...p,
          verbosity: Math.max(0, p.verbosity - delta),
        }
        reason =
          'High verbosity with few contributions - reduce noise'
      }

      if (suggested) {
        tunings.push({
          agentId: profile.id,
          current: p,
          suggested,
          reason,
        })
      }
    }

    return tunings
  }

  /**
   * Suggest optimal swarm size based on contribution distribution.
   *
   * Uses a diminishing returns model: each additional agent
   * should provide unique value. Returns suggested size.
   */
  suggestOptimalSize(
    profiles: readonly AgentProfile[],
    similarities: readonly PairwiseSimilarity[],
  ): number {
    if (profiles.length <= 2) return profiles.length

    // Sort agents by contribution (most valuable first)
    const sorted = [...profiles].sort(
      (a, b) => b.contributions - a.contributions,
    )

    // Compute average pairwise similarity for each agent
    const avgSim = new Map<string, number>()
    for (const profile of sorted) {
      const sims = similarities.filter(
        (s) => s.agentA === profile.id || s.agentB === profile.id,
      )
      const avg =
        sims.length > 0
          ? sims.reduce((sum, s) => sum + s.nmi, 0) / sims.length
          : 0
      avgSim.set(profile.id, avg)
    }

    // Add agents one by one until marginal agent is too redundant
    let optimalSize = 1
    for (let i = 1; i < sorted.length; i++) {
      const agent = sorted[i]!
      const sim = avgSim.get(agent.id) ?? 0

      // If this agent is too similar to existing ones, stop
      if (sim > this.config.redundancyThreshold) break
      optimalSize++
    }

    return optimalSize
  }
}

function resolveOptimizerConfig(
  config?: OptimizerConfig,
): ResolvedOptimizerConfig {
  return {
    redundancyThreshold: config?.redundancyThreshold ?? 0.8,
    tuningThreshold: config?.tuningThreshold ?? 0.2,
  }
}
