import { describe, it, expect, vi } from 'vitest'
import type {
  Signal,
  SwarmAgentConfig,
  PersonalityVector,
} from '@cognitive-swarm/core'
import type { CognitiveResponse } from '@cognitive-engine/core'
import { SwarmAgent } from './swarm-agent.js'

const BALANCED: PersonalityVector = {
  curiosity: 0.5,
  caution: 0.3,
  conformity: 0.5,
  verbosity: 0.5,
}

function makeSignal(
  overrides: Partial<Signal> = {},
): Signal {
  return {
    id: 'sig-1',
    type: 'discovery',
    source: 'other-agent',
    payload: { finding: 'test finding', relevance: 0.7 },
    confidence: 0.8,
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeCognitiveResponse(
  overrides: Partial<CognitiveResponse> = {},
): CognitiveResponse {
  return {
    percept: {
      rawText: 'test',
      emotionalTone: 'neutral',
      urgency: 0.3,
      requestType: 'question',
      responseMode: 'informing',
      entities: [],
      implicitNeeds: [],
      conversationPhase: 'exploration',
      confidence: 0.8,
      analysisMethod: 'quick',
    },
    reasoning: {
      intentions: [],
      newBeliefs: [],
      hypotheses: [],
      questionsToAsk: [],
      suggestedActions: [],
      confidence: 0.8,
    },
    suggestedResponse: 'Test response from orchestrator',
    systemPrompt: 'You are a test agent',
    ...overrides,
  }
}

function mockOrchestrator(response?: CognitiveResponse) {
  return {
    process: vi.fn().mockResolvedValue(
      response ?? makeCognitiveResponse(),
    ),
  }
}

function mockBandit(strategyId = 'analyze') {
  return {
    select: vi.fn().mockResolvedValue({
      actionId: strategyId,
      expectedReward: 0.5,
      wasExploration: false,
    }),
    update: vi.fn().mockResolvedValue(undefined),
  }
}

function makeConfig(
  overrides: Partial<SwarmAgentConfig> = {},
): SwarmAgentConfig {
  return {
    id: 'agent-test',
    name: 'Test Agent',
    role: 'General purpose test agent',
    personality: BALANCED,
    listens: [
      'task:new',
      'discovery',
      'proposal',
      'doubt',
      'challenge',
    ],
    canEmit: ['discovery', 'proposal', 'challenge', 'doubt', 'vote'],
    ...overrides,
  }
}

describe('SwarmAgent', () => {
  it('exposes config properties', () => {
    const orch = mockOrchestrator()
    const bandit = mockBandit()
    const agent = new SwarmAgent(
      orch as never,
      bandit as never,
      makeConfig(),
    )

    expect(agent.id).toBe('agent-test')
    expect(agent.name).toBe('Test Agent')
    expect(agent.role).toBe('General purpose test agent')
    expect(agent.weight).toBe(1)
  })

  describe('shouldReact', () => {
    it('rejects signals from self', () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit() as never,
        makeConfig(),
      )
      const signal = makeSignal({ source: 'agent-test' })
      expect(agent.shouldReact(signal)).toBe(false)
    })

    it('rejects signal types not in listens', () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit() as never,
        makeConfig({ listens: ['proposal'] }),
      )
      const signal = makeSignal({ type: 'discovery' })
      expect(agent.shouldReact(signal)).toBe(false)
    })

    it('accepts valid signal types', () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit() as never,
        makeConfig(),
      )
      const signal = makeSignal({
        type: 'discovery',
        source: 'other',
      })
      expect(agent.shouldReact(signal)).toBe(true)
    })

    it('respects concurrency limit', () => {
      const orch = mockOrchestrator()
      // Make process never resolve to keep activeTasks at 1
      orch.process = vi.fn(
        () => new Promise<CognitiveResponse>(() => {}),
      )

      const agent = new SwarmAgent(
        orch as never,
        mockBandit() as never,
        makeConfig({ maxConcurrentSignals: 1 }),
      )

      // Start processing (won't resolve)
      void agent.onSignal(makeSignal({ id: 's1', source: 'other' }))

      // Now should reject because at capacity
      const signal = makeSignal({ id: 's2', source: 'other' })
      expect(agent.shouldReact(signal)).toBe(false)
    })
  })

  describe('onSignal', () => {
    it('returns agent reaction with produced signals', async () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit('analyze') as never,
        makeConfig(),
      )

      const reaction = await agent.onSignal(makeSignal())

      expect(reaction.agentId).toBe('agent-test')
      expect(reaction.inResponseTo).toBe('sig-1')
      expect(reaction.strategyUsed).toBe('analyze')
      expect(reaction.processingTimeMs).toBeGreaterThanOrEqual(0)
      expect(reaction.signals.length).toBeGreaterThanOrEqual(0)
    })

    it('produces discovery signals for analyze strategy', async () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit('analyze') as never,
        makeConfig(),
      )

      const reaction = await agent.onSignal(makeSignal())

      expect(reaction.signals).toHaveLength(1)
      expect(reaction.signals[0]?.type).toBe('discovery')
      expect(reaction.signals[0]?.source).toBe('agent-test')
      expect(reaction.signals[0]?.replyTo).toBe('sig-1')
    })

    it('produces proposal signals for propose strategy', async () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit('propose') as never,
        makeConfig(),
      )

      const reaction = await agent.onSignal(makeSignal())

      expect(reaction.signals).toHaveLength(1)
      expect(reaction.signals[0]?.type).toBe('proposal')
    })

    it('produces no signals for defer strategy', async () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit('defer') as never,
        makeConfig(),
      )

      const reaction = await agent.onSignal(makeSignal())

      expect(reaction.signals).toHaveLength(0)
      expect(reaction.strategyUsed).toBe('defer')
    })

    it('falls back to allowed output type when canEmit blocks strategy', async () => {
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        mockBandit('challenge') as never,
        makeConfig({ canEmit: ['vote'] }), // can't emit challenge/doubt
      )

      const reaction = await agent.onSignal(makeSignal())

      // challenge strategy wants to emit challenge/doubt,
      // but agent can only emit vote -> falls back to vote
      expect(reaction.signals).toHaveLength(1)
      expect(reaction.signals[0]!.type).toBe('vote')
    })

    it('handles orchestrator errors gracefully', async () => {
      const orch = mockOrchestrator()
      orch.process = vi.fn().mockRejectedValue(new Error('LLM down'))
      const onError = vi.fn()

      const agent = new SwarmAgent(
        orch as never,
        mockBandit() as never,
        makeConfig({ onError }),
      )

      const reaction = await agent.onSignal(makeSignal())

      expect(reaction.signals).toHaveLength(0)
      expect(reaction.strategyUsed).toBe('defer')
      expect(onError).toHaveBeenCalled()
    })

    it('passes context to bandit select', async () => {
      const bandit = mockBandit()
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        bandit as never,
        makeConfig(),
      )

      await agent.onSignal(makeSignal())

      expect(bandit.select).toHaveBeenCalledOnce()
      const context = bandit.select.mock.calls[0]?.[0]
      // context = [confidence, curiosity, caution, conformity,
      //            verbosity, ...11 one-hot signal type]
      expect(context).toHaveLength(16) // 5 features + 11 signal types
    })

    it('builds prompt with agent role', async () => {
      const orch = mockOrchestrator()
      const agent = new SwarmAgent(
        orch as never,
        mockBandit() as never,
        makeConfig({ role: 'Security expert' }),
      )

      await agent.onSignal(makeSignal())

      const prompt = orch.process.mock.calls[0]?.[1]
      expect(prompt).toContain('Security expert')
    })
  })

  describe('recordFeedback', () => {
    it('delegates to bandit update', async () => {
      const bandit = mockBandit()
      const agent = new SwarmAgent(
        mockOrchestrator() as never,
        bandit as never,
        makeConfig(),
      )

      await agent.recordFeedback('analyze', [1, 0, 0], 0.9)

      expect(bandit.update).toHaveBeenCalledWith(
        'analyze',
        [1, 0, 0],
        0.9,
      )
    })
  })
})
