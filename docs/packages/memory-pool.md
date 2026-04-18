# @cognitive-swarm/memory-pool

In-memory collective memory with decay, reinforcement, and similarity search.

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/memory-pool)](https://www.npmjs.com/package/@cognitive-swarm/memory-pool)

## Install

```bash
npm install @cognitive-swarm/memory-pool
```

## Overview

`SharedMemoryPool` provides an in-memory knowledge store that agents use to share discoveries, proposals, and insights during a swarm solve. Memories naturally decay over time unless reinforced by other agents, creating an organic signal of what the swarm collectively finds important.

Key properties:

- **Decay** -- memory strength decreases each tick unless reinforced
- **Reinforcement** -- agents can upvote memories, slowing their decay
- **Similarity search** -- find relevant memories using embedding-based cosine similarity
- **Eviction** -- memories below a strength threshold are automatically removed
- **Capacity** -- hard limit prevents unbounded growth

## Quick Start

```typescript
import { SharedMemoryPool } from '@cognitive-swarm/memory-pool'
import type { MemoryPoolConfig, ShareMemoryInput } from '@cognitive-swarm/memory-pool'

const pool = new SharedMemoryPool({
  decay: {
    rate: 0.05,
    interval: 1,
  },
  eviction: {
    threshold: 0.1,
  },
  capacity: {
    maxMemories: 1000,
  },
  reinforcement: {
    boost: 0.2,
    maxStrength: 1.0,
  },
})

// Agent shares a discovery
const memory = await pool.share('analyst-1', {
  content: 'The dataset contains seasonal patterns with a 12-month cycle',
  category: 'discovery',
  importance: 0.8,
})

console.log(memory.id)         // 'mem-...'
console.log(memory.strength)   // 1.0 (initial)

// Another agent reinforces it
pool.reinforce('coder-1', memory.id)

// Search for relevant memories
const results = await pool.search('seasonal trends in data', 5)
for (const r of results) {
  console.log(`[${r.relevance.toFixed(2)}] ${r.memory.content}`)
}
```

## API Reference

### `SharedMemoryPool`

#### Constructor

```typescript
new SharedMemoryPool(config?: Partial<MemoryPoolConfig>)
```

---

#### `share(agentId, input)`

Add a new memory to the pool.

```typescript
async share(
  agentId: string,
  input: ShareMemoryInput,
): Promise<SharedMemory>
```

**Parameters:**

| Parameter | Type               | Description                          |
| --------- | ------------------ | ------------------------------------ |
| `agentId` | `string`           | ID of the agent sharing the memory   |
| `input`   | `ShareMemoryInput` | Memory content and metadata          |

**Returns:** The created `SharedMemory` object with a generated ID, embedding, and initial strength of 1.0.

```typescript
const memory = await pool.share('critic-1', {
  content: 'The proposed algorithm has O(n^2) worst case -- consider quickselect instead',
  category: 'challenge',
  importance: 0.9,
})
```

---

#### `search(query, limit?, category?)`

Find memories relevant to a query using embedding similarity.

```typescript
async search(
  query: string,
  limit?: number,
  category?: string,
): Promise<MemorySearchResult[]>
```

**Parameters:**

| Parameter  | Type     | Default | Description                               |
| ---------- | -------- | ------- | ----------------------------------------- |
| `query`    | `string` | --      | Natural-language search query             |
| `limit`    | `number` | `10`    | Maximum results to return                 |
| `category` | `string` | --      | Filter by category before ranking         |

**Returns:** Array of `MemorySearchResult` sorted by relevance (highest first).

Relevance is computed as cosine similarity between the query embedding and each memory's embedding, weighted by the memory's current strength.

```typescript
// Search all memories
const results = await pool.search('performance optimization')

// Search only discoveries
const discoveries = await pool.search('performance', 5, 'discovery')
```

---

#### `reinforce(agentId, memoryId)`

Reinforce a memory, boosting its strength and slowing decay.

```typescript
reinforce(agentId: string, memoryId: string): void
```

**Parameters:**

| Parameter  | Type     | Description                              |
| ---------- | -------- | ---------------------------------------- |
| `agentId`  | `string` | ID of the agent reinforcing the memory   |
| `memoryId` | `string` | ID of the memory to reinforce            |

Each reinforcement:

1. Increments the memory's `reinforcements` counter
2. Adds `agentId` to `reinforcedBy` set
3. Boosts `strength` by the configured `reinforcement.boost` (capped at `maxStrength`)
4. Updates `lastAccessedAt`

```typescript
pool.reinforce('analyst-1', memory.id)
pool.reinforce('coder-1', memory.id)

const state = pool.getStrength(memory.id)
console.log(state) // ~1.0 (boosted, capped at maxStrength)
```

---

#### `decay()`

Apply one decay tick to all memories. Evict memories below the threshold.

```typescript
decay(): void
```

The decay formula:

```
strength(t+1) = strength(t) * (1 - decayRate / (1 + log(1 + reinforcements)))
```

Reinforced memories decay slower because the denominator grows with the reinforcement count. After decay, any memory with `strength < evictionThreshold` is permanently removed.

```typescript
// Typically called once per round
pool.decay()

// Or on a timer
setInterval(() => pool.decay(), 60_000)
```

---

#### `get(id)`

Retrieve a specific memory by ID.

```typescript
get(id: string): SharedMemory | undefined
```

---

#### `getStrength(id)`

Get the current strength of a memory.

```typescript
getStrength(id: string): number | undefined
```

---

#### `getByAgent(agentId)`

Get all memories shared by a specific agent.

```typescript
getByAgent(agentId: string): SharedMemory[]
```

---

#### `getByCategory(category)`

Get all memories in a specific category.

```typescript
getByCategory(category: string): SharedMemory[]
```

---

#### `stats()`

Get pool statistics.

```typescript
stats(): PoolStats
```

```typescript
const s = pool.stats()
console.log(s.totalMemories)      // 42
console.log(s.averageStrength)    // 0.73
console.log(s.categoryCounts)     // { discovery: 18, proposal: 12, challenge: 12 }
console.log(s.agentCounts)        // { 'analyst-1': 15, 'coder-1': 14, 'critic-1': 13 }
console.log(s.evictedTotal)       // 7
```

---

#### `toVectorMemory()`

Convert the pool contents into a format compatible with `VectorMemory` interface (used by `@cognitive-swarm/memory-qdrant` for persistence).

```typescript
toVectorMemory(): VectorMemoryEntry[]
```

```typescript
const entries = pool.toVectorMemory()
for (const entry of entries) {
  await qdrantMemory.store(entry.content, entry.metadata)
}
```

---

#### `reset()`

Clear all memories and reset statistics.

```typescript
reset(): void
```

## Types

### `SharedMemory`

```typescript
interface SharedMemory {
  /** Unique memory identifier */
  readonly id: string

  /** ID of the agent that created this memory */
  readonly sourceAgentId: string

  /** The memory content (natural language) */
  readonly content: string

  /** Classification category */
  readonly category: string

  /** Importance score assigned at creation (0-1) */
  readonly importance: number

  /** Embedding vector for similarity search */
  readonly embedding: readonly number[]

  /** Creation timestamp */
  readonly createdAt: number
}
```

### `MemoryState`

Internal state tracked per memory (separate from the immutable `SharedMemory`):

```typescript
interface MemoryState {
  /** Current strength (0-1), decreases with decay */
  strength: number

  /** Number of times this memory has been reinforced */
  reinforcements: number

  /** Set of agent IDs that reinforced this memory */
  reinforcedBy: Set<string>

  /** Timestamp of last access (search hit or reinforcement) */
  lastAccessedAt: number
}
```

### `ShareMemoryInput`

```typescript
interface ShareMemoryInput {
  /** The memory content to store */
  readonly content: string

  /** Category for filtering (e.g., 'discovery', 'proposal', 'challenge') */
  readonly category: string

  /**
   * Importance score (0-1).
   * Higher importance memories are ranked higher
   * in search results at equal similarity.
   */
  readonly importance: number
}
```

### `MemorySearchResult`

```typescript
interface MemorySearchResult {
  /** The matched memory */
  readonly memory: SharedMemory

  /** Relevance score (0-1), combines similarity and strength */
  readonly relevance: number

  /** Current strength of this memory */
  readonly strength: number
}
```

### `MemoryPoolConfig`

```typescript
interface MemoryPoolConfig {
  readonly decay: {
    /** Rate of decay per tick (0-1) */
    readonly rate: number
    /** Number of ticks between decay applications (if using auto-decay) */
    readonly interval: number
  }

  readonly eviction: {
    /** Memories with strength below this are evicted after decay */
    readonly threshold: number
  }

  readonly capacity: {
    /** Maximum number of memories in the pool */
    readonly maxMemories: number
  }

  readonly reinforcement: {
    /** Strength boost per reinforcement */
    readonly boost: number
    /** Maximum strength (cap after reinforcement) */
    readonly maxStrength: number
  }
}
```

### `PoolStats`

```typescript
interface PoolStats {
  /** Total memories currently in the pool */
  readonly totalMemories: number

  /** Average strength across all memories */
  readonly averageStrength: number

  /** Memory count per category */
  readonly categoryCounts: Record<string, number>

  /** Memory count per source agent */
  readonly agentCounts: Record<string, number>

  /** Total memories evicted since creation/reset */
  readonly evictedTotal: number
}
```

## Configuration Reference

| Option                    | Type     | Default  | Description                               |
| ------------------------- | -------- | -------- | ----------------------------------------- |
| `decay.rate`              | `number` | `0.05`   | Strength lost per decay tick               |
| `decay.interval`          | `number` | `1`      | Ticks between auto-decay (if applicable)   |
| `eviction.threshold`      | `number` | `0.1`    | Evict memories below this strength         |
| `capacity.maxMemories`    | `number` | `1000`   | Maximum pool size                          |
| `reinforcement.boost`     | `number` | `0.2`    | Strength added per reinforcement           |
| `reinforcement.maxStrength` | `number` | `1.0`  | Strength cap                               |

## Decay Model

The decay function models natural forgetting with a reinforcement-dependent slowdown:

```
strength(t+1) = strength(t) * (1 - decayRate / (1 + log(1 + reinforcements)))
```

**Intuition:**

- A memory with 0 reinforcements decays at the full rate: `strength *= (1 - 0.05)` = loses 5% per tick
- A memory with 5 reinforcements decays slower: `strength *= (1 - 0.05 / (1 + log(6)))` = loses ~2.3% per tick
- A memory with 20 reinforcements: `strength *= (1 - 0.05 / (1 + log(21)))` = loses ~1.3% per tick

This means collectively valued memories persist longer, while noise is naturally filtered out.

**Eviction:** After each decay tick, memories with `strength < evictionThreshold` are permanently removed. This prevents the pool from accumulating stale, irrelevant memories.

**Capacity:** When the pool is at `maxMemories` and a new memory is shared, the weakest existing memory is evicted to make room.

## Usage Patterns

### Per-round decay in an orchestrator

```typescript
const pool = new SharedMemoryPool()
const orchestrator = new SwarmOrchestrator({ memoryPool: pool })

orchestrator.on('round:end', () => {
  pool.decay()
  const s = pool.stats()
  console.log(`Memories: ${s.totalMemories}, avg strength: ${s.averageStrength.toFixed(2)}`)
})
```

### Agent-driven reinforcement

```typescript
// Inside an agent's think cycle
const relevant = await pool.search(currentContext, 3)

for (const result of relevant) {
  if (result.relevance > 0.7) {
    // This memory is useful to my current reasoning
    pool.reinforce(myAgentId, result.memory.id)
  }
}
```

### Persisting pool to Qdrant between sessions

```typescript
import { SharedMemoryPool } from '@cognitive-swarm/memory-pool'
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'

const pool = new SharedMemoryPool()
const qdrant = new QdrantVectorMemory({ collection: 'swarm-session-1' })
await qdrant.initialize()

// ... run swarm solve, pool accumulates memories ...

// Persist surviving memories
const entries = pool.toVectorMemory()
for (const entry of entries) {
  await qdrant.store(entry.content, entry.metadata)
}

// Next session: load from Qdrant via search
const priorKnowledge = await qdrant.search('previous findings', 20)
for (const item of priorKnowledge) {
  await pool.share('system', {
    content: item.content,
    category: item.metadata?.category ?? 'prior',
    importance: item.strength,
  })
}
```

## Dependencies

- `@cognitive-swarm/core` -- `VectorMemory` interface, shared types
