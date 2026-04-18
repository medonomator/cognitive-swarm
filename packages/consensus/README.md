# @cognitive-swarm/consensus

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/consensus)](https://www.npmjs.com/package/@cognitive-swarm/consensus)

The ConsensusEngine evaluates proposals and votes using pluggable strategies.

## Install

```bash
npm install @cognitive-swarm/consensus
```

## Quick Start

```typescript
import { ConsensusEngine } from '@cognitive-swarm/consensus'

const engine = new ConsensusEngine({
  strategy: 'confidence-weighted',
  threshold: 0.7,
  minVoters: 2,
})

const result = engine.evaluate(proposals, votes)
if (result.decided) {
  console.log(`Decision: ${result.decision}`)
  console.log(`Confidence: ${result.confidence}`)
}
```

## ConsensusEngine API

### `evaluate(proposals, votes): ConsensusResult`

Synchronous evaluation of proposals and votes.

### `canEvaluate(proposals, votes): boolean`

Returns `false` when no proposals exist or fewer unique voters than `minVoters`.

### Properties

- `engine.activeStrategy` -- current strategy ID
- `engine.availableStrategies` -- all registered strategy IDs

## Built-in Strategies

| Strategy | Best For | Key Tradeoff |
|----------|----------|--------------|
| `confidence-weighted` | General use (default) | Biased toward high-weight agents |
| `voting` | Democratic decisions | Ignores agent expertise |
| `hierarchical` | Mixed-expertise swarms | Single point of failure |
| `bayesian` | Calibrated confidence | Requires `@cognitive-swarm/math` |
| `entropy` | Exploratory tasks | Sensitive to proposal count |

### Example: Confidence-Weighted

```typescript
const engine = new ConsensusEngine({ strategy: 'confidence-weighted', threshold: 0.7 })

// Senior agent (weight 0.9) vs junior (weight 0.3): 0.9/(0.9+0.3) = 0.75 >= 0.7
// Even at 1-1 raw votes, the senior's weight achieves consensus
```

### Example: Bayesian

```typescript
const engine = new ConsensusEngine({ strategy: 'bayesian', threshold: 0.7 })
const result = engine.evaluate(proposals, votes)
// result.confidence is a real posterior probability, not a vote ratio
```

## Configuration

```typescript
interface ConsensusConfig {
  readonly strategy?: 'voting' | 'confidence-weighted' | 'hierarchical' | 'bayesian' | 'entropy'
  readonly threshold?: number           // default: 0.7
  readonly timeoutMs?: number           // default: 30_000
  readonly minVoters?: number           // default: 2
  readonly maxDebateRounds?: number     // default: 3
  readonly conflictResolution?: 'debate' | 'escalate' | 'majority'
}
```

## Conflict Resolution

| Mode | Behavior |
|------|----------|
| `'debate'` (default) | Structured multi-round debate via DebateRunner |
| `'majority'` | Proposal with more support wins immediately |
| `'escalate'` | Emit escalation signal for external handling |

## DebateRunner

Structured debate for conflict resolution between two proposals:

```typescript
import { DebateRunner } from '@cognitive-swarm/consensus'

const debater = new DebateRunner()
// Used internally by orchestrator when conflictResolution: 'debate'
```

Events emitted: `debate:start`, `debate:round` (per round with posteriors), `debate:end`.

## Custom Strategy

```typescript
import type { ConsensusStrategy, ConsensusEvaluation } from '@cognitive-swarm/core'

const unanimityStrategy: ConsensusStrategy = {
  id: 'unanimity',
  evaluate(proposals, votes, config): ConsensusEvaluation {
    // Require ALL voters to agree on the same proposal
    for (const proposal of proposals) {
      const proposalVotes = votes.filter(v => v.proposalId === proposal.id)
      const allAgree = proposalVotes.length > 0 &&
        proposalVotes.every(v => v.vote.stance === 'agree')
      if (allAgree) {
        return { reached: true, winningProposalId: proposal.id, confidence: 1.0, reasoning: 'Unanimous' }
      }
    }
    return { reached: false, confidence: 0, reasoning: 'No unanimous agreement' }
  },
}

// Register via constructor
const engine = new ConsensusEngine(config, events, [unanimityStrategy])
```

## ConsensusResult

```typescript
interface ConsensusResult {
  readonly decided: boolean
  readonly decision?: string
  readonly proposalId?: string
  readonly confidence: number
  readonly votingRecord: readonly VoteRecord[]
  readonly dissent: readonly string[]
  readonly reasoning: string
  readonly resolvedConflicts: readonly ConflictPair[]
  readonly durationMs: number
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/consensus) | [GitHub](https://github.com/medonomator/cognitive-swarm)
