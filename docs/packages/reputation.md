# @cognitive-swarm/reputation

Agent reliability tracking with Bayesian estimation. Weights agents by past performance using Beta distribution posteriors.

## Install

```bash
npm install @cognitive-swarm/reputation
```

## ReputationTracker

```typescript
import { ReputationTracker } from '@cognitive-swarm/reputation'

const tracker = new ReputationTracker()

// After consensus, record who was right
tracker.update('agent-1', 'code-review', true)
tracker.update('agent-2', 'code-review', false)

// Use reputation for weighted voting
const weight = tracker.getWeight('agent-1', 'code-review')
// -> high weight (was correct)

// Get full profile
const profile = tracker.getProfile('agent-1')
// -> strengths: ['code-review'], weaknesses: []
```

## ReputationConfig

```typescript
interface ReputationConfig {
  readonly priorSuccesses?: number       // Beta prior alpha, default: 1
  readonly priorFailures?: number        // Beta prior beta, default: 1
  readonly strengthThreshold?: number    // min accuracy for "strength", default: 0.7
  readonly weaknessThreshold?: number    // max accuracy for "weakness", default: 0.4
  readonly trendWindow?: number          // recent records for trend, default: 10
}

const tracker = new ReputationTracker({
  priorSuccesses: 2,     // optimistic prior
  priorFailures: 1,
  strengthThreshold: 0.8,
  trendWindow: 20,
})
```

## Methods

### update() / updateBatch()

Record performance outcomes:

```typescript
tracker.update(agentId: string, taskType: string, wasCorrect: boolean, confidence?: number): void
tracker.updateBatch(records: readonly PerformanceRecord[]): void
```

### getWeight()

Get Bayesian weight for an agent on a task type. Uses Beta distribution posterior mean:

```
weight = (alpha + successes) / (alpha + beta + total)
```

Returns the prior mean (0.5 with default config) if no data exists.

```typescript
const weight = tracker.getWeight('analyst', 'architecture')  // 0..1
```

### getScore()

Get detailed reputation score:

```typescript
const score = tracker.getScore('analyst', 'architecture')
```

```typescript
interface ReputationScore {
  readonly successes: number
  readonly failures: number
  readonly total: number
  readonly accuracy: number    // success rate [0, 1]
  readonly weight: number      // Bayesian weight - accounts for sample size
  readonly trend: number       // positive if improving, negative if declining
}
```

### getProfile()

Full reputation profile across all task types:

```typescript
const profile = tracker.getProfile('analyst')
// profile.overall: ReputationScore
// profile.byTaskType: Map<string, ReputationScore>
// profile.strengths: string[]    - task types with accuracy > strengthThreshold
// profile.weaknesses: string[]   - task types with accuracy < weaknessThreshold
```

```typescript
interface AgentReputation {
  readonly agentId: string
  readonly overall: ReputationScore
  readonly byTaskType: ReadonlyMap<string, ReputationScore>
  readonly strengths: readonly string[]
  readonly weaknesses: readonly string[]
}
```

### rankAgents()

Rank all agents by Bayesian weight:

```typescript
const rankings = tracker.rankAgents('code-review')

for (const r of rankings) {
  console.log(`${r.agentId}: weight=${r.weight.toFixed(3)} accuracy=${r.accuracy.toFixed(2)} (${r.total} tasks)`)
}
```

```typescript
interface AgentRanking {
  readonly agentId: string
  readonly weight: number
  readonly accuracy: number
  readonly total: number
}
```

## Bayesian Estimation

Reputation uses a Beta(alpha, beta) conjugate prior:

- **Start:** `Beta(1, 1)` -- uniform, no prior belief
- **Correct outcome:** `alpha += 1`
- **Incorrect outcome:** `beta += 1`
- **Weight** = `alpha / (alpha + beta)` = posterior mean

This naturally handles:
- **New agents:** weight starts at prior mean (0.5), converges as evidence accumulates
- **Sample size:** an agent with 2/3 correct gets lower weight than 20/30 correct
- **Trend detection:** compare recent window to overall rate

## Integration with Orchestrator

```typescript
const tracker = new ReputationTracker()

const swarm = new SwarmOrchestrator({
  agents,
  advisor: {
    reputationWeighting: true,
    weightProvider: tracker,   // votes weighted by calibrated reliability
  },
})

const result = await swarm.solve('task')

// After verifying the result, update reputations
for (const [agentId, contrib] of result.agentContributions) {
  const wasCorrect = !result.consensus.dissent.includes(agentId)
  tracker.update(agentId, 'general', wasCorrect)
}
```

## Other Properties

```typescript
tracker.recordCount    // total recorded outcomes
tracker.getAllAgentIds() // all tracked agent IDs
tracker.reset()        // clear all records
```
