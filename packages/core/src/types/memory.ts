// Framework-level abstraction for persistent vector memory.
// Implementations can be in-memory (SharedMemoryPool),
// Qdrant, Pinecone, Weaviate, or any vector database.
//
// The orchestrator uses VectorMemory to:
//   1. Store discoveries - agents' findings persist across rounds
//   2. Search context - retrieve relevant past knowledge before each round
//   3. Reinforce - useful memories survive, noise decays
//
// This is the mechanism for collective intelligence:
// Agents build on each other's work across rounds AND across solve() calls.

/** A memory entry returned from vector search. */
export interface VectorMemoryEntry {
  /** Unique identifier. */
  readonly id: string
  /** The text content stored. */
  readonly content: string
  /** Semantic relevance to the query in [0, 1]. */
  readonly relevance: number
  /** Current strength after decay in (0, 1]. */
  readonly strength: number
  /** Arbitrary metadata (agent, category, round, etc.). */
  readonly metadata: Readonly<Record<string, string>>
}

/**
 * Abstract interface for persistent vector memory.
 *
 * Implementations handle embedding internally - consumers
 * pass raw text, not vectors. This keeps the interface
 * implementation-agnostic (works with any embedding model).
 *
 * Usage (from orchestrator's perspective):
 * ```ts
 * // Store a discovery
 * const id = await memory.store('SQL injection in user handler', {
 *   agent: 'security-reviewer',
 *   category: 'vulnerability',
 *   round: '2',
 * })
 *
 * // Search for relevant context
 * const results = await memory.search('input validation issues', 5)
 *
 * // Reinforce a useful memory
 * await memory.reinforce(id)
 *
 * // Decay unreinforced memories
 * const evicted = await memory.decay()
 * ```
 */
export interface VectorMemory {
  /**
   * Store content in vector memory.
   * Implementation embeds the text internally.
   *
   * @returns the memory's unique ID
   */
  store(
    content: string,
    metadata?: Record<string, string>,
  ): Promise<string>

  /**
   * Search for semantically similar entries.
   * Implementation embeds the query internally.
   *
   * @param query - natural language search query
   * @param limit - max results to return (default: 10)
   * @returns entries sorted by relevance (highest first)
   */
  search(
    query: string,
    limit?: number,
  ): Promise<readonly VectorMemoryEntry[]>

  /**
   * Reinforce a memory - signal that it was useful.
   * Reinforced memories resist decay and persist longer.
   */
  reinforce(id: string): Promise<void>

  /**
   * Apply decay to all memories.
   * Unreinforced memories lose strength and eventually get evicted.
   *
   * @returns number of memories evicted
   */
  decay(): Promise<number>
}
