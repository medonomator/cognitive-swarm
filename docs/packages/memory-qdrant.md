# @cognitive-swarm/memory-qdrant

Qdrant-backed persistent vector memory with decay and reinforcement.

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/memory-qdrant)](https://www.npmjs.com/package/@cognitive-swarm/memory-qdrant)

## Install

```bash
npm install @cognitive-swarm/memory-qdrant
```

::: tip Peer Dependency
This package requires `@qdrant/js-client-rest` as a peer dependency:

```bash
npm install @qdrant/js-client-rest
```
:::

## Overview

`QdrantVectorMemory` implements the `VectorMemory` interface from `@cognitive-swarm/core`, providing persistent vector storage backed by [Qdrant](https://qdrant.tech/). Unlike the in-memory `SharedMemoryPool`, memories stored here survive process restarts and can be shared across multiple swarm sessions.

The same decay model used by `@cognitive-swarm/memory-pool` applies here -- memories lose strength over time unless reinforced, and weak memories are evicted during decay cycles.

**When to use which:**

| Feature            | `memory-pool`       | `memory-qdrant`      |
| ------------------ | ------------------- | -------------------- |
| Storage            | In-memory            | Qdrant (persistent)  |
| Survives restart   | No                   | Yes                  |
| Cross-session      | No                   | Yes                  |
| Capacity           | ~1000 (configurable) | Millions+            |
| Latency            | Sub-millisecond      | Network-dependent    |
| Best for           | Single solve session | Long-term knowledge  |

## Quick Start

```typescript
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'

const memory = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collection: 'swarm-memory',
  decayRate: 0.05,
  evictionThreshold: 0.1,
  reinforcementBoost: 0.2,
  maxStrength: 1.0,
})

// Initialize (creates collection if needed)
await memory.initialize()

// Store a memory
const id = await memory.store(
  'Merge sort has O(n log n) time complexity in all cases',
  {
    category: 'discovery',
    agentId: 'analyst-1',
    taskType: 'algorithms',
    importance: 0.85,
  },
)

// Search for relevant memories
const results = await memory.search('sorting algorithm complexity', 5)
for (const r of results) {
  console.log(`[${r.score.toFixed(2)}] ${r.content}`)
}

// Reinforce a useful memory
await memory.reinforce(id)

// Apply decay
await memory.decay()

// Check collection size
const total = await memory.count()
console.log(`Total memories: ${total}`)
```

## API Reference

### `QdrantVectorMemory`

Implements the `VectorMemory` interface with Qdrant as the backing store.

#### Constructor

```typescript
new QdrantVectorMemory(config: QdrantMemoryConfig)
```

---

#### `initialize()`

Initialize the Qdrant collection. Creates the collection if it does not exist, with the appropriate vector configuration.

```typescript
async initialize(): Promise<void>
```

**Must be called before any other method.** Safe to call multiple times -- existing collections are not modified.

```typescript
const memory = new QdrantVectorMemory({ url: 'http://localhost:6333' })
await memory.initialize()
```

---

#### `store(content, metadata?)`

Store a new memory with its embedding vector.

```typescript
async store(
  content: string,
  metadata?: MemoryMetadata,
): Promise<string>
```

**Parameters:**

| Parameter  | Type              | Description                              |
| ---------- | ----------------- | ---------------------------------------- |
| `content`  | `string`          | The memory content (natural language)    |
| `metadata` | `MemoryMetadata`  | Optional metadata for filtering/context  |

**Returns:** The generated memory ID (UUID).

The content is embedded using the configured embedding provider and stored as a Qdrant point with the following payload fields:

- `content` -- the raw text
- `strength` -- initial value `1.0`
- `reinforcements` -- initial value `0`
- `createdAt` -- ISO timestamp
- `lastAccessedAt` -- ISO timestamp
- All fields from `metadata`

```typescript
const id = await memory.store(
  'The system exhibits emergent behavior under high load',
  {
    category: 'discovery',
    agentId: 'observer-1',
    importance: 0.9,
    taskType: 'systems-analysis',
    tags: ['emergence', 'scalability'],
  },
)
```

---

#### `search(query, limit?)`

Search for memories similar to a query.

```typescript
async search(
  query: string,
  limit?: number,
): Promise<MemorySearchResult[]>
```

**Parameters:**

| Parameter | Type     | Default | Description                       |
| --------- | -------- | ------- | --------------------------------- |
| `query`   | `string` | --      | Natural-language search query     |
| `limit`   | `number` | `10`    | Maximum number of results         |

**Returns:** Array of `MemorySearchResult` sorted by score (highest first).

The score combines Qdrant's vector similarity with the memory's current strength, so reinforced memories rank higher at equal semantic distance.

```typescript
const results = await memory.search('distributed consensus algorithms', 5)

for (const r of results) {
  console.log(`[${r.score.toFixed(3)}] (strength: ${r.strength.toFixed(2)}) ${r.content}`)
  if (r.metadata?.category) {
    console.log(`  category: ${r.metadata.category}`)
  }
}
```

---

#### `reinforce(id)`

Reinforce a memory, boosting its strength and slowing future decay.

```typescript
async reinforce(id: string): Promise<void>
```

Each call:

1. Increments `reinforcements` by 1
2. Increases `strength` by `reinforcementBoost` (capped at `maxStrength`)
3. Updates `lastAccessedAt`

```typescript
// An agent found this memory useful
await memory.reinforce(result.id)
```

---

#### `decay()`

Apply one decay tick to all memories in the collection. Evict memories below the threshold.

```typescript
async decay(): Promise<void>
```

Uses the same formula as `@cognitive-swarm/memory-pool`:

```
strength(t+1) = strength(t) * (1 - decayRate / (1 + log(1 + reinforcements)))
```

After updating strengths, all points with `strength < evictionThreshold` are deleted from Qdrant.

::: warning Performance
Decay iterates over all points in the collection using scroll queries. For very large collections (100k+), consider running decay during off-peak times or batching with a custom scroll size.
:::

```typescript
// Daily decay job
import cron from 'node-cron'

cron.schedule('0 3 * * *', async () => {
  await memory.decay()
  const remaining = await memory.count()
  console.log(`Post-decay: ${remaining} memories`)
})
```

---

#### `clear()`

Remove all points from the collection without dropping it.

```typescript
async clear(): Promise<void>
```

---

#### `dropCollection()`

Drop the entire Qdrant collection. Requires `initialize()` again before further use.

```typescript
async dropCollection(): Promise<void>
```

---

#### `count()`

Get the total number of memories in the collection.

```typescript
async count(): Promise<number>
```

## Types

### `QdrantMemoryConfig`

```typescript
interface QdrantMemoryConfig {
  /** Qdrant server URL */
  readonly url: string

  /** Collection name in Qdrant */
  readonly collection: string

  /** Decay rate per tick (0-1) */
  readonly decayRate: number

  /** Evict memories with strength below this value */
  readonly evictionThreshold: number

  /** Strength boost per reinforcement call */
  readonly reinforcementBoost: number

  /** Maximum strength value (cap) */
  readonly maxStrength: number

  /** Optional Qdrant API key for authenticated clusters */
  readonly apiKey?: string

  /** Embedding dimension (must match your embedding model) */
  readonly embeddingDimension?: number

  /** Embedding provider (defaults to internal provider from @cognitive-engine/core) */
  readonly embeddingProvider?: EmbeddingProvider
}
```

### `MemoryMetadata`

```typescript
interface MemoryMetadata {
  /** Category for filtering (e.g., 'discovery', 'proposal') */
  readonly category?: string

  /** Source agent ID */
  readonly agentId?: string

  /** Task type for context */
  readonly taskType?: string

  /** Importance score (0-1) */
  readonly importance?: number

  /** Free-form tags */
  readonly tags?: readonly string[]

  /** Any additional key-value pairs */
  readonly [key: string]: unknown
}
```

### `MemorySearchResult`

```typescript
interface MemorySearchResult {
  /** Memory ID in Qdrant */
  readonly id: string

  /** The stored content text */
  readonly content: string

  /** Combined relevance score (similarity * strength) */
  readonly score: number

  /** Current memory strength (0-1) */
  readonly strength: number

  /** Number of reinforcements received */
  readonly reinforcements: number

  /** Stored metadata */
  readonly metadata?: MemoryMetadata
}
```

### `VectorMemory` (interface from `@cognitive-swarm/core`)

```typescript
interface VectorMemory {
  initialize(): Promise<void>
  store(content: string, metadata?: Record<string, unknown>): Promise<string>
  search(query: string, limit?: number): Promise<MemorySearchResult[]>
  reinforce(id: string): Promise<void>
  decay(): Promise<void>
  clear(): Promise<void>
}
```

`QdrantVectorMemory` implements this interface fully plus adds `dropCollection()` and `count()`.

### `EmbeddingProvider`

```typescript
interface EmbeddingProvider {
  /** Convert text to a vector embedding */
  embed(text: string): Promise<number[]>

  /** Convert multiple texts to embeddings in batch */
  embedBatch?(texts: string[]): Promise<number[][]>

  /** Embedding dimension */
  readonly dimension: number
}
```

## Configuration Reference

| Option                | Type                | Default            | Description                              |
| --------------------- | ------------------- | ------------------ | ---------------------------------------- |
| `url`                 | `string`            | `http://localhost:6333` | Qdrant server URL                    |
| `collection`          | `string`            | `swarm-memory`     | Qdrant collection name                   |
| `decayRate`           | `number`            | `0.05`             | Strength decay per tick                  |
| `evictionThreshold`   | `number`            | `0.1`              | Evict below this strength                |
| `reinforcementBoost`  | `number`            | `0.2`              | Strength added per reinforcement         |
| `maxStrength`         | `number`            | `1.0`              | Strength cap                             |
| `apiKey`              | `string`             | --                | Qdrant API key (optional)                |
| `embeddingDimension`  | `number`            | `1536`             | Must match embedding model output        |
| `embeddingProvider`   | `EmbeddingProvider` | --                 | Custom embedding provider                |

## Decay Model

Identical to `@cognitive-swarm/memory-pool`:

```
strength(t+1) = strength(t) * (1 - decayRate / (1 + log(1 + reinforcements)))
```

**Decay rate examples** (with default `decayRate = 0.05`):

| Reinforcements | Effective decay per tick | Ticks to reach 0.1 (eviction) |
| -------------- | ------------------------ | ----------------------------- |
| 0              | 5.0%                     | ~45                           |
| 3              | 2.8%                     | ~82                           |
| 10             | 1.7%                     | ~134                          |
| 50             | 1.1%                     | ~208                          |

## Usage Patterns

### Swarm orchestrator with persistent memory

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'

const memory = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collection: 'project-knowledge',
  decayRate: 0.02,  // slow decay for long-term knowledge
})

