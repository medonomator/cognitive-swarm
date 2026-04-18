# @cognitive-swarm/orchestrator

The main entry point. `SwarmOrchestrator` wires all components together and runs the round-based solve loop.

## Install

```bash
npm install @cognitive-swarm/orchestrator
```

## SwarmOrchestrator

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator(config)
```

## Methods

### solve()

Runs the swarm to completion and returns the full result.

```typescript
const result: SwarmResult = await swarm.solve('What is the best approach?')
```

### solveWithStream()

Returns an async iterable that yields events as they happen:

```typescript
for await (const event of swarm.solveWithStream('Analyze this')) {
  // SwarmEvent - discriminated union on event.type
  switch (event.type) {
    case 'round:start': console.log(`Round ${event.round}`); break
    case 'signal:emitted': console.log(event.signal.type); break
    case 'consensus:reached': console.log(event.result.decision); break
    case 'solve:complete': console.log(event.result.answer); break
  }
}
```

### solveResumable()

Resumes from a checkpoint if one exists, otherwise starts fresh.

```typescript
const result = await swarm.solveResumable('task', 'checkpoint-id')
```

Requires `checkpoint` to be set in `SwarmConfig`.

### on()

Register typed event listeners. Returns a cleanup function:

```typescript
const unsub = swarm.on('signal:emitted', (signal) => {
  console.log(signal.type, signal.source, signal.confidence)
})

// Later:
unsub()
```

### destroy()

Clean up all resources (signal bus timers, event listeners):

```typescript
swarm.destroy()
```

## Full Configuration

```typescript
const swarm = new SwarmOrchestrator({
  // Required
  agents: [agentDef1, agentDef2],

  // Consensus (default: confidence-weighted, threshold 0.7)
  consensus: {
    strategy: 'confidence-weighted',
    threshold: 0.7,
    timeoutMs: 30_000,
    minVoters: 2,
    maxDebateRounds: 3,
    conflictResolution: 'debate',
  },

  // Loop limits
  maxRounds: 10,                       // default: 10
  maxSignals: 200,                     // default: 200
  timeout: 120_000,                    // ms, default: 120_000

  // Final answer synthesis
  synthesizer: {
    llm: myLlmProvider,
    prompt: 'Synthesize a clear answer from the swarm deliberation...',
  },

  // Persistent vector memory across sessions
  memory: qdrantVectorMemory,

  // Math convergence config
  math: {
    entropyThreshold: 0.3,
    minInformationGain: 0.05,
    redundancyThreshold: 0.7,
  },

  // Advisor: groupthink correction, agent pruning, topology
  advisor: {
    groupthinkCorrection: true,
    agentPruning: false,
    reputationWeighting: true,
    weightProvider: reputationTracker,
    warmupRounds: 2,
    topology: {
      enabled: true,
      minConnectivity: 0.3,
      maxInfluenceConcentration: 0.6,
      pruneRedundantLinks: true,
      protectBridgingAgents: true,
    },
    metaAgentLlm: llmProvider,
    metaAgentInterval: 3,
  },

  // Error handling
  onError: (error, context) => {
    logger.error(error)
    return true  // true = continue, false = halt
  },

  // Bandit storage for cross-session strategy learning
  banditStorage: myBanditStorage,

  // Selective agent activation (top-K per signal)
  agentSelection: {
    topK: 3,
    minSpread: 0.15,
  },

  // Retry + circuit breaker
  retry: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    circuitBreakerThreshold: 5,
  },

  // Hard token limit
  tokenBudget: 50_000,

  // Resumable solve
  checkpoint: new FileCheckpointStorage('./checkpoints'),

  // Mid-solve evolution
  evolution: {
    enabled: true,
    maxEvolvedAgents: 3,
    evaluationWindow: 5,
    minValueForKeep: 0.5,
    cooldownRounds: 3,
    nmiPruneThreshold: 0.8,
  },
})
```

## SwarmAgentDef

```typescript
interface SwarmAgentDef {
  readonly config: SwarmAgentConfig    // agent identity and behavior
  readonly engine: EngineConfig        // LLM + store for cognitive pipeline
  readonly toolSupport?: AgentToolSupport  // MCP tools
}
```

## Events

All `SwarmEventMap` event types are available via `swarm.on()`:

```typescript
swarm.on('signal:emitted', (signal) => { ... })
swarm.on('round:end', ({ round, signalCount }) => { ... })
swarm.on('consensus:reached', (result) => { ... })
swarm.on('evolution:spawned', (event) => { ... })
swarm.on('advisor:action', (advice) => { ... })
```

See [`@cognitive-swarm/core`](./core.md) for the full `SwarmEventMap` definition.

## FileCheckpointStorage

Built-in file-based checkpoint storage:

```typescript
import { FileCheckpointStorage } from '@cognitive-swarm/orchestrator'

const checkpoint = new FileCheckpointStorage('./checkpoints')
```

Saves JSON files to the specified directory. Implement `CheckpointStorage` interface for custom backends (Redis, database, etc.).
