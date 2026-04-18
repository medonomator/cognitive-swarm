# Signals

Signals are the primary communication primitive in cognitive-swarm. All agent-to-agent communication happens through typed signals on a shared bus -- no direct function calls between agents. This page covers every signal type, its payload, the full bus API, conflict detection internals, TTL/sweep mechanics, and filtering.

## Signal Types (11 total)

```typescript
// packages/core/src/types/signal.ts

type SignalType =
  | 'task:new'          // A new task enters the swarm
  | 'discovery'         // An agent found something relevant
  | 'proposal'          // An agent proposes a solution
  | 'doubt'             // An agent expresses uncertainty about a signal
  | 'challenge'         // An agent directly challenges a proposal
  | 'vote'              // An agent votes on a proposal
  | 'conflict'          // Bus detected two contradicting signals
  | 'consensus:reached' // Consensus engine reached a decision
  | 'escalate'          // Problem requires human or external escalation
  | 'memory:shared'     // An agent shares a fact with the swarm memory pool
  | 'tool:result'       // Result from an MCP tool call
```

## The Signal Interface

Every signal flowing through the bus conforms to this interface. The generic parameter `T` locks `payload` to the correct shape for the signal type at compile time:

```typescript
interface Signal<T extends SignalType = SignalType> {
  readonly id: string                       // unique ID (uid('sig'))
  readonly type: T                          // discriminant
  readonly source: string                   // agent ID or 'orchestrator'
  readonly payload: SignalPayloadMap[T]     // type-safe payload
  readonly confidence: number               // 0..1
  readonly timestamp: number                // Date.now()
  readonly replyTo?: string                 // ID of signal this replies to
  readonly ttl?: number                     // ms until signal expires (overrides bus default)
  readonly metadata?: SignalMetadata
}

interface SignalMetadata {
  readonly round?: number
  readonly priority?: number
  /** Pearl's Ladder: correlation (L1) < intervention (L2) < counterfactual (L3). */
  readonly causalLevel?: CausalLevel
}

type CausalLevel = 'correlation' | 'intervention' | 'counterfactual'
```

## All 11 Payload Types

Each signal type maps to exactly one payload shape via `SignalPayloadMap`:

### `task:new` -- Task Entry

```typescript
interface TaskPayload {
  readonly task: string       // the problem to solve
  readonly context?: string   // optional background context
}
```

Emitted by the orchestrator at round 1. All agents that listen to `task:new` receive this as their initial stimulus.

### `discovery` -- Agent Finding

```typescript
interface DiscoveryPayload {
  readonly finding: string     // what was found
  readonly evidence?: string   // supporting evidence
  readonly relevance: number   // 0..1, how relevant to the task
}
```

Agents emit discoveries when they find facts, patterns, or insights. High-relevance discoveries with `evidence` tend to influence consensus more. Discoveries are stored in vector memory (if configured) for cross-session recall.

### `proposal` -- Solution Proposal

```typescript
interface ProposalPayload {
  readonly proposalId: string   // unique ID for this proposal
  readonly content: string      // the proposed solution
  readonly reasoning: string    // why this proposal is good
}
```

Proposals enter the consensus pipeline. The `proposalId` is what votes reference. When two agents submit proposals from different sources, the bus detects a `conflict`.

### `doubt` -- Uncertainty

```typescript
interface DoubtPayload {
  readonly targetSignalId: string                // which signal is doubted
  readonly concern: string                        // what the concern is
  readonly severity: 'low' | 'medium' | 'high'   // how serious
}
```

Agents with high `caution` personality naturally emit more doubts. Doubt signals don't block proposals directly -- they inform other agents that something may be wrong.

### `challenge` -- Counter-argument

```typescript
interface ChallengePayload {
  readonly targetSignalId: string         // signal being challenged
  readonly counterArgument: string        // the counter-argument
  readonly alternativeProposal?: string   // optional alternative
}
```

Stronger than doubt. The math bridge's game theory module tracks expected vs actual challengers -- if too few agents challenge, it indicates groupthink risk. Challenges with `alternativeProposal` can shift consensus direction.

### `vote` -- Voting on Proposals

```typescript
interface VotePayload {
  readonly proposalId: string                        // which proposal
  readonly stance: 'agree' | 'disagree' | 'abstain'  // position
  readonly reasoning?: string                        // optional rationale
  readonly weight: number                            // voter confidence weight
}
```

Votes are the input to the consensus engine. The `weight` field matters differently depending on the strategy:
- **confidence-weighted**: `agreeWeight / totalWeight` ratio
- **bayesian**: converted to likelihood ratio via `voteToLikelihoodRatio(stance, weight)`
- **entropy**: weighted support summed per proposal
- **hierarchical**: highest weight voter can override
- **voting**: weights ignored, each voter = 1 vote

