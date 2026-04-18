/** A shared memory entry stored in the collective pool. */
export interface SharedMemory {
  /** Unique identifier. */
  readonly id: string
  /** Agent that created this memory. */
  readonly sourceAgentId: string
  /** The content of the memory (discovery, insight, etc.). */
  readonly content: string
  /** Category for coarse-grained filtering. */
  readonly category: string
  /** Importance score ∈ [0, 1]. Higher = more important. */
  readonly importance: number
  /** Timestamp when the memory was created. */
  readonly createdAt: number
  /** Embedding vector for semantic search. */
  readonly embedding: readonly number[]
}

/** Internal mutable state of a memory entry. */
export interface MemoryState {
  /** Current strength ∈ (0, 1]. Decays over time. */
  strength: number
  /** How many agents have reinforced this memory. */
  reinforcements: number
  /** IDs of agents that reinforced this memory. */
  reinforcedBy: Set<string>
  /** Last time the memory was accessed or reinforced. */
  lastAccessedAt: number
}

/** Input for sharing a new memory. */
export interface ShareMemoryInput {
  readonly content: string
  readonly category: string
  /** Importance ∈ [0, 1]. Default: 0.5 */
  readonly importance?: number
}

/** A search result with relevance score. */
export interface MemorySearchResult {
  readonly memory: SharedMemory
  /** Cosine similarity to the query ∈ [-1, 1]. */
  readonly relevance: number
  /** Current strength after decay. */
  readonly strength: number
}

/** Configuration for the memory pool. */
export interface MemoryPoolConfig {
  /** Decay rate per call to decay(). Default: 0.05 */
  readonly decayRate?: number
  /** Minimum strength before eviction. Default: 0.1 */
  readonly evictionThreshold?: number
  /** Maximum memories in the pool. Default: 1000 */
  readonly maxCapacity?: number
  /** Strength boost per reinforcement. Default: 0.2 */
  readonly reinforcementBoost?: number
  /** Maximum strength (capped). Default: 1.0 */
  readonly maxStrength?: number
}

/** Resolved config with all defaults applied. */
export interface ResolvedMemoryPoolConfig {
  readonly decayRate: number
  readonly evictionThreshold: number
  readonly maxCapacity: number
  readonly reinforcementBoost: number
  readonly maxStrength: number
}

/** Statistics about the memory pool. */
export interface PoolStats {
  /** Total memories currently stored. */
  readonly totalMemories: number
  /** Breakdown by category. */
  readonly byCategory: ReadonlyMap<string, number>
  /** Average strength across all memories. */
  readonly averageStrength: number
  /** Number of memories below eviction threshold. */
  readonly nearEviction: number
  /** Total reinforcements across all memories. */
  readonly totalReinforcements: number
}
