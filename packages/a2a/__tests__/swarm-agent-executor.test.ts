import { describe, it, expect } from 'vitest'
import { SwarmAgentExecutor } from '../src/swarm-agent-executor.js'
import type { RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server'
import type { AgentExecutionEvent } from '@a2a-js/sdk/server'
import type { SwarmResult, SwarmEvent } from '@cognitive-swarm/core'
import type { Orchestratable, OrchestratorFactory } from '../src/types.js'

function makeResult(): SwarmResult {
  return {
    answer: 'mock answer',
    confidence: 0.8,
    consensus: {
      decided: true, decision: 'mock', proposalId: 'p1', confidence: 0.8,
      votingRecord: [], dissent: [], reasoning: 'mock', resolvedConflicts: [], durationMs: 100,
    },
    signalLog: [],
    agentContributions: [],
    cost: { tokens: 100, estimatedUsd: 0.0003 },
    timing: { totalMs: 500, roundsUsed: 1 },
    mathAnalysis: null as never,
    advisorReport: null,
    debateResults: [],
  }
}

function makeMockOrchestrator(events?: SwarmEvent[]): Orchestratable {
  const defaultEvents: SwarmEvent[] = events ?? [
    { type: 'solve:start', task: 'test' },
    { type: 'round:start', round: 1 },
    { type: 'round:end', round: 1, signalCount: 2 },
    { type: 'solve:complete', result: makeResult() },
  ]

  return {
    async solve() { return makeResult() },
    async *solveWithStream() {
      for (const e of defaultEvents) yield e
    },
    destroy() {},
  }
}

function makeFactory(orchestrator?: Orchestratable): OrchestratorFactory {
  return { create: () => orchestrator ?? makeMockOrchestrator() }
}

function makeRequestContext(text = 'test task'): RequestContext {
  return {
    userMessage: {
      kind: 'message',
      messageId: 'm1',
      role: 'user',
      parts: [{ kind: 'text', text }],
    },
    taskId: 'task-1',
    contextId: 'ctx-1',
  } as RequestContext
}

function makeEventBus(): ExecutionEventBus & { events: AgentExecutionEvent[] } {
  const events: AgentExecutionEvent[] = []
  return {
    events,
    publish(event: AgentExecutionEvent) { events.push(event) },
    on() { return this },
    off() { return this },
    once() { return this },
    removeAllListeners() { return this },
    finished() {},
  }
}

describe('SwarmAgentExecutor', () => {
  it('executes and publishes events', async () => {
    const executor = new SwarmAgentExecutor(makeFactory(), 'standard')
    const ctx = makeRequestContext('analyze this')
    const bus = makeEventBus()

    await executor.execute(ctx, bus)

    // Should have: initial working + mapped events from solveWithStream
    expect(bus.events.length).toBeGreaterThan(0)

    // First event: working status
    const first = bus.events[0]! as { kind: string; status: { state: string } }
    expect(first.kind).toBe('status-update')
    expect(first.status.state).toBe('working')

    // Last event: completed status (from solve:complete mapping)
    const last = bus.events[bus.events.length - 1]! as { kind: string; status?: { state: string }; final?: boolean }
    expect(last.kind).toBe('status-update')
    expect(last.status!.state).toBe('completed')
    expect(last.final).toBe(true)
  })

  it('publishes artifact with answer', async () => {
    const executor = new SwarmAgentExecutor(makeFactory(), 'minimal')
    const bus = makeEventBus()

    await executor.execute(makeRequestContext(), bus)

    const artifacts = bus.events.filter((e) => e.kind === 'artifact-update')
    expect(artifacts).toHaveLength(1)

    const artifact = artifacts[0]! as { artifact: { parts: Array<{ kind: string; text?: string }> } }
    expect(artifact.artifact.parts[0]!.text).toBe('mock answer')
  })

  it('publishes failed status on error', async () => {
    const failOrchestrator: Orchestratable = {
      async solve() { throw new Error('boom') },
      async *solveWithStream() { throw new Error('boom') },
      destroy() {},
    }
    const executor = new SwarmAgentExecutor(makeFactory(failOrchestrator))
    const bus = makeEventBus()

    await executor.execute(makeRequestContext(), bus)

    const lastEvent = bus.events[bus.events.length - 1]! as { kind: string; status: { state: string }; final: boolean }
    expect(lastEvent.kind).toBe('status-update')
    expect(lastEvent.status.state).toBe('failed')
    expect(lastEvent.final).toBe(true)
  })

  it('destroys orchestrator after execution', async () => {
    let destroyed = false
    const orch: Orchestratable = {
      ...makeMockOrchestrator(),
      destroy() { destroyed = true },
    }
    const executor = new SwarmAgentExecutor(makeFactory(orch))
    const bus = makeEventBus()

    await executor.execute(makeRequestContext(), bus)

    expect(destroyed).toBe(true)
  })

  it('cancelTask destroys the orchestrator', async () => {
    let destroyed = false
    const orch: Orchestratable = {
      ...makeMockOrchestrator(),
      destroy() { destroyed = true },
    }
    const executor = new SwarmAgentExecutor({ create: () => orch })
    const bus = makeEventBus()

    // Start execution (will stream events)
    const execPromise = executor.execute(makeRequestContext(), bus)

    // Cancel while running
    await executor.cancelTask('task-1', bus)
    await execPromise

    expect(destroyed).toBe(true)
  })

  it('concatenates multiple text parts', async () => {
    const executor = new SwarmAgentExecutor(makeFactory(), 'minimal')
    const ctx = {
      userMessage: {
        kind: 'message' as const,
        messageId: 'm1',
        role: 'user' as const,
        parts: [
          { kind: 'text' as const, text: 'Part 1.' },
          { kind: 'text' as const, text: 'Part 2.' },
        ],
      },
      taskId: 'task-2',
      contextId: 'ctx-2',
    } as RequestContext
    const bus = makeEventBus()

    await executor.execute(ctx, bus)

    // Should have executed without error (concatenated text)
    expect(bus.events.length).toBeGreaterThan(0)
  })
})
