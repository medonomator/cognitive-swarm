# @cognitive-swarm/memory-pool

Shared memory pool -- collective knowledge across swarm agents.

## Install

```bash
npm install @cognitive-swarm/memory-pool
```

## Overview

An in-memory shared knowledge store that agents use to publish and retrieve facts, discoveries, and intermediate results during a swarm session. Supports tagging, relevance search, and memory lifecycle management.

## Usage

```typescript
import { SharedMemoryPool } from '@cognitive-swarm/memory-pool'
import type { MemoryPoolConfig, ShareMemoryInput } from '@cognitive-swarm/memory-pool'

const pool = new SharedMemoryPool(config)

// An agent shares a discovery
pool.share({
  agentId: 'analyst',
  key: 'dataset-correlation',
  content: 'Variables X and Y are strongly correlated (r=0.93)',
  tags: ['statistics', 'correlation'],
})

// Another agent searches for relevant memories
const results = pool.search({ query: 'correlation', limit: 5 })

// Get pool statistics
const stats = pool.stats()
```

## Types

| Type | Description |
|------|-------------|
| `SharedMemory` | A stored memory entry with metadata |
| `MemoryState` | Current state snapshot of the pool |
| `ShareMemoryInput` | Input for sharing a new memory |
| `MemorySearchResult` | Search result with relevance score |
| `MemoryPoolConfig` | Configuration options |
| `PoolStats` | Pool usage statistics |

## License

Apache-2.0

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
