import type { LlmProvider } from '@cognitive-engine/core'
import type { SwarmAgentDef } from '@cognitive-swarm/core'
import type {
  AgentCandidate,
  CompositionResult,
  SelectionReason,
  ComposerConfig,
  ResolvedComposerConfig,
  AgentActivity,
} from './types.js'

// Selects optimal agent sets for tasks.
// Can add specialists mid-task when the swarm is stuck,
// and prune agents that aren't contributing.
//
// Selection uses:
// 1. Tag matching - agent tags vs task keywords
// 2. Role coverage - ensure diverse perspectives
// 3. Reputation weighting - prefer reliable agents
// 4. LLM classification - analyze task to determine needed roles

/**
 * Dynamically compose swarm agent sets based on task requirements.
 *
 * Usage:
 * ```ts
 * const composer = new DynamicComposer(llm)
 *
 * // Define available agents
 * const candidates = [
 *   { def: securityAgent, tags: ['security', 'vulnerability'] },
 *   { def: perfAgent, tags: ['performance', 'optimization'] },
 *   { def: archAgent, tags: ['architecture', 'design'] },
 * ]
 *
 * // Compose for task
 * const result = await composer.compose('Review auth module for security issues', candidates)
 * // -> selects securityAgent (tag match) + archAgent (diversity)
 * ```
 */
export class DynamicComposer {
  private readonly config: ResolvedComposerConfig

  constructor(
    private readonly llm: LlmProvider,
    config?: ComposerConfig,
  ) {
    this.config = resolveConfig(config)
  }

  /**
   * Select optimal agents for a task.
   *
   * 1. Extract keywords from task via LLM
   * 2. Score candidates by tag match + reputation
   * 3. Select top agents, ensuring diversity
   */
  async compose(
    task: string,
    candidates: readonly AgentCandidate[],
  ): Promise<CompositionResult> {
    if (candidates.length === 0) {
      return { selected: [], reasoning: [], totalWeight: 0 }
    }

    // Extract task keywords via LLM
    const keywords = await this.extractKeywords(task)

    // Score each candidate
    const scored = candidates.map((candidate) => {
      const tagScore = computeTagScore(candidate.tags, keywords)
      const reputationScore = candidate.reputationWeight ?? 0.5
      const weight = candidate.def.config.weight ?? 1.0

      // Combined score: 50% tag match, 30% reputation, 20% base weight
      const score =
        0.5 * tagScore + 0.3 * reputationScore + 0.2 * Math.min(weight, 1)

      return { candidate, score }
    })

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    // Select agents respecting min/max and diversity
    const selected: SwarmAgentDef[] = []
    const reasoning: SelectionReason[] = []
    const selectedRoles = new Set<string>()

    for (const { candidate, score } of scored) {
      if (selected.length >= this.config.maxAgents) {
        reasoning.push({
          agentId: candidate.def.config.id,
          action: 'rejected',
          reason: 'Max agent limit reached',
          score,
        })
        continue
      }

      // Check diversity - avoid duplicate roles
      const role = candidate.def.config.role
      if (selectedRoles.has(role) && selected.length >= this.config.minAgents) {
        reasoning.push({
          agentId: candidate.def.config.id,
          action: 'rejected',
          reason: `Duplicate role: ${role}`,
          score,
        })
        continue
      }

      selected.push(candidate.def)
      selectedRoles.add(role)
      reasoning.push({
        agentId: candidate.def.config.id,
        action: 'selected',
        reason:
          score > 0.5
            ? 'High relevance to task'
            : 'Selected for diversity',
        score,
      })
    }

    // Ensure minimum agents
    if (selected.length < this.config.minAgents) {
      for (const { candidate, score } of scored) {
        if (selected.length >= this.config.minAgents) break
        if (selected.some((s) => s.config.id === candidate.def.config.id)) {
          continue
        }
        selected.push(candidate.def)
        reasoning.push({
          agentId: candidate.def.config.id,
          action: 'selected',
          reason: 'Added to meet minimum agent count',
          score,
        })
      }
    }

    const totalWeight = selected.reduce(
      (sum, def) => sum + (def.config.weight ?? 1),
      0,
    )

    return { selected, reasoning, totalWeight }
  }