### `conflict` -- Detected Contradiction

```typescript
interface ConflictPayload {
  readonly signalA: string     // first signal ID
  readonly signalB: string     // second signal ID
  readonly description: string // what the conflict is about
}
```

Emitted automatically by the signal bus when two proposals from different agents are detected. Conflicts trigger the configured resolution mode (`debate`, `escalate`, or `majority`).

### `consensus:reached` -- Decision Made

```typescript
interface ConsensusReachedPayload {
  readonly proposalId: string   // winning proposal
  readonly decision: string     // the content of the decision
  readonly confidence: number   // 0..1 consensus confidence
}
```

Emitted by the consensus engine. This stops the solve loop.

### `escalate` -- External Escalation

```typescript
interface EscalatePayload {
  readonly reason: string    // why escalation is needed
  readonly context: string   // relevant context for the human
}
```

When `conflictResolution: 'escalate'` is configured, unresolvable conflicts produce this signal instead of forcing a decision.

### `memory:shared` -- Shared Memory Fact

```typescript
interface SharedMemoryPayload {
  readonly content: string      // the fact/knowledge
  readonly category: string     // category label
  readonly importance: number   // 0..1
}
```

Used when the orchestrator recalls prior knowledge from vector memory (Qdrant) at solve start. Also emitted when agents want to share facts across the swarm memory pool.

### `tool:result` -- MCP Tool Output

```typescript
interface ToolResultPayload {
  readonly toolName: string     // which tool was called
  readonly result: string       // tool output
  readonly isError: boolean     // whether it errored
  readonly durationMs: number   // how long it took
  readonly triggeredBy: string  // which agent triggered the call
}
```

When agents have MCP tool access, tool results are broadcast as signals so other agents can incorporate them.

## Signal Lifecycle

```
                                    ┌──────────────────────────┐
                                    │      Signal Bus          │
                                    │                          │
  Agent emits signal ───────────────▶  1. Check if expired     │
                                    │     (ttl or defaultTtlMs)│
                                    │     ↓ skip if expired    │
                                    │                          │
                                    │  2. Add to history[]     │
                                    │     (bounded by          │
                                    │      maxHistorySize)     │
                                    │                          │
                                    │  3. Conflict detection   │
                                    │     (if proposal, check  │
                                    │      against all other   │
                                    │      proposals from      │
                                    │      different sources)  │
                                    │                          │
                                    │  4. Route to subscribers │
                                    │     agents with matching │
                                    │     listens[] types      │
                                    │                          │
                                    │  5. Emit events:         │
                                    │     signal:delivered     │
                                    │     signal:emitted       │
                                    │                          │
                                    │  6. Sweep timer runs     │
                                    │     every sweepIntervalMs│
                                    │     removing expired     │
                                    │     signals from history │
                                    └──────────────────────────┘
```

### Step by step:

1. **Agent calls** `signalBus.publish(signal)`.
2. **Expiry check**: if `now > signal.timestamp + (signal.ttl ?? config.defaultTtlMs)`, the signal is silently dropped.
3. **History**: the signal is appended to the bounded history array. If `history.length >= maxHistorySize`, the oldest signal is evicted (`shift()`).
4. **Conflict detection** (if `enableConflictDetection` is true): for `proposal` signals, the `ConflictDetector` checks every existing proposal in history. If it finds a proposal from a *different* source, it creates a `ConflictPair` and emits `conflict:detected`.
5. **Delivery**: the bus iterates all subscribers registered for this `signal.type` and calls their callbacks. Each delivery emits a `signal:delivered` event with the target agent ID.
6. **Global emit**: `signal:emitted` fires for OTel tracing and streaming.
7. **Periodic sweep**: a timer runs every `sweepIntervalMs` and removes expired signals from history, emitting `signal:expired` for each.

## SignalBus Configuration

```typescript
interface SignalBusConfig {
  readonly maxHistorySize?: number         // default: 1000
  readonly defaultTtlMs?: number           // default: 60_000 (60s)
  readonly enableConflictDetection?: boolean // default: true
  readonly sweepIntervalMs?: number        // default: 10_000 (10s), 0 = disabled
  readonly onError?: ErrorHandler          // error handler for delivery failures
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxHistorySize` | 1000 | Maximum signals kept in history. Oldest evicted when exceeded. |
| `defaultTtlMs` | 60,000 | Default time-to-live for signals without explicit `ttl`. |
| `enableConflictDetection` | true | Whether `ConflictDetector` runs on each publish. |
| `sweepIntervalMs` | 10,000 | How often expired signals are swept from history. 0 = no sweep timer. |
| `onError` | `defaultErrorHandler` | Called when a subscriber callback throws. |

