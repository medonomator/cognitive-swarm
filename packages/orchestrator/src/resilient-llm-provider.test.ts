import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LlmProvider, LlmMessage, LlmResponse } from '@cognitive-engine/core'
import type { ResolvedRetryConfig } from '@cognitive-swarm/core'
import { ResilientLlmProvider, CircuitOpenError } from './resilient-llm-provider.js'

const DEFAULT_CONFIG: ResolvedRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  circuitBreakerThreshold: 3,
}

function okResponse(content = 'ok'): LlmResponse {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  }
}

function createMockLlm(impl?: Partial<LlmProvider>): LlmProvider {
  return {
    complete: impl?.complete ?? vi.fn().mockResolvedValue(okResponse()),
    completeJson:
      impl?.completeJson ??
      vi.fn().mockResolvedValue({ ...okResponse('{}'), parsed: {} }),
  }
}

describe('ResilientLlmProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes through on first success', async () => {
    const inner = createMockLlm()
    const provider = new ResilientLlmProvider(inner, DEFAULT_CONFIG)

    const result = await provider.complete([{ role: 'user', content: 'hi' }])
    expect(result.content).toBe('ok')
    expect(inner.complete).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and succeeds', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce(okResponse('recovered'))

    const provider = new ResilientLlmProvider(
      createMockLlm({ complete }),
      DEFAULT_CONFIG,
    )

    const promise = provider.complete([{ role: 'user', content: 'hi' }])
    // Advance past retry delays
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(result.content).toBe('recovered')
    expect(complete).toHaveBeenCalledTimes(3)
  })

  it('respects maxRetries limit', async () => {
    vi.useRealTimers()

    const complete = vi.fn().mockImplementation(() =>
      Promise.reject(new Error('always fails')),
    )
    const provider = new ResilientLlmProvider(
      createMockLlm({ complete }),
      { ...DEFAULT_CONFIG, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5, circuitBreakerThreshold: 10 },
    )

    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('always fails')
    // 1 initial + 2 retries = 3
    expect(complete).toHaveBeenCalledTimes(3)
  })

  it('applies exponential backoff with jitter', async () => {
    // Use real timers for this test — we need to capture actual delay values
    vi.useRealTimers()

    const delays: number[] = []
    const origSetTimeout = globalThis.setTimeout.bind(globalThis)
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms && ms > 0) delays.push(ms)
      // Execute callback immediately so the test doesn't wait
      return origSetTimeout(fn, 0)
    })

    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(okResponse())

    const provider = new ResilientLlmProvider(
      createMockLlm({ complete }),
      { ...DEFAULT_CONFIG, baseDelayMs: 100, maxDelayMs: 10000, circuitBreakerThreshold: 10 },
    )

    await provider.complete([{ role: 'user', content: 'hi' }])

    // Attempt 0 delay: 100 * 2^0 = 100 ± 20% → [80, 120]
    expect(delays[0]).toBeGreaterThanOrEqual(80)
    expect(delays[0]).toBeLessThanOrEqual(120)

    // Attempt 1 delay: 100 * 2^1 = 200 ± 20% → [160, 240]
    expect(delays[1]).toBeGreaterThanOrEqual(160)
    expect(delays[1]).toBeLessThanOrEqual(240)

    vi.restoreAllMocks()
  })

  it('opens circuit after threshold consecutive failures', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('down'))
    const provider = new ResilientLlmProvider(
      createMockLlm({ complete }),
      { ...DEFAULT_CONFIG, maxRetries: 0, circuitBreakerThreshold: 3 },
    )

    // Burn through 3 failures to trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        provider.complete([{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('down')
    }

    expect(provider._state).toBe('open')

    // Next call should throw CircuitOpenError immediately
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(CircuitOpenError)
  })

  it('allows half-open probe after cooldown', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('down'))
    const provider = new ResilientLlmProvider(
      createMockLlm({ complete }),
      { ...DEFAULT_CONFIG, maxRetries: 0, circuitBreakerThreshold: 2 },
    )

    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      await expect(
        provider.complete([{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('down')
    }
    expect(provider._state).toBe('open')

    // Advance past 30s cooldown
    vi.advanceTimersByTime(31_000)

    // Now allow probe — succeeds this time
    complete.mockResolvedValueOnce(okResponse('back'))
    const result = await provider.complete([{ role: 'user', content: 'hi' }])
    expect(result.content).toBe('back')
    expect(provider._state).toBe('closed')
  })

  it('reopens circuit if half-open probe fails', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('still down'))
    const provider = new ResilientLlmProvider(
      createMockLlm({ complete }),
      { ...DEFAULT_CONFIG, maxRetries: 0, circuitBreakerThreshold: 2 },
    )

    // Trip
    for (let i = 0; i < 2; i++) {
      await expect(
        provider.complete([{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow()
    }

    vi.advanceTimersByTime(31_000)

    // Probe fails → circuit reopens
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('still down')
    expect(provider._state).toBe('open')
  })

  it('successful call resets failure counter', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('fluke'))
      .mockResolvedValueOnce(okResponse())
      // After success, failures should start from zero
      .mockRejectedValueOnce(new Error('fluke2'))
      .mockResolvedValueOnce(okResponse())

    const provider = new ResilientLlmProvider(
      createMockLlm({ complete }),
      { ...DEFAULT_CONFIG, circuitBreakerThreshold: 3 },
    )

    const p1 = provider.complete([{ role: 'user', content: '1' }])
    await vi.advanceTimersByTimeAsync(5000)
    await p1

    const p2 = provider.complete([{ role: 'user', content: '2' }])
    await vi.advanceTimersByTimeAsync(5000)
    await p2

    // Circuit should still be closed — failures never accumulated
    expect(provider._state).toBe('closed')
  })

  it('completeJson also retries', async () => {
    const completeJson = vi
      .fn()
      .mockRejectedValueOnce(new Error('json fail'))
      .mockResolvedValueOnce({ ...okResponse('{"a":1}'), parsed: { a: 1 } })

    const provider = new ResilientLlmProvider(
      createMockLlm({ completeJson }),
      DEFAULT_CONFIG,
    )

    const promise = provider.completeJson<{ a: number }>(
      [{ role: 'user', content: 'json' }],
    )
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(result.parsed).toEqual({ a: 1 })
    expect(completeJson).toHaveBeenCalledTimes(2)
  })
})