  /**
   * Suggest an agent to add when the swarm is stuck.
   *
   * Analyzes what's missing by looking at current agent roles
   * vs task requirements, and selects the best reinforcement.
   */
  async suggestReinforcement(
    task: string,
    currentAgents: readonly SwarmAgentDef[],
    candidates: readonly AgentCandidate[],
  ): Promise<SwarmAgentDef | null> {
    // Filter out agents already in the swarm
    const currentIds = new Set(currentAgents.map((a) => a.config.id))
    const available = candidates.filter(
      (c) => !currentIds.has(c.def.config.id),
    )

    if (available.length === 0) return null

    // Find the most complementary agent
    const currentRoles = new Set(currentAgents.map((a) => a.config.role))
    const keywords = await this.extractKeywords(task)

    let bestCandidate: AgentCandidate | null = null
    let bestScore = -Infinity

    for (const candidate of available) {
      const tagScore = computeTagScore(candidate.tags, keywords)
      // Bonus for new role not yet in swarm
      const diversityBonus = currentRoles.has(candidate.def.config.role)
        ? 0
        : 0.3

      const score = tagScore + diversityBonus
      if (score > bestScore) {
        bestScore = score
        bestCandidate = candidate
      }
    }

    return bestCandidate?.def ?? null
  }

  /**
   * Identify agents to prune based on their activity.
   *
   * Returns agent IDs that are below the contribution threshold.
   * Low signals + low proposals + low confidence = candidate for pruning.
   */
  suggestPrune(
    activities: readonly AgentActivity[],
    threshold = 0.2,
  ): readonly string[] {
    if (activities.length <= this.config.minAgents) return []

    // Normalize each metric across all agents
    const maxSignals = Math.max(...activities.map((a) => a.signalsSent), 1)
    const maxProposals = Math.max(
      ...activities.map((a) => a.proposalsMade),
      1,
    )

    const scored = activities.map((activity) => {
      const signalScore = activity.signalsSent / maxSignals
      const proposalScore = activity.proposalsMade / maxProposals
      const challengeBonus = activity.challengesMade > 0 ? 0.2 : 0
      const confidenceScore = activity.avgConfidence

      // Weighted contribution score
      const score =
        0.3 * signalScore +
        0.3 * proposalScore +
        0.2 * confidenceScore +
        0.2 * challengeBonus

      return { agentId: activity.agentId, score }
    })

    // Keep at least minAgents
    scored.sort((a, b) => a.score - b.score)
    const maxPrune = activities.length - this.config.minAgents

    return scored
      .filter((s) => s.score < threshold)
      .slice(0, maxPrune)
      .map((s) => s.agentId)
  }

  private async extractKeywords(task: string): Promise<readonly string[]> {
    const response = await this.llm.complete([
      {
        role: 'user',
        content: `Extract 3-7 keywords from this task. Return ONLY comma-separated keywords, nothing else.\n\nTask: ${task}`,
      },
    ])

    return response.content
      .split(',')
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length > 0)
  }
}

function resolveConfig(config?: ComposerConfig): ResolvedComposerConfig {
  return {
    minAgents: config?.minAgents ?? 2,
    maxAgents: config?.maxAgents ?? 10,
    minDiversity: config?.minDiversity ?? 0.3,
  }
}

function computeTagScore(
  tags: readonly string[],
  keywords: readonly string[],
): number {
  if (tags.length === 0 || keywords.length === 0) return 0

  let matches = 0
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase()
    for (const keyword of keywords) {
      if (lowerTag.includes(keyword) || keyword.includes(lowerTag)) {
        matches++
        break
      }
    }
  }

  return matches / tags.length
}
