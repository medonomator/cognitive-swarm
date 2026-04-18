import type {
  ConsensusStrategy,
  ConsensusEvaluation,
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'

/**
 * Votes weighted by each voter's confidence and voting weight.
 * Agents with higher confidence and weight have more influence.
 */
export class ConfidenceWeightedStrategy implements ConsensusStrategy {
  readonly id = 'confidence-weighted'

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

    let bestProposalId: string | undefined
    let bestWeightedRatio = 0

    for (const proposal of proposals) {
      const proposalVotes = votes.filter(
        (v) => v.proposalId === proposal.id,
      )
      if (proposalVotes.length === 0) continue

      let agreeWeight = 0
      let totalWeight = 0

      for (const record of proposalVotes) {
        const weight = record.vote.weight
        totalWeight += weight

        if (record.vote.stance === 'agree') {
          agreeWeight += weight
        }
      }

      if (totalWeight === 0) continue

      const weightedRatio = agreeWeight / totalWeight
      if (weightedRatio > bestWeightedRatio) {
        bestWeightedRatio = weightedRatio
        bestProposalId = proposal.id
      }
    }

    const reached = bestWeightedRatio >= config.threshold
    return {
      reached,
      winningProposalId: bestProposalId,
      confidence: bestWeightedRatio,
      reasoning: reached
        ? `Weighted consensus at ${(bestWeightedRatio * 100).toFixed(0)}%`
        : `Weighted ratio ${(bestWeightedRatio * 100).toFixed(0)}% below threshold ${(config.threshold * 100).toFixed(0)}%`,
    }
  }
}
