# Resilience

cognitive-swarm is production-ready with built-in fault tolerance: retry with exponential backoff, circuit breaker, token budget enforcement, and resumable checkpoints. This page covers the internals of each mechanism.

## Architecture

Every agent's LLM provider is wrapped in two layers:

```
Agent's LLM call
    │
    ▼
┌─────────────────────────┐
│  TokenTrackingLlmProvider │  ← counts tokens, enforces budget
│  ┌────────────────────────┐│
│  │  ResilientLlmProvider  ││  ← retry + circuit breaker
│  │  ┌──────────────────┐  ││
│  │  │  Inner LlmProvider│  ││  ← actual OpenAI/Anthropic call
│  │  └──────────────────┘  ││
│  └────────────────────────┘│
└─────────────────────────────┘
```

Both wrappers implement the `LlmProvider` interface, so they're transparent to the agent.

## Retry with Exponential Backoff

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  retry: {
    maxRetries: 3,               // attempts per LLM call (default: 3)
    baseDelayMs: 1000,           // base delay (default: 1000)
    maxDelayMs: 10_000,          // cap delay (default: 10000)
    circuitBreakerThreshold: 5,  // opens after N consecutive failures (default: 5)
  },
})
```

### Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `maxRetries` | 3 | Maximum retry attempts per individual LLM call. |
| `baseDelayMs` | 1,000 | Base delay for exponential backoff. |
| `maxDelayMs` | 10,000 | Maximum delay cap. |
| `circuitBreakerThreshold` | 5 | Consecutive failures to open the circuit. |

### Retry Algorithm (from source)

```typescript
// ResilientLlmProvider.withRetry()

async withRetry<T>(fn: () => Promise<T>): Promise<T> {
  this.guardCircuit()  // check circuit state first

  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn()
      this.onSuccess()   // reset consecutive failures to 0, close circuit
      return result
    } catch (err) {
      lastError = err
      this.onFailure()   // increment consecutive failures

      if (attempt < maxRetries && circuitState !== 'open') {
        await this.delay(attempt)
      }
    }
  }
  throw lastError  // all retries exhausted
}
```

### Delay Computation

```typescript
// delay = min(baseDelayMs * 2^attempt, maxDelayMs) * random(0.8, 1.2)

delay(attempt: number): Promise<void> {
  const base = Math.min(
    this.config.baseDelayMs * 2 ** attempt,
    this.config.maxDelayMs,
  )
  const jitter = base * (0.8 + Math.random() * 0.4)  // +/- 20%
  return new Promise(resolve => setTimeout(resolve, jitter))
}
```

Example delays with defaults (`baseDelayMs: 1000`, `maxDelayMs: 10000`):

| Attempt | Base Delay | With Jitter Range |
|---------|------------|-------------------|
| 0 | 1,000ms | 800 -- 1,200ms |
| 1 | 2,000ms | 1,600 -- 2,400ms |
| 2 | 4,000ms | 3,200 -- 4,800ms |
| 3 | 8,000ms | 6,400 -- 9,600ms |
| 4+ | 10,000ms (capped) | 8,000 -- 12,000ms |

## Circuit Breaker

The circuit breaker prevents a failing agent from consuming all retry budget while other agents make progress.

### State Machine

```
                  success
         ┌────────────────────────┐
         │                        │
         ▼                        │
     ┌────────┐    N consecutive  ┌──────┐
     │ CLOSED │───────failures───▶│ OPEN │
     │        │                   │      │
     └────────┘                   └──┬───┘
         ▲                           │
         │     success               │  30s cooldown elapsed
         │  ┌───────────┐           │
         └──│ HALF-OPEN │◀──────────┘
            │           │
            └─────┬─────┘
                  │ failure
                  ▼
              ┌──────┐
              │ OPEN │  (reopened)
              └──────┘
