import type {
  ConsensusStrategy,
  ConsensusEvaluation,
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import { ConfidenceWeightedStrategy } from './confidence-weighted-strategy.js'

/**
 * Hierarchical voting: the highest-weight voter can override.
 * If the top voter agrees with a proposal, that proposal wins immediately.
 * Otherwise, falls back to confidence-weighted evaluation.
 */
export class HierarchicalStrategy implements ConsensusStrategy {
  readonly id = 'hierarchical'

  private readonly fallback = new ConfidenceWeightedStrategy()

  evaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
    config: ResolvedConsensusConfig,
  ): ConsensusEvaluation {
    if (proposals.length === 0 || votes.length === 0) {
      return {
        reached: false,
        confidence: 0,
        reasoning: 'No proposals or votes',
      }
    }

    // Find the highest-weight voter
    let topWeight = 0
    let topVoterId: string | undefined

    for (const record of votes) {
      if (record.vote.weight > topWeight) {
        topWeight = record.vote.weight
        topVoterId = record.agentId
      }
    }

    if (topVoterId === undefined) {
      return this.fallback.evaluate(proposals, votes, config)
    }

    // Check if the top voter agreed with any proposal
    const topVoterAgrees = votes.filter(
      (v) => v.agentId === topVoterId && v.vote.stance === 'agree',
    )

    if (topVoterAgrees.length > 0) {
      // Top voter agrees - pick the proposal they voted for
      // If multiple, pick the one with highest weight on the agree vote
      const agreedProposalId = topVoterAgrees[0]!.proposalId
      return {
        reached: true,
        winningProposalId: agreedProposalId,
        confidence: topWeight,
        reasoning: `Hierarchical override: top voter (weight=${topWeight}) approved`,
      }
    }

    // Top voter did not agree - fallback to weighted
    return this.fallback.evaluate(proposals, votes, config)
  }
}
