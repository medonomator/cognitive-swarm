# @cognitive-swarm/evolution

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/evolution)](https://www.npmjs.com/package/@cognitive-swarm/evolution)

Self-evolving swarm: agents detect expertise gaps, propose new specialists, and dissolve underperformers.

## Install

```bash
npm install @cognitive-swarm/evolution
```

## Quick Start

```typescript
import { SwarmEvolver } from '@cognitive-swarm/evolution'

const evolver = new SwarmEvolver(llmProvider, {
  minVotesForSpawn: 2,
  approvalThreshold: 0.6,
  minValueForKeep: 0.3,
  evaluationWindow: 3,
})

// 1. Agent detects a gap
evolver.reportGap({
  id: 'g1',
  detectedBy: 'agent-1',
  domain: 'reverse-engineering',
  reason: 'Found obfuscated code needing binary analysis',
  urgency: 0.8,
  timestamp: Date.now(),
})

// 2. Another agent confirms
evolver.confirmGap('g1', 'agent-2')

// 3. Spawn a specialist
const proposal = await evolver.proposeSpawn('g1', ['analyst', 'critic'])
console.log(proposal?.role)           // LLM-generated role name
console.log(proposal?.personality)    // generated PersonalityVector

// 4. Evaluate and prune
const result = evolver.evaluate('spawned-agent-1', 12, 3, 5)
console.log(result.recommendation)   // 'keep' | 'dissolve'
```

## Lifecycle

1. **Gap Detection** -- agents report missing expertise via `reportGap()`
2. **Confirmation** -- other agents confirm via `confirmGap()`
3. **Spawning** -- when enough confirmations, `proposeSpawn()` creates a specialist
4. **Evaluation** -- `evaluate()` tracks spawned agent contribution
5. **Pruning** -- `suggestPrune()` recommends removing underperformers

## Gap Detection

```typescript
evolver.reportGap(gap: GapSignal): void
evolver.confirmGap(gapId: string, agentId: string): void
evolver.dismissGap(gapId: string, agentId: string): void
evolver.getConfirmationCount(gapId: string): number
```

## Spawning

```typescript
const proposal = await evolver.proposeSpawn(gapId: string, existingRoles: string[]): SpawnProposal | null
```

Returns `null` if confirmations < `minVotesForSpawn`. The LLM generates the role description and personality based on gap context.

```typescript
interface SpawnProposal {
  readonly id: string
  readonly gapId: string
  readonly role: string
  readonly roleDescription: string
  readonly personality: PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly temporary: boolean
  readonly status: 'pending' | 'approved' | 'rejected'
}
```

## Evaluation

```typescript
const result = evolver.evaluate(agentId, signalsSent, proposalsMade, roundsActive)

interface EvaluationResult {
  readonly agentId: string
  readonly valueScore: number           // 0..1
  readonly roundsActive: number
  readonly recommendation: 'keep' | 'dissolve'
  readonly reason: string
}
```

Value score: `0.4 * signalScore + 0.6 * proposalScore`. Agents evaluated before `evaluationWindow` rounds always get "keep".

## Pruning

```typescript
const report = evolver.suggestPrune(redundancyScores: Map<string, number>)

interface PruneReport {
  readonly candidates: readonly PruneCandidate[]
  readonly pruneCount: number
}
```

## Configuration

```typescript
interface EvolverConfig {
  readonly minVotesForSpawn?: number      // default: 2
  readonly approvalThreshold?: number    // default: 0.6
  readonly minValueForKeep?: number      // default: 0.3
  readonly evaluationWindow?: number     // default: 3
}
```

## Usage via Orchestrator

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  evolution: {
    enabled: true,
    maxEvolvedAgents: 3,
    evaluationWindow: 5,
    minValueForKeep: 0.5,
    cooldownRounds: 3,
    nmiPruneThreshold: 0.8,
  },
})

const result = await swarm.solve('complex multi-domain task')
console.log(result.evolutionReport?.spawned)
```

## Stream Events

```typescript
for await (const event of swarm.solveWithStream('task')) {
  if (event.type === 'evolution:spawned') {
    console.log(event.agentId, event.domain, event.reason)
  }
  if (event.type === 'evolution:dissolved') {
    console.log(event.agentId, event.reason)
  }
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/evolution) | [GitHub](https://github.com/medonomator/cognitive-swarm)
