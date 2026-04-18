import { QdrantClient } from '@qdrant/js-client-rest'
import type { EmbeddingProvider } from '@cognitive-engine/core'
import type { VectorMemory, VectorMemoryEntry } from '@cognitive-swarm/core'

// Qdrant-backed VectorMemory - persistent collective memory.
// Decay model: strength(t+1) = strength(t) * (1 - decayRate / (1 + log(reinforcements)))

/** Configuration for QdrantVectorMemory. */
export interface QdrantMemoryConfig {
  /** Qdrant server URL. Default: http://localhost:6333 */
  readonly url?: string
  /** Qdrant collection name. Default: 'swarm-memory' */
  readonly collection?: string
  /** Decay rate per decay() call. Default: 0.05 */
  readonly decayRate?: number
  /** Minimum strength before eviction. Default: 0.1 */
  readonly evictionThreshold?: number
  /** Strength boost per reinforcement. Default: 0.2 */
  readonly reinforcementBoost?: number
  /** Maximum strength (capped). Default: 1.0 */
  readonly maxStrength?: number
  /** Qdrant API key (optional, for cloud). */
  readonly apiKey?: string
}

/** Resolved config with all defaults. */
interface ResolvedConfig {
  readonly url: string
  readonly collection: string
  readonly decayRate: number
  readonly evictionThreshold: number
  readonly reinforcementBoost: number
  readonly maxStrength: number
}

/** Qdrant point payload shape. */
interface MemoryPayload {
  content: string
  strength: number
  reinforcements: number
  createdAt: number
  metadata: Record<string, string>
}

const DEFAULTS: ResolvedConfig = {
  url: 'http://localhost:6333',
  collection: 'swarm-memory',
  decayRate: 0.05,
  evictionThreshold: 0.1,
  reinforcementBoost: 0.2,
  maxStrength: 1.0,
}

/**
 * Qdrant-backed VectorMemory for persistent swarm knowledge.
 *
 * Usage:
 * ```ts
 * const memory = new QdrantVectorMemory(embeddingProvider, {
 *   url: 'http://localhost:6333',
 *   collection: 'my-swarm',
 * })
 *
 * await memory.initialize() // creates collection if needed
 *
 * const id = await memory.store('SQL injection found', { agent: 'security' })
 * const results = await memory.search('vulnerabilities', 5)
 * await memory.reinforce(id)
 * const evicted = await memory.decay()
 * ```
 */
export class QdrantVectorMemory implements VectorMemory {
  private readonly client: QdrantClient
  private readonly embedding: EmbeddingProvider
  private readonly config: ResolvedConfig
  private initialized = false

  constructor(embedding: EmbeddingProvider, config?: QdrantMemoryConfig) {
    this.embedding = embedding
    this.config = {
      url: config?.url ?? DEFAULTS.url,
      collection: config?.collection ?? DEFAULTS.collection,
      decayRate: config?.decayRate ?? DEFAULTS.decayRate,
      evictionThreshold: config?.evictionThreshold ?? DEFAULTS.evictionThreshold,
      reinforcementBoost: config?.reinforcementBoost ?? DEFAULTS.reinforcementBoost,
      maxStrength: config?.maxStrength ?? DEFAULTS.maxStrength,
    }
    this.client = new QdrantClient({
      url: this.config.url,
      apiKey: config?.apiKey,
    })
  }

