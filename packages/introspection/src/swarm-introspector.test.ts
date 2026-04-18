import { describe, it, expect } from 'vitest'
import { SwarmIntrospector } from './swarm-introspector.js'
import type { SignalEvent } from './types.js'

function event(
  partial: Partial<SignalEvent> & { source: string; type: SignalEvent['type'] },
): SignalEvent {
  return {
    signalId: `s-${Math.random().toString(36).slice(2, 8)}`,
    targets: [],
    timestamp: Date.now(),
    ...partial,
  }
}

describe('SwarmIntrospector', () => {
  it('starts empty', () => {
    const intro = new SwarmIntrospector()
    expect(intro.eventCount).toBe(0)
  })

  it('records events', () => {
    const intro = new SwarmIntrospector()
    intro.record(event({ source: 'a1', type: 'proposal', targets: ['a2'] }))
    expect(intro.eventCount).toBe(1)
  })

  it('recordBatch adds multiple events', () => {
    const intro = new SwarmIntrospector()
    intro.recordBatch([
      event({ source: 'a1', type: 'proposal' }),
      event({ source: 'a2', type: 'vote' }),
    ])
    expect(intro.eventCount).toBe(2)
  })

  it('getSignalGraph builds directed graph', () => {
    const intro = new SwarmIntrospector()
    intro.record(event({ source: 'a1', type: 'proposal', targets: ['a2', 'a3'] }))
    intro.record(event({ source: 'a2', type: 'vote', targets: ['a1'] }))

    const graph = intro.getSignalGraph()
    expect(graph.nodes).toHaveLength(3)
    expect(graph.edges.length).toBeGreaterThan(0)
    expect(graph.totalSignals).toBe(2)
  })

  it('getSignalGraph counts duplicate edges', () => {
    const intro = new SwarmIntrospector()
    intro.record(event({ source: 'a1', type: 'proposal', targets: ['a2'] }))
    intro.record(event({ source: 'a1', type: 'proposal', targets: ['a2'] }))

    const graph = intro.getSignalGraph()
    expect(graph.edges).toHaveLength(1) // Merged
    expect(graph.edges[0]!.count).toBe(2)
  })

  it('getSignalGraph handles empty events', () => {
    const intro = new SwarmIntrospector()
    const graph = intro.getSignalGraph()
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
  })

  it('detects severe groupthink - all votes, no challenges', () => {
    const intro = new SwarmIntrospector()
    for (let i = 0; i < 10; i++) {
      intro.record(event({ source: `a${i % 3}`, type: 'vote', targets: ['a0'] }))
    }

    const report = intro.detectGroupThink()
    expect(report.detected).toBe(true)
    expect(report.severity).toBe('severe')
    expect(report.agreementRate).toBe(1.0)
    expect(report.challengers).toHaveLength(0)
    expect(report.conformists.length).toBeGreaterThan(0)
  })

  it('detects mild groupthink - mostly votes, few challenges', () => {
    const intro = new SwarmIntrospector()
    // 8 votes, 2 challenges -> agreement = 0.8
    for (let i = 0; i < 8; i++) {
      intro.record(event({ source: `a${i % 3}`, type: 'vote' }))
    }
    intro.record(event({ source: 'challenger', type: 'challenge' }))
    intro.record(event({ source: 'challenger', type: 'doubt' }))

    const report = intro.detectGroupThink()
    expect(report.severity).toBe('mild')
    expect(report.challengers).toContain('challenger')
  })

  it('no groupthink with balanced challenges', () => {
    const intro = new SwarmIntrospector()
    // Equal votes and challenges
    for (let i = 0; i < 5; i++) {
      intro.record(event({ source: `a${i}`, type: 'vote' }))
      intro.record(event({ source: `a${i}`, type: 'challenge' }))
    }

    const report = intro.detectGroupThink()
    expect(report.severity).toBe('none')
    expect(report.detected).toBe(false)
  })

  it('detects deadlock - reply ping-pong', () => {
    const intro = new SwarmIntrospector()
    intro.record(event({
      signalId: 's1',
      source: 'a1',
      type: 'challenge',
      targets: ['a2'],
    }))
    intro.record(event({
      signalId: 's2',
      source: 'a2',
      type: 'challenge',
      targets: ['a1'],
      replyTo: 's1',
    }))
    intro.record(event({
      signalId: 's3',
      source: 'a1',
      type: 'challenge',
      targets: ['a2'],
      replyTo: 's2',
    }))

    const report = intro.detectDeadlock()
    expect(report.detected).toBe(true)
    expect(report.stuckAgents).toContain('a1')
    expect(report.stuckAgents).toContain('a2')
    expect(report.cycles.length).toBeGreaterThan(0)
  })

  it('no deadlock without reply chains', () => {
    const intro = new SwarmIntrospector()
    intro.record(event({ source: 'a1', type: 'proposal', targets: ['a2'] }))
    intro.record(event({ source: 'a2', type: 'vote', targets: ['a1'] }))

    const report = intro.detectDeadlock()
    expect(report.detected).toBe(false)
    expect(report.cycles).toHaveLength(0)
  })

  it('getCostBreakdown tracks sent and received', () => {
    const intro = new SwarmIntrospector()
    intro.record(event({ source: 'a1', type: 'proposal', targets: ['a2', 'a3'] }))
    intro.record(event({ source: 'a2', type: 'vote', targets: ['a1'] }))

    const report = intro.getCostBreakdown()
    expect(report.totalSignals).toBe(2)

    const a1 = report.agents.find((a) => a.agentId === 'a1')!
    expect(a1.signalsSent).toBe(1)
    expect(a1.signalsReceived).toBe(1) // from a2's vote

    const a2 = report.agents.find((a) => a.agentId === 'a2')!
    expect(a2.signalsSent).toBe(1)
    expect(a2.signalsReceived).toBe(1) // from a1's proposal
  })

  it('mostActive is the agent with most signals sent', () => {
    const intro = new SwarmIntrospector()
    for (let i = 0; i < 5; i++) {
      intro.record(event({ source: 'busy', type: 'proposal', targets: ['a1'] }))
    }
    intro.record(event({ source: 'quiet', type: 'vote', targets: ['busy'] }))

    const report = intro.getCostBreakdown()
    expect(report.mostActive).toBe('busy')
  })

  it('amplification ratio is computed correctly', () => {
    const intro = new SwarmIntrospector()
    // a1 receives 1 signal, sends 3
    intro.record(event({ source: 'a0', type: 'task:new', targets: ['a1'] }))
    intro.record(event({ source: 'a1', type: 'discovery', targets: ['a2'] }))
    intro.record(event({ source: 'a1', type: 'proposal', targets: ['a2'] }))
    intro.record(event({ source: 'a1', type: 'vote', targets: ['a2'] }))

    const report = intro.getCostBreakdown()
    const a1 = report.agents.find((a) => a.agentId === 'a1')!
    expect(a1.amplification).toBe(3) // 3 sent / 1 received
  })

  it('reset clears all events', () => {
    const intro = new SwarmIntrospector()
    intro.record(event({ source: 'a1', type: 'proposal' }))
    intro.reset()
    expect(intro.eventCount).toBe(0)
  })
})
