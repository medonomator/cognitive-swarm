import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { trace } from '@opentelemetry/api'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { instrumentSwarm } from '../src/instrument.js'
import type { InstrumentableOrchestrator } from '../src/instrument.js'
import type { SwarmResult, SwarmEvent, SwarmEventMap } from '@cognitive-swarm/core'

type EventHandler<K extends keyof SwarmEventMap> = (data: SwarmEventMap[K]) => void

/** Minimal mock orchestrator that fires events and returns canned results. */
function createMockOrchestrator(): InstrumentableOrchestrator & {
  emit<K extends keyof SwarmEventMap & string>(event: K, data: SwarmEventMap[K]): void
} {
  const listeners = new Map<string, Set<(data: unknown) => void>>()

  const result: SwarmResult = {
    answer: 'mock answer',
    confidence: 0.8,
    consensus: {
      decided: true,
      decision: 'mock',
      proposalId: 'p1',
      confidence: 0.8,
      votingRecord: [],
      dissent: [],
      reasoning: 'mock',
      resolvedConflicts: [],
      durationMs: 100,
    },
    signalLog: [],
    agentContributions: [],
    cost: { tokens: 100, estimatedUsd: 0.0003 },
    timing: { totalMs: 500, roundsUsed: 1 },
    mathAnalysis: null as never,
    advisorReport: null,
    debateResults: [],
  }

  return {
    async solve(): Promise<SwarmResult> {
      return result
    },

    async *solveWithStream(): AsyncIterable<SwarmEvent> {
      yield { type: 'solve:complete', result }
    },

    on<K extends keyof SwarmEventMap & string>(
      event: K,
      handler: EventHandler<K>,
    ): () => void {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(handler as (data: unknown) => void)
      return () => set!.delete(handler as (data: unknown) => void)
    },

    destroy(): void {
      listeners.clear()
    },

    emit<K extends keyof SwarmEventMap & string>(event: K, data: SwarmEventMap[K]): void {
      const set = listeners.get(event)
      if (set) {
        for (const handler of set) handler(data)
      }
    },
  }
}

describe('instrumentSwarm', () => {
  let exporter: InMemorySpanExporter
  let provider: BasicTracerProvider

  beforeEach(() => {
    trace.disable()
    exporter = new InMemorySpanExporter()
    provider = new BasicTracerProvider()
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
    provider.register()
  })

  afterEach(async () => {
    await provider.shutdown()
    trace.disable()
  })

  it('creates solve span on solve()', async () => {
    const mock = createMockOrchestrator()
    const instrumented = instrumentSwarm(mock, { agentCount: 3, maxRounds: 10 })

    const result = await instrumented.solve('test task')

    expect(result.answer).toBe('mock answer')
    const spans = exporter.getFinishedSpans()
    const solveSpan = spans.find((s) => s.name === 'cognitive-swarm.solve')
    expect(solveSpan).toBeDefined()
    expect(solveSpan!.attributes['swarm.task']).toBe('test task')
    expect(solveSpan!.attributes['swarm.agent_count']).toBe(3)
  })

  it('creates solve span on solveWithStream()', async () => {
    const mock = createMockOrchestrator()
    const instrumented = instrumentSwarm(mock, { agentCount: 2, maxRounds: 5 })

    const events: SwarmEvent[] = []
    for await (const event of instrumented.solveWithStream('streaming task')) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('solve:complete')

    const spans = exporter.getFinishedSpans()
    const solveSpan = spans.find((s) => s.name === 'cognitive-swarm.solve')
    expect(solveSpan).toBeDefined()
    expect(solveSpan!.attributes['swarm.task']).toBe('streaming task')
  })

  it('responds to events and creates child spans', async () => {
    const mock = createMockOrchestrator()
    const instrumented = instrumentSwarm(mock, { agentCount: 1, maxRounds: 5 })

    // Simulate events during solve
    const solvePromise = instrumented.solve('task')

    // Events are fired synchronously by the real orchestrator
    // For the mock, we fire them before await resolves
    mock.emit('round:start', { round: 1 })
    mock.emit('agent:reacted', {
      agentId: 'agent-1',
      inResponseTo: 'sig-1',
      signals: [],
      strategyUsed: 'analyze',
      processingTimeMs: 30,
    })
    mock.emit('round:end', { round: 1, signalCount: 2 })

    await solvePromise

    const spans = exporter.getFinishedSpans()
    expect(spans.some((s) => s.name === 'cognitive-swarm.round')).toBe(true)
    expect(spans.some((s) => s.name === 'cognitive-swarm.agent.on-signal')).toBe(true)
    expect(spans.some((s) => s.name === 'cognitive-swarm.solve')).toBe(true)
  })

  it('dispose() removes event subscriptions', async () => {
    const mock = createMockOrchestrator()
    const instrumented = instrumentSwarm(mock, { agentCount: 1, maxRounds: 5 })

    instrumented.dispose()

    // Events after dispose should not create spans
    mock.emit('round:start', { round: 1 })
    mock.emit('round:end', { round: 1, signalCount: 0 })

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(0)
  })

  it('destroy() disposes and destroys the orchestrator', async () => {
    const mock = createMockOrchestrator()
    const instrumented = instrumentSwarm(mock)

    let destroyed = false
    mock.destroy = () => { destroyed = true }

    instrumented.destroy()
    expect(destroyed).toBe(true)
  })

  it('cleans up spans on solve() error', async () => {
    const mock = createMockOrchestrator()
    mock.solve = async () => { throw new Error('boom') }

    const instrumented = instrumentSwarm(mock)

    await expect(instrumented.solve('task')).rejects.toThrow('boom')

    // Solve span should be ended (via cleanup)
    const spans = exporter.getFinishedSpans()
    const solveSpan = spans.find((s) => s.name === 'cognitive-swarm.solve')
    expect(solveSpan).toBeDefined()
  })
})
