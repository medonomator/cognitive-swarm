import { describe, it, expect, vi } from 'vitest'
import type { LlmProvider } from '@cognitive-engine/core'
import type { Signal, ConsensusResult } from '@cognitive-swarm/core'
import { Synthesizer } from './synthesizer.js'

function createMockLlm(response = 'Synthesized answer'): LlmProvider {
  return {
    complete: vi.fn().mockResolvedValue({
      content: response,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    completeJson: vi.fn(),
  }
}

function makeConsensus(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  return {
    decided: true,
    decision: 'Use approach A',
    proposalId: 'p1',
    confidence: 0.85,
    votingRecord: [],
    dissent: [],
    reasoning: 'Majority agreed',
    resolvedConflicts: [],
    durationMs: 100,
    ...overrides,
  }
}

function makeDiscovery(source: string, finding: string): Signal {
  return {
    id: `sig-${Math.random()}`,
    type: 'discovery',
    source,
    payload: { finding, relevance: 0.8 },
    confidence: 0.9,
    timestamp: Date.now(),
  } as Signal
}

function makeProposal(source: string, content: string): Signal {
  return {
    id: `sig-${Math.random()}`,
    type: 'proposal',
    source,
    payload: { proposalId: 'p1', content, reasoning: 'test' },
    confidence: 0.85,
    timestamp: Date.now(),
  } as Signal
}

describe('Synthesizer', () => {
  it('produces a synthesized answer', async () => {
    const llm = createMockLlm('Final answer')
    const synth = new Synthesizer(llm)

    const result = await synth.synthesize(
      'What is best?',
      makeConsensus(),
      [makeDiscovery('agent-1', 'Found X')],
      [makeProposal('agent-2', 'Do Y')],
    )

    expect(result).toBe('Final answer')
  })

  it('sends system and user messages to LLM', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm)

    await synth.synthesize(
      'Solve this',
      makeConsensus(),
      [],
      [],
    )

    expect(llm.complete).toHaveBeenCalledTimes(1)
    const call = vi.mocked(llm.complete).mock.calls[0]!
    const messages = call[0]

    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.role).toBe('user')
    expect(messages[1]?.content).toContain('Solve this')
  })

  it('includes winning decision in prompt', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm)

    await synth.synthesize(
      'task',
      makeConsensus({ decision: 'Use Redis' }),
      [],
      [],
    )

    const userMessage = vi.mocked(llm.complete).mock.calls[0]![0][1]?.content
    expect(userMessage).toContain('Use Redis')
  })

  it('includes discoveries in prompt', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm)

    await synth.synthesize(
      'task',
      makeConsensus(),
      [makeDiscovery('analyst', 'Memory leak detected')],
      [],
    )

    const userMessage = vi.mocked(llm.complete).mock.calls[0]![0][1]?.content
    expect(userMessage).toContain('Memory leak detected')
    expect(userMessage).toContain('analyst')
  })

  it('includes proposals in prompt', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm)

    await synth.synthesize(
      'task',
      makeConsensus(),
      [],
      [makeProposal('architect', 'Refactor the module')],
    )

    const userMessage = vi.mocked(llm.complete).mock.calls[0]![0][1]?.content
    expect(userMessage).toContain('Refactor the module')
    expect(userMessage).toContain('architect')
  })

  it('includes dissenting views', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm)

    await synth.synthesize(
      'task',
      makeConsensus({ dissent: ['Performance concern', 'Security risk'] }),
      [],
      [],
    )

    const userMessage = vi.mocked(llm.complete).mock.calls[0]![0][1]?.content
    expect(userMessage).toContain('Performance concern')
    expect(userMessage).toContain('Security risk')
  })

  it('uses custom system prompt', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm, 'You are a code reviewer.')

    await synth.synthesize('task', makeConsensus(), [], [])

    const systemMessage = vi.mocked(llm.complete).mock.calls[0]![0][0]?.content
    expect(systemMessage).toBe('You are a code reviewer.')
  })

  it('handles no decision gracefully', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm)

    await synth.synthesize(
      'task',
      makeConsensus({ decided: false, decision: undefined }),
      [],
      [],
    )

    const userMessage = vi.mocked(llm.complete).mock.calls[0]![0][1]?.content
    expect(userMessage).toContain('No decision reached')
  })

  it('limits discoveries to 20', async () => {
    const llm = createMockLlm()
    const synth = new Synthesizer(llm)

    const discoveries = Array.from({ length: 30 }, (_, i) =>
      makeDiscovery(`agent-${i}`, `Finding ${i}`),
    )

    await synth.synthesize('task', makeConsensus(), discoveries, [])

    const userMessage = vi.mocked(llm.complete).mock.calls[0]![0][1]?.content
    expect(userMessage).toContain('Finding 19')
    expect(userMessage).not.toContain('Finding 20')
  })
})
