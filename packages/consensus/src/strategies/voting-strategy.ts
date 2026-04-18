import type {
  ConsensusStrategy,
  ConsensusEvaluation,
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'

/**
 * Simple majority voting.
 * Each voter gets one vote regardless of weight or confidence.
 * Winner is the proposal with the highest agree ratio.
 */
export class VotingStrategy implements ConsensusStrategy {
  readonly id = 'voting'

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
    let bestRatio = 0

    for (const proposal of proposals) {
      const proposalVotes = votes.filter(
        (v) => v.proposalId === proposal.id,
      )
      const agrees = proposalVotes.filter(
        (v) => v.vote.stance === 'agree',
      ).length
      const total = proposalVotes.length

      if (total === 0) continue

      const ratio = agrees / total
      if (ratio > bestRatio) {
        bestRatio = ratio
        bestProposalId = proposal.id
      }
    }

    const reached = bestRatio >= config.threshold
    return {
      reached,
      winningProposalId: bestProposalId,
      confidence: bestRatio,
      reasoning: reached
        ? `Majority reached with ${(bestRatio * 100).toFixed(0)}% agreement`
        : `Best ratio ${(bestRatio * 100).toFixed(0)}% below threshold ${(config.threshold * 100).toFixed(0)}%`,
    }
  }
}
