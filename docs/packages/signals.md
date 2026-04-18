# @cognitive-swarm/signals

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/signals)](https://www.npmjs.com/package/@cognitive-swarm/signals)

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
- Checks if signal is already expired (skips if so)
- Adds to history (bounded by `maxHistorySize`, oldest evicted first)
- Checks for conflicts (if `enableConflictDetection` is true)
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

Subscribe an agent to one or more signal types. The callback fires for every published signal of those types. One agent can subscribe to multiple types. The `unsubscribe()` call removes all subscriptions for that agent.

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

Remove expired signals from history. Called automatically on a timer (`sweepIntervalMs`), but can be triggered manually. Emits `signal:expired` for each removed signal.

### destroy()

```typescript
bus.destroy(): void
```

Clean up timers, clear handlers and history, clear conflict detector. Call when the bus is no longer needed.

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

### Configuration Guide

| Parameter | Default | When to Change |
|-----------|---------|----------------|
| `maxHistorySize` | 1000 | Increase for long deliberations (50+ rounds). Decrease for memory-constrained environments. |
| `defaultTtlMs` | 60,000 (1 min) | Increase for slow-paced swarms. Decrease for fast deliberations where stale signals are harmful. |
| `enableConflictDetection` | true | Disable if you handle conflicts externally or want raw throughput. |
| `sweepIntervalMs` | 10,000 (10s) | Set to 0 to disable auto-sweep (call `sweep()` manually). Lower for tighter memory control. |
| `onError` | `defaultErrorHandler` | Provide custom handler to integrate with your logging/monitoring. |

## All 11 Signal Types

Every signal flowing through the bus has one of these types:

| Signal Type | When Emitted | Payload Interface | Typical Source |
|-------------|-------------|-------------------|----------------|
| `task:new` | Solve starts, new task injected | `TaskPayload` | Orchestrator |
| `discovery` | Agent finds relevant information | `DiscoveryPayload` | Any agent |
| `proposal` | Agent proposes an answer/solution | `ProposalPayload` | Any agent |
| `doubt` | Agent expresses uncertainty | `DoubtPayload` | Any agent |
| `challenge` | Agent challenges another's signal | `ChallengePayload` | Any agent |
| `vote` | Agent votes on a proposal | `VotePayload` | Any agent |
| `conflict` | Two proposals conflict | `ConflictPayload` | SignalBus (auto) |
| `consensus:reached` | Consensus engine decides | `ConsensusReachedPayload` | ConsensusEngine |
| `escalate` | Issue needs higher authority | `EscalatePayload` | Any agent / Advisor |
| `memory:shared` | Agent shares from memory pool | `SharedMemoryPayload` | Any agent |
| `tool:result` | Tool call completed | `ToolResultPayload` | Agent with tools |

### Signal Interface

```typescript
interface Signal<T extends SignalType = SignalType> {
  readonly id: string
  readonly type: T
  readonly source: string           // agent ID that emitted
  readonly payload: SignalPayloadMap[T]
  readonly confidence: number       // 0..1
  readonly timestamp: number        // ms since epoch
  readonly replyTo?: string         // ID of signal being replied to
  readonly ttl?: number             // ms, overrides defaultTtlMs
  readonly metadata?: SignalMetadata
}

interface SignalMetadata {
  readonly round?: number
  readonly priority?: number
}
```

### Signal Type Details

**`task:new`** -- The orchestrator publishes this at the start of each solve. All agents receive it as their initial stimulus. Agents subscribed to `task:new` produce their first reactions.

**`discovery`** -- Information found during research. High-confidence discoveries from trusted agents influence proposal formation. Often the first signal type emitted by agents in round 1.

**`proposal`** -- A concrete answer or solution. Proposals trigger the consensus engine. Multiple proposals from different agents create the basis for voting and potential conflict.

**`doubt`** -- Signals uncertainty about a previous signal (via `replyTo`). Doubt signals lower the effective confidence of the referenced signal in consensus calculations.

**`challenge`** -- Directly challenges another signal. Stronger than doubt -- creates a conflict pair with the challenged signal when `replyTo` is set.

**`vote`** -- Explicit vote on a proposal. Contains stance (agree/disagree/abstain) and weight. Required input for the ConsensusEngine.

**`consensus:reached`** -- Emitted by the consensus engine when a decision is made. Signals to all agents that deliberation can wrap up.

**`escalate`** -- Indicates the swarm cannot resolve an issue internally. The advisor or orchestrator may act on escalation signals.

**`memory:shared`** -- Agents share relevant information from their memory pool. Other agents can use this to inform their reasoning without direct coupling.

**`tool:result`** -- Result of an external tool call (web search, code execution, etc.). Contains the tool output for other agents to react to.

## Signal Lifecycle

```
Agent creates signal
       |
       v
  bus.publish(signal)
       |
       +-- Is signal expired? --yes--> (dropped, not published)
       |
       no
       |
       +-- Add to history (evict oldest if maxHistorySize reached)
       |
       +-- Conflict detection enabled?
       |     |
       |    yes --> Is this a proposal? Check against other proposals
       |     |      from different sources --> conflict:detected event
       |     |
       +-- Deliver to all subscribers of this signal type
       |     |
       |     +-- For each subscriber: callback(signal)
       |     +-- Emit signal:delivered event per delivery
       |
       +-- Emit signal:emitted event
       |
       .
       .  (time passes)
       .
       |
  sweep() runs (auto every sweepIntervalMs)
       |
       +-- For each signal in history:
       |     Is now > timestamp + ttl? --> remove, emit signal:expired
       |
       v
  Signal gone from history
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

### Advanced Filtering Patterns

**Filter by multiple types:**

```typescript
const combatSignals = bus.getHistory({
  type: ['challenge', 'doubt', 'conflict'],
})
```

**Filter by time window (last 10 seconds):**

```typescript
const recentSignals = bus.getHistory({
  since: Date.now() - 10_000,
})
```

**Filter high-confidence proposals from a specific agent:**

```typescript
const strongProposals = bus.getHistory({
  type: 'proposal',
  source: 'senior-analyst',
  minConfidence: 0.8,
})
```

**Get reply threads (all responses to a specific signal):**

```typescript
const originalSignal = proposals[0]
const replies = bus.getHistory({
  replyTo: originalSignal.id,
})
// Returns all doubts, challenges, votes referencing this signal
```

**Combine time window with type (signals from the current round):**

```typescript
const roundStart = performance.now()
// ... round executes ...
const roundSignals = bus.getHistory({
  since: roundStart,
  type: ['proposal', 'vote'],
})
```

## Conflict Detection

The bus automatically detects conflicting signal pairs when `enableConflictDetection` is true.

### How It Works

The `ConflictDetector` checks each new signal against the history:

1. Only `proposal`-type signals can trigger conflict detection.
2. A conflict is detected when two proposals come from **different agents** (different `source` field).
3. Challenge signals referencing another signal via `replyTo` also create conflict pairs.

```typescript
// Two agents propose different solutions -> conflict detected
agentA.emit({ type: 'proposal', source: 'agent-a', content: 'Use REST API' })
agentB.emit({ type: 'proposal', source: 'agent-b', content: 'Use GraphQL' })
// ConflictPair created: { signalA: proposalA, signalB: proposalB }
```

### Conflict Resolution Flow

```
Two proposals from different agents
       |
       v
  ConflictDetector.check() -> ConflictPair
       |
       v
  conflict:detected event emitted
       |
       v
  Orchestrator picks up the event
       |
       +-- conflictResolution === 'debate'
       |     |
       |     v
       |   DebateRunner starts structured debate
       |     |
       |     v
       |   Debate resolves or hits maxRounds
       |     |
       |     v
       |   bus.resolveConflict(signalAId, signalBId)
       |
       +-- conflictResolution === 'majority'
       |     |
       |     v
       |   Proposal with more support wins immediately
       |
       +-- conflictResolution === 'escalate'
             |
             v
           Escalation signal emitted for external handling
```

### Working with Conflicts

```typescript
// Check current unresolved conflicts
const conflicts = bus.getConflicts()
for (const conflict of conflicts) {
  console.log(`Conflict between ${conflict.signalA.source} and ${conflict.signalB.source}`)
  console.log(`Detected at: ${new Date(conflict.detectedAt).toISOString()}`)
}

// After resolution (e.g., debate winner chosen)
bus.resolveConflict(conflict.signalA.id, conflict.signalB.id)

// Verify no more unresolved
console.log(bus.getConflicts().length) // 0
```

## ConflictPair

```typescript
interface ConflictPair {
  readonly signalA: Signal
  readonly signalB: Signal
  readonly detectedAt: number
}
```

## Memory Management

### TTL Strategies

Each signal can override the bus-level `defaultTtlMs` with its own `ttl` field:

```typescript
// Short-lived discovery signal (expire after 5s)
bus.publish({
  id: 'sig-1',
  type: 'discovery',
  source: 'agent-1',
  payload: { ... },
  confidence: 0.6,
  timestamp: Date.now(),
  ttl: 5_000,  // 5 seconds
})

// Long-lived proposal (expire after 5 minutes)
bus.publish({
  id: 'sig-2',
  type: 'proposal',
  source: 'agent-2',
  payload: { ... },
  confidence: 0.9,
  timestamp: Date.now(),
  ttl: 300_000,  // 5 minutes
})
```

### TTL Guidelines

| Signal Type | Recommended TTL | Reasoning |
|-------------|----------------|-----------|
| `task:new` | Long (5 min+) or no TTL | Task context needed throughout solve |
| `discovery` | Medium (30-60s) | Relevant for current deliberation |
| `proposal` | Long (2-5 min) | Must survive until consensus |
| `doubt` / `challenge` | Medium (30-60s) | Relevant while debate is active |
| `vote` | Long (2-5 min) | Must survive until consensus |
| `tool:result` | Short (10-30s) | Consumed quickly by agents |
| `memory:shared` | Medium (60s) | Background context |

### History Size Tuning

The `maxHistorySize` acts as a ring buffer. When history reaches the limit, the oldest signal is evicted (FIFO):

```typescript
// For a swarm with 5 agents, 10 rounds, ~5 signals/agent/round:
// Expected signals: 5 * 10 * 5 = 250
const bus = new SignalBus({ maxHistorySize: 500 }) // 2x headroom

// For a large swarm (20 agents, 50 rounds):
const bus = new SignalBus({ maxHistorySize: 5000 })

// For memory-constrained environments:
const bus = new SignalBus({
  maxHistorySize: 100,
  defaultTtlMs: 10_000,    // aggressive TTL
  sweepIntervalMs: 5_000,  // frequent sweeps
})
```

## Signal Routing

Signals flow through the bus via pub/sub. Agents subscribe to signal types in their `listens` config. The orchestrator's `RoundRunner` manages the subscription lifecycle.

This means:
- All signals are visible to all agents that care about them
- No direct agent-to-agent coupling
- The full history is always queryable
- An agent never receives signal types it didn't subscribe to

### Subscription Example

```typescript
// Agent config
const agentConfig = {
  id: 'analyst',
  listens: ['task:new', 'discovery', 'challenge'] as const,
  canEmit: ['discovery', 'proposal'] as const,
}

// The orchestrator subscribes agents based on their config:
bus.subscribe('analyst', agentConfig.listens, (signal) => {
  // Called for every task:new, discovery, or challenge signal
  agent.onSignal(signal)
})

// At end of solve or round:
bus.unsubscribe('analyst')
```

## Pattern: Building a Signal-Driven Workflow

Here's a complete example of using the SignalBus for a custom multi-agent workflow:

```typescript
import { SignalBus } from '@cognitive-swarm/signals'
import { TypedEventEmitter } from '@cognitive-swarm/core'

const events = new TypedEventEmitter()
const bus = new SignalBus(
  { maxHistorySize: 500, defaultTtlMs: 120_000 },
  events,
)

// Monitor signal flow
events.on('signal:emitted', (signal) => {
  console.log(`[${signal.type}] from ${signal.source} (confidence: ${signal.confidence})`)
})

events.on('conflict:detected', (conflict) => {
  console.log(`Conflict: ${conflict.signalA.source} vs ${conflict.signalB.source}`)
})

// Subscribe agents
bus.subscribe('researcher', ['task:new', 'discovery'], handleResearcherSignal)
bus.subscribe('critic', ['proposal', 'discovery'], handleCriticSignal)
bus.subscribe('synthesizer', ['proposal', 'vote', 'consensus:reached'], handleSynthesizerSignal)

// Kick off the workflow
bus.publish({
  id: 'task-1',
  type: 'task:new',
  source: 'orchestrator',
  payload: { task: 'Analyze event sourcing tradeoffs' },
  confidence: 1.0,
  timestamp: Date.now(),
})

// Later: clean up
bus.destroy()
```

## Debugging Signal Flow

### Inspect History

```typescript
// See everything that happened
const all = bus.getHistory()
console.log(`Total signals: ${all.length}`)

// Group by type
const byType = new Map<string, number>()
for (const s of all) {
  byType.set(s.type, (byType.get(s.type) ?? 0) + 1)
}
console.log('Signal distribution:', Object.fromEntries(byType))
```

### Event Listeners for Debugging

```typescript
// Log every delivery
events.on('signal:delivered', ({ signal, targetAgentId }) => {
  console.log(`  -> delivered ${signal.type}:${signal.id} to ${targetAgentId}`)
})

// Log expirations
events.on('signal:expired', (signal) => {
  console.log(`  [expired] ${signal.type}:${signal.id} from ${signal.source}`)
})

// Log conflicts
events.on('conflict:detected', (conflict) => {
  console.log(`  [conflict] ${conflict.signalA.id} vs ${conflict.signalB.id}`)
})
```

### Common Debugging Questions

**"Why didn't agent X receive the signal?"**
- Check if the agent is subscribed to that signal type (`listens` config)
- Check if the signal was expired before publishing (TTL already exceeded)
- Check if `unsubscribe()` was called too early

**"Why are there no conflicts detected?"**
- Verify `enableConflictDetection` is true (default)
- Only `proposal` signals trigger conflict detection
- Proposals from the same source don't conflict with each other

**"History is empty but signals were published"**
- `sweep()` may have cleared expired signals
- `maxHistorySize` may be too small (oldest evicted)
- `destroy()` was called, which clears everything

## Properties

```typescript
bus.historySize  // number of signals currently in history
```
