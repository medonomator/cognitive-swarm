import { describe, it, expect } from 'vitest'
import { mapSwarmEventToA2A } from '../src/event-mapper.js'
import type { SwarmEvent, SwarmResult } from '@cognitive-swarm/core'

const TASK_ID = 'task-1'
const CTX_ID = 'ctx-1'

function makeResult(overrides?: Partial<SwarmResult>): SwarmResult {
  return {
    answer: 'test answer',
    confidence: 0.85,
    consensus: {
      decided: true,
      decision: 'test',
      proposalId: 'p1',
      confidence: 0.85,
      votingRecord: [],
      dissent: [],
      reasoning: 'test',
      resolvedConflicts: [],
      durationMs: 100,
    },
    signalLog: [],
    agentContributions: [],
    cost: { tokens: 500, estimatedUsd: 0.0015 },
    timing: { totalMs: 1000, roundsUsed: 2 },
    mathAnalysis: null as never,
    advisorReport: null,
    debateResults: [],
    ...overrides,
  }
}

describe('mapSwarmEventToA2A', () => {
  it('maps solve:start to working status', () => {
    const event: SwarmEvent = { type: 'solve:start', task: 'analyze this' }
    const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'minimal')

    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe('status-update')
    const status = result[0] as { kind: 'status-update'; status: { state: string } }
    expect(status.status.state).toBe('working')
  })

  it('maps solve:complete to artifact + completed status', () => {
    const event: SwarmEvent = { type: 'solve:complete', result: makeResult() }
    const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'minimal')

    expect(result).toHaveLength(2)

    // First: artifact
    expect(result[0]!.kind).toBe('artifact-update')
    const artifact = result[0] as { kind: 'artifact-update'; artifact: { parts: Array<{ kind: string; text?: string; data?: Record<string, unknown> }> } }
    expect(artifact.artifact.parts[0]!.kind).toBe('text')
    expect(artifact.artifact.parts[0]!.text).toBe('test answer')
    expect(artifact.artifact.parts[1]!.kind).toBe('data')
    expect(artifact.artifact.parts[1]!.data!['confidence']).toBe(0.85)

    // Second: completed status
    expect(result[1]!.kind).toBe('status-update')
    const status = result[1] as { kind: 'status-update'; final: boolean; status: { state: string } }
    expect(status.status.state).toBe('completed')
    expect(status.final).toBe(true)
  })

  describe('minimal verbosity', () => {
    it('skips round:start', () => {
      const event: SwarmEvent = { type: 'round:start', round: 1 }
      expect(mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'minimal')).toHaveLength(0)
    })

    it('skips round:end', () => {
      const event: SwarmEvent = { type: 'round:end', round: 1, signalCount: 3 }
      expect(mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'minimal')).toHaveLength(0)
    })

    it('skips synthesis:start', () => {
      const event: SwarmEvent = { type: 'synthesis:start' }
      expect(mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'minimal')).toHaveLength(0)
    })
  })

  describe('standard verbosity', () => {
    it('includes round:start', () => {
      const event: SwarmEvent = { type: 'round:start', round: 2 }
      const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'standard')

      expect(result).toHaveLength(1)
      expect(result[0]!.kind).toBe('status-update')
    })

    it('includes round:end', () => {
      const event: SwarmEvent = { type: 'round:end', round: 1, signalCount: 5 }
      const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'standard')

      expect(result).toHaveLength(1)
    })

    it('includes consensus:check', () => {
      const event: SwarmEvent = {
        type: 'consensus:check',
        result: {
          decided: true,
          decision: 'yes',
          confidence: 0.9,
          votingRecord: [],
          dissent: [],
          reasoning: 'agreed',
          resolvedConflicts: [],
          durationMs: 50,
        },
      }
      const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'standard')
      expect(result).toHaveLength(1)
    })

    it('skips agent:reacted', () => {
      const event: SwarmEvent = {
        type: 'agent:reacted',
        reaction: {
          agentId: 'a1',
          inResponseTo: 's1',
          signals: [],
          strategyUsed: 'analyze',
          processingTimeMs: 50,
        },
      }
      expect(mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'standard')).toHaveLength(0)
    })
  })

  describe('verbose verbosity', () => {
    it('includes agent:reacted', () => {
      const event: SwarmEvent = {
        type: 'agent:reacted',
        reaction: {
          agentId: 'analyst',
          inResponseTo: 's1',
          signals: [],
          strategyUsed: 'analyze',
          processingTimeMs: 50,
        },
      }
      const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'verbose')

      expect(result).toHaveLength(1)
    })

    it('includes signal:emitted', () => {
      const event: SwarmEvent = {
        type: 'signal:emitted',
        signal: {
          id: 'sig-1',
          type: 'discovery',
          source: 'analyst',
          payload: { finding: 'test', relevance: 0.8 },
          confidence: 0.8,
          timestamp: Date.now(),
        },
      }
      const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'verbose')
      expect(result).toHaveLength(1)
    })
  })

  it('serializes SwarmResult data part correctly', () => {
    const event: SwarmEvent = {
      type: 'solve:complete',
      result: makeResult({
        timing: { totalMs: 2000, roundsUsed: 3 },
        debateResults: [{
          resolved: true,
          winningProposalId: 'p2',
          confidence: 0.9,
          roundsUsed: 2,
          signals: [],
        }],
      }),
    }

    const result = mapSwarmEventToA2A(event, TASK_ID, CTX_ID, 'minimal')
    const artifact = result[0] as { artifact: { parts: Array<{ kind: string; data?: Record<string, unknown> }> } }
    const data = artifact.artifact.parts[1]!.data!

    expect(data['timing']).toEqual({ totalMs: 2000, roundsUsed: 3 })
    expect((data['debateResults'] as Array<Record<string, unknown>>)[0]!['resolved']).toBe(true)
  })
})
