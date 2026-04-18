import type { SwarmAgentDef } from '@cognitive-swarm/core'

/** A candidate agent with metadata for composition. */
export interface AgentCandidate {
  readonly def: SwarmAgentDef
  /** Keywords/tags for task matching. */
  readonly tags: readonly string[]
  /** Optional reputation weight from ReputationTracker. */
  readonly reputationWeight?: number
}

/** Result of composition - selected agents with reasoning. */
export interface CompositionResult {
  readonly selected: readonly SwarmAgentDef[]
  readonly reasoning: readonly SelectionReason[]
  readonly totalWeight: number
}

/** Why an agent was selected or rejected. */
export interface SelectionReason {
  readonly agentId: string
  readonly action: 'selected' | 'rejected'
  readonly reason: string
  readonly score: number
}

/** Configuration for the composer. */
export interface ComposerConfig {
  /** Minimum agents to select. Default: 2 */
  readonly minAgents?: number
  /** Maximum agents to select. Default: 10 */
  readonly maxAgents?: number
  /** Minimum diversity score across selected agents. Default: 0.3 */
  readonly minDiversity?: number
}

/** Resolved composer config. */
export interface ResolvedComposerConfig {
  readonly minAgents: number
  readonly maxAgents: number
  readonly minDiversity: number
}

/** Contribution data for pruning decisions. */
export interface AgentActivity {
  readonly agentId: string
  readonly signalsSent: number
  readonly proposalsMade: number
  readonly challengesMade: number
  readonly avgConfidence: number
}
