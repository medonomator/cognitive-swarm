import { describe, it, expect } from 'vitest'
import type { Signal } from '@cognitive-swarm/core'
import { ConflictDetector } from './conflict-detector.js'

function makeSignal(
  overrides: Partial<Signal> = {},
): Signal {
  return {
    id: 'sig-1',
    type: 'discovery',
    source: 'agent-1',
    payload: { finding: 'test', relevance: 0.5 },
    confidence: 0.8,
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeProposal(
  id: string,
  source: string,
): Signal<'proposal'> {
  return {
    id,
    type: 'proposal',
    source,
    payload: {
      proposalId: id,
      content: `Proposal from ${source}`,
      reasoning: 'test',
    },
    confidence: 0.8,
    timestamp: Date.now(),
  }
}

describe('ConflictDetector', () => {
  it('detects conflict between proposals from different agents', () => {
    const detector = new ConflictDetector()
    const existing = makeProposal('p-1', 'agent-1')
    const incoming = makeProposal('p-2', 'agent-2')

    const conflict = detector.check(incoming, [existing])

    expect(conflict).not.toBeNull()
    expect(conflict?.signalA.id).toBe('p-1')
    expect(conflict?.signalB.id).toBe('p-2')
  })

  it('does not flag proposals from the same agent', () => {
    const detector = new ConflictDetector()
    const existing = makeProposal('p-1', 'agent-1')
    const incoming = makeProposal('p-2', 'agent-1')

    const conflict = detector.check(incoming, [existing])
    expect(conflict).toBeNull()
  })

  it('ignores non-proposal signals', () => {
    const detector = new ConflictDetector()
    const signal = makeSignal({ type: 'discovery' })

    const conflict = detector.check(signal, [makeProposal('p-1', 'agent-1')])
    expect(conflict).toBeNull()
  })

  it('tracks unresolved conflicts', () => {
    const detector = new ConflictDetector()
    const existing = makeProposal('p-1', 'agent-1')
    const incoming = makeProposal('p-2', 'agent-2')

    detector.check(incoming, [existing])

    expect(detector.getUnresolved()).toHaveLength(1)
  })

  it('marks conflicts as resolved', () => {
    const detector = new ConflictDetector()
    const existing = makeProposal('p-1', 'agent-1')
    const incoming = makeProposal('p-2', 'agent-2')

    detector.check(incoming, [existing])
    detector.markResolved('p-1', 'p-2')

    expect(detector.getUnresolved()).toHaveLength(0)
  })

  it('handles reversed signal IDs in markResolved', () => {
    const detector = new ConflictDetector()
    const existing = makeProposal('p-1', 'agent-1')
    const incoming = makeProposal('p-2', 'agent-2')

    detector.check(incoming, [existing])
    detector.markResolved('p-2', 'p-1')

    expect(detector.getUnresolved()).toHaveLength(0)
  })

  it('clears all conflicts', () => {
    const detector = new ConflictDetector()
    detector.check(makeProposal('p-2', 'agent-2'), [
      makeProposal('p-1', 'agent-1'),
    ])
    detector.check(makeProposal('p-4', 'agent-4'), [
      makeProposal('p-3', 'agent-3'),
    ])

    detector.clear()
    expect(detector.getUnresolved()).toHaveLength(0)
  })

  it('returns a copy from getUnresolved', () => {
    const detector = new ConflictDetector()
    const result1 = detector.getUnresolved()
    detector.check(makeProposal('p-2', 'agent-2'), [
      makeProposal('p-1', 'agent-1'),
    ])
    const result2 = detector.getUnresolved()

    expect(result1).toHaveLength(0)
    expect(result2).toHaveLength(1)
  })
})
