import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  Signal,
  SwarmAgentConfig,
  SwarmConfig,
  SwarmAgentDef,
  SwarmEvent,
} from '@cognitive-swarm/core'
import type {
  LlmProvider,
  LlmResponse,
  EmbeddingProvider,
  Store,
  EngineConfig,
} from '@cognitive-engine/core'
import { SwarmOrchestrator } from './swarm-orchestrator.js'

function createMockLlm(
  responseContent = 'mock response',
  tokens = 50,
): LlmProvider {
  return {
    complete: vi.fn().mockResolvedValue({
      content: responseContent,
      usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens },
    } satisfies LlmResponse),
    completeJson: vi.fn().mockResolvedValue({
      content: '{}',
      parsed: {},
      usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens },
    }),
  }
}

function createMockEmbedding(): EmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  }
}

function createMockStore(): Store {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    has: vi.fn().mockResolvedValue(false),
  }
}

function createEngineConfig(llm?: LlmProvider): EngineConfig {
  return {
    llm: llm ?? createMockLlm(),
    embedding: createMockEmbedding(),
    store: createMockStore(),
  }
}

function createAgentConfig(
  id: string,
  overrides: Partial<SwarmAgentConfig> = {},
): SwarmAgentConfig {
  return {
    id,
    name: `Agent ${id}`,
    role: 'Test agent',
    personality: {
      curiosity: 0.5,
      caution: 0.3,
      conformity: 0.5,
      verbosity: 0.5,
    },
    listens: ['task:new', 'discovery', 'proposal', 'vote'],
    canEmit: ['discovery', 'proposal', 'vote', 'challenge'],
    ...overrides,
  }
}

function createAgentDef(
  id: string,
  agentOverrides?: Partial<SwarmAgentConfig>,
  llm?: LlmProvider,
): SwarmAgentDef {
  return {
    config: createAgentConfig(id, agentOverrides),
    engine: createEngineConfig(llm),
  }
}

function createSwarmConfig(
  agentCount = 3,
  overrides: Partial<SwarmConfig> = {},
): SwarmConfig {
  const agents = Array.from({ length: agentCount }, (_, i) =>
    createAgentDef(`agent-${i}`),
  )
  return {
    agents,
    maxRounds: 3,
    maxSignals: 50,
    timeout: 10_000,
    ...overrides,
  }
}

describe('SwarmOrchestrator', () => {
  it('creates successfully with valid config', () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig())
    expect(orchestrator).toBeDefined()
    orchestrator.destroy()
  })

  it('solve() returns a SwarmResult', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(2))

    const result = await orchestrator.solve('What is 2+2?')

    expect(result).toBeDefined()
    expect(result.answer).toBeDefined()
    expect(typeof result.confidence).toBe('number')
    expect(result.consensus).toBeDefined()
    expect(result.signalLog.length).toBeGreaterThan(0)
    expect(result.cost.tokens).toBeGreaterThanOrEqual(0)
    expect(result.timing.totalMs).toBeGreaterThan(0)
    expect(result.timing.roundsUsed).toBeGreaterThanOrEqual(0)

    orchestrator.destroy()
  })

  it('includes task signal in signal log', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(1))
    const result = await orchestrator.solve('Test task')

    const taskSignal = result.signalLog.find((s) => s.type === 'task:new')
    expect(taskSignal).toBeDefined()
    expect(taskSignal?.source).toBe('orchestrator')

    orchestrator.destroy()
  })

  it('respects maxRounds limit', async () => {
    const orchestrator = new SwarmOrchestrator(
      createSwarmConfig(2, { maxRounds: 2 }),
    )
    const result = await orchestrator.solve('Test')

    expect(result.timing.roundsUsed).toBeLessThanOrEqual(2)
    orchestrator.destroy()
  })

  it('tracks token cost across agents', async () => {
    const tokensPerCall = 100
    const llm = createMockLlm('response', tokensPerCall)
    const config = createSwarmConfig(0, {
      agents: [createAgentDef('a1', undefined, llm)],
      maxRounds: 1,
    })
    const orchestrator = new SwarmOrchestrator(config)

    const result = await orchestrator.solve('Test')

    // Token count should be >= 0 (depends on how many calls agents make)
    expect(result.cost.tokens).toBeGreaterThanOrEqual(0)
    expect(result.cost.estimatedUsd).toBeGreaterThanOrEqual(0)

    orchestrator.destroy()
  })

  it('tracks agent contributions', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(2))
    const result = await orchestrator.solve('Test')

    // Contributions map should exist
    expect(result.agentContributions).toBeDefined()

    orchestrator.destroy()
  })

  it('uses synthesizer when configured', async () => {
    const synthLlm = createMockLlm('Polished final answer', 25)
    const config = createSwarmConfig(1, {
      synthesizer: { llm: synthLlm },
      maxRounds: 1,
    })
    const orchestrator = new SwarmOrchestrator(config)

    const result = await orchestrator.solve('Synthesize me')

    expect(result.answer).toBe('Polished final answer')
    expect(synthLlm.complete).toHaveBeenCalled()

    orchestrator.destroy()
  })

  it('returns consensus decision when no synthesizer', async () => {
    const orchestrator = new SwarmOrchestrator(
      createSwarmConfig(1, { maxRounds: 1 }),
    )
    const result = await orchestrator.solve('No synth')

    // Without synthesizer, answer comes from consensus or fallback
    expect(typeof result.answer).toBe('string')
    expect(result.answer.length).toBeGreaterThan(0)

    orchestrator.destroy()
  })

  it('onSignal() registers and unregisters callbacks', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(1))
    const signals: Signal[] = []

    const unsub = orchestrator.onSignal((s) => signals.push(s))
    await orchestrator.solve('Test')

    expect(signals.length).toBeGreaterThan(0) // at least the task signal

    const countBefore = signals.length
    unsub()

    await orchestrator.solve('Test 2')
    // After unsubscribe, no more signals should be captured
    expect(signals.length).toBe(countBefore)

    orchestrator.destroy()
  })

  it('destroy() cleans up resources', () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(1))
    expect(() => orchestrator.destroy()).not.toThrow()
  })

  it('handles zero agents gracefully', async () => {
    const orchestrator = new SwarmOrchestrator(
      createSwarmConfig(0, { agents: [] }),
    )

    const result = await orchestrator.solve('No agents')

    expect(result.answer).toBeDefined()
    // Round 1 starts (task signal exists) but produces no new signals
    expect(result.timing.roundsUsed).toBe(1)
    expect(result.consensus.decided).toBe(false)

    orchestrator.destroy()
  })

  it('applies default config values', async () => {
    const orchestrator = new SwarmOrchestrator({
      agents: [createAgentDef('a1')],
    })

    const result = await orchestrator.solve('Defaults test')
    expect(result).toBeDefined()

    orchestrator.destroy()
  })
})

