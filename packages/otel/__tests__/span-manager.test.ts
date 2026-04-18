import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { trace } from '@opentelemetry/api'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { SpanManager } from '../src/span-manager.js'
import type {
  AgentReaction,
  ConsensusResult,
  DebateResult,
  SwarmResult,
  ToolCalledEvent,
} from '@cognitive-swarm/core'

describe('SpanManager', () => {
  let exporter: InMemorySpanExporter
  let provider: BasicTracerProvider
  let manager: SpanManager

  beforeEach(() => {
    trace.disable()
    exporter = new InMemorySpanExporter()
    provider = new BasicTracerProvider()
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
    provider.register()
    manager = new SpanManager()
  })

  afterEach(async () => {
    manager.cleanup()
    await provider.shutdown()
    trace.disable()
  })

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

  it('creates and ends a solve span', () => {
    manager.startSolve('test task', 3, 10)
    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)

    const solve = spans[0]!
    expect(solve.name).toBe('cognitive-swarm.solve')
    expect(solve.attributes['swarm.task']).toBe('test task')
    expect(solve.attributes['swarm.agent_count']).toBe(3)
    expect(solve.attributes['swarm.max_rounds']).toBe(10)
    expect(solve.attributes['swarm.rounds_used']).toBe(2)
    expect(solve.attributes['swarm.consensus_reached']).toBe(true)
    expect(solve.attributes['swarm.confidence']).toBe(0.85)
  })

  it('truncates long task text to 256 chars', () => {
    const longTask = 'x'.repeat(500)
    manager.startSolve(longTask, 1, 5)
    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    const solve = spans[0]!
    expect((solve.attributes['swarm.task'] as string).length).toBe(256)
  })

  it('creates round spans as children of solve', () => {
    manager.startSolve('task', 2, 5)
    manager.onRoundStart({ round: 1 })
    manager.onRoundEnd({ round: 1, signalCount: 3 })
    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(2)

    const roundSpan = spans.find((s) => s.name === 'cognitive-swarm.round')!
    expect(roundSpan.attributes['swarm.round.number']).toBe(1)
    expect(roundSpan.attributes['swarm.round.signal_count']).toBe(3)

    const solveSpan = spans.find((s) => s.name === 'cognitive-swarm.solve')!
    expect(roundSpan.parentSpanId).toBe(solveSpan.spanContext().spanId)
  })

  it('creates agent spans as children of round', () => {
    manager.startSolve('task', 2, 5)
    manager.onRoundStart({ round: 1 })

    const reaction: AgentReaction = {
      agentId: 'agent-1',
      inResponseTo: 'sig-1',
      signals: [],
      strategyUsed: 'analyze',
      processingTimeMs: 50,
    }
    manager.onAgentReacted(reaction)

    manager.onRoundEnd({ round: 1, signalCount: 1 })
    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    const agentSpan = spans.find((s) => s.name === 'cognitive-swarm.agent.on-signal')!
    const roundSpan = spans.find((s) => s.name === 'cognitive-swarm.round')!

    expect(agentSpan).toBeDefined()
    expect(agentSpan.attributes['swarm.agent.id']).toBe('agent-1')
    expect(agentSpan.attributes['swarm.agent.strategy']).toBe('analyze')
    expect(agentSpan.parentSpanId).toBe(roundSpan.spanContext().spanId)
  })

  it('creates tool spans as children of round', () => {
    manager.startSolve('task', 1, 5)
    manager.onRoundStart({ round: 1 })

    const toolEvent: ToolCalledEvent = {
      agentId: 'agent-1',
      toolName: 'search_web',
      durationMs: 200,
      isError: false,
    }
    manager.onToolCalled(toolEvent)

    manager.onRoundEnd({ round: 1, signalCount: 1 })
    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    const toolSpan = spans.find((s) => s.name === 'cognitive-swarm.tool.execute')!
    const roundSpan = spans.find((s) => s.name === 'cognitive-swarm.round')!

    expect(toolSpan).toBeDefined()
    expect(toolSpan.attributes['swarm.tool.name']).toBe('search_web')
    expect(toolSpan.attributes['swarm.tool.is_error']).toBe(false)
    expect(toolSpan.parentSpanId).toBe(roundSpan.spanContext().spanId)
  })

  it('creates debate spans', () => {
    manager.startSolve('task', 2, 5)
    manager.onRoundStart({ round: 1 })

    manager.onDebateStart({ proposalA: 'p1', proposalB: 'p2' })
    const debateResult: DebateResult = {
      resolved: true,
      winningProposalId: 'p1',
      confidence: 0.9,
      roundsUsed: 3,
      signals: [],
    }
    manager.onDebateEnd(debateResult)

    manager.onRoundEnd({ round: 1, signalCount: 2 })
    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    const debateSpan = spans.find((s) => s.name === 'cognitive-swarm.debate')!
    const roundSpan = spans.find((s) => s.name === 'cognitive-swarm.round')!

    expect(debateSpan).toBeDefined()
    expect(debateSpan.attributes['swarm.debate.resolved']).toBe(true)
    expect(debateSpan.attributes['swarm.debate.rounds']).toBe(3)
    expect(debateSpan.parentSpanId).toBe(roundSpan.spanContext().spanId)
  })

  it('creates synthesis span as child of solve', () => {
    manager.startSolve('task', 1, 5)
    manager.onRoundStart({ round: 1 })
    manager.onRoundEnd({ round: 1, signalCount: 1 })

    manager.onSynthesisStart()
    manager.onSynthesisComplete({ answer: 'final answer' })

    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    const synthSpan = spans.find((s) => s.name === 'cognitive-swarm.synthesize')!
    const solveSpan = spans.find((s) => s.name === 'cognitive-swarm.solve')!

    expect(synthSpan).toBeDefined()
    expect(synthSpan.parentSpanId).toBe(solveSpan.spanContext().spanId)
  })

  it('adds consensus event to round span', () => {
    manager.startSolve('task', 1, 5)
    manager.onRoundStart({ round: 1 })

    const consensus: ConsensusResult = {
      decided: true,
      decision: 'approved',
      proposalId: 'p1',
      confidence: 0.9,
      votingRecord: [],
      dissent: [],
      reasoning: 'unanimous',
      resolvedConflicts: [],
      durationMs: 50,
    }
    manager.onConsensusReached(consensus)

    manager.onRoundEnd({ round: 1, signalCount: 3 })
    manager.endSolve(makeResult())

    const spans = exporter.getFinishedSpans()
    const roundSpan = spans.find((s) => s.name === 'cognitive-swarm.round')!
    const events = roundSpan.events
    expect(events).toHaveLength(1)
    expect(events[0]!.name).toBe('consensus:reached')
  })

  it('cleanup ends all orphaned spans', () => {
    manager.startSolve('task', 1, 5)
    manager.onRoundStart({ round: 1 })
    manager.onDebateStart({ proposalA: 'a', proposalB: 'b' })
    manager.onSynthesisStart()

    // Don't properly end anything - just cleanup
    manager.cleanup()

    const spans = exporter.getFinishedSpans()
    // All 4 should be ended (solve, round, debate, synthesis)
    expect(spans).toHaveLength(4)
  })

  it('is a no-op when no solve span exists', () => {
    // These should not throw
    manager.onRoundStart({ round: 1 })
    manager.onRoundEnd({ round: 1, signalCount: 0 })
    manager.onAgentReacted({
      agentId: 'a',
      inResponseTo: 's',
      signals: [],
      strategyUsed: 'defer',
      processingTimeMs: 0,
    })
    manager.onSynthesisStart()
    manager.onSynthesisComplete({ answer: '' })

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(0)
  })
})
