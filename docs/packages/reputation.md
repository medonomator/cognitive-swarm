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

### Configuration Recommendations by Swarm Size

| Swarm Size | priorSuccesses | priorFailures | strengthThreshold | trendWindow | Rationale |
|------------|---------------|---------------|-------------------|-------------|-----------|
| 3-5 agents | 1 | 1 | 0.7 | 10 | Default. Small swarms need quick convergence. |
| 6-10 agents | 2 | 1 | 0.75 | 15 | Slightly optimistic prior rewards good agents faster. |
| 10-20 agents | 1 | 1 | 0.8 | 20 | Large swarm -- raise threshold to truly distinguish top performers. |
| Competitive | 1 | 2 | 0.7 | 10 | Pessimistic prior -- agents must prove themselves. |
| Cooperative | 2 | 1 | 0.6 | 10 | Optimistic prior -- assume competence, weight differences gently. |

## Beta Distribution Explained

The reputation system uses a **Beta distribution** as a conjugate prior for Bernoulli outcomes (correct/incorrect). Here is the intuition:

### The Model

Imagine each agent has a hidden "true accuracy" -- some probability `p` that their answer is correct. We do not know `p`, but we observe outcomes (correct or incorrect) and want to estimate it.

The Beta distribution `Beta(alpha, beta)` represents our belief about `p`:

```
                  alpha - 1         beta - 1
  P(p) ~ p              * (1 - p)

  Mean = alpha / (alpha + beta)
  Variance decreases as alpha + beta grows
```

- `alpha` counts "successes" (including prior pseudo-counts)
- `beta` counts "failures" (including prior pseudo-counts)

### Update Rule

Every time we observe an outcome:
- **Correct:** `alpha += 1` (shift distribution right toward 1.0)
- **Incorrect:** `beta += 1` (shift distribution left toward 0.0)

The posterior mean `alpha / (alpha + beta)` is the Bayesian weight.

### Why Beta Distribution?

1. **Handles uncertainty:** An agent with 2/3 correct gets weight 0.6, but an agent with 200/300 correct also gets ~0.67. The second estimate is much more certain, and the Beta distribution captures this.

2. **Smooth cold start:** New agents start at the prior mean (0.5 with default config), not at 0 or 1. This prevents new agents from being immediately silenced.

3. **No hyperparameters to tune:** The conjugate prior updates analytically -- no gradient descent or learning rate needed.

**Intuition:** With few observations, the distribution is wide (uncertain). As data accumulates, it narrows into a sharp peak around the true accuracy. An agent with 3/5 correct has a wide `Beta(4,3)`; an agent with 30/50 correct has a sharp `Beta(31,21)` peaked at 0.60.

## Prior Tuning Guide

The prior `Beta(alpha, beta)` encodes your initial belief about agent quality before any evidence.

### When to Use Different Priors

```typescript
// Uniform prior -- no initial bias (default)
// Use when: you have no information about agent quality
new ReputationTracker({ priorSuccesses: 1, priorFailures: 1 })
// Starting weight: 0.50

// Optimistic prior -- assume agents are good
// Use when: agents are pre-trained or known to be competent
new ReputationTracker({ priorSuccesses: 3, priorFailures: 1 })
// Starting weight: 0.75

// Pessimistic prior -- agents must prove themselves
// Use when: agents are untested, or mistakes are costly
new ReputationTracker({ priorSuccesses: 1, priorFailures: 3 })
// Starting weight: 0.25

// Strong uniform prior -- slow to change, resistant to noise
// Use when: you want stability over responsiveness
new ReputationTracker({ priorSuccesses: 5, priorFailures: 5 })
// Starting weight: 0.50, but needs ~20 outcomes to move significantly

// Weak prior -- very responsive to evidence
// Use when: you want reputation to change quickly
new ReputationTracker({ priorSuccesses: 0.5, priorFailures: 0.5 })
// Starting weight: 0.50, but moves rapidly with first few outcomes
```

### Prior Strength vs Responsiveness

The sum `alpha + beta` determines how "strong" the prior is -- how many observations it takes to override:

| Prior | alpha + beta | Observations to reach 0.7 weight (if all correct) | Character |
|-------|-------------|----------------------------------------------|-----------|
| Beta(0.5, 0.5) | 1 | 1 | Very responsive |
| Beta(1, 1) | 2 | 2 | Default |
| Beta(2, 2) | 4 | 4 | Moderate |
| Beta(5, 5) | 10 | 8 | Stable |
| Beta(10, 10) | 20 | 14 | Very stable |

