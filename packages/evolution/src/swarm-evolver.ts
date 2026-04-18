import type { LlmProvider } from '@cognitive-engine/core'
import type { PersonalityVector } from '@cognitive-swarm/core'
import type {
  GapSignal,
  SpawnProposal,
  EvaluationResult,
  PruneReport,
  PruneCandidate,
  EvolverConfig,
  ResolvedEvolverConfig,
} from './types.js'

// The swarm grows itself. When agents detect gaps in
// collective expertise, the evolver:
//
// 1. Collects gap signals from agents
// 2. When enough agents confirm a gap, creates a spawn proposal
// 3. Uses LLM to generate a role description for the new agent
// 4. Tracks spawned agents and evaluates their contribution
// 5. Agents that don't provide value are dissolved

/**
 * Manages the lifecycle of dynamically spawned agents.
 *
 * Usage:
 * ```ts
 * const evolver = new SwarmEvolver(llm)
 *
 * // Agent detects a gap
 * evolver.reportGap({
 *   id: 'g1', detectedBy: 'agent-1',
 *   domain: 'reverse-engineering',
 *   reason: 'Found obfuscated code',
 *   urgency: 0.8, timestamp: Date.now(),
 * })
 *
 * // Another agent confirms
 * evolver.confirmGap('g1', 'agent-2')
 *
 * // Check if spawn is warranted
 * const proposal = await evolver.proposeSpawn('g1')
 * if (proposal) {
 *   // Use the proposal to create a new SwarmAgent
 * }
 * ```
 */
export class SwarmEvolver {
  private readonly gaps = new Map<string, GapSignal>()
  private readonly confirmations = new Map<string, Set<string>>()
  private readonly proposals = new Map<string, SpawnProposal>()
  private readonly agentValues = new Map<
    string,
    { score: number; rounds: number }
  >()
  private readonly config: ResolvedEvolverConfig

  constructor(
    private readonly llm: LlmProvider,
    config?: EvolverConfig,
  ) {
    this.config = resolveEvolverConfig(config)
  }

  /** Report a gap detected by an agent. */
  reportGap(gap: GapSignal): void {
    this.gaps.set(gap.id, gap)
    // The detecting agent counts as a confirmation
    const confs = this.confirmations.get(gap.id) ?? new Set()
    confs.add(gap.detectedBy)
    this.confirmations.set(gap.id, confs)
  }

  /** Another agent confirms a gap is real. */
  confirmGap(gapId: string, agentId: string): void {
    const confs = this.confirmations.get(gapId) ?? new Set()
    confs.add(agentId)
    this.confirmations.set(gapId, confs)
  }

  /** Dismiss a gap (vote against it). */
  dismissGap(gapId: string, agentId: string): void {
    // Removing a confirmation is dismissal
    const confs = this.confirmations.get(gapId)
    if (confs) confs.delete(agentId)
  }

  /** Get confirmation count for a gap. */
  getConfirmationCount(gapId: string): number {
    return this.confirmations.get(gapId)?.size ?? 0
  }

  /**
   * Check if a gap has enough confirmations and create a spawn proposal.
   *
   * Uses LLM to generate a role description based on the gap context.
   * Returns null if the gap hasn't been confirmed by enough agents.
   */
  async proposeSpawn(
    gapId: string,
    existingRoles?: readonly string[],
  ): Promise<SpawnProposal | null> {
    const gap = this.gaps.get(gapId)
    if (!gap) return null

    const confirmCount = this.getConfirmationCount(gapId)
    if (confirmCount < this.config.minVotesForSpawn) return null

    // Generate role via LLM
    const role = await this.generateRole(gap, existingRoles ?? [])

    const proposal: SpawnProposal = {
      id: `spawn-${gapId}`,
      gapId,
      role: role.name,
      roleDescription: role.description,
      personality: role.personality,
      listens: ['task:new', 'discovery', 'challenge'],
      canEmit: ['discovery', 'proposal', 'challenge', 'doubt', 'vote'],
      temporary: gap.urgency < 0.5,
      proposedBy: [...(this.confirmations.get(gapId) ?? [])],
      votes: [],
      status: 'approved', // Auto-approved once threshold met
    }

    this.proposals.set(proposal.id, proposal)
    return proposal
  }

