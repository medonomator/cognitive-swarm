# @cognitive-swarm/orchestrator

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/orchestrator)](https://www.npmjs.com/package/@cognitive-swarm/orchestrator)

The main entry point. `SwarmOrchestrator` wires all components together and runs the round-based solve loop.

## Install

```bash
npm install @cognitive-swarm/orchestrator
```

## Quick Start

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve('What is the best approach?')
console.log(result.answer)
console.log(result.confidence)
```

## Methods

### `solve(task): Promise<SwarmResult>`

Runs the swarm to completion and returns the full result.

### `solveWithStream(task): AsyncIterable<SwarmEvent>`

Returns an async iterable that yields events as they happen:

```typescript
for await (const event of swarm.solveWithStream('Analyze this')) {
  switch (event.type) {
    case 'round:start': console.log(`Round ${event.round}`); break
    case 'signal:emitted': console.log(event.signal.type); break
    case 'consensus:reached': console.log(event.result.decision); break
    case 'solve:complete': console.log(event.result.answer); break
  }
}
```

### `solveResumable(task, checkpointId): Promise<SwarmResult>`

Resumes from a checkpoint if one exists. Requires `checkpoint` in config.

### `on(event, handler): () => void`

Register typed event listeners. Returns a cleanup function.

### `destroy()`

Clean up all resources (timers, event listeners).

## Full Configuration

```typescript
const swarm = new SwarmOrchestrator({
  agents: [agentDef1, agentDef2],

  consensus: {
    strategy: 'confidence-weighted',
    threshold: 0.7,
    minVoters: 2,
    maxDebateRounds: 3,
    conflictResolution: 'debate',
  },

  maxRounds: 10,
  maxSignals: 200,
  timeout: 120_000,

  synthesizer: { llm: myLlmProvider },
  memory: qdrantVectorMemory,

  math: {
    entropyThreshold: 0.3,
    minInformationGain: 0.05,
    redundancyThreshold: 0.7,
  },

  advisor: {
    groupthinkCorrection: true,
    reputationWeighting: true,
    weightProvider: reputationTracker,
    topology: {
      enabled: true,
      minConnectivity: 0.3,
      protectBridgingAgents: true,
    },
  },

  retry: { maxRetries: 3, baseDelayMs: 500 },
  tokenBudget: 50_000,
  checkpoint: new FileCheckpointStorage('./checkpoints'),

  evolution: {
    enabled: true,
    maxEvolvedAgents: 3,
    evaluationWindow: 5,
    cooldownRounds: 3,
  },
})
```

## Events

All `SwarmEventMap` event types available via `swarm.on()`:

```typescript
swarm.on('signal:emitted', (signal) => { ... })
swarm.on('round:end', ({ round, signalCount }) => { ... })
swarm.on('consensus:reached', (result) => { ... })
swarm.on('evolution:spawned', (event) => { ... })
swarm.on('advisor:action', (advice) => { ... })
```

## FileCheckpointStorage

Built-in file-based checkpoint storage for resumable solves:

```typescript
import { FileCheckpointStorage } from '@cognitive-swarm/orchestrator'

const checkpoint = new FileCheckpointStorage('./checkpoints')
```

Implement `CheckpointStorage` interface for custom backends (Redis, database, etc.).

## Key Exports

| Export | Description |
|--------|-------------|
| `SwarmOrchestrator` | Main entry point -- runs the full solve loop |
| `SwarmAdvisor` | Meta-cognitive layer for groupthink correction, topology |
| `RoundRunner` | Executes a single round of agent reactions |
| `DebateRunner` | Runs structured debates between opposing views |
| `TopologyController` | Controls signal visibility between agents |
| `ContributionTracker` | Scores each agent's contribution |
| `TokenTrackingLlmProvider` | Wraps LLM provider for cost tracking |
| `Synthesizer` | Merges contributions into final answer |
| `MathBridge` | Connects orchestrator to `@cognitive-swarm/math` |
| `FileCheckpointStorage` | File-based checkpoint storage |

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/orchestrator) | [GitHub](https://github.com/medonomator/cognitive-swarm)
