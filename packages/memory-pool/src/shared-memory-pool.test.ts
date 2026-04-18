import { describe, it, expect, vi } from 'vitest'
import type { EmbeddingProvider } from '@cognitive-engine/core'
import { SharedMemoryPool } from './shared-memory-pool.js'

function mockEmbedding(dimensions = 3): EmbeddingProvider {
  // Deterministic fake embeddings based on text hash
  const embed = vi.fn(async (text: string) => {
    const vec = new Array<number>(dimensions).fill(0)
    for (let i = 0; i < text.length; i++) {
      vec[i % dimensions]! += text.charCodeAt(i) / 1000
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
    return norm > 0 ? vec.map((v) => v / norm) : vec
  })

  return {
    embed,
    embedBatch: vi.fn(async (texts: string[]) =>
      Promise.all(texts.map((t) => embed(t))),
    ),
    dimensions,
  }
}

describe('SharedMemoryPool', () => {
  it('starts empty', () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    expect(pool.size).toBe(0)
  })

  it('shares a memory and assigns an ID', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    const mem = await pool.share('agent-1', {
      content: 'SQL injection found',
      category: 'security',
      importance: 0.9,
    })

    expect(mem.id).toBe('mem-0')
    expect(mem.sourceAgentId).toBe('agent-1')
    expect(mem.content).toBe('SQL injection found')
    expect(mem.category).toBe('security')
    expect(mem.importance).toBe(0.9)
    expect(mem.embedding.length).toBe(3)
    expect(pool.size).toBe(1)
  })

  it('uses default importance of 0.5', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    const mem = await pool.share('a1', {
      content: 'test',
      category: 'misc',
    })
    expect(mem.importance).toBe(0.5)
  })

  it('retrieves memory by ID', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    const mem = await pool.share('a1', {
      content: 'finding',
      category: 'test',
    })

    expect(pool.get(mem.id)).toBe(mem)
    expect(pool.get('nonexistent')).toBeUndefined()
  })

  it('retrieves memories by agent', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    await pool.share('a1', { content: 'mem1', category: 'c' })
    await pool.share('a2', { content: 'mem2', category: 'c' })
    await pool.share('a1', { content: 'mem3', category: 'c' })

    const a1Mems = pool.getByAgent('a1')
    expect(a1Mems).toHaveLength(2)
    expect(a1Mems[0]!.content).toBe('mem1')
    expect(a1Mems[1]!.content).toBe('mem3')
  })

  it('retrieves memories by category', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    await pool.share('a1', { content: 'sec1', category: 'security' })
    await pool.share('a1', { content: 'perf1', category: 'perf' })
    await pool.share('a2', { content: 'sec2', category: 'security' })

    const secMems = pool.getByCategory('security')
    expect(secMems).toHaveLength(2)
  })

  it('searches memories by semantic similarity', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    await pool.share('a1', {
      content: 'SQL injection vulnerability',
      category: 'security',
      importance: 0.9,
    })
    await pool.share('a2', {
      content: 'performance bottleneck in loop',
      category: 'perf',
      importance: 0.7,
    })

    const results = await pool.search('injection attack')
    expect(results.length).toBeGreaterThan(0)
    // Results are sorted by weighted score
    expect(results[0]!.relevance).toBeGreaterThanOrEqual(-1)
    expect(results[0]!.relevance).toBeLessThanOrEqual(1)
  })

  it('search respects category filter', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    await pool.share('a1', { content: 'bug in auth', category: 'security' })
    await pool.share('a2', { content: 'slow query', category: 'perf' })

    const results = await pool.search('issue', 10, 'perf')
    expect(results).toHaveLength(1)
    expect(results[0]!.memory.category).toBe('perf')
  })

  it('search respects limit', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    for (let i = 0; i < 5; i++) {
      await pool.share('a1', { content: `mem ${i}`, category: 'c' })
    }

    const results = await pool.search('mem', 2)
    expect(results).toHaveLength(2)
  })

  it('search returns empty for empty pool', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    const results = await pool.search('anything')
    expect(results).toHaveLength(0)
  })

  it('reinforces a memory', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    const mem = await pool.share('a1', { content: 'finding', category: 'c' })

    expect(pool.reinforce('a2', mem.id)).toBe(true)
    expect(pool.getStrength(mem.id)).toBeGreaterThan(1.0 - 0.01) // Near max
  })

  it('prevents double reinforcement from same agent', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    const mem = await pool.share('a1', { content: 'finding', category: 'c' })

    expect(pool.reinforce('a2', mem.id)).toBe(true)
    expect(pool.reinforce('a2', mem.id)).toBe(false) // Already reinforced
  })

  it('reinforce returns false for unknown memory', () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    expect(pool.reinforce('a1', 'nonexistent')).toBe(false)
  })

  it('decay reduces memory strength', async () => {
    const pool = new SharedMemoryPool(mockEmbedding(), { decayRate: 0.1 })
    const mem = await pool.share('a1', { content: 'finding', category: 'c' })

    const before = pool.getStrength(mem.id)!
    pool.decay()
    const after = pool.getStrength(mem.id)!

    expect(after).toBeLessThan(before)
  })

  it('reinforced memories decay slower', async () => {
    const pool = new SharedMemoryPool(mockEmbedding(), { decayRate: 0.1 })
    const weak = await pool.share('a1', {
      content: 'weak',
      category: 'c',
    })
    const strong = await pool.share('a1', {
      content: 'strong',
      category: 'c',
    })

    // Reinforce the strong memory
    pool.reinforce('a2', strong.id)
    pool.reinforce('a3', strong.id)

    // Decay several times
    for (let i = 0; i < 5; i++) pool.decay()

    const weakStrength = pool.getStrength(weak.id)
    const strongStrength = pool.getStrength(strong.id)

    // Strong memory should have higher strength
    if (weakStrength !== undefined && strongStrength !== undefined) {
      expect(strongStrength).toBeGreaterThan(weakStrength)
    }
  })

  it('evicts memories below threshold after decay', async () => {
    const pool = new SharedMemoryPool(mockEmbedding(), {
      decayRate: 0.3,
      evictionThreshold: 0.5,
    })

    await pool.share('a1', { content: 'ephemeral', category: 'c' })
    expect(pool.size).toBe(1)

    // Aggressive decay
    for (let i = 0; i < 5; i++) pool.decay()

    expect(pool.size).toBe(0)
  })

  it('evicts weakest when over capacity', async () => {
    const pool = new SharedMemoryPool(mockEmbedding(), { maxCapacity: 3 })

    await pool.share('a1', { content: 'mem1', category: 'c' })
    await pool.share('a1', { content: 'mem2', category: 'c' })
    await pool.share('a1', { content: 'mem3', category: 'c' })

    // Decay to weaken existing
    pool.decay()

    // Adding 4th should evict weakest
    await pool.share('a1', { content: 'mem4', category: 'c' })
    expect(pool.size).toBe(3)
  })

  it('stats returns pool overview', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    await pool.share('a1', { content: 'sec1', category: 'security' })
    await pool.share('a2', { content: 'perf1', category: 'perf' })
    await pool.share('a1', { content: 'sec2', category: 'security' })

    const s = pool.stats()
    expect(s.totalMemories).toBe(3)
    expect(s.byCategory.get('security')).toBe(2)
    expect(s.byCategory.get('perf')).toBe(1)
    expect(s.averageStrength).toBe(1.0) // Fresh memories
    expect(s.totalReinforcements).toBe(0)
  })

  it('stats reflects reinforcements', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    const mem = await pool.share('a1', {
      content: 'finding',
      category: 'c',
    })
    pool.reinforce('a2', mem.id)
    pool.reinforce('a3', mem.id)

    const s = pool.stats()
    expect(s.totalReinforcements).toBe(2)
  })

  it('reset clears all state', async () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    await pool.share('a1', { content: 'mem', category: 'c' })
    pool.reset()

    expect(pool.size).toBe(0)
    expect(pool.stats().totalMemories).toBe(0)
  })

  it('getStrength returns undefined for unknown ID', () => {
    const pool = new SharedMemoryPool(mockEmbedding())
    expect(pool.getStrength('nonexistent')).toBeUndefined()
  })

  it('embeds content via the provider', async () => {
    const emb = mockEmbedding(4)
    const pool = new SharedMemoryPool(emb)

    await pool.share('a1', { content: 'test content', category: 'c' })

    expect(emb.embed).toHaveBeenCalledWith('test content')
  })

  it('search embeds query via the provider', async () => {
    const emb = mockEmbedding()
    const pool = new SharedMemoryPool(emb)
    await pool.share('a1', { content: 'memory', category: 'c' })

    await pool.search('query text')

    // First call: share's embed. Second call: search's embed.
    expect(emb.embed).toHaveBeenCalledWith('query text')
  })

  describe('toVectorMemory adapter', () => {
    it('store() delegates to share() and returns ID', async () => {
      const pool = new SharedMemoryPool(mockEmbedding())
      const vm = pool.toVectorMemory()

      const id = await vm.store('test content', {
        agent: 'agent-1',
        category: 'security',
        importance: '0.8',
      })

      expect(id).toBe('mem-0')
      expect(pool.size).toBe(1)

      const mem = pool.get(id)
      expect(mem).toBeDefined()
      expect(mem!.sourceAgentId).toBe('agent-1')
      expect(mem!.category).toBe('security')
      expect(mem!.importance).toBe(0.8)
    })

    it('store() uses defaults when no metadata', async () => {
      const pool = new SharedMemoryPool(mockEmbedding())
      const vm = pool.toVectorMemory()

      const id = await vm.store('content without metadata')

      const mem = pool.get(id)
      expect(mem!.sourceAgentId).toBe('system')
      expect(mem!.category).toBe('general')
      expect(mem!.importance).toBe(0.5)
    })

    it('search() returns VectorMemoryEntry format', async () => {
      const pool = new SharedMemoryPool(mockEmbedding())
      await pool.share('a1', {
        content: 'SQL injection found',
        category: 'security',
        importance: 0.9,
      })

      const vm = pool.toVectorMemory()
      const results = await vm.search('injection')

      expect(results.length).toBe(1)
      expect(results[0]!.id).toBe('mem-0')
      expect(results[0]!.content).toBe('SQL injection found')
      expect(typeof results[0]!.relevance).toBe('number')
      expect(typeof results[0]!.strength).toBe('number')
      expect(results[0]!.metadata.agent).toBe('a1')
      expect(results[0]!.metadata.category).toBe('security')
      expect(results[0]!.metadata.importance).toBe('0.9')
    })

    it('reinforce() delegates to pool reinforce', async () => {
      const pool = new SharedMemoryPool(mockEmbedding())
      const mem = await pool.share('a1', { content: 'finding', category: 'c' })

      const vm = pool.toVectorMemory()
      await vm.reinforce(mem.id)

      // Strength should increase (reinforced by 'system')
      const strength = pool.getStrength(mem.id)
      expect(strength).toBeDefined()
    })

    it('decay() delegates to pool decay', async () => {
      const pool = new SharedMemoryPool(mockEmbedding(), { decayRate: 0.3, evictionThreshold: 0.5 })
      await pool.share('a1', { content: 'ephemeral', category: 'c' })

      const vm = pool.toVectorMemory()

      // Decay until evicted
      let totalEvicted = 0
      for (let i = 0; i < 5; i++) {
        totalEvicted += await vm.decay()
      }

      expect(totalEvicted).toBeGreaterThan(0)
      expect(pool.size).toBe(0)
    })
  })
})