await memory.initialize()

const orchestrator = new SwarmOrchestrator({
  vectorMemory: memory,
  // ... other config
})

// Memories persist across multiple solves
await orchestrator.solve('Analyze the caching layer')
await orchestrator.solve('Design the failover mechanism')
// Second solve can access discoveries from the first
```

### Migrating from in-memory pool to Qdrant

```typescript
import { SharedMemoryPool } from '@cognitive-swarm/memory-pool'
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'

const pool = new SharedMemoryPool()
const qdrant = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collection: 'migrated-memories',
})

await qdrant.initialize()

// Export from pool
const entries = pool.toVectorMemory()

// Import to Qdrant
for (const entry of entries) {
  await qdrant.store(entry.content, {
    category: entry.category,
    agentId: entry.sourceAgentId,
    importance: entry.importance,
  })
}

console.log(`Migrated ${entries.length} memories to Qdrant`)
```

### Multi-collection architecture

```typescript
// Separate collections for different knowledge domains
const factualMemory = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collection: 'factual-knowledge',
  decayRate: 0.01,  // facts decay slowly
})

const proceduralMemory = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collection: 'procedural-knowledge',
  decayRate: 0.03,
})

const episodicMemory = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collection: 'episodic-memory',
  decayRate: 0.1,  // episodes decay faster
})

