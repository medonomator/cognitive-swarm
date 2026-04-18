# @cognitive-swarm/reputation

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/reputation)](https://www.npmjs.com/package/@cognitive-swarm/reputation)

Agent reliability tracking with Bayesian estimation. Weights agents by past performance using Beta distribution posteriors.

## Install

```bash
npm install @cognitive-swarm/reputation
```

## Quick Start

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

// Rank all agents for a task type
const rankings = tracker.rankAgents('code-review')
```

## Methods

### `update(agentId, taskType, wasCorrect, confidence?)`

Record a performance outcome. Correct answers increase `alpha`, incorrect increase `beta` in the Beta distribution.

### `updateBatch(records)`

Bulk-record multiple `PerformanceRecord` entries.

### `getWeight(agentId, taskType): number`

Get Bayesian weight (posterior mean): `alpha / (alpha + beta)`. Returns prior mean (0.5 default) if no data exists.

### `getScore(agentId, taskType): ReputationScore`

Detailed score with accuracy, weight, trend, and counts.

```typescript
interface ReputationScore {
  readonly successes: number
  readonly failures: number
  readonly total: number
  readonly accuracy: number    // raw success rate
  readonly weight: number      // Bayesian-smoothed weight
  readonly trend: number       // positive = improving, negative = declining
}
```

### `getProfile(agentId): AgentReputation`

Full reputation profile across all task types, including `strengths` and `weaknesses` (task types with accuracy above/below thresholds, minimum 3 observations).

### `rankAgents(taskType?): AgentRanking[]`

Rank all agents by Bayesian weight, optionally filtered by task type.

## Beta Distribution Model

Each agent's accuracy is modeled as `Beta(alpha, beta)`:
- **Correct outcome:** `alpha += 1`
- **Incorrect outcome:** `beta += 1`
- **Weight** = `alpha / (alpha + beta)` (posterior mean)

New agents start at the prior mean (0.5 with default config) -- no penalty, no reward until evidence accumulates.

## Configuration

```typescript
interface ReputationConfig {
  readonly priorSuccesses?: number       // default: 1
  readonly priorFailures?: number        // default: 1
  readonly strengthThreshold?: number    // default: 0.7
  readonly weaknessThreshold?: number    // default: 0.4
  readonly trendWindow?: number          // default: 10
}
```

| Swarm Size | Recommended Prior | Rationale |
|------------|------------------|-----------|
| 3-5 agents | Beta(1,1) | Default. Quick convergence. |
| 6-10 agents | Beta(2,1) | Optimistic -- rewards good agents faster |
| 10-20 agents | Beta(1,1), threshold 0.8 | High threshold distinguishes top performers |
| Competitive | Beta(1,2) | Pessimistic -- agents must prove themselves |

## Multi-Task Reputation

Agents can have different accuracy per task type:

```typescript
tracker.update('analyst', 'code-review', true)   // 3/3 on code review
tracker.update('analyst', 'architecture', false)  // 1/3 on architecture

tracker.getWeight('analyst', 'code-review')    // ~0.8
tracker.getWeight('analyst', 'architecture')   // ~0.4

const profile = tracker.getProfile('analyst')
// strengths: ['code-review'], weaknesses: ['architecture']
```

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

// After verifying results, update reputations
for (const [agentId, contrib] of result.agentContributions) {
  const wasCorrect = !result.consensus.dissent.includes(agentId)
  tracker.update(agentId, 'general', wasCorrect)
}
```

## Other Properties

```typescript
tracker.recordCount        // total recorded outcomes
tracker.getAllAgentIds()    // all tracked agent IDs
tracker.reset()            // clear all records
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/reputation) | [GitHub](https://github.com/medonomator/cognitive-swarm)
