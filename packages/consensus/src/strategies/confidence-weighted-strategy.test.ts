import { describe, it, expect } from 'vitest'
import type {
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import { defaultErrorHandler } from '@cognitive-engine/core'
import { ConfidenceWeightedStrategy } from './confidence-weighted-strategy.js'

const DEFAULT_CONFIG: ResolvedConsensusConfig = {
  strategy: 'confidence-weighted',
  threshold: 0.7,
  timeoutMs: 30_000,
  minVoters: 2,
  maxDebateRounds: 3,
  conflictResolution: 'debate',
  onError: defaultErrorHandler,
}

function makeProposal(id: string): Proposal {
  return {
    id,
    content: `Proposal ${id}`,
    reasoning: 'test',
    sourceAgentId: 'agent-x',
    sourceSignalId: `sig-${id}`,
    confidence: 0.8,
    timestamp: Date.now(),
  }
}

function makeVote(
  agentId: string,
  proposalId: string,
  stance: 'agree' | 'disagree',
  weight: number,
): VoteRecord {
  return {
    agentId,
    proposalId,
    vote: { proposalId, stance, weight },
    timestamp: Date.now(),
  }
}

describe('ConfidenceWeightedStrategy', () => {
  const strategy = new ConfidenceWeightedStrategy()

  it('has correct id', () => {
    expect(strategy.id).toBe('confidence-weighted')
  })

  it('weights votes by vote weight', () => {
    const proposals = [makeProposal('p1')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree', 3),
      makeVote('agent-2', 'p1', 'disagree', 1),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    // agreeWeight=3, totalWeight=4, ratio=0.75 >= 0.7
    expect(result.reached).toBe(true)
    expect(result.confidence).toBe(0.75)
  })

  it('high-weight disagree can block consensus', () => {
    const proposals = [makeProposal('p1')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree', 1),
      makeVote('agent-2', 'p1', 'disagree', 5),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    // agreeWeight=1, totalWeight=6, ratio=0.167
    expect(result.reached).toBe(false)
    expect(result.confidence).toBeCloseTo(0.167, 2)
  })

  it('picks highest weighted proposal among multiple', () => {
    const proposals = [makeProposal('p1'), makeProposal('p2')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree', 1),
      makeVote('agent-2', 'p1', 'disagree', 1),
      makeVote('agent-1', 'p2', 'agree', 3),
      makeVote('agent-2', 'p2', 'agree', 1),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    expect(result.reached).toBe(true)
    expect(result.winningProposalId).toBe('p2')
    expect(result.confidence).toBe(1)
  })

  it('returns not reached for insufficient voters', () => {
    const proposals = [makeProposal('p1')]
    const votes = [makeVote('agent-1', 'p1', 'agree', 1)]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    expect(result.reached).toBe(false)
  })
})
