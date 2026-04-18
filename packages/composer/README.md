# @cognitive-swarm/composer

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/composer)](https://www.npmjs.com/package/@cognitive-swarm/composer)

Dynamic swarm composition -- select, reinforce, and prune agents at runtime based on task relevance, reputation, and diversity.

## Install

```bash
npm install @cognitive-swarm/composer
```

## Quick Start

```typescript
import { DynamicComposer } from '@cognitive-swarm/composer'
import type { AgentCandidate, CompositionResult } from '@cognitive-swarm/composer'

const composer = new DynamicComposer({
  minAgents: 2,
  maxAgents: 5,
  diversityThreshold: 0.3,
  tagRelevanceWeight: 0.5,
  reputationWeight: 0.3,
  baseWeight: 0.2,
})

const candidates: AgentCandidate[] = [
  { id: 'analyst-1', name: 'Data Analyst', tags: ['data', 'statistics'], reputation: 0.85, weight: 1.0 },
  { id: 'critic-1', name: 'Critical Thinker', tags: ['logic', 'reasoning'], reputation: 0.92, weight: 1.0 },
  { id: 'coder-1', name: 'Engineer', tags: ['algorithms', 'optimization'], reputation: 0.78, weight: 1.0 },
]

const result = await composer.compose('Find statistical anomalies in the dataset', candidates)
console.log(result.selected)    // agents chosen for the task
console.log(result.reasoning)   // human-readable explanation
```

## API

### `compose(task, candidates): Promise<CompositionResult>`

Select the optimal agent subset for a task. Scores each candidate using:

```
score = tagRelevance * 0.5 + reputation * 0.3 + normalizedWeight * 0.2
```

Applies diversity constraints -- candidates with tag overlap above `diversityThreshold` relative to already-selected agents are rejected.

```typescript
const result = await composer.compose('Design a distributed cache', candidates)

for (const reason of result.reasons) {
  console.log(`${reason.agentId}: ${reason.status} (score: ${reason.score})`)
}
```

### `suggestReinforcement(task, currentAgents, candidates): Promise<AgentCandidate | null>`

Suggest an additional agent when the swarm is stuck. Applies a **+0.3 diversity bonus** to candidates whose tags differ from the current composition.

```typescript
const reinforcement = await composer.suggestReinforcement(task, currentSwarm, remaining)
if (reinforcement) {
  swarm.addAgent(reinforcement)
}
```

### `suggestPrune(activities, threshold?): Promise<string[]>`

Identify underperforming agents for removal. Activity score is computed from signal count, proposal count, challenge count, and average confidence.

```typescript
const toPrune = await composer.suggestPrune(activities, 0.3)
// ['coder-1'] -- low activity and confidence
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minAgents` | `number` | `2` | Minimum agents in a composition |
| `maxAgents` | `number` | `5` | Maximum agents in a composition |
| `diversityThreshold` | `number` | `0.3` | Max tag overlap before rejecting for diversity |
| `tagRelevanceWeight` | `number` | `0.5` | Tag relevance contribution to score |
| `reputationWeight` | `number` | `0.3` | Reputation contribution to score |
| `baseWeight` | `number` | `0.2` | Base weight contribution to score |

## Types

### `AgentCandidate`

```typescript
interface AgentCandidate {
  readonly id: string
  readonly name: string
  readonly tags: readonly string[]
  readonly reputation: number      // 0-1
  readonly weight: number          // default 1.0
}
```

### `CompositionResult`

```typescript
interface CompositionResult {
  readonly selected: AgentCandidate[]
  readonly reasons: SelectionReason[]
  readonly reasoning: string
  readonly totalWeight: number
}
```

### `AgentActivity`

```typescript
interface AgentActivity {
  readonly agentId: string
  readonly signals: number
  readonly proposals: number
  readonly challenges: number
  readonly confidence: number
}
```

## Usage Pattern: Adaptive Composition

```typescript
const composer = new DynamicComposer({ maxAgents: 7 })

// Initial composition
const result = await composer.compose(task, pool)
const swarm = createSwarm(result.selected)

// Mid-solve reinforcement
swarm.on('stalled', async () => {
  const remaining = pool.filter(c => !result.selected.some(s => s.id === c.id))
  const reinforcement = await composer.suggestReinforcement(task, result.selected, remaining)
  if (reinforcement) swarm.addAgent(reinforcement)
})

// Periodic pruning
swarm.on('round:end', async (activities) => {
  const toPrune = await composer.suggestPrune(activities)
  for (const id of toPrune) swarm.removeAgent(id)
})
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/composer) | [GitHub](https://github.com/medonomator/cognitive-swarm)