## Convergence Analysis

How many updates does it take for the weight to stabilize?

For an agent with true accuracy `p`, the posterior mean converges to `p` at rate `O(1/n)` where `n` is the number of observations.

**Practical convergence (weight within 0.05 of true accuracy):**

| True Accuracy | Prior Beta(1,1) | Prior Beta(5,5) |
|---------------|-----------------|-----------------|
| 0.5 | ~10 observations | ~20 observations |
| 0.7 | ~15 observations | ~25 observations |
| 0.9 | ~20 observations | ~30 observations |

```typescript
// Check if an agent's reputation has converged
function isConverged(score: ReputationScore, tolerance = 0.05): boolean {
  if (score.total < 5) return false
  // Approximate: Beta variance = alpha*beta / ((alpha+beta)^2 * (alpha+beta+1))
  const alpha = score.successes + 1  // assuming default prior
  const beta = score.failures + 1
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1))
  const stdDev = Math.sqrt(variance)
  return stdDev < tolerance
}
```

## Methods

### update() / updateBatch()

Record performance outcomes:

```typescript
tracker.update(agentId: string, taskType: string, wasCorrect: boolean, confidence?: number): void
tracker.updateBatch(records: readonly PerformanceRecord[]): void
```

The `confidence` parameter is stored with the record but does not currently affect the weight calculation. It can be used for future extensions (e.g., weighting confident correct answers higher).

```typescript
interface PerformanceRecord {
  readonly agentId: string
  readonly taskType: string
  readonly wasCorrect: boolean
  readonly timestamp: number
  readonly confidence?: number
}
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
  readonly accuracy: number    // success rate [0, 1]. Returns 0.5 if no data.
  readonly weight: number      // Bayesian weight - accounts for sample size
  readonly trend: number       // positive if improving, negative if declining
}
```

**Accuracy vs Weight:** `accuracy` is the raw success rate (`successes / total`). `weight` is the Bayesian-smoothed version that accounts for sample size. For decision-making, always use `weight`.

**Trend:** Computed as `recentWindowAccuracy - overallAccuracy`. Positive means the agent is improving; negative means declining. Returns 0 if there are fewer records than `trendWindow` (default: 10).

### getProfile()

Full reputation profile across all task types:

```typescript
const profile = tracker.getProfile('analyst')
// profile.overall: ReputationScore
// profile.byTaskType: Map<string, ReputationScore>
// profile.strengths: string[]    - task types with accuracy > strengthThreshold AND total >= 3
// profile.weaknesses: string[]   - task types with accuracy < weaknessThreshold AND total >= 3
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

**Minimum data requirement:** A task type needs at least 3 recorded outcomes before it can appear in `strengths` or `weaknesses`. This prevents marking a task type as a "strength" after a single lucky correct answer.

### rankAgents()

Rank all agents by Bayesian weight:

```typescript
const rankings = tracker.rankAgents('code-review')

for (const r of rankings) {
  console.log(`${r.agentId}: weight=${r.weight.toFixed(3)} accuracy=${r.accuracy.toFixed(2)} (${r.total} tasks)`)
}

// Rank by overall performance (no task type filter)
const overallRanking = tracker.rankAgents()
```

```typescript
interface AgentRanking {
  readonly agentId: string
  readonly weight: number
  readonly accuracy: number
  readonly total: number
}
```

## Multi-Task Reputation

Agents can have different accuracy on different task types. The tracker tracks each task type independently:

```typescript
// Same agent, different performance per task type
tracker.update('analyst', 'code-review', true)
tracker.update('analyst', 'code-review', true)
tracker.update('analyst', 'code-review', true)    // 3/3 on code review

tracker.update('analyst', 'architecture', false)
tracker.update('analyst', 'architecture', false)
tracker.update('analyst', 'architecture', true)    // 1/3 on architecture

const profile = tracker.getProfile('analyst')
// profile.strengths: ['code-review']
// profile.weaknesses: ['architecture']

