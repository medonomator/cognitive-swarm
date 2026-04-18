import type {
  LlmProvider,
  LlmMessage,
  LlmOptions,
  LlmResponse,
} from '@cognitive-engine/core'

/**
 * Thrown when the total token usage across all trackers exceeds the configured budget.
 */
export class TokenBudgetExceededError extends Error {
  readonly totalTokens: number
  readonly budget: number

  constructor(totalTokens: number, budget: number) {
    super(`Token budget exceeded: ${totalTokens} >= ${budget}`)
    this.name = 'TokenBudgetExceededError'
    this.totalTokens = totalTokens
    this.budget = budget
  }
}

/**
 * Wraps an LlmProvider and accumulates token usage.
 * Used by SwarmOrchestrator to track cost across all agent LLM calls.
 *
 * When a budget is set via {@link setBudget}, each call checks
 * the shared total before forwarding to the inner provider.
 */
export class TokenTrackingLlmProvider implements LlmProvider {
  private readonly inner: LlmProvider
  private _totalTokens = 0
  private _budget: number | null = null
  private _getSharedTotal: (() => number) | null = null

  constructor(inner: LlmProvider) {
    this.inner = inner
  }

  /**
   * Set a shared budget tracker.
   * When the shared total across all trackers reaches or exceeds the budget,
   * subsequent LLM calls throw {@link TokenBudgetExceededError}.
   */
  setBudget(budget: number | null, sharedCounter: () => number): void {
    this._budget = budget
    this._getSharedTotal = sharedCounter
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    this.checkBudget()
    const result = await this.inner.complete(messages, options)
    this._totalTokens += result.usage.totalTokens
    return result
  }

  async completeJson<T>(
    messages: LlmMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse & { parsed: T }> {
    this.checkBudget()
    const result = await this.inner.completeJson<T>(
      messages,
      options,
    )
    this._totalTokens += result.usage.totalTokens
    return result
  }

  get totalTokens(): number {
    return this._totalTokens
  }

  reset(): void {
    this._totalTokens = 0
  }

  private checkBudget(): void {
    if (this._budget !== null && this._getSharedTotal !== null) {
      const total = this._getSharedTotal()
      if (total >= this._budget) {
        throw new TokenBudgetExceededError(total, this._budget)
      }
    }
  }
}