::: tip
The orchestrator overrides `sweepIntervalMs: 0` and sets `defaultTtlMs` to `timeout * 2` to prevent mid-solve signal expiration. Signals expire naturally via round progression, not timers.
:::

## SignalBus API

```typescript
class SignalBus {
  /** Publish a signal to all subscribers of its type. */
  publish(signal: Signal): void

  /** Subscribe an agent to one or more signal types. */
  subscribe(
    agentId: string,
    types: readonly SignalType[],
    callback: (signal: Signal) => void,
  ): void

  /** Unsubscribe an agent from all signal types. */
  unsubscribe(agentId: string): void

  /** Query signal history with optional filtering. */
  getHistory(filter?: SignalFilter): readonly Signal[]

  /** Get all unresolved conflicts. */
  getConflicts(): readonly ConflictPair[]

  /** Mark a conflict as resolved. */
  resolveConflict(signalAId: string, signalBId: string): void

  /** Remove expired signals from history. */
  sweep(): void

  /** Number of signals currently in history. */
  get historySize(): number

  /** Clean up timers and clear all state. */
  destroy(): void
}
```

## Filtering Signal History

The `getHistory()` method accepts a `SignalFilter` to query the signal log:

```typescript
interface SignalFilter {
  readonly type?: SignalType | readonly SignalType[]  // filter by signal type(s)
  readonly source?: string                            // filter by source agent ID
  readonly since?: number                             // timestamp lower bound
  readonly until?: number                             // timestamp upper bound
  readonly replyTo?: string                           // filter by replyTo signal ID
  readonly minConfidence?: number                     // minimum confidence threshold
}
```

### Filter Examples

```typescript
// Get all proposals from a specific agent
const agentProposals = signalBus.getHistory({
  type: 'proposal',
  source: 'analyst',
})

// Get all high-confidence discoveries in the last 30 seconds
const recentDiscoveries = signalBus.getHistory({
  type: 'discovery',
  since: Date.now() - 30_000,
  minConfidence: 0.7,
})

// Get all votes and challenges on proposals
const feedback = signalBus.getHistory({
  type: ['vote', 'challenge'],
})

// Get all signals replying to a specific signal
const replies = signalBus.getHistory({
  replyTo: 'sig-abc123',
})

// Combine filters: high-confidence votes since round start
const strongVotes = signalBus.getHistory({
  type: 'vote',
  since: roundStartTimestamp,
  minConfidence: 0.6,
})
```

## Conflict Detection

The `ConflictDetector` is a focused component that only looks at `proposal` signals:

```typescript
class ConflictDetector {
  /**
   * Check a new signal against history for conflicts.
   * Only proposals can conflict. A conflict = two proposals
   * from DIFFERENT agents (different source, different id).
   */
  check(signal: Signal, history: readonly Signal[]): ConflictPair | null

  /** Mark a conflict as resolved. */
  markResolved(signalAId: string, signalBId: string): void

  /** Get all unresolved conflicts. */
  getUnresolved(): readonly ConflictPair[]
}
```

```typescript
interface ConflictPair {
  readonly signalA: Signal    // the existing proposal
  readonly signalB: Signal    // the new competing proposal
  readonly detectedAt: number // when the conflict was detected
}
```

The detection logic is straightforward: when a `proposal` signal is published, the detector iterates all proposals in history. If it finds any proposal from a *different* source with a *different* ID, it creates a `ConflictPair`. The first conflict found is returned (one per publish call).

Unresolved conflicts are passed to the consensus engine's conflict resolution mechanism:
- **`debate`** (default): the `DebateRunner` runs structured adversarial rounds between the two proposals
- **`majority`**: immediate majority vote decides the winner
- **`escalate`**: an `escalate` signal is emitted, returning an unresolved result

## Causal Levels Explained

Signals can carry a `causalLevel` in their metadata, based on Judea Pearl's Ladder of Causation:

```
Level 1: correlation       "X and Y co-occur"
                           Observational. The weakest form of evidence.
                           Example: "Users who churn also have low engagement"

Level 2: intervention      "If we do X, then Y"
                           Experimental. Stronger than correlation.
                           Example: "If we add onboarding, engagement increases"

Level 3: counterfactual    "If X had not happened, Y would not have"
                           Hypothetical reasoning. The strongest evidence.
                           Example: "Had we not added onboarding, engagement
                                     would have remained low"
```

