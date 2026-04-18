# @cognitive-swarm/core

Core types, interfaces, and event emitter for the cognitive-swarm framework.

## Install

```bash
npm install @cognitive-swarm/core
```

## Key Concepts

This package is **type-only** (plus one class) -- it defines the shared vocabulary that all other packages depend on. No LLM calls, no I/O, no heavy dependencies.

The three pillars:

- **Signal** -- the unit of communication between agents
- **SwarmConfig** -- everything needed to configure a swarm solve
- **SwarmResult** -- everything produced by a solve

## Signal System

Signals are typed, immutable messages that flow through the swarm's SignalBus.

```typescript
type SignalType =
  | 'task:new'
  | 'discovery'
  | 'proposal'
  | 'doubt'
  | 'challenge'
  | 'vote'
  | 'conflict'
  | 'consensus:reached'
  | 'escalate'
  | 'memory:shared'
  | 'tool:result'

interface Signal<T extends SignalType = SignalType> {
  readonly id: string
  readonly type: T
  readonly source: string
  readonly payload: SignalPayloadMap[T]
  readonly confidence: number
  readonly timestamp: number
  readonly replyTo?: string
  readonly ttl?: number
  readonly metadata?: SignalMetadata
}

interface SignalMetadata {
  readonly round?: number
  readonly priority?: number
  readonly causalLevel?: CausalLevel  // 'correlation' | 'intervention' | 'counterfactual'
}
```

Each `SignalType` has a corresponding payload shape via `SignalPayloadMap`. Key payloads:

```typescript
interface ProposalPayload {
  readonly proposalId: string
  readonly content: string
  readonly reasoning: string
}

interface VotePayload {
  readonly proposalId: string
  readonly stance: 'agree' | 'disagree' | 'abstain'
  readonly reasoning?: string
  readonly weight: number
}

interface DiscoveryPayload {
  readonly finding: string
  readonly evidence?: string
  readonly relevance: number
}
```

## Agent Types

```typescript
interface PersonalityVector {
  readonly curiosity: number   // 0-1
  readonly caution: number     // 0-1
  readonly conformity: number  // 0-1
  readonly verbosity: number   // 0-1
}

type AgentStrategyId =
  | 'analyze' | 'propose' | 'challenge'
  | 'support' | 'synthesize' | 'defer'

interface SwarmAgentConfig {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly personality: PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly weight?: number
  readonly maxConcurrentSignals?: number
  readonly strategyActions?: readonly AgentStrategyId[]
  readonly tools?: AgentToolConfig
}

interface SwarmAgentDef {
  readonly config: SwarmAgentConfig
  readonly engine: EngineConfig
  readonly toolSupport?: AgentToolSupport
}
```

## SwarmConfig

```typescript
interface SwarmConfig {
  readonly agents: readonly SwarmAgentDef[]
  readonly consensus?: ConsensusConfig
  readonly maxRounds?: number        // default: 10
  readonly maxSignals?: number       // default: 200
  readonly timeout?: number          // default: 120_000ms
  readonly synthesizer?: SynthesizerConfig
  readonly memory?: VectorMemory
  readonly math?: MathConfig
  readonly advisor?: SwarmAdvisorConfig
  readonly retry?: RetryConfig
  readonly tokenBudget?: number
  readonly checkpoint?: CheckpointStorage
  readonly evolution?: EvolutionConfig
}
```

## SwarmResult

```typescript
interface SwarmResult {
  readonly solveId: string
  readonly answer: string
  readonly confidence: number
  readonly consensus: ConsensusResult
  readonly signalLog: readonly Signal[]
  readonly agentContributions: ReadonlyMap<string, AgentContribution>
  readonly cost: SwarmCost
  readonly timing: SwarmTiming
  readonly mathAnalysis: MathAnalysis
  readonly advisorReport: AdvisorReport | null
  readonly debateResults: readonly DebateResult[]
  readonly evolutionReport: EvolutionReport | null
}
```

## TypedEventEmitter

Generic typed event emitter parameterized by an event map.

```typescript
class TypedEventEmitter<TMap extends { [K in keyof TMap]: unknown }> {
  on<K extends keyof TMap & string>(event: K, handler: (data: TMap[K]) => void): void
  off<K extends keyof TMap & string>(event: K, handler: (data: TMap[K]) => void): void
  emit<K extends keyof TMap & string>(event: K, data: TMap[K]): void
  removeAllListeners(event?: keyof TMap & string): void
  listenerCount(event: keyof TMap & string): number
}
```

## SwarmEventMap

All events emitted during a solve:

```typescript
interface SwarmEventMap {
  'signal:emitted': Signal
  'signal:expired': Signal
  'signal:delivered': SignalDeliveryEvent
  'agent:reacted': AgentReaction
  'agent:error': AgentErrorEvent
  'conflict:detected': ConflictPair
  'proposal:submitted': Proposal
  'vote:cast': VoteRecord
  'consensus:reached': ConsensusResult
  'consensus:failed': ConsensusFailedEvent
  'advisor:action': SwarmAdvice
  'debate:start': { proposalA: string; proposalB: string }
  'debate:round': { round: number; posteriors: Record<string, number> }
  'debate:end': DebateResult
  'round:start': RoundStartEvent
  'round:end': RoundEndEvent
  'synthesis:start': Record<string, never>
  'synthesis:complete': SynthesisCompleteEvent
  'topology:updated': { neighbors: ReadonlyMap<string, ReadonlySet<string>>; reason: string }
  'tool:called': ToolCalledEvent
  'evolution:spawned': EvolutionSpawnedEvent
  'evolution:dissolved': EvolutionDissolvedEvent
}
```

## Other Exports

- **Consensus types** -- `ConsensusConfig`, `ConsensusStrategy`, `ConsensusResult`, `Proposal`, `VoteRecord`
- **Memory types** -- `VectorMemory`, `VectorMemoryEntry`
- **Math types** -- `MathConfig`, `MathAnalysis`, `MathStoppingReason`, `SwarmControlSignals`
- **Advisor types** -- `SwarmAdvisorConfig`, `SwarmAdvice`, `AdvisorReport`, `TopologyConfig`
- **Evolution types** -- `EvolutionConfig`, `EvolutionReport`
- **Evaluation types** -- `OutcomeVerdict`, `OutcomeRecord`, `CalibrationPoint`, `EvaluationReport`
- **Checkpoint types** -- `CheckpointStorage`, `SolveCheckpoint`
- **Tool types** -- `AgentToolConfig`, `AgentToolSupport`, `ToolExecutor`, `McpServerConfig`
