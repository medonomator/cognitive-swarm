# @cognitive-swarm/consensus

The ConsensusEngine evaluates proposals and votes using pluggable strategies.

## Install

```bash
npm install @cognitive-swarm/consensus
```

## ConsensusEngine

```typescript
import { ConsensusEngine } from '@cognitive-swarm/consensus'

const engine = new ConsensusEngine(config?, events?, customStrategies?)
```

### evaluate()

Synchronous evaluation of proposals and votes:

```typescript
const result: ConsensusResult = engine.evaluate(proposals, votes)
```

## ConsensusConfig

```typescript
interface ConsensusConfig {
  readonly strategy?: 'voting' | 'confidence-weighted' | 'hierarchical' | 'bayesian' | 'entropy'
  readonly threshold?: number           // 0..1, default: 0.7
  readonly timeoutMs?: number
  readonly minVoters?: number
  readonly maxDebateRounds?: number     // for conflict resolution debate
  readonly conflictResolution?: 'debate' | 'escalate' | 'majority'
  readonly onError?: ErrorHandler
}
```

## Built-in Strategies

All five strategies implement the `ConsensusStrategy` interface:

| Strategy | Id | Best For |
|----------|-----|---------|
| Confidence Weighted | `confidence-weighted` | General use (default) |
| Voting | `voting` | Democratic decisions |
| Hierarchical | `hierarchical` | Mixed-expertise swarms |
| Bayesian | `bayesian` | Calibrated confidence scores |
| Entropy-Based | `entropy` | Exploratory tasks |

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

## Proposal and VoteRecord

```typescript
interface Proposal {
  readonly id: string
  readonly content: string
  readonly reasoning: string
  readonly sourceAgentId: string
  readonly sourceSignalId: string
  readonly confidence: number
  readonly timestamp: number
}

interface VoteRecord {
  readonly agentId: string
  readonly proposalId: string
  readonly vote: VotePayload
  readonly timestamp: number
  readonly causalLevel?: CausalLevel    // Pearl's Ladder level
}
```

## Custom Strategy

Implement `ConsensusStrategy` to add your own evaluation logic:

```typescript
import type { ConsensusStrategy, ConsensusEvaluation } from '@cognitive-swarm/core'

const myStrategy: ConsensusStrategy = {
  id: 'custom',
  evaluate(proposals, votes, config): ConsensusEvaluation {
    // Pure function - no side effects
    return {
      reached: true,
      winningProposalId: proposals[0]?.id,
      confidence: 0.9,
      reasoning: 'Custom evaluation',
    }
  }
}
```

Register via the constructor:

```typescript
const engine = new ConsensusEngine(config, events, [myStrategy])
```

## ConsensusEvaluation

Output of a single strategy evaluation:

```typescript
interface ConsensusEvaluation {
  readonly reached: boolean
  readonly winningProposalId?: string
  readonly confidence: number
  readonly reasoning: string
}
```

## DebateRunner

Structured debate for conflict resolution. Used by the orchestrator when `conflictResolution: 'debate'` and two proposals conflict.

```typescript
import { DebateRunner } from '@cognitive-swarm/consensus'

const debater = new DebateRunner()
```

```typescript
interface DebateResult {
  readonly resolved: boolean
  readonly winningProposalId: string | null
  readonly confidence: number
  readonly roundsUsed: number
  readonly signals: readonly Signal[]
}
```
