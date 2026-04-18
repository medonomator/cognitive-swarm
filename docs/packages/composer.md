# @cognitive-swarm/composer

Dynamic swarm composition -- select, reinforce, and prune agents for optimal task solving.

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/composer)](https://www.npmjs.com/package/@cognitive-swarm/composer)

## Install

```bash
npm install @cognitive-swarm/composer
```

## Overview

The composer package handles the critical question: **which agents should participate in solving a given task?** Rather than throwing every available agent at a problem, `DynamicComposer` selects an optimal subset using keyword extraction, tag matching, reputation scoring, and diversity constraints.

Three operations cover the full lifecycle:

- **compose** -- initial agent selection for a new task
- **suggestReinforcement** -- add an agent when the swarm is stuck
- **suggestPrune** -- remove underperforming agents mid-solve

## Quick Start

```typescript
import { DynamicComposer } from '@cognitive-swarm/composer'
import type { AgentCandidate, ComposerConfig } from '@cognitive-swarm/composer'

const composer = new DynamicComposer({
  minAgents: 2,
  maxAgents: 5,
  diversityThreshold: 0.3,
  tagRelevanceWeight: 0.5,
  reputationWeight: 0.3,
  baseWeight: 0.2,
})

const candidates: AgentCandidate[] = [
  {
    id: 'analyst-1',
    name: 'Data Analyst',
    tags: ['data', 'statistics', 'visualization'],
    reputation: 0.85,
    weight: 1.0,
  },
  {
    id: 'critic-1',
    name: 'Critical Thinker',
    tags: ['logic', 'fallacies', 'reasoning'],
    reputation: 0.92,
    weight: 1.0,
  },
  {
    id: 'coder-1',
    name: 'Software Engineer',
    tags: ['algorithms', 'data-structures', 'optimization'],
    reputation: 0.78,
    weight: 1.0,
  },
]

const result = await composer.compose(
  'Analyze the dataset and find statistical anomalies',
  candidates,
)

console.log(result.selected)    // agents chosen for the task
console.log(result.reasoning)   // human-readable explanation
console.log(result.totalWeight) // combined weight of selected agents
```

## API Reference

### `DynamicComposer`

Main class for swarm composition decisions.

#### Constructor

```typescript
new DynamicComposer(config?: Partial<ComposerConfig>)
```

Creates a new composer instance. All config fields are optional and fall back to sensible defaults.

---

#### `compose(task, candidates)`

Select the optimal set of agents for a task.

```typescript
async compose(
  task: string,
  candidates: AgentCandidate[],
): Promise<CompositionResult>
```

**Parameters:**

| Parameter    | Type               | Description                              |
| ------------ | ------------------ | ---------------------------------------- |
| `task`       | `string`           | Natural-language task description        |
| `candidates` | `AgentCandidate[]` | Pool of agents available for selection   |

**Returns:** `CompositionResult`

**Algorithm:**

1. Extract keywords from the task string
2. Score each candidate: `tagRelevance * 0.5 + reputation * 0.3 + baseWeight * 0.2`
3. Sort candidates by score descending
4. Select top candidates within `[minAgents, maxAgents]` range
5. Apply diversity constraints -- reject candidates whose tag overlap with already-selected agents exceeds `diversityThreshold`
6. Return selected agents with per-agent reasoning

```typescript
const result = await composer.compose(
  'Design a distributed caching layer with failover',
  candidates,
)

for (const reason of result.reasons) {
  console.log(`${reason.agentId}: ${reason.status} (score: ${reason.score})`)
  // analyst-1: selected (score: 0.82)
  // critic-1: rejected (score: 0.41) -- low tag relevance
}
```

---

#### `suggestReinforcement(task, currentAgents, candidates)`

Suggest an additional agent when the current swarm is stuck or underperforming.

```typescript
async suggestReinforcement(
  task: string,
  currentAgents: AgentCandidate[],
  candidates: AgentCandidate[],
): Promise<AgentCandidate | null>
```

**Parameters:**

| Parameter       | Type               | Description                                |
| --------------- | ------------------ | ------------------------------------------ |
| `task`          | `string`           | The task being solved                      |
| `currentAgents` | `AgentCandidate[]` | Agents currently in the swarm              |
| `candidates`    | `AgentCandidate[]` | Pool of agents not yet in the swarm        |

**Returns:** The best candidate to add, or `null` if no suitable candidate exists.

The reinforcement algorithm applies a **diversity bonus of +0.3** to candidates whose tags differ from the current swarm composition. This encourages bringing in fresh perspectives rather than more of the same.

```typescript
const reinforcement = await composer.suggestReinforcement(
  'Design a distributed caching layer with failover',
  currentSwarm,
  remainingCandidates,
)

if (reinforcement) {
  console.log(`Add ${reinforcement.name} to unblock the swarm`)
}
```

---

#### `suggestPrune(activities, threshold)`

Identify agents that are underperforming and should be removed.

```typescript
async suggestPrune(
  activities: AgentActivity[],
  threshold?: number,
): Promise<string[]>
```

**Parameters:**

| Parameter    | Type              | Default | Description                                   |
| ------------ | ----------------- | ------- | --------------------------------------------- |
| `activities` | `AgentActivity[]` | --      | Activity records for each agent in the swarm   |
| `threshold`  | `number`          | `0.3`   | Agents scoring below this are pruned           |

**Returns:** Array of agent IDs recommended for removal.

Activity score is computed from signal count, proposal count, challenge count, and average confidence. Agents below the threshold are flagged.

```typescript
const activities: AgentActivity[] = [
  {
    agentId: 'analyst-1',
    signals: 12,
    proposals: 3,
    challenges: 1,
    confidence: 0.75,
  },
  {
    agentId: 'coder-1',
    signals: 2,
    proposals: 0,
    challenges: 0,
    confidence: 0.3,
  },
]

const toPrune = await composer.suggestPrune(activities, 0.3)
// ['coder-1'] -- low activity and confidence
```

## Types

### `AgentCandidate`

```typescript
interface AgentCandidate {
  /** Unique agent identifier */
  readonly id: string

  /** Human-readable name */
  readonly name: string

  /** Skill/domain tags used for matching */
  readonly tags: readonly string[]

  /** Historical reputation score (0-1) */
  readonly reputation: number

  /** Base weight for scoring (default 1.0) */
  readonly weight: number
}
```

### `CompositionResult`

```typescript
interface CompositionResult {
  /** Agents selected for the task */
  readonly selected: AgentCandidate[]

  /** Per-agent selection reasoning */
  readonly reasons: SelectionReason[]

  /** Human-readable summary of the composition decision */
  readonly reasoning: string

  /** Sum of weights of selected agents */
  readonly totalWeight: number
}
```

### `SelectionReason`

```typescript
interface SelectionReason {
  /** Agent ID */
  readonly agentId: string

  /** Whether the agent was selected or rejected */
  readonly status: 'selected' | 'rejected'

  /** Composite score used for ranking */
  readonly score: number

  /** Human-readable explanation */
  readonly reason: string
}
```

### `ComposerConfig`

```typescript
interface ComposerConfig {
  /** Minimum number of agents to select */
  readonly minAgents: number

  /** Maximum number of agents to select */
  readonly maxAgents: number

  /**
   * Tag overlap threshold (0-1).
   * Candidates with tag overlap above this value
   * relative to already-selected agents are rejected
   * for diversity.
   */
  readonly diversityThreshold: number

  /** Weight of tag-relevance in the scoring formula */
  readonly tagRelevanceWeight: number

  /** Weight of reputation in the scoring formula */
  readonly reputationWeight: number

  /** Weight of the agent's base weight in the scoring formula */
  readonly baseWeight: number
}
```

### `AgentActivity`

```typescript
interface AgentActivity {
  /** Agent ID */
  readonly agentId: string

  /** Total signals emitted */
  readonly signals: number

  /** Number of proposals made */
  readonly proposals: number

  /** Number of challenges issued */
  readonly challenges: number

  /** Average confidence across all signals */
  readonly confidence: number
}
```

## Configuration Reference

| Option               | Type     | Default | Description                                    |
| -------------------- | -------- | ------- | ---------------------------------------------- |
| `minAgents`          | `number` | `2`     | Minimum agents in a composition                |
| `maxAgents`          | `number` | `5`     | Maximum agents in a composition                |
| `diversityThreshold` | `number` | `0.3`   | Max tag overlap before rejecting for diversity  |
| `tagRelevanceWeight` | `number` | `0.5`   | Tag relevance contribution to score (50%)      |
| `reputationWeight`   | `number` | `0.3`   | Reputation contribution to score (30%)         |
| `baseWeight`         | `number` | `0.2`   | Base weight contribution to score (20%)        |

## Scoring Formula

The composite score for each candidate is:

```
score = (tagRelevance * tagRelevanceWeight)
      + (reputation * reputationWeight)
      + (normalizedWeight * baseWeight)
```

Where:

- **tagRelevance** (0-1): fraction of the candidate's tags that match keywords extracted from the task
- **reputation** (0-1): historical performance score from `@cognitive-swarm/reputation`
- **normalizedWeight** (0-1): the candidate's `weight` normalized against the pool maximum

For **reinforcement**, a diversity bonus of **+0.3** is added to candidates whose tags have low overlap with the current swarm, encouraging complementary skill selection.

## Usage Patterns

### Static composition with fixed pool

```typescript
const composer = new DynamicComposer()
const pool = loadAgentPool()

const result = await composer.compose('Solve this math proof', pool)
const swarm = createSwarm(result.selected)
await swarm.solve(task)
```

### Adaptive composition with mid-solve reinforcement

```typescript
const composer = new DynamicComposer({ maxAgents: 7 })
const pool = loadAgentPool()

// Initial composition
const result = await composer.compose(task, pool)
const swarm = createSwarm(result.selected)

// Monitor and adapt
swarm.on('stalled', async () => {
  const remaining = pool.filter(
    (c) => !result.selected.some((s) => s.id === c.id),
  )
  const reinforcement = await composer.suggestReinforcement(
    task,
    result.selected,
    remaining,
  )
  if (reinforcement) {
    swarm.addAgent(reinforcement)
  }
})

// Periodic pruning
swarm.on('round:end', async (activities) => {
  const toPrune = await composer.suggestPrune(activities)
  for (const id of toPrune) {
    swarm.removeAgent(id)
  }
})

await swarm.solve(task)
```

### Custom scoring weights

```typescript
// Favor reputation over tag matching for critical tasks
const criticalComposer = new DynamicComposer({
  tagRelevanceWeight: 0.2,
  reputationWeight: 0.6,
  baseWeight: 0.2,
  minAgents: 3,
})

// Favor diversity for creative tasks
const creativeComposer = new DynamicComposer({
  diversityThreshold: 0.15,  // stricter overlap rejection
  tagRelevanceWeight: 0.4,
  reputationWeight: 0.2,
  baseWeight: 0.4,
  maxAgents: 7,
})
```

## Dependencies

- `@cognitive-swarm/core` -- signal types, agent config interfaces
- `@cognitive-engine/core` -- engine abstraction for keyword extraction
