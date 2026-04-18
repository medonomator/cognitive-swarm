import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Signal, SwarmEventMap } from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import { SignalBus } from './signal-bus.js'

function makeSignal<T extends Signal['type']>(
  type: T,
  overrides: Partial<Signal<T>> = {},
): Signal<T> {
  const defaults: Record<string, unknown> = {
    id: `sig-${Math.random().toString(36).slice(2, 8)}`,
    type,
    source: 'agent-1',
    confidence: 0.8,
    timestamp: Date.now(),
  }

  const payloads: Record<string, unknown> = {
    'task:new': { task: 'test task' },
    discovery: { finding: 'found something', relevance: 0.5 },
    proposal: {
      proposalId: 'p-1',
      content: 'test proposal',
      reasoning: 'because',
    },
    doubt: {
      targetSignalId: 'sig-x',
      concern: 'hmm',
      severity: 'medium',
    },
    challenge: {
      targetSignalId: 'sig-x',
      counterArgument: 'no',
    },
    vote: {
      proposalId: 'p-1',
      stance: 'agree',
      weight: 1,
    },
    conflict: {
      signalA: 'a',
      signalB: 'b',
      description: 'conflict',
    },
    'consensus:reached': {
      proposalId: 'p-1',
      decision: 'yes',
      confidence: 0.9,
    },
    escalate: { reason: 'stuck', context: 'ctx' },
    'memory:shared': {
      content: 'memory',
      category: 'test',
      importance: 0.5,
    },
  }

  return {
    ...defaults,
    payload: payloads[type],
    ...overrides,
  } as Signal<T>
}

let activeBuses: SignalBus[] = []

function createBus(
  ...args: ConstructorParameters<typeof SignalBus>
): SignalBus {
  const bus = new SignalBus(...args)
  activeBuses.push(bus)
  return bus
}

afterEach(() => {
  for (const bus of activeBuses) {
    bus.destroy()
  }
  activeBuses = []
})

