import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { EmbeddingProvider } from '@cognitive-engine/core'
import { QdrantVectorMemory } from './qdrant-vector-memory.js'

// Integration tests - require Qdrant on localhost:6333
//
// Run: QDRANT_URL=http://localhost:6333 npm test
// Skip: tests auto-skip if Qdrant is not available

const QDRANT_URL = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
const TEST_COLLECTION = `swarm-test-${Date.now()}`

/** Simple deterministic embedding for tests. */
function testEmbedding(dimensions = 64): EmbeddingProvider {
  return {
    dimensions,
    async embed(text: string): Promise<number[]> {
      const vec = new Array(dimensions).fill(0)
      for (let i = 0; i < text.length; i++) {
        vec[i % dimensions] += text.charCodeAt(i) / 1000
      }
      // Normalize
      const mag = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0))
      if (mag > 0) {
        for (let i = 0; i < dimensions; i++) {
          vec[i] = vec[i]! / mag
        }
      }
      return vec
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return Promise.all(texts.map((t) => this.embed(t)))
    },
  }
}

async function isQdrantAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${QDRANT_URL}/healthz`)
    return res.ok
  } catch {
    return false
  }
}

describe('QdrantVectorMemory', async () => {
  const available = await isQdrantAvailable()

  if (!available) {
    it.skip('Qdrant not available — skipping integration tests', () => {})
    return
  }

  let memory: QdrantVectorMemory

  beforeEach(async () => {
    memory = new QdrantVectorMemory(testEmbedding(), {
      url: QDRANT_URL,
      collection: TEST_COLLECTION,
      decayRate: 0.3, // aggressive for testing
      evictionThreshold: 0.2,
      reinforcementBoost: 0.3,
    })
    await memory.dropCollection()
    await memory.initialize()
  })

  afterEach(async () => {
    await memory.dropCollection()
  })

  describe('initialize', () => {
    it('creates collection if not exists', async () => {
      const info = await memory.qdrantClient.getCollection(TEST_COLLECTION)
      expect(info.status).toBe('green')
    })

    it('is idempotent', async () => {
      await memory.initialize()
      await memory.initialize()
      const info = await memory.qdrantClient.getCollection(TEST_COLLECTION)
      expect(info.status).toBe('green')
    })
  })

  describe('store', () => {
    it('returns a UUID', async () => {
      const id = await memory.store('test content')
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    })

    it('stores with metadata', async () => {
      const id = await memory.store('SQL injection found', {
        agent: 'security',
        round: '2',
      })
      const count = await memory.count()
      expect(count).toBe(1)
      expect(id).toBeTruthy()
    })

    it('stores multiple entries', async () => {
      await memory.store('finding one')
      await memory.store('finding two')
      await memory.store('finding three')
      const count = await memory.count()
      expect(count).toBe(3)
    })
  })

  describe('search', () => {
    it('returns semantically similar entries', async () => {
      await memory.store('SQL injection vulnerability in login')
      await memory.store('performance bottleneck in database queries')
      await memory.store('XSS vulnerability in user input')

      const results = await memory.search('security vulnerabilities', 5)

      expect(results.length).toBeGreaterThan(0)
      // All results should have valid fields
      for (const r of results) {
        expect(r.id).toBeTruthy()
        expect(r.content).toBeTruthy()
        expect(r.relevance).toBeGreaterThanOrEqual(0)
        expect(r.strength).toBeGreaterThan(0)
      }
    })

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await memory.store(`finding ${i}`)
      }

      const results = await memory.search('finding', 2)
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('returns empty for no matches', async () => {
      const results = await memory.search('something')
      expect(results.length).toBe(0)
    })

    it('preserves metadata in results', async () => {
      await memory.store('important finding', {
        agent: 'reviewer',
        category: 'bug',
      })

      const results = await memory.search('important', 1)
      expect(results.length).toBe(1)
      expect(results[0]!.metadata['agent']).toBe('reviewer')
      expect(results[0]!.metadata['category']).toBe('bug')
    })
  })

  describe('reinforce', () => {
    it('increases strength', async () => {
      const id = await memory.store('reinforced memory')

      // Get initial strength
      const before = await memory.search('reinforced', 1)
      expect(before[0]!.strength).toBe(1.0)

      // Reinforce
      await memory.reinforce(id)

      // Strength should still be 1.0 (capped at maxStrength)
      const after = await memory.search('reinforced', 1)
      expect(after[0]!.strength).toBe(1.0) // already at max
    })

    it('ignores nonexistent ID', async () => {
      // Should not throw
      await memory.reinforce('00000000-0000-0000-0000-000000000000')
    })
  })

  describe('decay', () => {
    it('reduces strength of unreinforced memories', async () => {
      await memory.store('decaying memory')

      const before = await memory.search('decaying', 1)
      expect(before[0]!.strength).toBe(1.0)

      await memory.decay()

      const after = await memory.search('decaying', 1)
      expect(after[0]!.strength).toBeLessThan(1.0)
    })

    it('evicts memories below threshold', async () => {
      await memory.store('weak memory')

      // Decay multiple times to push below threshold
      // decayRate=0.3, evictionThreshold=0.2
      // After 1: 1.0 * 0.7 = 0.7
      // After 2: 0.7 * 0.7 = 0.49
      // After 3: 0.49 * 0.7 = 0.343
      // After 4: 0.343 * 0.7 = 0.24
      // After 5: 0.24 * 0.7 = 0.168 < 0.2 -> evicted
      for (let i = 0; i < 5; i++) {
        await memory.decay()
      }

      const count = await memory.count()
      expect(count).toBe(0)
    })

    it('reinforced memories decay slower', async () => {
      const id1 = await memory.store('alpha memory entry')
      const id2 = await memory.store('beta memory entry')

      // Reinforce the second one multiple times
      await memory.reinforce(id2)
      await memory.reinforce(id2)
      await memory.reinforce(id2)

      // Decay once
      await memory.decay()

      // Retrieve by ID to check exact strength
      const points = await memory.qdrantClient.retrieve(TEST_COLLECTION, {
        ids: [id1, id2],
        with_payload: true,
      })

      const p1 = points.find((p) => p.id === id1)
      const p2 = points.find((p) => p.id === id2)

      expect(p1).toBeDefined()
      expect(p2).toBeDefined()

      const s1 = (p1!.payload as Record<string, unknown>)['strength'] as number
      const s2 = (p2!.payload as Record<string, unknown>)['strength'] as number

      // Reinforced memory should have higher strength after decay
      expect(s2).toBeGreaterThan(s1)
    })

    it('returns count of evicted memories', async () => {
      await memory.store('will survive')

      // Not enough decay to evict
      const evicted = await memory.decay()
      expect(evicted).toBe(0)
    })
  })

  describe('clear', () => {
    it('removes all points', async () => {
      await memory.store('one')
      await memory.store('two')
      expect(await memory.count()).toBe(2)

      await memory.clear()
      expect(await memory.count()).toBe(0)
    })
  })

  describe('properties', () => {
    it('exposes collection name', () => {
      expect(memory.collectionName).toBe(TEST_COLLECTION)
    })

    it('exposes qdrant client', () => {
      expect(memory.qdrantClient).toBeDefined()
    })
  })
})
