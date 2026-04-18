import type { ErrorHandler } from '@cognitive-engine/core'
import type { ConflictPair, VotePayload } from './signal.js'

/** Built-in consensus strategy identifiers. */
export type ConsensusStrategyId =
  | 'voting'
  | 'confidence-weighted'
  | 'hierarchical'
  | 'bayesian'
  | 'entropy'

/** Conflict resolution approach. */
export type ConflictResolutionMode = 'debate' | 'escalate' | 'majority'

/** User-facing consensus engine config. */
export interface ConsensusConfig {
  readonly strategy?: ConsensusStrategyId | string
  readonly threshold?: number
  readonly timeoutMs?: number
  readonly minVoters?: number
  readonly maxDebateRounds?: number
  readonly conflictResolution?: ConflictResolutionMode
  readonly onError?: ErrorHandler
}

/** Resolved consensus config - all fields required. */
export interface ResolvedConsensusConfig {
  readonly strategy: string
  readonly threshold: number
  readonly timeoutMs: number
  readonly minVoters: number
  readonly maxDebateRounds: number
  readonly conflictResolution: ConflictResolutionMode
  readonly onError: ErrorHandler
}

/** A proposal submitted for consensus. */
export interface Proposal {
  readonly id: string
  readonly content: string
  readonly reasoning: string
  readonly sourceAgentId: string
  readonly sourceSignalId: string
  readonly confidence: number
  readonly timestamp: number
}

/** Individual vote record. */
export interface VoteRecord {
  readonly agentId: string
  readonly proposalId: string
  readonly vote: VotePayload
  readonly timestamp: number
}

/** Final consensus result. */
export interface ConsensusResult {
  readonly decided: boolean
  readonly decision?: string
  readonly proposalId?: string
  readonly confidence: number
  readonly votingRecord: readonly VoteRecord[]
  readonly dissent: readonly string[]
  readonly reasoning: string
  readonly resolvedConflicts: readonly ConflictPair[]
  readonly durationMs: number
}

/**
 * Interface for consensus strategies.
 * Implement this to add new strategies without modifying ConsensusEngine.
 */
export interface ConsensusStrategy {
  readonly id: string

  /** Evaluate proposals and votes. Pure function - no side effects. */
  evaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
    config: ResolvedConsensusConfig,
  ): ConsensusEvaluation
}

/** Output of a single strategy evaluation. */
export interface ConsensusEvaluation {
  readonly reached: boolean
  readonly winningProposalId?: string
  readonly confidence: number
  readonly reasoning: string
}
