import type { EmbeddingProvider } from '@cognitive-engine/core'
import type { VectorMemory, VectorMemoryEntry } from '@cognitive-swarm/core'
import type {
  SharedMemory,
  MemoryState,
  ShareMemoryInput,
  MemorySearchResult,
  MemoryPoolConfig,
  ResolvedMemoryPoolConfig,
  PoolStats,
} from './types.js'

// Shared memory pool - collective knowledge with decay/reinforcement.
// Memories decay unless reinforced; semantic search via embeddings.

/**
 * Shared memory pool for collective swarm knowledge.
 *
 * Usage:
 * ```ts
 * const pool = new SharedMemoryPool(embeddingProvider)
 *
 * // Agent shares a discovery
 * await pool.share('agent-1', {
 *   content: 'SQL injection in user input handler',
 *   category: 'security',
 *   importance: 0.9,
 * })
 *
 * // Another agent searches for related knowledge
 * const results = await pool.search('input validation vulnerabilities')
 * // -> finds the SQL injection memory via semantic similarity
 *
 * // Agent reinforces a useful memory
 * pool.reinforce('agent-2', memoryId)
 *
 * // Periodic decay - unreinforced memories fade
 * pool.decay()
 * ```
 */
export class SharedMemoryPool {
  private readonly memories = new Map<string, SharedMemory>()
  private readonly states = new Map<string, MemoryState>()
  private readonly config: ResolvedMemoryPoolConfig
  private nextId = 0

  constructor(
    private readonly embedding: EmbeddingProvider,
    config?: MemoryPoolConfig,
  ) {
    this.config = resolveConfig(config)
  }

  /**
   * Share a new memory with the pool.
   *
   * The content is embedded for semantic search. Returns the memory ID.
   */
  async share(
    agentId: string,
    input: ShareMemoryInput,
  ): Promise<SharedMemory> {
    const vector = await this.embedding.embed(input.content)
    const now = Date.now()
    const id = `mem-${this.nextId++}`

    const memory: SharedMemory = {
      id,
      sourceAgentId: agentId,
      content: input.content,
      category: input.category,
      importance: input.importance ?? 0.5,
      createdAt: now,
      embedding: vector,
    }

    this.memories.set(id, memory)
    this.states.set(id, {
      strength: 1.0,
      reinforcements: 0,
      reinforcedBy: new Set(),
      lastAccessedAt: now,
    })

    // Evict weakest if over capacity
    this.evictIfNeeded()

    return memory
  }

  /**
   * Search the pool for memories semantically similar to the query.
   *
   * Returns results sorted by relevance (highest first).
   *
   * @param query - natural language search query
   * @param limit - max results to return (default: 10)
   * @param category - optional category filter
   */
  async search(
    query: string,
    limit = 10,
    category?: string,
  ): Promise<readonly MemorySearchResult[]> {
    if (this.memories.size === 0) return []

    const queryVector = await this.embedding.embed(query)
    const results: MemorySearchResult[] = []

    for (const [id, memory] of this.memories) {
      if (category !== undefined && memory.category !== category) continue

      const state = this.states.get(id)
      if (!state) continue

      const relevance = cosineSimilarity(queryVector, memory.embedding)

      // Score combines relevance, importance, and strength
      results.push({
        memory,
        relevance,
        strength: state.strength,
      })
    }

    // Sort by weighted score: relevance × importance × strength
    results.sort((a, b) => {
      const scoreA = a.relevance * a.memory.importance * a.strength
      const scoreB = b.relevance * b.memory.importance * b.strength
      return scoreB - scoreA
    })

    return results.slice(0, limit)
  }

  /**
   * Reinforce a memory - signal that it was useful.
   *
   * Each agent can reinforce a memory at most once.
   * Reinforcement increases the memory's strength, making it persist longer.
   *
   * @returns true if reinforcement was applied, false if already reinforced by this agent
   */
  reinforce(agentId: string, memoryId: string): boolean {
    const state = this.states.get(memoryId)
    if (!state) return false

    // Each agent can only reinforce once
    if (state.reinforcedBy.has(agentId)) return false

    state.reinforcedBy.add(agentId)
    state.reinforcements++
    state.strength = Math.min(
      this.config.maxStrength,
      state.strength + this.config.reinforcementBoost,
    )
    state.lastAccessedAt = Date.now()

    return true
  }

  /**
   * Apply decay to all memories.
   *
   * Memories lose strength over time. Unreinforced memories
   * fade away, while reinforced ones persist. Memories below
   * the eviction threshold are removed.
   *
   * Call this periodically (e.g., once per swarm round).
   *
   * @returns number of memories evicted
   */
  decay(): number {
    let evicted = 0
    const toRemove: string[] = []

    for (const [id, state] of this.states) {
      // Decay: strength × (1 - decayRate)
      // Reinforced memories decay slower (log-scaled bonus)
      const reinforcementResistance =
        1 - this.config.decayRate / (1 + Math.log1p(state.reinforcements))

      state.strength *= reinforcementResistance

      if (state.strength < this.config.evictionThreshold) {
        toRemove.push(id)
      }
    }

    for (const id of toRemove) {
      this.memories.delete(id)
      this.states.delete(id)
      evicted++
    }

    return evicted
  }

