import type {
  Signal,
  SignalType,
  SignalFilter,
  SignalBusConfig,
  ResolvedSignalBusConfig,
  ConflictPair,
  SwarmEventMap,
} from '@cognitive-swarm/core'
import type { TypedEventEmitter } from '@cognitive-swarm/core'
import { defaultErrorHandler } from '@cognitive-engine/core'
import { ConflictDetector } from './conflict-detector.js'

const DEFAULT_MAX_HISTORY = 1000
const DEFAULT_TTL_MS = 60_000
const DEFAULT_SWEEP_INTERVAL_MS = 10_000

interface SubscriptionEntry {
  readonly agentId: string
  readonly callback: (signal: Signal) => void
}

/**
 * Central pub/sub hub for signals in the swarm.
 * Agents subscribe to signal types and receive deliveries.
 * Maintains bounded history with TTL-based expiration.
 */
export class SignalBus {
  private readonly config: ResolvedSignalBusConfig
  private readonly handlers = new Map<SignalType, Set<SubscriptionEntry>>()
  private readonly agentSubscriptions = new Map<string, Set<SignalType>>()
  private readonly history: Signal[] = []
  private readonly conflictDetector: ConflictDetector
  private readonly events: TypedEventEmitter<SwarmEventMap> | null
  private sweepTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    config?: SignalBusConfig,
    events?: TypedEventEmitter<SwarmEventMap>,
  ) {
    this.config = resolveConfig(config)
    this.conflictDetector = new ConflictDetector()
    this.events = events ?? null

    if (this.config.sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(
        () => this.sweep(),
        this.config.sweepIntervalMs,
      )
    }
  }

  /** Publish a signal to all subscribers of its type. */
  publish(signal: Signal): void {
    if (this.isExpired(signal)) return

    this.addToHistory(signal)

    if (this.config.enableConflictDetection) {
      const conflict = this.conflictDetector.check(signal, this.history)
      if (conflict) {
        this.events?.emit('conflict:detected', conflict)
      }
    }

    const subscribers = this.handlers.get(signal.type)
    if (subscribers) {
      for (const entry of subscribers) {
        try {
          entry.callback(signal)
          this.events?.emit('signal:delivered', {
            signal,
            targetAgentId: entry.agentId,
          })
        } catch (error: unknown) {
          this.config.onError(
            error,
            `signal-bus.deliver.${entry.agentId}`,
          )
        }
      }
    }

    this.events?.emit('signal:emitted', signal)
  }

  /** Subscribe an agent to one or more signal types. */
  subscribe(
    agentId: string,
    types: readonly SignalType[],
    callback: (signal: Signal) => void,
  ): void {
    const entry: SubscriptionEntry = { agentId, callback }

    let agentTypes = this.agentSubscriptions.get(agentId)
    if (!agentTypes) {
      agentTypes = new Set()
      this.agentSubscriptions.set(agentId, agentTypes)
    }

    for (const type of types) {
      let set = this.handlers.get(type)
      if (!set) {
        set = new Set()
        this.handlers.set(type, set)
      }
      set.add(entry)
      agentTypes.add(type)
    }
  }

  /** Unsubscribe an agent from all signal types. */
  unsubscribe(agentId: string): void {
    const types = this.agentSubscriptions.get(agentId)
    if (!types) return

    for (const type of types) {
      const set = this.handlers.get(type)
      if (set) {
        for (const entry of set) {
          if (entry.agentId === agentId) {
            set.delete(entry)
          }
        }
      }
    }

    this.agentSubscriptions.delete(agentId)
  }

  /** Query signal history with optional filtering. */
  getHistory(filter?: SignalFilter): readonly Signal[] {
    if (!filter) return [...this.history]

    return this.history.filter((signal) => {
      if (filter.type !== undefined) {
        const types = Array.isArray(filter.type)
          ? filter.type
          : [filter.type]
        if (!types.includes(signal.type)) return false
      }
      if (filter.source !== undefined && signal.source !== filter.source) {
        return false
      }
      if (filter.since !== undefined && signal.timestamp < filter.since) {
        return false
      }
      if (filter.until !== undefined && signal.timestamp > filter.until) {
        return false
      }
      if (filter.replyTo !== undefined && signal.replyTo !== filter.replyTo) {
        return false
      }
      if (
        filter.minConfidence !== undefined &&
        signal.confidence < filter.minConfidence
      ) {
        return false
      }
      return true
    })
  }

  /** Get all unresolved conflicts. */
  getConflicts(): readonly ConflictPair[] {
    return this.conflictDetector.getUnresolved()
  }

  /** Mark a conflict as resolved. */
  resolveConflict(signalAId: string, signalBId: string): void {
    this.conflictDetector.markResolved(signalAId, signalBId)
  }

  /** Remove expired signals from history. */
  sweep(): void {
    const now = Date.now()
    let i = 0
    while (i < this.history.length) {
      const signal = this.history[i]!
      if (this.isExpiredAt(signal, now)) {
        this.history.splice(i, 1)
        this.events?.emit('signal:expired', signal)
      } else {
        i++
      }
    }
  }

  get historySize(): number {
    return this.history.length
  }

  /** Clean up timers. Call when the bus is no longer needed. */
  destroy(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
    this.handlers.clear()
    this.agentSubscriptions.clear()
    this.history.length = 0
    this.conflictDetector.clear()
  }

  private addToHistory(signal: Signal): void {
    if (this.history.length >= this.config.maxHistorySize) {
      this.history.shift()
    }
    this.history.push(signal)
  }

  private isExpired(signal: Signal): boolean {
    return this.isExpiredAt(signal, Date.now())
  }

  private isExpiredAt(signal: Signal, now: number): boolean {
    const ttl = signal.ttl ?? this.config.defaultTtlMs
    return now > signal.timestamp + ttl
  }
}

function resolveConfig(config?: SignalBusConfig): ResolvedSignalBusConfig {
  return {
    maxHistorySize: config?.maxHistorySize ?? DEFAULT_MAX_HISTORY,
    defaultTtlMs: config?.defaultTtlMs ?? DEFAULT_TTL_MS,
    enableConflictDetection: config?.enableConflictDetection ?? true,
    sweepIntervalMs: config?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS,
    onError: config?.onError ?? defaultErrorHandler,
  }
}
