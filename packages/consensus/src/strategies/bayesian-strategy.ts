import type {
  ConsensusStrategy,
  ConsensusEvaluation,
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import {
  BeliefNetwork,
  voteToLikelihoodRatio,
} from '@cognitive-swarm/math'

/**
 * Bayesian consensus - decisions based on posterior probabilities.
 *
 * Instead of counting votes, maintains a belief network over proposals.
 * Each vote is treated as evidence that updates posterior probabilities:
 *   P(proposal_i | votes) ~ P(votes | proposal_i) * P(proposal_i)
 *
 * Advantages over simple voting:
 * - Voter weight naturally affects belief strength
 * - Multiple weak votes can outweigh one strong vote
 * - Abstentions are truly uninformative (LR = 1)
 * - Confidence is a real probability, not a vote ratio
 */
export class BayesianStrategy implements ConsensusStrategy {
  readonly id = 'bayesian'

  evaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
    config: ResolvedConsensusConfig,
  ): ConsensusEvaluation {
    if (proposals.length === 0) {
      return {
        reached: false,
        confidence: 0,
        reasoning: 'No proposals submitted',
      }
    }

    const uniqueVoters = new Set(votes.map((v) => v.agentId))
    if (uniqueVoters.size < config.minVoters) {
      return {
        reached: false,
        confidence: 0,
        reasoning: `Insufficient voters: ${uniqueVoters.size}/${config.minVoters}`,
      }
    }

    const proposalIds = proposals.map((p) => p.id)
    const beliefs = new BeliefNetwork(proposalIds)

    for (const record of votes) {
      const lr = voteToLikelihoodRatio(
        record.vote.stance,
        record.vote.weight,
      )
      beliefs.update({
        hypothesisId: record.proposalId,
        likelihoodRatio: lr,
        weight: 1.0, // weight is already factored into LR
      })
    }

    const map = beliefs.mapEstimate()
    const reached = map.probability >= config.threshold

    return {
      reached,
      winningProposalId: map.hypothesisId,
      confidence: map.probability,
      reasoning: reached
        ? `Bayesian posterior ${(map.probability * 100).toFixed(1)}% exceeds threshold ${(config.threshold * 100).toFixed(0)}% after ${beliefs.evidenceCount} evidence updates`
        : `Highest posterior ${(map.probability * 100).toFixed(1)}% below threshold ${(config.threshold * 100).toFixed(0)}%`,
    }
  }
}
