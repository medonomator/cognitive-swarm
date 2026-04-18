import { describe, it, expect, vi } from 'vitest'
import type {
  Proposal,
  VoteRecord,
  ConsensusStrategy,
  ConsensusEvaluation,
  ResolvedConsensusConfig,
  SwarmEventMap,
} from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import { ConsensusEngine } from './consensus-engine.js'

function makeProposal(id: string, agentId: string): Proposal {
  return {
    id,
    content: `Proposal ${id}`,
    reasoning: 'test reasoning',
    sourceAgentId: agentId,
    sourceSignalId: `sig-${id}`,
    confidence: 0.8,
    timestamp: Date.now(),
  }
}

function makeVote(
  agentId: string,
  proposalId: string,
  stance: 'agree' | 'disagree',
  weight = 1,
  reasoning?: string,
): VoteRecord {
  return {
    agentId,
    proposalId,
    vote: { proposalId, stance, weight, reasoning },
    timestamp: Date.now(),
  }
}

describe('ConsensusEngine', () => {
  it('uses confidence-weighted strategy by default', () => {
    const engine = new ConsensusEngine()
    expect(engine.activeStrategy).toBe('confidence-weighted')
  })

  it('lists available strategies', () => {
    const engine = new ConsensusEngine()
    expect(engine.availableStrategies).toContain('voting')
    expect(engine.availableStrategies).toContain('confidence-weighted')
    expect(engine.availableStrategies).toContain('hierarchical')
    expect(engine.availableStrategies).toContain('bayesian')
    expect(engine.availableStrategies).toContain('entropy')
  })

  it('evaluates and reaches consensus', () => {
    const engine = new ConsensusEngine({ strategy: 'voting' })
    const proposals = [makeProposal('p1', 'agent-1')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree'),
      makeVote('agent-2', 'p1', 'agree'),
      makeVote('agent-3', 'p1', 'agree'),
    ]

    const result = engine.evaluate(proposals, votes)
    expect(result.decided).toBe(true)
    expect(result.decision).toBe('Proposal p1')
    expect(result.proposalId).toBe('p1')
    expect(result.confidence).toBe(1)
  })

  it('preserves dissent reasoning', () => {
    const engine = new ConsensusEngine({
      strategy: 'voting',
      threshold: 0.5,
    })
    const proposals = [makeProposal('p1', 'agent-1')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree'),
      makeVote('agent-2', 'p1', 'agree'),
      makeVote('agent-3', 'p1', 'disagree', 1, 'I disagree because X'),
    ]

    const result = engine.evaluate(proposals, votes)
    expect(result.decided).toBe(true)
    expect(result.dissent).toContain('I disagree because X')
  })

  it('emits consensus:reached event on success', () => {
    const events = new TypedEventEmitter<SwarmEventMap>()
    const handler = vi.fn()
    events.on('consensus:reached', handler)

    const engine = new ConsensusEngine({ strategy: 'voting' }, events)
    const proposals = [makeProposal('p1', 'agent-1')]
    const votes = [
      makeVote('agent-1', 'p1', 'agree'),
      makeVote('agent-2', 'p1', 'agree'),
    ]

    engine.evaluate(proposals, votes)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('emits consensus:failed event on failure', () => {
    const events = new TypedEventEmitter<SwarmEventMap>()
    const handler = vi.fn()
    events.on('consensus:failed', handler)

    const engine = new ConsensusEngine({ strategy: 'voting' }, events)
    const proposals = [makeProposal('p1', 'agent-1')]
    const votes = [
      makeVote('agent-1', 'p1', 'disagree'),
      makeVote('agent-2', 'p1', 'disagree'),
    ]

    engine.evaluate(proposals, votes)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('supports custom strategies', () => {
    const customStrategy: ConsensusStrategy = {
      id: 'always-yes',
      evaluate(
        proposals: readonly Proposal[],
        _votes: readonly VoteRecord[],
        _config: ResolvedConsensusConfig,
      ): ConsensusEvaluation {
        return {
          reached: true,
          winningProposalId: proposals[0]?.id,
          confidence: 1,
          reasoning: 'Always yes',
        }
      },
    }

    const engine = new ConsensusEngine(
      { strategy: 'always-yes' },
      undefined,
      [customStrategy],
    )

    const result = engine.evaluate(
      [makeProposal('p1', 'agent-1')],
      [makeVote('agent-1', 'p1', 'disagree')],
    )
    expect(result.decided).toBe(true)
  })

  it('handles unknown strategy gracefully', () => {
    const engine = new ConsensusEngine({ strategy: 'nonexistent' })
    const result = engine.evaluate(
      [makeProposal('p1', 'agent-1')],
      [makeVote('agent-1', 'p1', 'agree')],
    )
    expect(result.decided).toBe(false)
    expect(result.reasoning).toContain('Unknown consensus strategy')
  })

  it('canEvaluate checks proposals and voter count', () => {
    const engine = new ConsensusEngine({ minVoters: 2 })

    expect(engine.canEvaluate([], [])).toBe(false)
    expect(
      engine.canEvaluate(
        [makeProposal('p1', 'a1')],
        [makeVote('agent-1', 'p1', 'agree')],
      ),
    ).toBe(false)
    expect(
      engine.canEvaluate(
        [makeProposal('p1', 'a1')],
        [
          makeVote('agent-1', 'p1', 'agree'),
          makeVote('agent-2', 'p1', 'agree'),
        ],
      ),
    ).toBe(true)
  })
})
