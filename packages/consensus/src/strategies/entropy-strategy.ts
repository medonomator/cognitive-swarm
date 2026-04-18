import type {
  ConsensusStrategy,
  ConsensusEvaluation,
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import { shannonEntropy } from '@cognitive-swarm/math'

/**
 * Entropy-aware consensus - uses information theory to measure
 * agreement quality, not just majority size.
 *
 * Confidence = 1 - H/H_max, where H is Shannon entropy of
 * the vote-mass distribution. This means 60% agreement across
 * 2 proposals is very different from 60% across 10 proposals.
 */
export class EntropyStrategy implements ConsensusStrategy {
  readonly id = 'entropy'

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

    const support = new Map<string, number>()
    for (const proposal of proposals) {
      support.set(proposal.id, 0)
    }

    for (const record of votes) {
      if (record.vote.stance === 'agree') {
        const current = support.get(record.proposalId) ?? 0
        support.set(record.proposalId, current + record.vote.weight)
      }
    }

    const h = shannonEntropy(support)
    const maxH = proposals.length > 1 ? Math.log2(proposals.length) : 0

    const confidence = maxH > 0 ? 1 - h / maxH : 1

    let bestProposalId: string | undefined
    let bestSupport = 0
    for (const [id, s] of support) {
      if (s > bestSupport) {
        bestSupport = s
        bestProposalId = id
      }
    }

    const reached = confidence >= config.threshold

    return {
      reached,
      winningProposalId: bestProposalId,
      confidence,
      reasoning: reached
        ? `Entropy-based confidence ${(confidence * 100).toFixed(1)}% (H=${h.toFixed(2)} bits, max=${maxH.toFixed(2)})`
        : `Entropy too high: confidence ${(confidence * 100).toFixed(1)}% (H=${h.toFixed(2)}/${maxH.toFixed(2)} bits)`,
    }
  }
}
