import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckpointStorage, SolveCheckpoint, AgentContribution } from '@cognitive-swarm/core'

/**
 * File-based checkpoint storage for resumable solves.
 *
 * Saves JSON files to a directory. Handles Map serialization
 * by converting to/from [key, value] pair arrays.
 */
export class FileCheckpointStorage implements CheckpointStorage {
  constructor(private readonly dir: string) {}

  async save(id: string, data: SolveCheckpoint): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const serialized = {
      ...data,
      agentContributions: [...data.agentContributions.entries()],
    }
    await writeFile(this.filePath(id), JSON.stringify(serialized, null, 2), 'utf-8')
  }

  async load(id: string): Promise<SolveCheckpoint | null> {
    try {
      const raw = await readFile(this.filePath(id), 'utf-8')
      const parsed = JSON.parse(raw) as {
        task: string
        roundsCompleted: number
        signals: SolveCheckpoint['signals']
        agentContributions: [string, AgentContribution][]
        tokensUsed: number
        timestamp: number
      }
      return {
        task: parsed.task,
        roundsCompleted: parsed.roundsCompleted,
        signals: parsed.signals,
        agentContributions: new Map(parsed.agentContributions),
        tokensUsed: parsed.tokensUsed,
        timestamp: parsed.timestamp,
      }
    } catch {
      return null
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await unlink(this.filePath(id))
    } catch {
      // File may not exist — ignore
    }
  }

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`)
  }
}
