# Resilience

cognitive-swarm is production-ready with built-in fault tolerance: retry with exponential backoff, circuit breaker, token budget enforcement, and resumable checkpoints.

## Retry with Exponential Backoff

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  retry: {
    maxRetries: 3,               // attempts per LLM call
    baseDelayMs: 500,            // 500ms → 1s → 2s (exponential, ±20% jitter)
    maxDelayMs: 10_000,          // cap at 10 seconds
    circuitBreakerThreshold: 5,  // opens after 5 consecutive failures
  },
})
```

### How Retry Works

Each agent wraps its LLM provider with `ResilientLlmProvider`. On failure:

1. Wait `baseDelayMs * 2^attempt` with ±20% random jitter
2. Retry up to `maxRetries` times
3. If all retries fail, the agent is skipped for this round (not the whole solve)

### Circuit Breaker

After `circuitBreakerThreshold` consecutive failures for a single agent, the circuit opens:

- Agent is disabled for the remainder of the solve
- Other agents continue normally
- Circuit state is logged in the signal history

This prevents one flaky agent from consuming all retry budget while the rest of the swarm makes progress.

## Token Budget

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  tokenBudget: 50_000,  // hard limit across all agents, all rounds
})
```

All LLM calls are wrapped with `TokenTrackingLlmProvider`. When cumulative tokens across all agents exceed `tokenBudget`:

- The current round completes
- The solve loop exits
- `SwarmResult.cost` contains the actual token count

Cost is estimated at `$0.000003` per token (GPT-4o-mini pricing, configurable).

## Checkpoints

Resume an interrupted solve from exactly where it left off:

```typescript
import { FileCheckpointStorage } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents,
  checkpoint: new FileCheckpointStorage('./checkpoints'),
})

// Start a resumable solve with an explicit ID
const result = await swarm.solveResumable('complex task', 'my-checkpoint-id')
```

If the process crashes mid-solve, restart with the same checkpoint ID:

```typescript
// Will resume from the last saved round, not from scratch
const result = await swarm.solveResumable('complex task', 'my-checkpoint-id')
```

### What Gets Checkpointed

```typescript
interface SolveCheckpoint {
  readonly task: string
  readonly roundsCompleted: number
  readonly signals: readonly Signal[]         // full signal history so far
  readonly agentContributions: ReadonlyMap<string, AgentContribution>
  readonly tokensUsed: number
  readonly timestamp: number
}
```

### Custom Checkpoint Storage

Implement `CheckpointStorage` for any backend (Redis, database, etc.):

```typescript
interface CheckpointStorage {
  save(id: string, data: SolveCheckpoint): Promise<void>
  load(id: string): Promise<SolveCheckpoint | null>
  delete(id: string): Promise<void>
}
```

## Error Handling

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  onError: (error, context) => {
    logger.error('Swarm error', { error, context })
    // Return false to halt, true to continue with degraded state
    return true
  },
})
```

Per-agent error handlers override the swarm-level handler:

```typescript
{
  config: {
    id: 'analyst',
    onError: (error) => {
      logger.warn('Agent error', { error })
      return true  // continue
    },
    // ...
  }
}
```

## Production Example

```typescript
import { SwarmOrchestrator, FileCheckpointStorage } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents: createAgents(llm),

  // Retry configuration
  retry: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    circuitBreakerThreshold: 5,
  },

  // Hard token limit
  tokenBudget: 100_000,

  // Resumable on crash
  checkpoint: new FileCheckpointStorage('./checkpoints'),

  // Global error handler
  onError: (error, ctx) => {
    logger.error('Swarm error', { error, ctx })
    return true
  },

  // Consensus with reasonable threshold
  consensus: {
    strategy: 'confidence-weighted',
    threshold: 0.7,
    conflictResolution: 'debate',
    maxDebateRounds: 3,
  },

  // Cap rounds
  maxRounds: 10,
  timeout: 120_000,
})
```
