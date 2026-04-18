# @cognitive-swarm/memory-qdrant

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/memory-qdrant)](https://www.npmjs.com/package/@cognitive-swarm/memory-qdrant)

Qdrant-backed persistent vector memory with decay and reinforcement. Implements the `VectorMemory` interface from `@cognitive-swarm/core`.

## Install

```bash
npm install @cognitive-swarm/memory-qdrant @qdrant/js-client-rest
```

`@qdrant/js-client-rest` is a required peer dependency.

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

await memory.initialize()  // creates collection if needed

// Store
const id = await memory.store('Merge sort is O(n log n) in all cases', {
  category: 'discovery',
  agentId: 'analyst-1',
  importance: 0.85,
})

// Search
const results = await memory.search('sorting algorithm complexity', 5)
for (const r of results) {
  console.log(`[${r.score.toFixed(2)}] ${r.content}`)
}

// Reinforce and decay
await memory.reinforce(id)
await memory.decay()
```

## When to Use

| Feature | `memory-pool` | `memory-qdrant` |
|---------|--------------|----------------|
| Storage | In-memory | Qdrant (persistent) |
| Survives restart | No | Yes |
| Cross-session | No | Yes |
| Capacity | ~1000 | Millions+ |
| Latency | Sub-ms | Network-dependent |
| Best for | Single solve session | Long-term knowledge |

## API

### `initialize(): Promise<void>`

Create the Qdrant collection if it does not exist. **Must be called before any other method.**

### `store(content, metadata?): Promise<string>`

Store a memory with its embedding. Returns the generated UUID.

### `search(query, limit?): Promise<MemorySearchResult[]>`

Semantic search. Score combines vector similarity with current strength.

### `reinforce(id): Promise<void>`

Boost strength and slow future decay.

### `decay(): Promise<void>`

Apply one decay tick to all memories, using the same formula as `memory-pool`:

```
strength(t+1) = strength(t) * (1 - decayRate / (1 + log(1 + reinforcements)))
```

Evicts memories below threshold.

### `count(): Promise<number>`, `clear(): Promise<void>`, `dropCollection(): Promise<void>`

Collection management methods.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `http://localhost:6333` | Qdrant server URL |
| `collection` | `string` | `swarm-memory` | Collection name |
| `decayRate` | `number` | `0.05` | Strength decay per tick |
| `evictionThreshold` | `number` | `0.1` | Evict below this strength |
| `reinforcementBoost` | `number` | `0.2` | Strength added per reinforcement |
| `maxStrength` | `number` | `1.0` | Strength cap |
| `apiKey` | `string` | -- | Qdrant API key (optional) |
| `embeddingDimension` | `number` | `1536` | Must match embedding model |
| `embeddingProvider` | `EmbeddingProvider` | -- | Custom embedding provider |

## Usage with Orchestrator

```typescript
const memory = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collection: 'project-knowledge',
  decayRate: 0.02,  // slow decay for long-term knowledge
})
await memory.initialize()

const swarm = new SwarmOrchestrator({
  vectorMemory: memory,
  // ... other config
})

// Memories persist across multiple solves
await swarm.solve('Analyze the caching layer')
await swarm.solve('Design the failover mechanism')
```

## Docker Compose

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - '6333:6333'
    volumes:
      - qdrant-data:/qdrant/storage

volumes:
  qdrant-data:
```

## Migrating from memory-pool

```typescript
const entries = pool.toVectorMemory()
for (const entry of entries) {
  await qdrant.store(entry.content, {
    category: entry.category,
    agentId: entry.sourceAgentId,
    importance: entry.importance,
  })
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/memory-qdrant) | [GitHub](https://github.com/medonomator/cognitive-swarm)