describe('SignalBus', () => {
  it('delivers signals to subscribed agents', () => {
    const bus = createBus({ sweepIntervalMs: 0 })
    const handler = vi.fn()

    bus.subscribe('agent-1', ['discovery'], handler)
    const signal = makeSignal('discovery')
    bus.publish(signal)

    expect(handler).toHaveBeenCalledWith(signal)
  })

  it('does not deliver to agents not subscribed to signal type', () => {
    const bus = createBus({ sweepIntervalMs: 0 })
    const handler = vi.fn()

    bus.subscribe('agent-1', ['proposal'], handler)
    bus.publish(makeSignal('discovery'))

    expect(handler).not.toHaveBeenCalled()
  })

  it('delivers to multiple subscribers', () => {
    const bus = createBus({ sweepIntervalMs: 0 })
    const h1 = vi.fn()
    const h2 = vi.fn()

    bus.subscribe('agent-1', ['discovery'], h1)
    bus.subscribe('agent-2', ['discovery'], h2)
    bus.publish(makeSignal('discovery'))

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('unsubscribes agent from all types', () => {
    const bus = createBus({ sweepIntervalMs: 0 })
    const handler = vi.fn()

    bus.subscribe('agent-1', ['discovery', 'proposal'], handler)
    bus.unsubscribe('agent-1')

    bus.publish(makeSignal('discovery'))
    bus.publish(makeSignal('proposal'))

    expect(handler).not.toHaveBeenCalled()
  })

  it('stores signals in history', () => {
    const bus = createBus({ sweepIntervalMs: 0 })
    const signal = makeSignal('discovery')
    bus.publish(signal)

    expect(bus.getHistory()).toHaveLength(1)
    expect(bus.getHistory()[0]).toBe(signal)
  })

  it('respects maxHistorySize', () => {
    const bus = createBus({ maxHistorySize: 2, sweepIntervalMs: 0 })

    bus.publish(makeSignal('discovery', { id: 's1' }))
    bus.publish(makeSignal('discovery', { id: 's2' }))
    bus.publish(makeSignal('discovery', { id: 's3' }))

    const history = bus.getHistory()
    expect(history).toHaveLength(2)
    expect(history[0]?.id).toBe('s2')
    expect(history[1]?.id).toBe('s3')
  })

  it('filters history by type', () => {
    const bus = createBus({ sweepIntervalMs: 0 })

    bus.publish(makeSignal('discovery', { id: 's1' }))
    bus.publish(makeSignal('proposal', { id: 's2' }))
    bus.publish(makeSignal('discovery', { id: 's3' }))

    const filtered = bus.getHistory({ type: 'discovery' })
    expect(filtered).toHaveLength(2)
  })

  it('filters history by multiple types', () => {
    const bus = createBus({ sweepIntervalMs: 0 })

    bus.publish(makeSignal('discovery', { id: 's1' }))
    bus.publish(makeSignal('proposal', { id: 's2' }))
    bus.publish(makeSignal('vote', { id: 's3' }))

    const filtered = bus.getHistory({ type: ['discovery', 'vote'] })
    expect(filtered).toHaveLength(2)
  })

  it('filters history by source', () => {
    const bus = createBus({ sweepIntervalMs: 0 })

    bus.publish(makeSignal('discovery', { source: 'agent-1' }))
    bus.publish(makeSignal('discovery', { source: 'agent-2' }))

    const filtered = bus.getHistory({ source: 'agent-1' })
    expect(filtered).toHaveLength(1)
  })

  it('filters history by time range', () => {
    const bus = createBus({ sweepIntervalMs: 0 })
    const now = Date.now()

    bus.publish(makeSignal('discovery', { timestamp: now - 2000 }))
    bus.publish(makeSignal('discovery', { timestamp: now - 1000 }))
    bus.publish(makeSignal('discovery', { timestamp: now }))

    const filtered = bus.getHistory({
      since: now - 1500,
      until: now - 500,
    })
    expect(filtered).toHaveLength(1)
  })

  it('filters history by minConfidence', () => {
    const bus = createBus({ sweepIntervalMs: 0 })

    bus.publish(makeSignal('discovery', { confidence: 0.3 }))
    bus.publish(makeSignal('discovery', { confidence: 0.8 }))

    const filtered = bus.getHistory({ minConfidence: 0.5 })
    expect(filtered).toHaveLength(1)
  })

  it('filters history by replyTo', () => {
    const bus = createBus({ sweepIntervalMs: 0 })

    bus.publish(makeSignal('discovery', { replyTo: 'sig-x' }))
    bus.publish(makeSignal('discovery'))

    const filtered = bus.getHistory({ replyTo: 'sig-x' })
    expect(filtered).toHaveLength(1)
  })

  it('skips expired signals on publish', () => {
    const bus = createBus({ defaultTtlMs: 1000, sweepIntervalMs: 0 })
    const handler = vi.fn()
    bus.subscribe('agent-1', ['discovery'], handler)

    const expiredSignal = makeSignal('discovery', {
      timestamp: Date.now() - 2000,
      ttl: 1000,
    })
    bus.publish(expiredSignal)

    expect(handler).not.toHaveBeenCalled()
    expect(bus.historySize).toBe(0)
  })

  it('sweeps expired signals from history', () => {
    const bus = createBus({ sweepIntervalMs: 0 })

    bus.publish(
      makeSignal('discovery', {
        timestamp: Date.now() - 120_000,
        ttl: 1000,
      }),
    )
    bus.publish(makeSignal('discovery', { timestamp: Date.now() }))

    bus.sweep()
    expect(bus.historySize).toBe(1)
  })

  it('detects conflicts between proposals', () => {
    const events = new TypedEventEmitter<SwarmEventMap>()
    const conflictHandler = vi.fn()
    events.on('conflict:detected', conflictHandler)

    const bus = createBus({ sweepIntervalMs: 0 }, events)

    bus.publish(makeSignal('proposal', { id: 'p1', source: 'agent-1' }))
    bus.publish(makeSignal('proposal', { id: 'p2', source: 'agent-2' }))

    expect(conflictHandler).toHaveBeenCalledOnce()
    expect(bus.getConflicts()).toHaveLength(1)
  })

  it('can disable conflict detection', () => {
    const bus = createBus({
      enableConflictDetection: false,
      sweepIntervalMs: 0,
    })

    bus.publish(makeSignal('proposal', { id: 'p1', source: 'agent-1' }))
    bus.publish(makeSignal('proposal', { id: 'p2', source: 'agent-2' }))

    expect(bus.getConflicts()).toHaveLength(0)
  })

  it('emits signal:emitted events', () => {
    const events = new TypedEventEmitter<SwarmEventMap>()
    const handler = vi.fn()
    events.on('signal:emitted', handler)

    const bus = createBus({ sweepIntervalMs: 0 }, events)
    const signal = makeSignal('discovery')
    bus.publish(signal)

    expect(handler).toHaveBeenCalledWith(signal)
  })

  it('emits signal:expired events on sweep', () => {
    vi.useFakeTimers()

    const events = new TypedEventEmitter<SwarmEventMap>()
    const handler = vi.fn()
    events.on('signal:expired', handler)

    const bus = createBus(
      { sweepIntervalMs: 0, defaultTtlMs: 1000 },
      events,
    )

    const signal = makeSignal('discovery', {
      timestamp: Date.now(),
      ttl: 500,
    })
    bus.publish(signal)
    expect(bus.historySize).toBe(1)

    // Advance time past TTL
    vi.advanceTimersByTime(600)
    bus.sweep()

    expect(handler).toHaveBeenCalledOnce()
    expect(bus.historySize).toBe(0)

    vi.useRealTimers()
  })

  it('catches handler errors without breaking delivery', () => {
    const onError = vi.fn()
    const bus = createBus({ sweepIntervalMs: 0, onError })

    const badHandler = vi.fn(() => {
      throw new Error('handler crash')
    })
    const goodHandler = vi.fn()

    bus.subscribe('bad-agent', ['discovery'], badHandler)
    bus.subscribe('good-agent', ['discovery'], goodHandler)

    bus.publish(makeSignal('discovery'))

    expect(badHandler).toHaveBeenCalled()
    expect(goodHandler).toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
  })

  it('resolves conflicts', () => {
    const bus = createBus({ sweepIntervalMs: 0 })

    bus.publish(makeSignal('proposal', { id: 'p1', source: 'agent-1' }))
    bus.publish(makeSignal('proposal', { id: 'p2', source: 'agent-2' }))

    bus.resolveConflict('p1', 'p2')
    expect(bus.getConflicts()).toHaveLength(0)
  })

  it('cleans up on destroy', () => {
    const bus = createBus({ sweepIntervalMs: 0 })
    const handler = vi.fn()

    bus.subscribe('agent-1', ['discovery'], handler)
    bus.publish(makeSignal('discovery'))

    bus.destroy()

    expect(bus.historySize).toBe(0)
    expect(bus.getConflicts()).toHaveLength(0)
  })
})
