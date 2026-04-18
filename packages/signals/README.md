# @cognitive-swarm/signals

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/signals)](https://www.npmjs.com/package/@cognitive-swarm/signals)

The SignalBus -- the nervous system of the swarm. All agent communication flows through it.

## Install

```bash
npm install @cognitive-swarm/signals
```

## Overview

Central pub/sub hub for signals. Agents subscribe to signal types and receive deliveries. Maintains bounded history with TTL-based expiration and automatic conflict detection between proposals.

## Quick Start

```typescript
import { SignalBus } from '@cognitive-swarm/signals'
import { TypedEventEmitter } from '@cognitive-swarm/core'

const events = new TypedEventEmitter()
const bus = new SignalBus(
  { maxHistorySize: 500, defaultTtlMs: 120_000 },
  events,
)

// Subscribe agents
bus.subscribe('researcher', ['task:new', 'discovery'], handleSignal)
bus.subscribe('critic', ['proposal', 'discovery'], handleCriticSignal)

// Publish a signal
bus.publish({
  id: 'task-1',
  type: 'task:new',
  source: 'orchestrator',
  payload: { task: 'Analyze event sourcing tradeoffs' },
  confidence: 1.0,
  timestamp: Date.now(),
})

// Query history
const proposals = bus.getHistory({ type: 'proposal', minConfidence: 0.6 })

// Clean up
bus.destroy()
```

## Core Methods

### `publish(signal)`

Publishes a signal to all subscribers of its type. Automatically adds to history, checks for conflicts, and delivers to subscribers.

### `subscribe(agentId, types, callback)` / `unsubscribe(agentId)`

Subscribe an agent to signal types. The callback fires for every matching published signal.

### `getHistory(filter?)`

Query signal history with optional filtering by type, source, time range, confidence, or reply thread:

```typescript
const recentProposals = bus.getHistory({
  type: 'proposal',
  since: Date.now() - 10_000,
  minConfidence: 0.8,
})

const replies = bus.getHistory({ replyTo: originalSignal.id })
```

### `getConflicts()` / `resolveConflict(signalAId, signalBId)`

Returns unresolved conflict pairs. Conflicts are detected automatically when two proposals come from different agents.

### `sweep()` / `destroy()`

Remove expired signals from history. `destroy()` cleans up all timers and handlers.

## Configuration

```typescript
interface SignalBusConfig {
  readonly maxHistorySize?: number           // default: 1000
  readonly defaultTtlMs?: number             // default: 60_000
  readonly enableConflictDetection?: boolean  // default: true
  readonly sweepIntervalMs?: number          // default: 10_000
}
```

| Parameter | Default | When to Change |
|-----------|---------|----------------|
| `maxHistorySize` | 1000 | Increase for long deliberations (50+ rounds) |
| `defaultTtlMs` | 60s | Increase for slow-paced swarms |
| `enableConflictDetection` | true | Disable for raw throughput |
| `sweepIntervalMs` | 10s | Set 0 to disable auto-sweep |

## Signal Types

| Type | When Emitted | Typical Source |
|------|-------------|----------------|
| `task:new` | Solve starts | Orchestrator |
| `discovery` | Agent finds information | Any agent |
| `proposal` | Agent proposes solution | Any agent |
| `doubt` / `challenge` | Agent questions signals | Any agent |
| `vote` | Agent votes on proposal | Any agent |
| `conflict` | Two proposals conflict | SignalBus (auto) |
| `consensus:reached` | Decision made | ConsensusEngine |
| `escalate` | Needs higher authority | Any agent |
| `memory:shared` | Shares from memory pool | Any agent |
| `tool:result` | Tool call completed | Agent with tools |

## Conflict Detection

Automatically detects conflicting proposal pairs from different agents. Resolved via `bus.resolveConflict()` after debate or majority vote.

## Signal Filter

```typescript
interface SignalFilter {
  readonly type?: SignalType | readonly SignalType[]
  readonly source?: string
  readonly since?: number
  readonly until?: number
  readonly replyTo?: string
  readonly minConfidence?: number
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/signals) | [GitHub](https://github.com/medonomator/cognitive-swarm)
