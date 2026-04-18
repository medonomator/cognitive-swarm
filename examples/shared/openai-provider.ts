/**
 * Minimal OpenAI providers for examples.
 * Uses the OpenAI SDK — set OPENAI_API_KEY env var.
 */
import OpenAI from 'openai'
import type {
  LlmProvider,
  LlmMessage,
  LlmOptions,
  LlmResponse,
  EmbeddingProvider,
  Store,
  EngineConfig,
} from '@cognitive-engine/core'

export class OpenAiLlm implements LlmProvider {
  private readonly client: OpenAI
  constructor(private readonly model = 'gpt-4o-mini') {
    this.client = new OpenAI()
  }

  async complete(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse> {
    const res = await this.client.chat.completions.create({
      model: options?.model ?? this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 500,
    })
    const choice = res.choices[0]
    const usage = res.usage
    return {
      content: choice?.message?.content ?? '',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: 'stop',
    }
  }

  async completeJson<T>(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse & { parsed: T }> {
    const res = await this.client.chat.completions.create({
      model: options?.model ?? this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 500,
      response_format: { type: 'json_object' },
    })
    const content = res.choices[0]?.message?.content ?? '{}'
    const usage = res.usage
    return {
      content,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: 'stop',
      parsed: JSON.parse(content) as T,
    }
  }
}

class NoopEmbedding implements EmbeddingProvider {
  readonly dimensions = 256
  async embed(): Promise<number[]> { return new Array(256).fill(0) }
  async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => new Array(256).fill(0)) }
}

class NoopStore implements Store {
  async get(): Promise<null> { return null }
  async set(): Promise<void> {}
  async delete(): Promise<void> {}
  async find(): Promise<never[]> { return [] }
  async upsert(): Promise<void> {}
}

/** Create a complete EngineConfig using OpenAI with optional model. */
export function createEngine(model = 'gpt-4o-mini'): EngineConfig {
  return {
    llm: new OpenAiLlm(model),
    embedding: new NoopEmbedding(),
    store: new NoopStore(),
  }
}

/** Print swarm result stats. */
export function printStats(result: {
  timing: { roundsUsed: number }
  signalLog: readonly unknown[]
  confidence: number
  cost: { tokens: number; estimatedUsd: number }
}, startTime: number): void {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n--- Stats ---`)
  console.log(`Time: ${duration}s`)
  console.log(`Rounds: ${result.timing.roundsUsed}`)
  console.log(`Signals: ${result.signalLog.length}`)
  console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`)
  console.log(`Tokens: ${result.cost.tokens}`)
  console.log(`Cost: ~$${result.cost.estimatedUsd.toFixed(4)}`)
}
