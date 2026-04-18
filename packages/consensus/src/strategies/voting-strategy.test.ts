import { describe, it, expect } from 'vitest'
import type {
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import { defaultErrorHandler } from '@cognitive-engine/core'
import { VotingStrategy } from './voting-strategy.js'

const DEFAULT_CONFIG: ResolvedConsensusConfig = {
  strategy: 'voting',
  threshold: 0.7,
  timeoutMs: 30_000,
  minVoters: 2,
  maxDebateRounds: 3,
  conflictResolution: 'debate',
  onError: defaultErrorHandler,
}

function makeProposal(id: string, agentId: string): Proposal {
  return {
    id,
    content: `Proposal ${id}`,
    reasoning: 'test',
    sourceAgentId: agentId,
    sourceSignalId: `sig-${id}`,
    confidence: 0.8,
    timestamp: Date.now(),
  }
}

function makeVote(
  agentId: string,
  proposalId: string,
  stance: 'agree' | 'disagree' | 'abstain',
): VoteRecord {
  return {
    agentId,
    proposalId,
    vote: { proposalId, stance, weight: 1 },
    timestamp: Date.now(),
  }
}

describe('VotingStrategy', () => {
  const strategy = new VotingStrategy()

  it('has correct id', () => {
    expect(strategy.id).toBe('voting')
  })

  it('returns not reached when no proposals', () => {
    const result = strategy.evaluate([], [], DEFAULT_CONFIG)
    expect(result.reached).toBe(false)
  })

  it('returns not reached when insufficient voters', () => {
    const proposals = [makeProposal('p1', 'agent-1')]
    const votes = [makeVote('agent-1', 'p1', 'agree')]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    expect(result.reached).toBe(false)
    expect(result.reasoning).toContain('Insufficient voters')
  })

  it('reaches consensus when agree ratio meets threshold', () => {
    const proposals = [makeProposal('p1', 'agent-1')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree'),
      makeVote('agent-2', 'p1', 'agree'),
      makeVote('agent-3', 'p1', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    expect(result.reached).toBe(true)
    expect(result.winningProposalId).toBe('p1')
    expect(result.confidence).toBe(1)
  })

  it('does not reach consensus when below threshold', () => {
    const proposals = [makeProposal('p1', 'agent-1')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree'),
      makeVote('agent-2', 'p1', 'disagree'),
      makeVote('agent-3', 'p1', 'disagree'),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    expect(result.reached).toBe(false)
    expect(result.confidence).toBeCloseTo(0.333, 2)
  })

  it('picks the proposal with the highest agree ratio', () => {
    const proposals = [
      makeProposal('p1', 'agent-1'),
      makeProposal('p2', 'agent-2'),
    ]
    const votes = [
      makeVote('agent-1', 'p1', 'agree'),
      makeVote('agent-2', 'p1', 'disagree'),
      makeVote('agent-3', 'p1', 'disagree'),
      makeVote('agent-1', 'p2', 'agree'),
      makeVote('agent-2', 'p2', 'agree'),
      makeVote('agent-3', 'p2', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, DEFAULT_CONFIG)
    expect(result.reached).toBe(true)
    expect(result.winningProposalId).toBe('p2')
  })
})
