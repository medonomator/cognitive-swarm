# @cognitive-swarm/signals

The SignalBus -- the nervous system of the swarm. All agent communication flows through it.

## Install

```bash
npm install @cognitive-swarm/signals
```

## SignalBus

Central pub/sub hub for signals. Agents subscribe to signal types and receive deliveries. Maintains bounded history with TTL-based expiration.

```typescript
import { SignalBus } from '@cognitive-swarm/signals'

const bus = new SignalBus(config?, events?)
```

## Core Methods

### publish()

```typescript
bus.publish(signal: Signal): void
```

Publishes a signal to all subscribers of its type. Automatically:
- Adds to history (bounded by `maxHistorySize`)
- Checks for conflicts (if enabled)
- Delivers to all subscribers via callback
- Emits `signal:emitted` and `signal:delivered` events

### subscribe() / unsubscribe()

```typescript
bus.subscribe(
  agentId: string,
  types: readonly SignalType[],
  callback: (signal: Signal) => void,
): void

bus.unsubscribe(agentId: string): void
```

Subscribe an agent to one or more signal types. The callback fires for every published signal of those types.

### getHistory()

```typescript
bus.getHistory(filter?: SignalFilter): readonly Signal[]
```

Query the full signal history with optional filtering:

```typescript
const proposals = bus.getHistory({
  type: 'proposal',
  minConfidence: 0.6,
  since: roundStartMs,
})

const agentSignals = bus.getHistory({
  source: 'agent-1',
  type: ['proposal', 'vote'],
})
```

### getConflicts()

```typescript
bus.getConflicts(): readonly ConflictPair[]
```

Returns all unresolved conflict pairs. Conflicts are detected automatically when `enableConflictDetection` is true.

### resolveConflict()

```typescript
bus.resolveConflict(signalAId: string, signalBId: string): void
```

Mark a conflict as resolved (e.g., after debate).

### sweep()

```typescript
bus.sweep(): void
```

Remove expired signals from history. Called automatically on a timer (`sweepIntervalMs`), but can be triggered manually.

### destroy()

```typescript
bus.destroy(): void
```

Clean up timers, clear handlers and history. Call when the bus is no longer needed.

## SignalBusConfig

```typescript
interface SignalBusConfig {
  readonly maxHistorySize?: number           // default: 1000
  readonly defaultTtlMs?: number             // default: 60_000
  readonly enableConflictDetection?: boolean  // default: true
  readonly sweepIntervalMs?: number          // default: 10_000 (0 = disabled)
  readonly onError?: ErrorHandler
}
```

## SignalFilter

```typescript
interface SignalFilter {
  readonly type?: SignalType | readonly SignalType[]
  readonly source?: string
  readonly since?: number          // timestamp ms
  readonly until?: number          // timestamp ms
  readonly replyTo?: string        // filter reply threads
  readonly minConfidence?: number
}
```

## Conflict Detection

The bus automatically detects conflicting signal pairs when `enableConflictDetection` is true. A conflict is detected when:

- Two `proposal` signals have contradictory content (detected via the `ConflictDetector`)
- A `challenge` signal directly references another signal via `replyTo`

Detected conflicts are exposed via `getConflicts()` and emitted as `conflict:detected` events, which the consensus engine picks up.

## Signal Routing

Signals flow through the bus via pub/sub. Agents subscribe to signal types in their `listens` config. The orchestrator's `RoundRunner` manages the subscription lifecycle.

This means:
- All signals are visible to all agents that care about them
- No direct agent-to-agent coupling
- The full history is always queryable

## ConflictPair

```typescript
interface ConflictPair {
  readonly signalA: Signal
  readonly signalB: Signal
  readonly detectedAt: number
}
```

## Properties

```typescript
bus.historySize  // number of signals in history
```
