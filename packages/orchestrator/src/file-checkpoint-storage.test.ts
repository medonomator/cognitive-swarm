import { describe, it, expect, afterEach } from 'vitest'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { SolveCheckpoint, Signal, AgentContribution } from '@cognitive-swarm/core'
import { FileCheckpointStorage } from './file-checkpoint-storage.js'

const TEST_DIR = join(tmpdir(), `ckpt-test-${Date.now()}`)

function makeCheckpoint(overrides?: Partial<SolveCheckpoint>): SolveCheckpoint {
  const contributions = new Map<string, AgentContribution>([
    ['agent-1', {
      agentId: 'agent-1',
      signalsEmitted: 3,
      proposalsMade: 1,
      challengesMade: 0,
      votesCast: 2,
      avgConfidence: 0.75,
    }],
    ['agent-2', {
      agentId: 'agent-2',
      signalsEmitted: 2,
      proposalsMade: 0,
      challengesMade: 1,
      votesCast: 1,
      avgConfidence: 0.6,
    }],
  ])

  return {
    task: 'test task',
    roundsCompleted: 3,
    signals: [
      {
        id: 'sig-1',
        type: 'task:new',
        source: 'orchestrator',
        payload: { task: 'test task' },
        confidence: 1,
        timestamp: 1000,
      } as Signal,
      {
        id: 'sig-2',
        type: 'discovery',
        source: 'agent-1',
        payload: { finding: 'something', relevance: 0.9 },
        confidence: 0.8,
        timestamp: 2000,
      } as Signal,
    ],
    agentContributions: contributions,
    tokensUsed: 1500,
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('FileCheckpointStorage', () => {
  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('saves and loads a checkpoint', async () => {
    const storage = new FileCheckpointStorage(TEST_DIR)
    const checkpoint = makeCheckpoint()

    await storage.save('run-1', checkpoint)
    const loaded = await storage.load('run-1')

    expect(loaded).not.toBeNull()
    expect(loaded!.task).toBe('test task')
    expect(loaded!.roundsCompleted).toBe(3)
    expect(loaded!.tokensUsed).toBe(1500)
    expect(loaded!.signals).toHaveLength(2)
    expect(loaded!.signals[0]!.id).toBe('sig-1')
    expect(loaded!.signals[1]!.id).toBe('sig-2')
  })

  it('returns null for non-existent checkpoint', async () => {
    const storage = new FileCheckpointStorage(TEST_DIR)
    const loaded = await storage.load('does-not-exist')
    expect(loaded).toBeNull()
  })

  it('deletes a checkpoint', async () => {
    const storage = new FileCheckpointStorage(TEST_DIR)
    const checkpoint = makeCheckpoint()

    await storage.save('run-1', checkpoint)
    await storage.delete('run-1')

    const loaded = await storage.load('run-1')
    expect(loaded).toBeNull()
  })

  it('delete is a no-op for non-existent checkpoint', async () => {
    const storage = new FileCheckpointStorage(TEST_DIR)
    // Should not throw
    await storage.delete('does-not-exist')
  })

  it('serializes and deserializes Map correctly', async () => {
    const storage = new FileCheckpointStorage(TEST_DIR)
    const checkpoint = makeCheckpoint()

    await storage.save('run-map', checkpoint)
    const loaded = await storage.load('run-map')

    expect(loaded).not.toBeNull()
    expect(loaded!.agentContributions).toBeInstanceOf(Map)
    expect(loaded!.agentContributions.size).toBe(2)

    const agent1 = loaded!.agentContributions.get('agent-1')
    expect(agent1).toBeDefined()
    expect(agent1!.agentId).toBe('agent-1')
    expect(agent1!.signalsEmitted).toBe(3)
    expect(agent1!.proposalsMade).toBe(1)
    expect(agent1!.avgConfidence).toBe(0.75)

    const agent2 = loaded!.agentContributions.get('agent-2')
    expect(agent2).toBeDefined()
    expect(agent2!.agentId).toBe('agent-2')
    expect(agent2!.challengesMade).toBe(1)
  })

  it('overwrites existing checkpoint on save', async () => {
    const storage = new FileCheckpointStorage(TEST_DIR)

    await storage.save('run-1', makeCheckpoint({ roundsCompleted: 1 }))
    await storage.save('run-1', makeCheckpoint({ roundsCompleted: 5 }))

    const loaded = await storage.load('run-1')
    expect(loaded!.roundsCompleted).toBe(5)
  })
})