```

**States:**

- **CLOSED** (normal): all calls go through. On success, `consecutiveFailures` resets to 0. On failure, `consecutiveFailures` increments.
- **OPEN** (blocked): all calls immediately throw `CircuitOpenError`. No retries attempted. After `CIRCUIT_COOLDOWN_MS` (30 seconds), transitions to HALF-OPEN.
- **HALF-OPEN** (probe): one call is allowed through.
  - If it succeeds → CLOSED
  - If it fails → OPEN (restarts the 30s cooldown)

```typescript
class CircuitOpenError extends Error {
  constructor(remainingMs: number) {
    super(`Circuit breaker open — retry in ${Math.ceil(remainingMs / 1000)}s`)
  }
}
```

### Guard Logic (from source)

```typescript
private guardCircuit(): void {
  if (this.circuitState === 'closed') return  // normal

  if (this.circuitState === 'open') {
    const elapsed = Date.now() - this.circuitOpenedAt
    if (elapsed >= CIRCUIT_COOLDOWN_MS) {     // 30,000ms
      this.circuitState = 'half-open'         // allow one probe
      return
    }
    throw new CircuitOpenError(CIRCUIT_COOLDOWN_MS - elapsed)
  }
  // half-open — allow the probe call through
}
```

### What Happens to the Swarm

When an agent's circuit opens:
1. The agent skips its reaction for remaining rounds (throws `CircuitOpenError`)
2. Other agents continue normally
3. The agent's contribution tracker records zero signals
4. After 30s, the circuit enters half-open and the agent gets one chance to recover
5. If the agent never recovers, it's effectively disabled for the solve

This is different from the advisor's agent pruning -- the circuit breaker is a fault tolerance mechanism, not an intelligence optimization.

## Token Budget

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  tokenBudget: 50_000,  // hard limit across ALL agents, ALL rounds
})
```

### How It Works

The `TokenTrackingLlmProvider` wraps the (already-resilient) LLM provider and counts tokens:

```typescript
class TokenTrackingLlmProvider implements LlmProvider {
  private _totalTokens = 0
  private _budget: number | null = null
  private _getSharedTotal: (() => number) | null = null

  async complete(messages, options): Promise<LlmResponse> {
    this.checkBudget()                              // throws if over budget
    const result = await this.inner.complete(messages, options)
    this._totalTokens += result.usage.totalTokens   // accumulate
    return result
  }

  private checkBudget(): void {
    if (this._budget !== null && this._getSharedTotal !== null) {
      const total = this._getSharedTotal()  // sum across ALL trackers
      if (total >= this._budget) {
        throw new TokenBudgetExceededError(total, this._budget)
      }
    }
  }
}
```

### Shared Budget Across Agents

The orchestrator wires a shared counter:

```typescript
// In constructor:
const getSharedTotal = () =>
  trackers.reduce((sum, t) => sum + t.totalTokens, 0)

for (const tracker of trackers) {
  tracker.setBudget(tokenBudget, getSharedTotal)
}
```

Every tracker calls the same `getSharedTotal()` before each LLM call. This means the budget is truly global -- agent A spending 40K of a 50K budget means agent B only has 10K left.

### What Happens When Budget Is Exhausted

1. The next LLM call throws `TokenBudgetExceededError`
2. The agent's reaction fails (it emits no signals for this round)
3. The orchestrator's main loop checks `isTokenBudgetExhausted()` at the top of each round
4. If true, the loop exits
5. A final consensus attempt is made with whatever proposals and votes exist
6. `SwarmResult.cost.tokens` contains the actual token count

### Cost Estimation

Cost per token is configurable via `SwarmConfig.costPerToken` (default: `0.000003`, ~GPT-4o-mini):

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  costPerToken: 0.00001, // Override for your model
})

// result.cost contains:
// { tokens: totalTokens, estimatedUsd: totalTokens * costPerToken }
```

## Checkpoints

Resume an interrupted solve from exactly where it left off.

### Setup

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
// Resumes from last saved round, not from scratch
const result = await swarm.solveResumable('complex task', 'my-checkpoint-id')
```

### Checkpoint Lifecycle

```
solveResumable('task', 'ckpt-123')
    │
    ├── Load checkpoint: storage.load('ckpt-123')
    │   ├── Found → restore signals, start from roundsCompleted
    │   └── Not found → fresh start (create task:new signal)
    │
    ├── Round loop:
    │   ├── ... (normal round processing) ...
    │   └── Save checkpoint after EACH round:
    │       storage.save('ckpt-123', {
    │         task, roundsCompleted, signals,
    │         agentContributions, tokensUsed, timestamp
    │       })
    │
    └── On completion:
        └── Delete checkpoint: storage.delete('ckpt-123')
```

### What Gets Checkpointed

