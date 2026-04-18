# @cognitive-swarm/memory-qdrant

Qdrant-backed VectorMemory -- persistent collective swarm knowledge.

## Install

```bash
npm install @cognitive-swarm/memory-qdrant
```

## Overview

Implements the `VectorMemory` interface from `@cognitive-swarm/core` using [Qdrant](https://qdrant.tech/) as the vector database backend. Provides persistent semantic search over swarm memories that survive across sessions, enabling long-term knowledge accumulation.

## Usage

```typescript
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'
import type { QdrantMemoryConfig } from '@cognitive-swarm/memory-qdrant'

const memory = new QdrantVectorMemory({
  url: 'http://localhost:6333',
  collectionName: 'swarm-memory',
  embeddingProvider: myEmbeddingProvider,
})

// Store a memory
await memory.store({
  content: 'Service X requires at least 3 replicas for HA',
  metadata: { source: 'architect', tags: ['infrastructure'] },
})

// Semantic search
const results = await memory.search('high availability requirements', { limit: 10 })
```

## Configuration

| Option | Description |
|--------|-------------|
| `url` | Qdrant server URL |
| `collectionName` | Name of the Qdrant collection |
| `embeddingProvider` | Function or provider that generates vector embeddings |

## License

MIT

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
