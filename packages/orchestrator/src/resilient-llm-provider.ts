import type {
  LlmProvider,
  LlmMessage,
  LlmOptions,
  LlmResponse,
} from '@cognitive-engine/core'
import type { ResolvedRetryConfig } from '@cognitive-swarm/core'

const CIRCUIT_COOLDOWN_MS = 30_000

export class CircuitOpenError extends Error {
  constructor(remainingMs: number) {
    super(`Circuit breaker open — retry in ${Math.ceil(remainingMs / 1000)}s`)
    this.name = 'CircuitOpenError'
  }
}

type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Wraps an LlmProvider with exponential-backoff retry and a circuit breaker.
 *
 * - Retries on any error up to `maxRetries` times.
 * - Delay = min(baseDelayMs * 2^attempt, maxDelayMs) ± 20% jitter.
 * - After `circuitBreakerThreshold` consecutive failures the circuit opens
 *   and all calls immediately throw CircuitOpenError for 30 seconds.
 * - After cooldown, one probe call is allowed (half-open). If it succeeds
 *   the circuit closes; if it fails, it reopens.
 */
export class ResilientLlmProvider implements LlmProvider {
  private readonly inner: LlmProvider
  private readonly config: ResolvedRetryConfig

  private consecutiveFailures = 0
  private circuitState: CircuitState = 'closed'
  private circuitOpenedAt = 0

  constructor(inner: LlmProvider, config: ResolvedRetryConfig) {
    this.inner = inner
    this.config = config
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    return this.withRetry(() => this.inner.complete(messages, options))
  }

  async completeJson<T>(
    messages: LlmMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse & { parsed: T }> {
    return this.withRetry(() => this.inner.completeJson<T>(messages, options))
  }

  /** Visible for testing. */
  get _state(): CircuitState {
    return this.circuitState
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    this.guardCircuit()

    let lastError: unknown
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await fn()
        this.onSuccess()
        return result
      } catch (err) {
        lastError = err
        this.onFailure()

        if (attempt < this.config.maxRetries && this.circuitState !== 'open') {
          await this.delay(attempt)
        }
      }
    }

    throw lastError
  }

  private guardCircuit(): void {
    if (this.circuitState === 'closed') return

    if (this.circuitState === 'open') {
      const elapsed = Date.now() - this.circuitOpenedAt
      if (elapsed >= CIRCUIT_COOLDOWN_MS) {
        this.circuitState = 'half-open'
        return
      }
      throw new CircuitOpenError(CIRCUIT_COOLDOWN_MS - elapsed)
    }
    // half-open — allow the probe call through
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0
    this.circuitState = 'closed'
  }

  private onFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      this.circuitState = 'open'
      this.circuitOpenedAt = Date.now()
    }
  }

  private delay(attempt: number): Promise<void> {
    const base = Math.min(
      this.config.baseDelayMs * 2 ** attempt,
      this.config.maxDelayMs,
    )
    const jitter = base * (0.8 + Math.random() * 0.4) // ±20%
    return new Promise((resolve) => setTimeout(resolve, jitter))
  }
}
