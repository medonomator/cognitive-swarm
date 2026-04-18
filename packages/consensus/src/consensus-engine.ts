import type {
  ConsensusConfig,
  ResolvedConsensusConfig,
  ConsensusStrategy,
  ConsensusResult,
  Proposal,
  VoteRecord,
  SwarmEventMap,
} from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import { defaultErrorHandler } from '@cognitive-engine/core'
import { VotingStrategy } from './strategies/voting-strategy.js'
import { ConfidenceWeightedStrategy } from './strategies/confidence-weighted-strategy.js'
import { HierarchicalStrategy } from './strategies/hierarchical-strategy.js'
import { BayesianStrategy } from './strategies/bayesian-strategy.js'
import { EntropyStrategy } from './strategies/entropy-strategy.js'

const DEFAULT_STRATEGY = 'confidence-weighted'
const DEFAULT_THRESHOLD = 0.7
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MIN_VOTERS = 2
const DEFAULT_MAX_DEBATE_ROUNDS = 3

/**
 * Evaluates proposals and votes to reach consensus.
 * Strategies are pluggable via the ConsensusStrategy interface (Open/Closed).
 */
export class ConsensusEngine {
  private readonly config: ResolvedConsensusConfig
  private readonly strategies: ReadonlyMap<string, ConsensusStrategy>
  private readonly events: TypedEventEmitter<SwarmEventMap> | null

  constructor(
    config?: ConsensusConfig,
    events?: TypedEventEmitter<SwarmEventMap>,
    customStrategies?: readonly ConsensusStrategy[],
  ) {
    this.config = resolveConfig(config)
    this.events = events ?? null

    const strategyMap = new Map<string, ConsensusStrategy>()
    strategyMap.set('voting', new VotingStrategy())
    strategyMap.set('confidence-weighted', new ConfidenceWeightedStrategy())
    strategyMap.set('hierarchical', new HierarchicalStrategy())
    strategyMap.set('bayesian', new BayesianStrategy())
    strategyMap.set('entropy', new EntropyStrategy())

    if (customStrategies) {
      for (const strategy of customStrategies) {
        strategyMap.set(strategy.id, strategy)
      }
    }

    this.strategies = strategyMap
  }

  /**
   * Evaluate proposals and votes to determine consensus.
   * Returns a ConsensusResult - does not manage signal flow.
   */
  evaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
  ): ConsensusResult {
    const startTime = Date.now()

    const strategy = this.strategies.get(this.config.strategy)
    if (!strategy) {
      return {
        decided: false,
        confidence: 0,
        votingRecord: votes,
        dissent: [],
        reasoning: `Unknown consensus strategy: ${this.config.strategy}`,
        resolvedConflicts: [],
        durationMs: Date.now() - startTime,
      }
    }

    const evaluation = strategy.evaluate(proposals, votes, this.config)
    const winningProposal = proposals.find(
      (p) => p.id === evaluation.winningProposalId,
    )

    const dissentReasons = votes
      .filter(
        (v) =>
          v.proposalId === evaluation.winningProposalId &&
          v.vote.stance === 'disagree' &&
          v.vote.reasoning,
      )
      .map((v) => v.vote.reasoning!)

    const result: ConsensusResult = {
      decided: evaluation.reached,
      decision: winningProposal?.content,
      proposalId: evaluation.winningProposalId,
      confidence: evaluation.confidence,
      votingRecord: votes,
      dissent: dissentReasons,
      reasoning: evaluation.reasoning,
      resolvedConflicts: [],
      durationMs: Date.now() - startTime,
    }

    if (result.decided) {
      this.events?.emit('consensus:reached', result)
    } else {
      this.events?.emit('consensus:failed', {
        reason: 'no_majority',
        proposals,
        votes,
      })
    }

    return result
  }

  /** Check if enough votes have been collected to attempt consensus. */
  canEvaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
  ): boolean {
    if (proposals.length === 0) return false
    const uniqueVoters = new Set(votes.map((v) => v.agentId))
    return uniqueVoters.size >= this.config.minVoters
  }

  /** Get the active strategy ID. */
  get activeStrategy(): string {
    return this.config.strategy
  }

  /** Get available strategy IDs. */
  get availableStrategies(): readonly string[] {
    return [...this.strategies.keys()]
  }
}

function resolveConfig(config?: ConsensusConfig): ResolvedConsensusConfig {
  return {
    strategy: config?.strategy ?? DEFAULT_STRATEGY,
    threshold: config?.threshold ?? DEFAULT_THRESHOLD,
    timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    minVoters: config?.minVoters ?? DEFAULT_MIN_VOTERS,
    maxDebateRounds:
      config?.maxDebateRounds ?? DEFAULT_MAX_DEBATE_ROUNDS,
    conflictResolution: config?.conflictResolution ?? 'debate',
    onError: config?.onError ?? defaultErrorHandler,
  }
}
