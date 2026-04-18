# @cognitive-swarm/core

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/core)](https://www.npmjs.com/package/@cognitive-swarm/core)

Core types, interfaces, and event emitter for the cognitive-swarm framework.

## Install

```bash
npm install @cognitive-swarm/core
```

## Overview

This package is **type-only** (plus one class) -- it defines the shared vocabulary that all other packages depend on. No LLM calls, no I/O, no heavy dependencies.

The three pillars:

- **Signal** -- the unit of communication between agents
- **SwarmConfig** -- everything needed to configure a swarm solve
- **SwarmResult** -- everything produced by a solve

## Quick Start

```typescript
import type {
  Signal,
  SignalType,
  SwarmAgentConfig,
  PersonalityVector,
  ConsensusConfig,
  SwarmConfig,
  SwarmResult,
  VectorMemory,
} from '@cognitive-swarm/core'

import { TypedEventEmitter } from '@cognitive-swarm/core'
```

## Signal System

Signals are typed, immutable messages that flow through the swarm's SignalBus. All 11 signal types:

```typescript
type SignalType =
  | 'task:new' | 'discovery' | 'proposal' | 'doubt'
  | 'challenge' | 'vote' | 'conflict' | 'consensus:reached'
  | 'escalate' | 'memory:shared' | 'tool:result'

interface Signal<T extends SignalType = SignalType> {
  readonly id: string
  readonly type: T
  readonly source: string
  readonly payload: SignalPayloadMap[T]
  readonly confidence: number       // 0..1
  readonly timestamp: number
  readonly replyTo?: string
  readonly ttl?: number
  readonly metadata?: SignalMetadata
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

interface SwarmAgentConfig {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly personality: PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly weight?: number
  readonly strategyActions?: readonly AgentStrategyId[]
  readonly tools?: AgentToolConfig
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
  readonly evolution?: EvolutionConfig
  readonly tokenBudget?: number
  readonly checkpoint?: CheckpointStorage
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
  readonly evolutionReport: EvolutionReport | null
}
```

## TypedEventEmitter

Generic typed event emitter parameterized by an event map:

```typescript
const emitter = new TypedEventEmitter<SwarmEventMap>()
emitter.on('signal:emitted', (signal) => { /* fully typed */ })
emitter.off('signal:emitted', handler)
emitter.emit('signal:emitted', signal)
emitter.removeAllListeners('signal:emitted')
emitter.listenerCount('signal:emitted')
```

## SwarmEventMap

All events emitted during a solve, including `signal:emitted`, `signal:expired`, `agent:reacted`, `conflict:detected`, `consensus:reached`, `round:start`, `round:end`, `debate:*`, `advisor:action`, `topology:updated`, `tool:called`, `evolution:spawned`, and `evolution:dissolved`.

## Type Categories

| Category | Key Types |
|----------|-----------|
| Signals | `Signal`, `SignalType`, `SignalPayloadMap`, `SignalFilter`, `SignalBusConfig` |
| Agents | `SwarmAgentConfig`, `SwarmAgentDef`, `PersonalityVector`, `AgentReaction`, `AgentContribution` |
| Consensus | `ConsensusConfig`, `ConsensusStrategy`, `ConsensusResult`, `Proposal`, `VoteRecord` |
| Memory | `VectorMemory`, `VectorMemoryEntry` |
| Math | `MathConfig`, `MathAnalysis`, `MathStoppingReason`, `SwarmControlSignals` |
| Advisor | `SwarmAdvisorConfig`, `SwarmAdvice`, `AdvisorReport`, `TopologyConfig` |
| Evolution | `EvolutionConfig`, `EvolutionReport` |
| Evaluation | `OutcomeVerdict`, `OutcomeRecord`, `CalibrationPoint`, `EvaluationReport` |
| Checkpoint | `CheckpointStorage`, `SolveCheckpoint` |
| Tools | `AgentToolConfig`, `AgentToolSupport`, `ToolExecutor`, `McpServerConfig` |

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/core) | [GitHub](https://github.com/medonomator/cognitive-swarm)