  /**
   * Evaluate a spawned agent's contribution.
   *
   * @param agentId - the spawned agent's ID
   * @param signalsSent - how many signals the agent has emitted
   * @param proposalsMade - how many proposals the agent created
   * @param roundsActive - how many rounds since spawn
   */
  evaluate(
    agentId: string,
    signalsSent: number,
    proposalsMade: number,
    roundsActive: number,
  ): EvaluationResult {
    // Compute value score
    const signalScore = Math.min(signalsSent / 10, 1)
    const proposalScore = Math.min(proposalsMade / 3, 1)
    const valueScore = 0.4 * signalScore + 0.6 * proposalScore

    this.agentValues.set(agentId, { score: valueScore, rounds: roundsActive })

    const tooEarlyToJudge = roundsActive < this.config.evaluationWindow

    const recommendation =
      tooEarlyToJudge || valueScore >= this.config.minValueForKeep
        ? 'keep'
        : 'dissolve'

    let reason: string
    if (tooEarlyToJudge) {
      reason = `Too early to evaluate (${roundsActive}/${this.config.evaluationWindow} rounds)`
    } else if (recommendation === 'keep') {
      reason = `Value score ${valueScore.toFixed(2)} exceeds threshold ${this.config.minValueForKeep}`
    } else {
      reason = `Value score ${valueScore.toFixed(2)} below threshold ${this.config.minValueForKeep}`
    }

    return { agentId, valueScore, roundsActive, recommendation, reason }
  }

  /**
   * Suggest agents to prune based on their value scores.
   *
   * @param redundancyScores - optional map of agentId to redundancy with others
   */
  suggestPrune(
    redundancyScores?: ReadonlyMap<string, number>,
  ): PruneReport {
    const candidates: PruneCandidate[] = []

    for (const [agentId, data] of this.agentValues) {
      const redundancy = redundancyScores?.get(agentId) ?? 0

      if (data.score < this.config.minValueForKeep) {
        candidates.push({
          agentId,
          reason: `Low value score: ${data.score.toFixed(2)}`,
          redundancyScore: redundancy,
        })
      } else if (redundancy > 0.8) {
        candidates.push({
          agentId,
          reason: `Highly redundant with other agents (NMI: ${redundancy.toFixed(2)})`,
          redundancyScore: redundancy,
        })
      }
    }

    // Sort by redundancy descending (prune most redundant first)
    candidates.sort((a, b) => b.redundancyScore - a.redundancyScore)

    return { candidates, pruneCount: candidates.length }
  }

  /** Get a gap by ID. */
  getGap(gapId: string): GapSignal | undefined {
    return this.gaps.get(gapId)
  }

  /** Get a proposal by ID. */
  getProposal(proposalId: string): SpawnProposal | undefined {
    return this.proposals.get(proposalId)
  }

  /** Total number of reported gaps. */
  get gapCount(): number {
    return this.gaps.size
  }

  /** Total number of proposals created. */
  get proposalCount(): number {
    return this.proposals.size
  }

  /** Reset all state. */
  reset(): void {
    this.gaps.clear()
    this.confirmations.clear()
    this.proposals.clear()
    this.agentValues.clear()
  }

  private async generateRole(
    gap: GapSignal,
    existingRoles: readonly string[],
  ): Promise<{ name: string; description: string; personality: PersonalityVector }> {
    const rolesContext =
      existingRoles.length > 0
        ? `Existing roles (avoid overlap): ${existingRoles.join(', ')}`
        : 'No existing roles.'

    const response = await this.llm.complete([
      {
        role: 'user',
        content: [
          `Generate a specialist agent role for this gap:`,
          `Domain: ${gap.domain}`,
          `Reason: ${gap.reason}`,
          rolesContext,
          '',
          'Return ONLY a JSON object with:',
          '- name: short role name (2-3 words)',
          '- description: one sentence describing what this agent does',
          '- curiosity: number 0-1',
          '- caution: number 0-1',
          '- conformity: number 0-1',
          '- verbosity: number 0-1',
        ].join('\n'),
      },
    ])

    // Parse response - fall back to defaults if LLM output is unparseable
    try {
      const parsed: {
        name?: string
        description?: string
        curiosity?: number
        caution?: number
        conformity?: number
        verbosity?: number
      } = JSON.parse(response.content)
      return {
        name: parsed.name ?? `${gap.domain}-specialist`,
        description:
          parsed.description ??
          `Specialist in ${gap.domain}`,
        personality: {
          curiosity: clamp01(parsed.curiosity ?? 0.7),
          caution: clamp01(parsed.caution ?? 0.5),
          conformity: clamp01(parsed.conformity ?? 0.3),
          verbosity: clamp01(parsed.verbosity ?? 0.5),
        },
      }
    } catch {
      // Fallback: generate a sensible default
      return {
        name: `${gap.domain}-specialist`,
        description: `Specialist in ${gap.domain}: ${gap.reason}`,
        personality: {
          curiosity: 0.7,
          caution: 0.5,
          conformity: 0.3,
          verbosity: 0.5,
        },
      }
    }
  }
}

function resolveEvolverConfig(config?: EvolverConfig): ResolvedEvolverConfig {
  return {
    minVotesForSpawn: config?.minVotesForSpawn ?? 2,
    approvalThreshold: config?.approvalThreshold ?? 0.6,
    minValueForKeep: config?.minValueForKeep ?? 0.3,
    evaluationWindow: config?.evaluationWindow ?? 3,
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
