import { describe, it, expect, vi } from 'vitest'
import type { LlmProvider, LlmMessage, LlmResponse } from '@cognitive-engine/core'
import { TokenTrackingLlmProvider } from './token-tracker.js'

function createMockLlm(tokensPerCall: number): LlmProvider {
  return {
    complete: vi.fn().mockResolvedValue({
      content: 'response',
      usage: { promptTokens: tokensPerCall, completionTokens: 0, totalTokens: tokensPerCall },
    }),
    completeJson: vi.fn().mockResolvedValue({
      content: '{}',
      parsed: {},
      usage: { promptTokens: tokensPerCall, completionTokens: 0, totalTokens: tokensPerCall },
    }),
  }
}

describe('TokenTrackingLlmProvider', () => {
  it('starts with zero tokens', () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(10))
    expect(tracker.totalTokens).toBe(0)
  })

  it('accumulates tokens from complete()', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(100))

    await tracker.complete([{ role: 'user', content: 'hello' }])
    expect(tracker.totalTokens).toBe(100)

    await tracker.complete([{ role: 'user', content: 'world' }])
    expect(tracker.totalTokens).toBe(200)
  })

  it('accumulates tokens from completeJson()', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(50))

    await tracker.completeJson([{ role: 'user', content: 'json' }])
    expect(tracker.totalTokens).toBe(50)
  })

  it('accumulates tokens across both methods', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(30))

    await tracker.complete([{ role: 'user', content: 'a' }])
    await tracker.completeJson([{ role: 'user', content: 'b' }])
    expect(tracker.totalTokens).toBe(60)
  })

  it('passes through the response unchanged', async () => {
    const inner = createMockLlm(10)
    const tracker = new TokenTrackingLlmProvider(inner)

    const result = await tracker.complete([{ role: 'user', content: 'x' }])
    expect(result.content).toBe('response')
    expect(result.usage.totalTokens).toBe(10)
  })

  it('passes through parsed JSON response', async () => {
    const inner = createMockLlm(10)
    const tracker = new TokenTrackingLlmProvider(inner)

    const result = await tracker.completeJson<Record<string, unknown>>(
      [{ role: 'user', content: 'x' }],
    )
    expect(result.parsed).toEqual({})
  })

  it('forwards options to inner provider', async () => {
    const inner = createMockLlm(10)
    const tracker = new TokenTrackingLlmProvider(inner)
    const opts = { temperature: 0.5 }

    await tracker.complete([{ role: 'user', content: 'x' }], opts)
    expect(inner.complete).toHaveBeenCalledWith(
      [{ role: 'user', content: 'x' }],
      opts,
    )
  })

  it('resets token count', async () => {
    const tracker = new TokenTrackingLlmProvider(createMockLlm(100))

    await tracker.complete([{ role: 'user', content: 'x' }])
    expect(tracker.totalTokens).toBe(100)

    tracker.reset()
    expect(tracker.totalTokens).toBe(0)
  })
})
