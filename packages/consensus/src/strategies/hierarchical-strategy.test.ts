import { describe, it, expect } from 'vitest'
import type {
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import { defaultErrorHandler } from '@cognitive-engine/core'
import { HierarchicalStrategy } from './hierarchical-strategy.js'

const DEFAULT_CONFIG: ResolvedConsensusConfig = {
  strategy: 'hierarchical',
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

describe('HierarchicalStrategy', () => {
  const strategy = new HierarchicalStrategy()

  it('has correct id', () => {
    expect(strategy.id).toBe('hierarchical')
  })

  it('top voter can override consensus', () => {
    const proposals = [makeProposal('p1'), makeProposal('p2')]
    const votes = [
      // Top voter (weight=5) agrees with p1
      makeVote('leader', 'p1', 'agree', 5),
      // Others disagree
      makeVote('agent-1', 'p1', 'disagree', 1),
      makeVote('agent-2', 'p1', 'disagree', 1),
      // Others prefer p2
      makeVote('agent-1', 'p2', 'agree', 1),
      makeVote('agent-2', 'p2', 'agree', 1),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    expect(result.reached).toBe(true)
    expect(result.winningProposalId).toBe('p1')
    expect(result.reasoning).toContain('Hierarchical override')
  })

  it('falls back to weighted when top voter disagrees', () => {
    const proposals = [makeProposal('p1')]
    const votes = [
      makeVote('leader', 'p1', 'disagree', 5),
      makeVote('agent-1', 'p1', 'agree', 1),
      makeVote('agent-2', 'p1', 'agree', 1),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    // Falls back to confidence-weighted: agree=2, total=7, ratio=0.286
    expect(result.reached).toBe(false)
  })

  it('returns not reached for empty input', () => {
    const result = strategy.evaluate([], [], DEFAULT_CONFIG)
    expect(result.reached).toBe(false)
  })
})