await Promise.all([
  factualMemory.initialize(),
  proceduralMemory.initialize(),
  episodicMemory.initialize(),
])

// Route memories to appropriate stores
async function routeMemory(content: string, category: string) {
  switch (category) {
    case 'fact':
    case 'discovery':
      return factualMemory.store(content, { category })
    case 'procedure':
    case 'algorithm':
      return proceduralMemory.store(content, { category })
    case 'event':
    case 'interaction':
      return episodicMemory.store(content, { category })
    default:
      return factualMemory.store(content, { category })
  }
}

// Search across all stores
async function searchAll(query: string, limit: number = 5) {
  const [facts, procedures, episodes] = await Promise.all([
    factualMemory.search(query, limit),
    proceduralMemory.search(query, limit),
    episodicMemory.search(query, limit),
  ])

  return [...facts, ...procedures, ...episodes]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
```

### Docker Compose setup with Qdrant

```yaml
# docker-compose.yml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - '6333:6333'
      - '6334:6334'  # gRPC
    volumes:
      - qdrant-data:/qdrant/storage
    environment:
      QDRANT__SERVICE__GRPC_PORT: 6334

  swarm-app:
    build: .
    depends_on:
      - qdrant
    environment:
      QDRANT_URL: http://qdrant:6333
      QDRANT_COLLECTION: swarm-memory

volumes:
  qdrant-data:
```

```typescript
// In your application
const memory = new QdrantVectorMemory({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  collection: process.env.QDRANT_COLLECTION ?? 'swarm-memory',
})
```

## Dependencies

- `@cognitive-swarm/core` -- `VectorMemory` interface, shared types
- `@qdrant/js-client-rest` -- Qdrant JavaScript client (peer dependency)