// Weights differ by task type
tracker.getWeight('analyst', 'code-review')    // ~0.8
tracker.getWeight('analyst', 'architecture')   // ~0.4
```

**Use case:** In a mixed swarm that handles both code review and debugging tasks, you can weight agents differently based on the current task type:

```typescript
// Dynamic vote weighting based on task type
const taskType = 'code-review'
for (const agent of swarm.agents) {
  const reputationWeight = tracker.getWeight(agent.id, taskType)
  // Combine with static weight
  const effectiveWeight = agent.weight * reputationWeight
}
```

## Edge Cases

### Cold Start (New Agents)

New agents with zero observations get the prior mean as their weight:

```typescript
const tracker = new ReputationTracker()  // default prior Beta(1,1)
tracker.getWeight('brand-new-agent', 'any-task')  // -> 0.5
```

This means new agents start at parity -- they are not penalized or rewarded until evidence accumulates. If you want new agents to have less influence until proven, use a pessimistic prior:

```typescript
const tracker = new ReputationTracker({ priorSuccesses: 1, priorFailures: 3 })
tracker.getWeight('brand-new-agent', 'any-task')  // -> 0.25
```

### Consistently Wrong Agents

An agent that is always wrong will have its weight converge toward 0, but the Beta distribution ensures it never reaches exactly 0:

```typescript
// Agent wrong 10 times in a row
for (let i = 0; i < 10; i++) {
  tracker.update('bad-agent', 'task', false)
}
tracker.getWeight('bad-agent', 'task')  // -> 1/12 = 0.083 (with default prior)
```

The weight asymptotically approaches 0 but never reaches it, meaning the agent always has a tiny residual influence. This is intentional -- it prevents permanently silencing agents that might recover.

### Recovering from a Bad Streak

```typescript
// Agent gets 10 wrong, then 10 right
for (let i = 0; i < 10; i++) tracker.update('agent', 'task', false)
tracker.getWeight('agent', 'task')  // -> 0.083

for (let i = 0; i < 10; i++) tracker.update('agent', 'task', true)
tracker.getWeight('agent', 'task')  // -> 0.5

// The trend will be positive, showing improvement
const score = tracker.getScore('agent', 'task')
// score.trend > 0  (recent window is 100% vs overall 50%)
```

## Weight Decay Over Time

The current implementation does not include time-based weight decay. All observations are weighted equally regardless of when they occurred. The `trendWindow` provides a partial solution by comparing recent performance to overall.

If you need time-based decay, implement it externally:

```typescript
// Simple approach: periodically reset and re-record recent data
function decayReputation(tracker: ReputationTracker, records: PerformanceRecord[], halfLifeDays: number) {
  const now = Date.now()
  const msPerDay = 86_400_000

  tracker.reset()
  for (const record of records) {
    const ageDays = (now - record.timestamp) / msPerDay
    const keepProbability = Math.pow(0.5, ageDays / halfLifeDays)

    if (Math.random() < keepProbability) {
      tracker.update(record.agentId, record.taskType, record.wasCorrect, record.confidence)
    }
  }
}
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

const result = await swarm.solve('task')

// After verifying the result, update reputations
for (const [agentId, contrib] of result.agentContributions) {
  const wasCorrect = !result.consensus.dissent.includes(agentId)
  tracker.update(agentId, 'general', wasCorrect)
}
```

### Integration Pattern: Reputation -> Composer -> Evolution

In a full system, reputation feeds into multiple downstream systems:

```typescript
// 1. Reputation affects vote weights during consensus
const advisor = {
  reputationWeighting: true,
  weightProvider: tracker,
}

// 2. Reputation informs composer (agent selection for future tasks)
function selectAgentsForTask(taskType: string, pool: SwarmAgentDef[]): SwarmAgentDef[] {
  const rankings = tracker.rankAgents(taskType)
  const topAgents = rankings.filter(r => r.weight > 0.5).map(r => r.agentId)
  return pool.filter(a => topAgents.includes(a.config.id))
}

// 3. Reputation drives evolution (mutate underperforming agents)
function shouldMutate(agentId: string): boolean {
  const profile = tracker.getProfile(agentId)
  return profile.overall.weight < 0.35 && profile.overall.total >= 10
}
```

## Visualization

To plot an agent's reputation distribution, compute the Beta PDF from their score:

```typescript
const score = tracker.getScore('agent-1', 'code-review')
const alpha = 1 + score.successes   // prior + observed
const beta = 1 + score.failures
// Plot Beta(alpha, beta) using d3, chart.js, or any PDF plotting library
```

## Other Properties

```typescript
tracker.recordCount    // total recorded outcomes
tracker.getAllAgentIds() // all tracked agent IDs
tracker.reset()        // clear all records
```
