import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type {
  LlmProvider,
  LlmMessage,
  LlmOptions,
  LlmResponse,
  EmbeddingProvider,
  Store,
  StoreFilter,
} from '@cognitive-engine/core'

function getHttpAgent(): HttpsProxyAgent<string> | undefined {
  const proxy =
    process.env['https_proxy'] ??
    process.env['HTTPS_PROXY'] ??
    process.env['http_proxy'] ??
    process.env['HTTP_PROXY']

  return proxy ? new HttpsProxyAgent(proxy) : undefined
}

/**
 * OpenAI LLM provider implementing cognitive-engine's LlmProvider.
 */
export class OpenAiLlmProvider implements LlmProvider {
  private readonly client: OpenAI
  private readonly defaultModel: string
  private totalTokensUsed = 0

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    const httpAgent = getHttpAgent()
    this.client = new OpenAI({
      apiKey,
      httpAgent,
    })
    this.defaultModel = model
  }

  private isGpt5Family(): boolean {
    return /^(gpt-5|o[1-4])/.test(this.defaultModel)
  }

  async complete(
    messages: LlmMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    const model = options?.model ?? this.defaultModel
    const isGpt5 = /^(gpt-5|o[1-4])/.test(model)
    // GPT-5.x generates more verbose output; enforce floor to prevent truncation
    const rawMaxTokens = options?.maxTokens ?? 1500
    const maxTokens = isGpt5 ? Math.max(rawMaxTokens, 1500) : rawMaxTokens

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(isGpt5 ? {} : { temperature: options?.temperature ?? 0 }),
      ...(isGpt5
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
    })

    const choice = response.choices[0]
    const usage = response.usage

    this.totalTokensUsed += usage?.total_tokens ?? 0

    return {
      content: choice?.message?.content ?? '',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason:
        choice?.finish_reason === 'length'
          ? 'length'
          : choice?.finish_reason === 'content_filter'
            ? 'content_filter'
            : 'stop',
    }
  }

  async completeJson<T>(
    messages: LlmMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse & { parsed: T }> {
    const model = options?.model ?? this.defaultModel
    const isGpt5 = /^(gpt-5|o[1-4])/.test(model)
    // GPT-5.x generates more verbose output; enforce floor to prevent truncation
    const rawMaxTokens = options?.maxTokens ?? 1500
    const maxTokens = isGpt5 ? Math.max(rawMaxTokens, 1500) : rawMaxTokens

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(isGpt5 ? {} : { temperature: options?.temperature ?? 0 }),
      ...(isGpt5
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      response_format: { type: 'json_object' },
    })

    const choice = response.choices[0]
    const usage = response.usage
    const content = choice?.message?.content ?? '{}'

    this.totalTokensUsed += usage?.total_tokens ?? 0

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

  get tokensUsed(): number {
    return this.totalTokensUsed
  }

  resetTokenCount(): void {
    this.totalTokensUsed = 0
  }
}

/**
 * OpenAI Embedding provider.
 */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI
  readonly dimensions: number

  constructor(apiKey: string, dimensions = 256) {
    const httpAgent = getHttpAgent()
    this.client = new OpenAI({ apiKey, httpAgent })
    this.dimensions = dimensions
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: this.dimensions,
    })
    return response.data[0]?.embedding ?? []
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: this.dimensions,
    })
    return response.data.map((d) => d.embedding)
  }
}

/**
 * In-memory Store for benchmarks.
 */
export class InMemoryStore implements Store {
  private readonly data = new Map<string, Map<string, unknown>>()

  async get<T>(collection: string, id: string): Promise<T | null> {
    return (this.data.get(collection)?.get(id) as T) ?? null
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map())
    }
    this.data.get(collection)!.set(id, data)
  }

  async delete(collection: string, id: string): Promise<void> {
    this.data.get(collection)?.delete(id)
  }

  async find<T>(collection: string, _filter: StoreFilter): Promise<T[]> {
    const col = this.data.get(collection)
    if (!col) return []
    return [...col.values()] as T[]
  }

  async upsert<T>(collection: string, id: string, data: T): Promise<void> {
    return this.set(collection, id, data)
  }
}