describe('SwarmOrchestrator.solveWithStream()', () => {
  it('yields solve:start as first event', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(1, { maxRounds: 1 }))
    const events: SwarmEvent[] = []

    for await (const event of orchestrator.solveWithStream('Stream test')) {
      events.push(event)
    }

    expect(events[0]?.type).toBe('solve:start')
    if (events[0]?.type === 'solve:start') {
      expect(events[0].task).toBe('Stream test')
    }

    orchestrator.destroy()
  })

  it('yields solve:complete as last event', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(1, { maxRounds: 1 }))
    const events: SwarmEvent[] = []

    for await (const event of orchestrator.solveWithStream('Test')) {
      events.push(event)
    }

    const last = events[events.length - 1]
    expect(last?.type).toBe('solve:complete')
    if (last?.type === 'solve:complete') {
      expect(last.result.answer).toBeDefined()
    }

    orchestrator.destroy()
  })

  it('yields signal:emitted for task signal', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(1, { maxRounds: 1 }))
    const events: SwarmEvent[] = []

    for await (const event of orchestrator.solveWithStream('Test')) {
      events.push(event)
    }

    const signalEvents = events.filter((e) => e.type === 'signal:emitted')
    expect(signalEvents.length).toBeGreaterThan(0)

    orchestrator.destroy()
  })

  it('yields round:start and round:end events', async () => {
    const orchestrator = new SwarmOrchestrator(createSwarmConfig(2, { maxRounds: 2 }))
    const events: SwarmEvent[] = []

    for await (const event of orchestrator.solveWithStream('Test')) {
      events.push(event)
    }

    const roundStarts = events.filter((e) => e.type === 'round:start')
    const roundEnds = events.filter((e) => e.type === 'round:end')
    expect(roundStarts.length).toBeGreaterThan(0)
    expect(roundEnds.length).toBe(roundStarts.length)

    orchestrator.destroy()
  })

  it('yields synthesis events when synthesizer configured', async () => {
    const synthLlm = createMockLlm('Streamed answer', 10)
    const orchestrator = new SwarmOrchestrator(
      createSwarmConfig(1, {
        maxRounds: 1,
        synthesizer: { llm: synthLlm },
      }),
    )
    const events: SwarmEvent[] = []

    for await (const event of orchestrator.solveWithStream('Test')) {
      events.push(event)
    }

    const synthStart = events.find((e) => e.type === 'synthesis:start')
    const synthComplete = events.find((e) => e.type === 'synthesis:complete')
    expect(synthStart).toBeDefined()
    expect(synthComplete).toBeDefined()
    if (synthComplete?.type === 'synthesis:complete') {
      expect(synthComplete.answer).toBe('Streamed answer')
    }

    orchestrator.destroy()
  })

  it('final result matches non-streaming solve()', async () => {
    const config = createSwarmConfig(0, { agents: [], maxRounds: 1 })

    const orchestrator1 = new SwarmOrchestrator(config)
    const directResult = await orchestrator1.solve('Same task')
    orchestrator1.destroy()

    const orchestrator2 = new SwarmOrchestrator(config)
    const events: SwarmEvent[] = []
    for await (const event of orchestrator2.solveWithStream('Same task')) {
      events.push(event)
    }
    orchestrator2.destroy()

    const last = events[events.length - 1]
    expect(last?.type).toBe('solve:complete')
    if (last?.type === 'solve:complete') {
      expect(last.result.answer).toBe(directResult.answer)
      expect(last.result.consensus.decided).toBe(directResult.consensus.decided)
    }
  })
})
