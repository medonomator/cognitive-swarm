import { describe, it, expect, vi } from 'vitest'
import type { Signal, AgentReaction, SwarmEventMap } from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import type { SwarmAgent } from '@cognitive-swarm/agent'
import { ContributionTracker } from './contribution-tracker.js'
import { RoundRunner } from './round-runner.js'

function makeSignal(id: string, type: Signal['type'] = 'task:new'): Signal {
  return {
    id,
    type,
    source: 'orchestrator',
    payload: { task: 'test' },
    confidence: 1,
    timestamp: Date.now(),
  } as Signal
}

function makeAgent(
  id: string,
  reactsTo: boolean,
  outputSignals: Signal[] = [],
): SwarmAgent {
  return {
    id,
    shouldReact: vi.fn().mockReturnValue(reactsTo),
    onSignal: vi.fn().mockResolvedValue({
      agentId: id,
      inResponseTo: 'any',
      signals: outputSignals,
      strategyUsed: 'analyze',
      processingTimeMs: 5,
    } satisfies AgentReaction),
  } as unknown as SwarmAgent
}

describe('RoundRunner', () => {
  it('returns empty result when no signals', async () => {
    const runner = new RoundRunner()
    const result = await runner.run({
      agents: [makeAgent('a', true)],
      pendingSignals: [],
      contributionTracker: new ContributionTracker(),
      events: null,
    })

    expect(result.newSignals).toHaveLength(0)
    expect(result.reactions).toHaveLength(0)
  })

  it('skips agents that should not react', async () => {
    const agent = makeAgent('a', false)
    const runner = new RoundRunner()

    await runner.run({
      agents: [agent],
      pendingSignals: [makeSignal('s1')],
      contributionTracker: new ContributionTracker(),
      events: null,
    })

    expect(agent.onSignal).not.toHaveBeenCalled()
  })

  it('delivers signals to reacting agents', async () => {
    const outputSig = makeSignal('out-1', 'discovery')
    const agent = makeAgent('a', true, [outputSig])
    const runner = new RoundRunner()

    const result = await runner.run({
      agents: [agent],
      pendingSignals: [makeSignal('s1')],
      contributionTracker: new ContributionTracker(),
      events: null,
    })

    expect(agent.onSignal).toHaveBeenCalledTimes(1)
    expect(result.newSignals).toContain(outputSig)
    expect(result.reactions).toHaveLength(1)
  })

  it('processes multiple agents in parallel per signal', async () => {
    const agent1 = makeAgent('a1', true, [makeSignal('out-1', 'discovery')])
    const agent2 = makeAgent('a2', true, [makeSignal('out-2', 'proposal')])
    const runner = new RoundRunner()

    const result = await runner.run({
      agents: [agent1, agent2],
      pendingSignals: [makeSignal('s1')],
      contributionTracker: new ContributionTracker(),
      events: null,
    })

    expect(result.newSignals).toHaveLength(2)
    expect(result.reactions).toHaveLength(2)
  })

  it('processes signals sequentially', async () => {
    const callOrder: string[] = []
    const agent: SwarmAgent = {
      id: 'a',
      shouldReact: vi.fn().mockReturnValue(true),
      onSignal: vi.fn().mockImplementation((signal: Signal) => {
        callOrder.push(signal.id)
        return Promise.resolve({
          agentId: 'a',
          inResponseTo: signal.id,
          signals: [],
          strategyUsed: 'analyze',
          processingTimeMs: 1,
        } satisfies AgentReaction)
      }),
    } as unknown as SwarmAgent

    const runner = new RoundRunner()
    await runner.run({
      agents: [agent],
      pendingSignals: [makeSignal('s1'), makeSignal('s2'), makeSignal('s3')],
      contributionTracker: new ContributionTracker(),
      events: null,
    })

    expect(callOrder).toEqual(['s1', 's2', 's3'])
  })

  it('records reactions in contribution tracker', async () => {
    const tracker = new ContributionTracker()
    const agent = makeAgent('a', true, [makeSignal('out', 'proposal')])
    const runner = new RoundRunner()

    await runner.run({
      agents: [agent],
      pendingSignals: [makeSignal('s1')],
      contributionTracker: tracker,
      events: null,
    })

    const contributions = tracker.getContributions()
    expect(contributions.get('a')?.proposalsMade).toBe(1)
  })

  it('emits agent:reacted events', async () => {
    const events = new TypedEventEmitter<SwarmEventMap>()
    const handler = vi.fn()
    events.on('agent:reacted', handler)

    const agent = makeAgent('a', true, [])
    const runner = new RoundRunner()

    await runner.run({
      agents: [agent],
      pendingSignals: [makeSignal('s1')],
      contributionTracker: new ContributionTracker(),
      events,
    })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('collects signals from multiple signals and agents', async () => {
    const agent1 = makeAgent('a1', true, [makeSignal('out-1', 'discovery')])
    const agent2 = makeAgent('a2', true, [makeSignal('out-2', 'proposal')])
    const runner = new RoundRunner()

    const result = await runner.run({
      agents: [agent1, agent2],
      pendingSignals: [makeSignal('s1'), makeSignal('s2')],
      contributionTracker: new ContributionTracker(),
      events: null,
    })

    // 2 signals × 2 agents = 4 reactions, each with 1 output = 4 signals
    expect(result.reactions).toHaveLength(4)
    expect(result.newSignals).toHaveLength(4)
  })
})