  /**
   * Get a specific memory by ID.
   */
  get(memoryId: string): SharedMemory | undefined {
    return this.memories.get(memoryId)
  }

  /**
   * Get the current strength of a memory.
   */
  getStrength(memoryId: string): number | undefined {
    return this.states.get(memoryId)?.strength
  }

  /**
   * Get all memories from a specific agent.
   */
  getByAgent(agentId: string): readonly SharedMemory[] {
    const result: SharedMemory[] = []
    for (const memory of this.memories.values()) {
      if (memory.sourceAgentId === agentId) {
        result.push(memory)
      }
    }
    return result
  }

  /**
   * Get all memories in a category.
   */
  getByCategory(category: string): readonly SharedMemory[] {
    const result: SharedMemory[] = []
    for (const memory of this.memories.values()) {
      if (memory.category === category) {
        result.push(memory)
      }
    }
    return result
  }

  /**
   * Get pool statistics.
   */
  stats(): PoolStats {
    const byCategory = new Map<string, number>()
    let totalStrength = 0
    let nearEviction = 0
    let totalReinforcements = 0

    for (const [id, memory] of this.memories) {
      byCategory.set(
        memory.category,
        (byCategory.get(memory.category) ?? 0) + 1,
      )

      const state = this.states.get(id)
      if (state) {
        totalStrength += state.strength
        totalReinforcements += state.reinforcements

        if (state.strength < this.config.evictionThreshold * 2) {
          nearEviction++
        }
      }
    }

    return {
      totalMemories: this.memories.size,
      byCategory,
      averageStrength:
        this.memories.size > 0 ? totalStrength / this.memories.size : 0,
      nearEviction,
      totalReinforcements,
    }
  }

  /**
   * Returns a VectorMemory adapter backed by this pool.
   *
   * Pass this to SwarmOrchestrator's `memory` config:
   * ```ts
   * const pool = new SharedMemoryPool(embedding)
   * const orchestrator = new SwarmOrchestrator({
   *   agents,
   *   memory: pool.toVectorMemory(),
   * })
   * ```
   */
  toVectorMemory(): VectorMemory {
    return {
      store: async (
        content: string,
        metadata?: Record<string, string>,
      ): Promise<string> => {
        const agentId = metadata?.['agent'] ?? 'system'
        const category = metadata?.['category'] ?? 'general'
        const importance = metadata?.['importance']
          ? Number(metadata['importance'])
          : 0.5
        const memory = await this.share(agentId, {
          content,
          category,
          importance,
        })
        return memory.id
      },

      search: async (
        query: string,
        limit?: number,
      ): Promise<readonly VectorMemoryEntry[]> => {
        const results = await this.search(query, limit)
        return results.map((r) => ({
          id: r.memory.id,
          content: r.memory.content,
          relevance: r.relevance,
          strength: r.strength,
          metadata: {
            agent: r.memory.sourceAgentId,
            category: r.memory.category,
            importance: String(r.memory.importance),
          },
        }))
      },

      reinforce: async (id: string): Promise<void> => {
        this.reinforce('system', id)
      },

      decay: async (): Promise<number> => {
        return this.decay()
      },
    }
  }

  get size(): number {
    return this.memories.size
  }

  reset(): void {
    this.memories.clear()
    this.states.clear()
    this.nextId = 0
  }

  /** Evict weakest memories if over capacity. */
  private evictIfNeeded(): void {
    while (this.memories.size > this.config.maxCapacity) {
      let weakestId: string | undefined
      let weakestStrength = Infinity

      for (const [id, state] of this.states) {
        if (state.strength < weakestStrength) {
          weakestStrength = state.strength
          weakestId = id
        }
      }

      if (weakestId !== undefined) {
        this.memories.delete(weakestId)
        this.states.delete(weakestId)
      } else {
        break
      }
    }
  }
}

function resolveConfig(
  config?: MemoryPoolConfig,
): ResolvedMemoryPoolConfig {
  return {
    decayRate: config?.decayRate ?? 0.05,
    evictionThreshold: config?.evictionThreshold ?? 0.1,
    maxCapacity: config?.maxCapacity ?? 1000,
    reinforcementBoost: config?.reinforcementBoost ?? 0.2,
    maxStrength: config?.maxStrength ?? 1.0,
  }
}

function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  let dot = 0
  let normA = 0
  let normB = 0

  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    normA += ai * ai
    normB += bi * bi
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
