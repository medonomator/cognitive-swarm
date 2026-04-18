# @cognitive-swarm/core

Core types, interfaces, and utilities for cognitive-swarm.

## Install

```bash
npm install @cognitive-swarm/core
```

## Overview

This package provides the foundational type system and shared utilities used across all `@cognitive-swarm/*` packages. It contains no runtime logic beyond a typed event emitter -- everything else is TypeScript interfaces and type definitions.

## Usage

```typescript
import type {
  Signal,
  SwarmAgentConfig,
  ConsensusConfig,
  SwarmConfig,
  SwarmResult,
  VectorMemory,
  VectorMemoryEntry,
  AgentTool,
  PersonalityVector,
} from '@cognitive-swarm/core'

import { TypedEventEmitter } from '@cognitive-swarm/core'
```

### Key type groups

| Category | Types |
|----------|-------|
| Signals | `Signal`, `SignalType`, `SignalPayloadMap`, `SignalFilter`, `SignalBusConfig` |
| Agents | `SwarmAgentConfig`, `PersonalityVector`, `AgentReaction`, `AgentContribution` |
| Consensus | `ConsensusConfig`, `Proposal`, `VoteRecord`, `ConsensusResult`, `ConsensusStrategy` |
| Tools | `AgentTool`, `AgentToolCall`, `AgentToolResult`, `McpServerConfig` |
| Orchestration | `SwarmConfig`, `SwarmResult`, `SwarmCost`, `SwarmTiming`, `SwarmEvent` |
| Memory | `VectorMemory`, `VectorMemoryEntry` |
| Math | `MathConfig`, `MathAnalysis`, `MathStoppingReason` |
| Advisor | `SwarmAdvisorConfig`, `SwarmAdvice`, `TopologyConfig`, `AdvisorReport` |

### TypedEventEmitter

A generic typed event emitter used internally by `SignalBus` and other components.

```typescript
const emitter = new TypedEventEmitter<SwarmEventMap>()
emitter.on('round:start', (event) => { /* ... */ })
```

## License

MIT

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
