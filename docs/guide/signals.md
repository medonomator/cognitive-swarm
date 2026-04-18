# Signals

Signals are the primary communication primitive in cognitive-swarm. All agent-to-agent communication happens through typed signals on a shared bus - no direct function calls between agents.

## Signal Types

```typescript
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

## Signal Structure

```typescript
interface Signal<T extends SignalType = SignalType> {
  readonly id: string
  readonly type: T
  readonly source: string           // agent ID
  readonly payload: SignalPayloadMap[T]
  readonly confidence: number       // 0..1
  readonly timestamp: number
  readonly replyTo?: string         // ID of signal this is replying to
  readonly ttl?: number             // rounds until signal expires
  readonly metadata?: {
    readonly round?: number
    readonly priority?: number
    readonly causalLevel?: 'correlation' | 'intervention' | 'counterfactual'
  }
}
```

## Payload Shapes

Each signal type has a specific payload:

```typescript
// A finding with evidence and relevance score
interface DiscoveryPayload {
  readonly finding: string
  readonly evidence?: string
  readonly relevance: number
}

// A concrete proposal for consensus
interface ProposalPayload {
  readonly proposalId: string
  readonly content: string
  readonly reasoning: string
}

// Uncertainty about another signal
interface DoubtPayload {
  readonly targetSignalId: string
  readonly concern: string
  readonly severity: 'low' | 'medium' | 'high'
}

// A direct counter-argument
interface ChallengePayload {
  readonly targetSignalId: string
  readonly counterArgument: string
  readonly alternativeProposal?: string
}

// A vote on a proposal
interface VotePayload {
  readonly proposalId: string
  readonly stance: 'agree' | 'disagree' | 'abstain'
  readonly reasoning?: string
  readonly weight: number
}
```

## Agent Signal Subscriptions

Each agent declares which signals it listens to and which it can emit:

```typescript
{
  config: {
    id: 'analyst',
    listens: ['task:new', 'proposal', 'challenge'],
    canEmit: ['discovery', 'proposal', 'vote'],
    // ...
  }
}
```

This creates a natural specialization: an agent configured with high caution and `canEmit: ['doubt', 'challenge']` will naturally become a critic without any explicit "critic role" scripting.

## Signal Lifecycle

```
1. Agent emits signal → SignalBus.emit()
2. Bus assigns id, timestamp, round metadata
3. Bus checks for conflicts with existing signals
4. Bus routes to agents that listen to this signal type
5. Agents that are active this round react
6. Signal enters history (queryable via SignalFilter)
7. TTL countdown: signal expires after N rounds if set
```

## Causal Levels

Signals can carry a causal level based on Pearl's Ladder of Causation:

- `correlation` (Level 1) - observational, "X and Y co-occur"
- `intervention` (Level 2) - experimental, "if we do X, then Y"
- `counterfactual` (Level 3) - hypothetical, "if X had not happened, Y would not have"

The consensus engine can weight votes from higher causal levels more heavily.

## Conflict Detection

The signal bus automatically detects conflicts - pairs of signals that make contradictory claims. Conflicting pairs are passed to the consensus engine's conflict resolution mechanism (debate, escalate, or majority).

## Querying Signal History

```typescript
const history = signalBus.getHistory({
  type: ['proposal', 'vote'],
  since: roundStartTimestamp,
  minConfidence: 0.6,
  source: 'agent-1',
})
```
