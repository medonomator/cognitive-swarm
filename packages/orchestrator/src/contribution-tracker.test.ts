import { describe, it, expect } from 'vitest'
import type { AgentReaction, Signal } from '@cognitive-swarm/core'
import { ContributionTracker } from './contribution-tracker.js'

function makeSignal(
  type: Signal['type'],
  confidence = 0.8,
): Signal {
  return {
    id: `sig-${Math.random()}`,
    type,
    source: 'test-agent',
    payload: { task: 'test' },
    confidence,
    timestamp: Date.now(),
  } as Signal
}

function makeReaction(
  agentId: string,
  signals: Signal[],
): AgentReaction {
  return {
    agentId,
    inResponseTo: 'input-signal',
    signals,
    strategyUsed: 'analyze',
    processingTimeMs: 10,
  }
}

describe('ContributionTracker', () => {
  it('starts empty', () => {
    const tracker = new ContributionTracker()
    const contributions = tracker.getContributions()
    expect(contributions.size).toBe(0)
  })

  it('tracks signal count', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [
        makeSignal('discovery'),
        makeSignal('discovery'),
      ]),
    )

    const c = tracker.getContributions().get('agent-1')
    expect(c?.signalsEmitted).toBe(2)
  })

  it('tracks proposals', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [makeSignal('proposal')]),
    )

    const c = tracker.getContributions().get('agent-1')
    expect(c?.proposalsMade).toBe(1)
  })

  it('tracks challenges', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [makeSignal('challenge')]),
    )

    const c = tracker.getContributions().get('agent-1')
    expect(c?.challengesMade).toBe(1)
  })

  it('tracks votes', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [makeSignal('vote')]),
    )

    const c = tracker.getContributions().get('agent-1')
    expect(c?.votesCast).toBe(1)
  })

  it('calculates average confidence', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [
        makeSignal('discovery', 0.6),
        makeSignal('discovery', 0.8),
      ]),
    )

    const c = tracker.getContributions().get('agent-1')
    expect(c?.avgConfidence).toBe(0.7)
  })

  it('tracks multiple agents independently', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [makeSignal('proposal')]),
    )
    tracker.recordReaction(
      makeReaction('agent-2', [
        makeSignal('vote'),
        makeSignal('challenge'),
      ]),
    )

    const contributions = tracker.getContributions()
    expect(contributions.size).toBe(2)
    expect(contributions.get('agent-1')?.proposalsMade).toBe(1)
    expect(contributions.get('agent-2')?.votesCast).toBe(1)
    expect(contributions.get('agent-2')?.challengesMade).toBe(1)
  })

  it('accumulates across multiple reactions for same agent', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [makeSignal('proposal')]),
    )
    tracker.recordReaction(
      makeReaction('agent-1', [makeSignal('vote')]),
    )

    const c = tracker.getContributions().get('agent-1')
    expect(c?.signalsEmitted).toBe(2)
    expect(c?.proposalsMade).toBe(1)
    expect(c?.votesCast).toBe(1)
  })

  it('resets all data', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(
      makeReaction('agent-1', [makeSignal('proposal')]),
    )
    tracker.reset()

    expect(tracker.getContributions().size).toBe(0)
  })

  it('returns zero avgConfidence when no signals emitted', () => {
    const tracker = new ContributionTracker()
    tracker.recordReaction(makeReaction('agent-1', []))

    const c = tracker.getContributions().get('agent-1')
    expect(c?.avgConfidence).toBe(0)
    expect(c?.signalsEmitted).toBe(0)
  })
})