```typescript
interface SolveCheckpoint {
  readonly task: string
  readonly roundsCompleted: number
  readonly signals: readonly Signal[]                      // full signal history
  readonly agentContributions: ReadonlyMap<string, AgentContribution>
  readonly tokensUsed: number
  readonly timestamp: number
}
```

### FileCheckpointStorage

The built-in file-based storage saves JSON to a directory:

```typescript
class FileCheckpointStorage implements CheckpointStorage {
  constructor(private readonly dir: string) {}

  async save(id: string, data: SolveCheckpoint): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    // Map → [key, value][] for JSON serialization
    const serialized = {
      ...data,
      agentContributions: [...data.agentContributions.entries()],
    }
    await writeFile(
      join(this.dir, `${id}.json`),
      JSON.stringify(serialized, null, 2),
    )
  }

  async load(id: string): Promise<SolveCheckpoint | null> {
    try {
      const raw = await readFile(join(this.dir, `${id}.json`), 'utf-8')
      const parsed = JSON.parse(raw)
      return {
        ...parsed,
        agentContributions: new Map(parsed.agentContributions),
      }
    } catch {
      return null  // file doesn't exist
    }
  }

  async delete(id: string): Promise<void> {
    try { await unlink(join(this.dir, `${id}.json`)) }
    catch { /* file may not exist */ }
  }
}
```

### Custom Checkpoint Storage

Implement `CheckpointStorage` for any backend:

```typescript
interface CheckpointStorage {
  save(id: string, data: SolveCheckpoint): Promise<void>
  load(id: string): Promise<SolveCheckpoint | null>
  delete(id: string): Promise<void>
}

// Example: Redis-based storage
class RedisCheckpointStorage implements CheckpointStorage {
  constructor(private readonly redis: Redis) {}

  async save(id: string, data: SolveCheckpoint): Promise<void> {
    const serialized = {
      ...data,
      agentContributions: [...data.agentContributions.entries()],
    }
    await this.redis.set(
      `checkpoint:${id}`,
      JSON.stringify(serialized),
      'EX', 86400,  // expire after 24h
    )
  }

  async load(id: string): Promise<SolveCheckpoint | null> {
    const raw = await this.redis.get(`checkpoint:${id}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      ...parsed,
      agentContributions: new Map(parsed.agentContributions),
    }
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(`checkpoint:${id}`)
  }
}
```

## Error Handling

The orchestrator accepts a global error handler:

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  onError: (error, context) => {
    logger.error('Swarm error', { error, context })
    // context is a string like:
    //   'signal-bus.deliver.agent-1'
    //   'orchestrator.memory-recall'
    //   'orchestrator.memory-store'
    //   'orchestrator.checkpoint-save'
    //   'orchestrator.memory-decay'
    //   'orchestrator.bandit-feedback.agent-1'
  },
})
```

Error contexts in the orchestrator:

| Context String | When |
|---|---|
| `signal-bus.deliver.{agentId}` | Subscriber callback threw during signal delivery |
| `orchestrator.memory-recall` | Vector memory search failed at solve start |
| `orchestrator.memory-store` | Storing discovery/proposal/challenge to vector memory failed |
| `orchestrator.memory-decay` | Memory decay at end of solve failed |
| `orchestrator.checkpoint-save` | Checkpoint save failed (solve continues) |
| `orchestrator.bandit-feedback.{agentId}` | Recording bandit feedback failed |

All errors are caught and logged -- they never crash the solve. If a memory operation fails, the solve continues without that feature.

## Production Example

```typescript
import { SwarmOrchestrator, FileCheckpointStorage } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents: createAgents(llm),

  // Retry: exponential backoff + circuit breaker
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
  },

  // Consensus with reasonable threshold
  consensus: {
    strategy: 'confidence-weighted',
    threshold: 0.7,
    conflictResolution: 'debate',
    maxDebateRounds: 3,
  },

  // Cap rounds and wall-clock time
  maxRounds: 10,
  timeout: 120_000,
})

// Resumable solve with explicit checkpoint ID
const result = await swarm.solveResumable(
  'Analyze this production incident',
  'incident-2024-03-15',
)

console.log(`Answer: ${result.answer}`)
console.log(`Confidence: ${result.confidence}`)
console.log(`Cost: $${result.cost.estimatedUsd.toFixed(4)}`)
console.log(`Rounds: ${result.timing.roundsUsed}`)
```
