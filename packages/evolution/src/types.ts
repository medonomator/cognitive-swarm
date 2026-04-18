import type {
  PersonalityVector,
  SignalType,
  VoteRecord,
} from '@cognitive-swarm/core'

/** A detected gap in the swarm's collective expertise. */
export interface GapSignal {
  /** Unique ID of this gap detection. */
  readonly id: string
  /** Agent that detected the gap. */
  readonly detectedBy: string
  /** What expertise is missing. */
  readonly domain: string
  /** Why it's needed now. */
  readonly reason: string
  /** Suggested role for a new agent. */
  readonly suggestedRole?: string
  /** Urgency ∈ [0, 1]. */
  readonly urgency: number
  /** Timestamp of detection. */
  readonly timestamp: number
}

/** A proposal to spawn a new agent. */
export interface SpawnProposal {
  readonly id: string
  /** Gap that triggered this proposal. */
  readonly gapId: string
  /** Proposed role name. */
  readonly role: string
  /** Generated role description. */
  readonly roleDescription: string
  /** Proposed personality. */
  readonly personality: PersonalityVector
  /** Signal types the new agent should listen to. */
  readonly listens: readonly SignalType[]
  /** Signal types the new agent can emit. */
  readonly canEmit: readonly SignalType[]
  /** Whether the agent is temporary (dissolved after task). */
  readonly temporary: boolean
  /** IDs of agents that proposed/confirmed this gap. */
  readonly proposedBy: readonly string[]
  /** Votes on this proposal. */
  readonly votes: readonly VoteRecord[]
  /** Status of the proposal. */
  readonly status: 'pending' | 'approved' | 'rejected'
}

/** Result of evaluating a spawned agent's contribution. */
export interface EvaluationResult {
  readonly agentId: string
  /** Value score ∈ [0, 1] based on contribution quality. */
  readonly valueScore: number
  /** Number of rounds the agent has been active. */
  readonly roundsActive: number
  /** Whether the agent should be kept or dissolved. */
  readonly recommendation: 'keep' | 'dissolve'
  /** Reasoning for the recommendation. */
  readonly reason: string
}

/** Report on pruning redundant agents. */
export interface PruneReport {
  /** Agents recommended for removal. */
  readonly candidates: readonly PruneCandidate[]
  /** Number of agents that would be removed. */
  readonly pruneCount: number
}

/** A candidate for pruning. */
export interface PruneCandidate {
  readonly agentId: string
  readonly reason: string
  /** Redundancy score - how similar to other agents in [0, 1]. */
  readonly redundancyScore: number
}

/** Suggestion to merge two similar agents. */
export interface MergeSuggestion {
  readonly agentA: string
  readonly agentB: string
  /** Normalized mutual information between the two. */
  readonly similarity: number
  /** Suggested merged personality. */
  readonly mergedPersonality: PersonalityVector
  /** Combined role description. */
  readonly mergedRole: string
}

/** Suggestion to tune an agent's personality. */
export interface PersonalityTuning {
  readonly agentId: string
  readonly current: PersonalityVector
  readonly suggested: PersonalityVector
  readonly reason: string
}

/** Configuration for the swarm evolver. */
export interface EvolverConfig {
  /** Minimum votes to approve a spawn. Default: 2 */
  readonly minVotesForSpawn?: number
  /** Approval ratio threshold. Default: 0.6 */
  readonly approvalThreshold?: number
  /** Minimum value score to keep an agent. Default: 0.3 */
  readonly minValueForKeep?: number
  /** Rounds before evaluating a new agent. Default: 3 */
  readonly evaluationWindow?: number
}

/** Resolved evolver config. */
export interface ResolvedEvolverConfig {
  readonly minVotesForSpawn: number
  readonly approvalThreshold: number
  readonly minValueForKeep: number
  readonly evaluationWindow: number
}

/** Configuration for the swarm optimizer. */
export interface OptimizerConfig {
  /** NMI threshold above which agents are considered redundant. Default: 0.8 */
  readonly redundancyThreshold?: number
  /** Minimum performance delta to trigger personality tuning. Default: 0.2 */
  readonly tuningThreshold?: number
}

/** Resolved optimizer config. */
export interface ResolvedOptimizerConfig {
  readonly redundancyThreshold: number
  readonly tuningThreshold: number
}
