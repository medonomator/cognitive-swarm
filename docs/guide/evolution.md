# Evolution

cognitive-swarm supports self-evolving swarms where agents detect expertise gaps and vote to spawn new specialists. No other multi-agent framework has this.

## How It Works

```
Day 1:  5 agents → basic analysis
Day 12: anomaly-detector can't diagnose Docker issues
        → gap:detected → swarm votes → spawns docker-specialist
Day 25: docker-specialist caught 3 real issues → PERMANENT
Day 40: DNS issue → spawns network-analyst (temporary) → dissolved after 2 days
Month 3: Swarm grew from 5 → 8 agents, all self-created
```

The evolution controller watches for signals that indicate expertise gaps and uses the existing consensus mechanism to decide whether to spawn a new specialist.

## Configuration

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  evolution: {
    enabled: true,
    maxEvolvedAgents: 3,          // hard cap on spawned agents
    evaluationWindow: 5,          // rounds before evaluating spawned agents
    minValueForKeep: 0.5,         // minimum value score to keep permanently
    cooldownRounds: 3,            // rounds before same domain can spawn again
    nmiPruneThreshold: 0.8,       // dissolve if NMI with another agent > this
  },
})
```

## EvolutionConfig Interface

```typescript
interface EvolutionConfig {
  readonly enabled?: boolean              // default: false
  readonly maxEvolvedAgents?: number      // default: 3
  readonly evaluationWindow?: number      // default: 5
  readonly minValueForKeep?: number       // default: 0.5
  readonly cooldownRounds?: number        // default: 3
  readonly nmiPruneThreshold?: number     // default: 0.8
}
```

## Streaming Evolution Events

```typescript
for await (const event of swarm.solveWithStream('diagnose this system')) {
  if (event.type === 'evolution:spawned') {
    console.log(`Spawned: ${event.agentId} (${event.domain}) - ${event.reason}`)
  }
  if (event.type === 'evolution:dissolved') {
    console.log(`Dissolved: ${event.agentId} - ${event.reason}`)
  }
}
```

## EvolutionReport

The `SwarmResult.evolutionReport` contains a full record of all evolution events:

```typescript
interface EvolutionReport {
  readonly spawned: readonly {
    readonly agentId: string
    readonly domain: string
    readonly round: number
    readonly reason: string
  }[]
  readonly dissolved: readonly {
    readonly agentId: string
    readonly round: number
    readonly reason: string
  }[]
  readonly activeEvolvedCount: number   // currently active spawned agents
}
```

## Spawning Logic

The evolution controller monitors signals for gap indicators. When a signal suggests a domain that no current agent covers well:

1. A `discovery` signal is emitted describing the gap
2. Existing agents vote on whether to spawn (using the standard consensus mechanism)
3. If vote passes: a new agent is created with domain-appropriate personality and role
4. The new agent participates in remaining rounds
5. After `evaluationWindow` rounds: if value score > `minValueForKeep`, the agent is kept; otherwise dissolved

## Value Score

Each spawned agent's value score is calculated from:

- Signals emitted that influenced consensus
- Shapley value in the agent coalition
- Unique information contribution (low NMI with existing agents)

Agents with value score above `minValueForKeep` can be flagged for permanent inclusion in future solves via persistent bandit storage.

## NMI-Based Pruning

If a spawned agent's Normalized Mutual Information with an existing agent exceeds `nmiPruneThreshold`, it's considered redundant and dissolved early. This prevents the swarm from growing with agents that don't add new perspective.

## Using SwarmEvolver Directly

```typescript
import { SwarmEvolver } from '@cognitive-swarm/evolution'

const evolver = new SwarmEvolver({
  maxAgents: 5,
  evaluationWindow: 3,
  minValueForKeep: 0.6,
})

// Check for gaps and get spawn recommendation
const action = await evolver.evaluate(signals, currentAgents, mathAnalysis)
if (action.type === 'spawn') {
  console.log(`Spawn recommendation: ${action.domain} - ${action.reason}`)
}
```
