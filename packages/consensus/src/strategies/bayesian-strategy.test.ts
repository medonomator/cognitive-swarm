import { describe, it, expect } from 'vitest'
import type {
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'
import { BayesianStrategy } from './bayesian-strategy.js'

const defaultConfig: ResolvedConsensusConfig = {
  strategy: 'bayesian',
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

describe('BayesianStrategy', () => {
  const strategy = new BayesianStrategy()

  it('has id "bayesian"', () => {
    expect(strategy.id).toBe('bayesian')
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
    expect(result.reasoning).toContain('Insufficient')
  })

  it('reaches consensus with strong agreement', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree', 2),
      makeVote('agent-2', 'A', 'agree', 2),
      makeVote('agent-3', 'A', 'agree', 1),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    expect(result.reached).toBe(true)
    expect(result.winningProposalId).toBe('A')
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('does not reach consensus with split votes', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'B', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // Even split -> posterior ~ 0.5 for each, below 0.7 threshold
    expect(result.confidence).toBeLessThan(0.7)
  })

  it('disagree votes shift posterior away from proposal', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'A', 'disagree'),
      makeVote('agent-3', 'B', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // A gets one agree and one disagree -> B has relative advantage
    expect(result.winningProposalId).toBe('B')
  })

  it('higher weight votes have stronger effect', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]

    // One high-weight vote for A vs two low-weight for B
    const votes = [
      makeVote('agent-1', 'A', 'agree', 5),
      makeVote('agent-2', 'B', 'agree', 1),
      makeVote('agent-3', 'B', 'agree', 1),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    expect(result.winningProposalId).toBe('A')
  })

  it('abstain votes do not change posteriors', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree', 2),
      makeVote('agent-2', 'A', 'abstain', 5),
      makeVote('agent-3', 'B', 'abstain', 5),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    // Only agent-1's vote matters - A should win
    expect(result.winningProposalId).toBe('A')
  })

  it('confidence is a real probability between 0 and 1', () => {
    const proposals = [makeProposal('A'), makeProposal('B')]
    const votes = [
      makeVote('agent-1', 'A', 'agree'),
      makeVote('agent-2', 'A', 'agree'),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('reasoning includes evidence count', () => {
    const proposals = [makeProposal('A')]
    const votes = [
      makeVote('agent-1', 'A', 'agree', 3),
      makeVote('agent-2', 'A', 'agree', 3),
    ]

    const result = strategy.evaluate(proposals, votes, defaultConfig)
    expect(result.reasoning).toContain('evidence updates')
  })
})