**How causal levels affect behavior:**

- The `CausalEngine` math module (`causal-inference.ts`) uses signal causal levels to build causal graphs and evaluate interventions.
- **Important**: causal levels affect signal *routing priority* (via `AgentSelector`), NOT direct vote weight. The `ConfidenceWeightedStrategy` explicitly documents this: "causal levels affect signal routing priority, NOT vote weight." This prevents counterfactual challenges from drowning out agreement.
- The consensus engine *can* access causal levels via `VoteRecord.causalLevel`, but the built-in strategies do not use it directly. Custom strategies can.

## Agent Signal Subscriptions

Each agent declares which signal types it listens to and which it can emit:

```typescript
{
  config: {
    id: 'analyst',
    name: 'Analyst',
    role: 'Analyze problems from first principles',
    personality: { curiosity: 0.9, caution: 0.6, conformity: 0.3, verbosity: 0.7 },
    listens: ['task:new', 'proposal', 'challenge'],
    canEmit: ['discovery', 'proposal', 'vote'],
  },
  engine,
}
```

This creates natural specialization without explicit role scripting:

| Personality + Signals | Emergent Behavior |
|---|---|
| high curiosity, emits `discovery`, `proposal` | Explorer/researcher |
| high caution, emits `doubt`, `challenge` | Devil's advocate/critic |
| low conformity, listens to `challenge` | Independent thinker |
| high conformity, emits `vote` | Consensus builder |

The `canEmit` constraint is enforced by the `SwarmAgent` -- the agent simply won't generate signals of types not in its `canEmit` list. The `listens` list determines which signal types get delivered via the bus subscription.

## TTL and Sweep Mechanics

### Per-signal TTL

Each signal can set its own `ttl` (in milliseconds). If not set, the bus's `defaultTtlMs` is used:

```typescript
// Signal with a 5-second TTL
const shortLivedSignal: Signal = {
  id: uid('sig'),
  type: 'discovery',
  source: 'agent-1',
  payload: { finding: 'transient observation', relevance: 0.3 },
  confidence: 0.4,
  timestamp: Date.now(),
  ttl: 5000,  // expires in 5 seconds
}
```

### Expiry check

A signal is considered expired when:
```typescript
now > signal.timestamp + (signal.ttl ?? config.defaultTtlMs)
```

This is checked in two places:
1. **On publish**: expired signals are silently dropped (never enter history).
2. **On sweep**: the `sweep()` method removes expired signals from history and emits `signal:expired` events.

### Sweep timer

If `sweepIntervalMs > 0`, a `setInterval` timer runs `sweep()` periodically. The sweep iterates history in-place, splicing out expired entries:

```typescript
sweep(): void {
  const now = Date.now()
  let i = 0
  while (i < this.history.length) {
    if (this.isExpiredAt(this.history[i]!, now)) {
      this.history.splice(i, 1)
      this.events?.emit('signal:expired', signal)
    } else {
      i++
    }
  }
}
```

::: warning
Always call `bus.destroy()` when done. It clears the sweep timer, all handlers, and history. The orchestrator calls this in its own `destroy()` method.
:::

## Internal Architecture

```
                    SignalBus
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    │  handlers: Map<SignalType, Set<Entry>>   │
                    │    task:new  → {agent-1, agent-2}        │
                    │    proposal → {agent-1, agent-3}         │
                    │    challenge→ {agent-2}                   │
                    │                                          │
                    │  agentSubscriptions: Map<agentId, Set>   │
                    │    agent-1 → {task:new, proposal}        │
                    │    agent-2 → {task:new, challenge}       │
                    │                                          │
                    │  history: Signal[]  (bounded)            │
                    │                                          │
                    │  conflictDetector: ConflictDetector      │
                    │    unresolved: ConflictPair[]            │
                    │                                          │
                    │  events: TypedEventEmitter<SwarmEventMap>│
                    │    signal:emitted                        │
                    │    signal:delivered                      │
                    │    signal:expired                        │
                    │    conflict:detected                     │
                    │                                          │
                    │  sweepTimer: setInterval | null          │
                    └──────────────────────────────────────────┘
```

The bus uses two data structures for routing:
- `handlers`: maps each `SignalType` to a `Set<SubscriptionEntry>` (agentId + callback pairs). This is the primary routing table.
- `agentSubscriptions`: maps each `agentId` to the `Set<SignalType>` it's subscribed to. This is used for cleanup in `unsubscribe()`.

Both are populated by `subscribe()` and cleaned up by `unsubscribe()` or `destroy()`.
