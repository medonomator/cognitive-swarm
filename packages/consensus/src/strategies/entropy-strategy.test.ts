import { describe, it, expect } from 'vitest'
import type {
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import { EntropyStrategy } from './entropy-strategy.js'

const defaultConfig: ResolvedConsensusConfig = {
  strategy: 'entropy',
  threshold: 0.7,
  timeoutMs: 30_000,
  minVoters: 2,
  maxDebateRounds: 3,
  conflictResolution: 'debate',
  onError: () => {},
}

function makeProposal(id: string): Proposal {
  return {
    id,
    content: `Proposal ${id}`,
    reasoning: 'test',
    sourceAgentId: `agent-${id}`,
    sourceSignalId: `sig-${id}`,
    confidence: 0.8,
    timestamp: Date.now(),
  }
}

function makeVote(
  agentId: string,
  proposalId: string,
  stance: 'agree' | 'disagree' | 'abstain',
  weight = 1,
): VoteRecord {
  return {
    agentId,
    proposalId,
    vote: { proposalId, stance, weight },
    timestamp: Date.now(),
  }
}

describe('EntropyStrategy', () => {
  const strategy = new EntropyStrategy()

  it('has id "entropy"', () => {
    expect(strategy.id).toBe('entropy')
  })

  it('returns not reached when no proposals', () => {
    const result = strategy.evaluate([], [], defaultConfig)
    expect(result.reached).toBe(false)
  })

  it('returns not reached when insufficient voters', () => {
    const proposals = [makeProposal('A')]
    const votes = [makeVote('agent-1', 'A', 'agree')]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    expect(result.reached).toBe(false)
  })

  it('unanimous support gives high confidence', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'A', 'agree'),
      makeVote('agent-3', 'A', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // All support on A -> entropy ~ 0 -> confidence ~ 1
    expect(result.reached).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.9)
    expect(result.winningProposalId).toBe('A')
  })

  it('split support gives low confidence', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'B', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // Even split -> entropy = maxH -> confidence = 0
    expect(result.confidence).toBeCloseTo(0, 1)
    expect(result.reached).toBe(false)
  })

  it('moderate skew gives moderate confidence', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree', 2),
      makeVote('agent-2', 'A', 'agree', 1),
      makeVote('agent-3', 'B', 'agree', 1),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // 3:1 weighted support -> moderate entropy
    expect(result.confidence).toBeGreaterThan(0.1)
    expect(result.confidence).toBeLessThan(0.95)
  })

  it('handles many proposals correctly', () => {
    const proposals = Array.from({ length: 5 }, (_, i) =>
      makeProposal(`P${i}`),
    )
    const votes = [
      makeVote('agent-1', 'P0', 'agree'),
      makeVote('agent-2', 'P0', 'agree'),
      makeVote('agent-3', 'P1', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // 2:1:0:0:0 distribution across 5 proposals
    // Entropy is low relative to max -> decent confidence
    expect(result.winningProposalId).toBe('P0')
    expect(result.confidence).toBeGreaterThan(0.3)
  })

  it('disagree votes do not add support', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'A', 'disagree'),
      makeVote('agent-3', 'A', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // Only agree votes count as support
    // A has 2 support, B has 0 -> all mass on A -> high confidence
    expect(result.reached).toBe(true)
    expect(result.winningProposalId).toBe('A')
  })

  it('reasoning includes entropy bits', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'A', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    expect(result.reasoning).toContain('bits')
  })

  it('single proposal always reaches consensus', () => {
    const proposals = [makeProposal('A')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'A', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // Single proposal -> maxH = 0 -> confidence = 1
    expect(result.reached).toBe(true)
    expect(result.confidence).toBe(1)
  })
})
