# @cognitive-swarm/memory-pool

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/memory-pool)](https://www.npmjs.com/package/@cognitive-swarm/memory-pool)

In-memory collective memory with decay, reinforcement, and similarity search. Memories naturally decay unless reinforced by agents, creating an organic signal of collective importance.

## Install

```bash
npm install @cognitive-swarm/memory-pool
```

## Quick Start

```typescript
import { SharedMemoryPool } from '@cognitive-swarm/memory-pool'

const pool = new SharedMemoryPool({
  decay: { rate: 0.05, interval: 1 },
  eviction: { threshold: 0.1 },
  capacity: { maxMemories: 1000 },
  reinforcement: { boost: 0.2, maxStrength: 1.0 },
})

// Agent shares a discovery
const memory = await pool.share('analyst-1', {
  content: 'Dataset contains seasonal patterns with 12-month cycle',
  category: 'discovery',
  importance: 0.8,
})

// Another agent reinforces it
pool.reinforce('coder-1', memory.id)

// Search for relevant memories
const results = await pool.search('seasonal trends in data', 5)
for (const r of results) {
  console.log(`[${r.relevance.toFixed(2)}] ${r.memory.content}`)
}

// Apply decay (typically once per round)
pool.decay()
```

## API

### `share(agentId, input): Promise<SharedMemory>`

Add a new memory to the pool. Returns the created memory with initial strength of 1.0.

### `search(query, limit?, category?): Promise<MemorySearchResult[]>`

Find memories by embedding similarity, weighted by current strength. Optionally filter by category.

### `reinforce(agentId, memoryId): void`

Boost a memory's strength and slow its decay. Each reinforcement increments the counter and adds the agent to `reinforcedBy`.

### `decay(): void`

Apply one decay tick. The formula:

```
strength(t+1) = strength(t) * (1 - decayRate / (1 + log(1 + reinforcements)))
```

Reinforced memories decay slower. Memories below `evictionThreshold` are permanently removed.

### `get(id)`, `getStrength(id)`, `getByAgent(agentId)`, `getByCategory(category)`

Direct lookups.

### `stats(): PoolStats`

```typescript
const s = pool.stats()
// s.totalMemories, s.averageStrength, s.categoryCounts, s.agentCounts, s.evictedTotal
```

### `toVectorMemory(): VectorMemoryEntry[]`

Export pool contents for persistence to `@cognitive-swarm/memory-qdrant`.

### `reset(): void`

Clear all memories and reset statistics.

## Decay Model

| Reinforcements | Effective Decay/Tick (rate=0.05) | Ticks to Eviction |
|----------------|----------------------------------|-------------------|
| 0 | 5.0% | ~45 |
| 5 | ~2.3% | ~82 |
| 20 | ~1.3% | ~134 |

Collectively valued memories persist longer; noise is naturally filtered.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `decay.rate` | `number` | `0.05` | Strength lost per tick |
| `decay.interval` | `number` | `1` | Ticks between auto-decay |
| `eviction.threshold` | `number` | `0.1` | Evict below this strength |
| `capacity.maxMemories` | `number` | `1000` | Max pool size |
| `reinforcement.boost` | `number` | `0.2` | Strength added per reinforcement |
| `reinforcement.maxStrength` | `number` | `1.0` | Strength cap |

## Usage with Orchestrator

```typescript
const pool = new SharedMemoryPool()
const orchestrator = new SwarmOrchestrator({ memoryPool: pool })

orchestrator.on('round:end', () => {
  pool.decay()
  const s = pool.stats()
  console.log(`Memories: ${s.totalMemories}, avg strength: ${s.averageStrength.toFixed(2)}`)
})
```

## Persisting to Qdrant

```typescript
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'

const entries = pool.toVectorMemory()
for (const entry of entries) {
  await qdrant.store(entry.content, entry.metadata)
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/memory-pool) | [GitHub](https://github.com/medonomator/cognitive-swarm)
