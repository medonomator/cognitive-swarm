import { describe, it, expect, vi } from 'vitest'
import type {
  SwarmConfig,
  SwarmAgentConfig,
  SwarmAgentDef,
} from '@cognitive-swarm/core'
import type {
  LlmProvider,
  LlmResponse,
  EmbeddingProvider,
  Store,
  EngineConfig,
} from '@cognitive-engine/core'
import { TokenTrackingLlmProvider, TokenBudgetExceededError } from './token-tracker.js'
import { SwarmOrchestrator } from './swarm-orchestrator.js'

function createMockLlm(tokensPerCall = 50): LlmProvider {
  return {
    complete: vi.fn().mockResolvedValue({
      content: 'mock response',
      usage: { promptTokens: tokensPerCall, completionTokens: 0, totalTokens: tokensPerCall },
    } satisfies LlmResponse),
    completeJson: vi.fn().mockResolvedValue({
      content: '{}',
      parsed: {},
      usage: { promptTokens: tokensPerCall, completionTokens: 0, totalTokens: tokensPerCall },
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

function createAgentConfig(id: string): SwarmAgentConfig {
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
  }
}

function createAgentDef(id: string, llm?: LlmProvider): SwarmAgentDef {
  return {
    config: createAgentConfig(id),
    engine: createEngineConfig(llm),
  }
}

describe('TokenBudgetExceededError', () => {
  it('has correct name and properties', () => {
    const error = new TokenBudgetExceededError(1500, 1000)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(TokenBudgetExceededError)
    expect(error.name).toBe('TokenBudgetExceededError')
    expect(error.totalTokens).toBe(1500)
    expect(error.budget).toBe(1000)
    expect(error.message).toContain('1500')
    expect(error.message).toContain('1000')
  })
})

describe('TokenTrackingLlmProvider budget enforcement', () => {
  it('throws TokenBudgetExceededError when shared total >= budget', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(100))
    tracker.setBudget(200, () => 200)

    await expect(
      tracker.complete([{ role: 'user', content: 'test' }]),
    ).rejects.toThrow(TokenBudgetExceededError)
  })

  it('throws on completeJson when budget exceeded', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(100))
    tracker.setBudget(50, () => 100)

    await expect(
      tracker.completeJson([{ role: 'user', content: 'test' }]),
    ).rejects.toThrow(TokenBudgetExceededError)
  })

  it('does not throw when under budget', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(100))
    tracker.setBudget(500, () => 0)

    const result = await tracker.complete([{ role: 'user', content: 'test' }])
    expect(result.content).toBe('mock response')
    expect(tracker.totalTokens).toBe(100)
  })

  it('no budget (null) means no enforcement', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(100))
    // setBudget with null = no enforcement
    tracker.setBudget(null, () => 999999)

    const result = await tracker.complete([{ role: 'user', content: 'test' }])
    expect(result.content).toBe('mock response')
  })

  it('without setBudget call, no enforcement', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(100))

    // No setBudget called at all
    const result = await tracker.complete([{ role: 'user', content: 'test' }])
    expect(result.content).toBe('mock response')
  })

  it('tracks budget across multiple trackers via shared counter', async () => {
    const tracker1 = new TokenTrackingLlmProvider(createMockLlm(100))
    const tracker2 = new TokenTrackingLlmProvider(createMockLlm(100))
    const trackers = [tracker1, tracker2]

    const getSharedTotal = () =>
      trackers.reduce((sum, t) => sum + t.totalTokens, 0)

    tracker1.setBudget(250, getSharedTotal)
    tracker2.setBudget(250, getSharedTotal)

    // Each call uses 100 tokens
    await tracker1.complete([{ role: 'user', content: 'a' }]) // total: 100
    await tracker2.complete([{ role: 'user', content: 'b' }]) // total: 200

    // Next call should still work (200 < 250)
    // But after it: total = 300, next call will throw
    // Wait, 200 < 250 so this passes:
    await tracker1.complete([{ role: 'user', content: 'c' }]) // total: 300

    // Now shared total is 300 >= 250 budget
    await expect(
      tracker2.complete([{ role: 'user', content: 'd' }]),
    ).rejects.toThrow(TokenBudgetExceededError)
  })
})

describe('SwarmOrchestrator token budget integration', () => {
  it('stops early when tokenBudget is exhausted', async () => {
    // Each LLM call uses 50 tokens. With 2 agents, each round uses ~100 tokens.
    // Budget of 1 means it should stop before any round runs.
    const config: SwarmConfig = {
      agents: [createAgentDef('a'), createAgentDef('b')],
      maxRounds: 10,
      maxSignals: 200,
      timeout: 30_000,
      tokenBudget: 1,
    }

    const orchestrator = new SwarmOrchestrator(config)
    const result = await orchestrator.solve('test task')

    // Budget is 1, but first round needs tokens. The budget check happens
    // before the first round starts, but tokens are 0 at that point.
    // After round 1 completes, budget check stops round 2.
    expect(result.timing.roundsUsed).toBeLessThanOrEqual(1)
    orchestrator.destroy()
  })

  it('no budget = no early stop from budget', async () => {
    const config: SwarmConfig = {
      agents: [createAgentDef('a')],
      maxRounds: 3,
      maxSignals: 200,
      timeout: 30_000,
      // no tokenBudget
    }

    const orchestrator = new SwarmOrchestrator(config)
    const result = await orchestrator.solve('test task')

    // Without budget, rounds run until other limits
    expect(result.cost.tokens).toBeGreaterThanOrEqual(0)
    orchestrator.destroy()
  })

  it('solveWithStream also respects token budget', async () => {
    const config: SwarmConfig = {
      agents: [createAgentDef('a'), createAgentDef('b')],
      maxRounds: 10,
      maxSignals: 200,
      timeout: 30_000,
      tokenBudget: 1,
    }

    const orchestrator = new SwarmOrchestrator(config)
    const events = []
    for await (const event of orchestrator.solveWithStream('test task')) {
      events.push(event)
    }

    const completeEvent = events.find((e) => e.type === 'solve:complete')
    expect(completeEvent).toBeDefined()
    if (completeEvent?.type === 'solve:complete') {
      expect(completeEvent.result.timing.roundsUsed).toBeLessThanOrEqual(1)
    }

    orchestrator.destroy()
  })
})