  /**
   * Initialize the collection in Qdrant.
   * Creates it if it doesn't exist. Safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const collections = await this.client.getCollections()
    const exists = collections.collections.some(
      (c) => c.name === this.config.collection,
    )

    if (!exists) {
      await this.client.createCollection(this.config.collection, {
        vectors: {
          size: this.embedding.dimensions,
          distance: 'Cosine',
        },
      })
    }

    this.initialized = true
  }

  async store(
    content: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    await this.ensureInitialized()

    const id = crypto.randomUUID()
    const vector = await this.embedding.embed(content)

    const payload: MemoryPayload = {
      content,
      strength: 1.0,
      reinforcements: 0,
      createdAt: Date.now(),
      metadata: metadata ?? {},
    }

    await this.client.upsert(this.config.collection, {
      wait: true,
      points: [{ id, vector, payload: payload as unknown as Record<string, unknown> }],
    })

    return id
  }

  async search(
    query: string,
    limit = 10,
  ): Promise<readonly VectorMemoryEntry[]> {
    await this.ensureInitialized()

    const vector = await this.embedding.embed(query)

    const results = await this.client.search(this.config.collection, {
      vector,
      limit,
      with_payload: true,
      score_threshold: 0.0,
    })

    return results.map((point) => {
      const payload = point.payload as unknown as MemoryPayload
      return {
        id: String(point.id),
        content: payload.content,
        relevance: Math.max(0, point.score),
        strength: payload.strength,
        metadata: payload.metadata,
      }
    })
  }

  async reinforce(id: string): Promise<void> {
    await this.ensureInitialized()

    // Fetch current point
    const points = await this.client.retrieve(this.config.collection, {
      ids: [id],
      with_payload: true,
    })

    if (points.length === 0) return

    const payload = points[0]!.payload as unknown as MemoryPayload
    const newReinforcements = payload.reinforcements + 1
    const newStrength = Math.min(
      this.config.maxStrength,
      payload.strength + this.config.reinforcementBoost,
    )

    await this.client.setPayload(this.config.collection, {
      wait: true,
      payload: {
        strength: newStrength,
        reinforcements: newReinforcements,
      },
      points: [id],
    })
  }

  async decay(): Promise<number> {
    await this.ensureInitialized()

    let evicted = 0
    let offset: string | number | undefined

    // Scroll through all points, apply decay, delete weak ones
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await this.client.scroll(this.config.collection, {
        limit: 100,
        offset,
        with_payload: true,
      })

      if (page.points.length === 0) break

      const toDelete: string[] = []
      const toUpdate: { id: string; strength: number }[] = []

      for (const point of page.points) {
        const payload = point.payload as unknown as MemoryPayload
        const reinforcements = payload.reinforcements

        // Reinforced memories decay slower: decayRate / (1 + log(1 + reinforcements))
        const effectiveDecay =
          this.config.decayRate / (1 + Math.log(1 + reinforcements))
        const newStrength = payload.strength * (1 - effectiveDecay)

        if (newStrength < this.config.evictionThreshold) {
          toDelete.push(String(point.id))
          evicted++
        } else {
          toUpdate.push({ id: String(point.id), strength: newStrength })
        }
      }

      // Batch delete evicted points
      if (toDelete.length > 0) {
        await this.client.delete(this.config.collection, {
          wait: true,
          points: toDelete,
        })
      }

      // Batch update strengths
      for (const { id, strength } of toUpdate) {
        await this.client.setPayload(this.config.collection, {
          wait: true,
          payload: { strength },
          points: [id],
        })
      }

      const nextOffset = page.next_page_offset
      if (
        nextOffset === null ||
        nextOffset === undefined ||
        typeof nextOffset === 'object'
      ) {
        break
      }
      offset = nextOffset
    }

    return evicted
  }

  /** Delete all points in the collection. */
  async clear(): Promise<void> {
    await this.ensureInitialized()

    await this.client.delete(this.config.collection, {
      wait: true,
      filter: { must: [] },
    })
  }

  async dropCollection(): Promise<void> {
    try {
      await this.client.deleteCollection(this.config.collection)
    } catch {
      // Collection might not exist
    }
    this.initialized = false
  }

  async count(): Promise<number> {
    await this.ensureInitialized()
    const info = await this.client.getCollection(this.config.collection)
    return info.points_count ?? 0
  }

  get qdrantClient(): QdrantClient {
    return this.client
  }

  get collectionName(): string {
    return this.config.collection
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }
}
