# @cognitive-swarm/consensus

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/consensus)](https://www.npmjs.com/package/@cognitive-swarm/consensus)

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

### canEvaluate()

Check if enough votes have been collected to attempt consensus:

```typescript
if (engine.canEvaluate(proposals, votes)) {
  const result = engine.evaluate(proposals, votes)
}
```

This returns `false` when:
- No proposals have been submitted
- Fewer unique voters than `minVoters` have voted

### Properties

```typescript
engine.activeStrategy    // string - current strategy ID
engine.availableStrategies  // readonly string[] - all registered strategy IDs
```

## ConsensusConfig

```typescript
interface ConsensusConfig {
  readonly strategy?: 'voting' | 'confidence-weighted' | 'hierarchical' | 'bayesian' | 'entropy'
  readonly threshold?: number           // 0..1, default: 0.7
  readonly timeoutMs?: number           // default: 30_000
  readonly minVoters?: number           // default: 2
  readonly maxDebateRounds?: number     // for conflict resolution debate, default: 3
  readonly conflictResolution?: 'debate' | 'escalate' | 'majority'
  readonly onError?: ErrorHandler
}
```

### Configuration Defaults

| Parameter | Default | Description |
|-----------|---------|-------------|
| `strategy` | `'confidence-weighted'` | Which strategy evaluates proposals |
| `threshold` | `0.7` | Minimum confidence/ratio to declare consensus |
| `timeoutMs` | `30_000` | Max time for consensus evaluation |
| `minVoters` | `2` | Minimum unique voters before evaluating |
| `maxDebateRounds` | `3` | Maximum rounds in structured debate |
| `conflictResolution` | `'debate'` | How to handle conflicting proposals |

## Built-in Strategies

All five strategies implement the `ConsensusStrategy` interface.

### Strategy Comparison Table

| Strategy | Best For | Agent Count | Latency | Confidence Meaning | Key Tradeoff |
|----------|----------|-------------|---------|---------------------|--------------|
| `confidence-weighted` | General use (default) | 3-10 | Low | Weighted agree ratio | Biased toward high-weight agents |
| `voting` | Democratic decisions | 3+ | Lowest | Raw agree/total ratio | Ignores agent expertise |
| `hierarchical` | Mixed-expertise swarms | 2-8 | Low | Top voter's weight | Single point of failure |
| `bayesian` | Calibrated confidence | 3-15 | Medium | Real posterior probability | Requires `@cognitive-swarm/math` |
| `entropy` | Exploratory tasks | 5+ | Medium | 1 - normalized entropy | Sensitive to proposal count |

### When to Use Each Strategy

**`voting`** -- Use when all agents are peers with equal expertise. Simple majority rule. Good for binary decisions (approve/reject) or when you want true democracy.

**`confidence-weighted`** -- The safe default. Agents with higher confidence and voting weight have proportionally more influence. Works well when agent weights reflect actual expertise. Note: causal levels (Pearl's Ladder) affect signal routing priority, NOT vote weight.

**`hierarchical`** -- Use when you have a clear expert agent (high weight) who should be able to override the group. If the highest-weight voter agrees with any proposal, that proposal wins immediately. Falls back to confidence-weighted if the top voter disagrees with everything.

**`bayesian`** -- Use when you need mathematically rigorous confidence scores. Maintains a belief network over proposals; each vote is evidence that updates posteriors via likelihood ratios. Multiple weak votes can outweigh one strong vote. Abstentions are truly uninformative (LR = 1).

**`entropy`** -- Use for creative or exploratory tasks where you want to measure agreement quality, not just majority size. Uses Shannon entropy: `confidence = 1 - H/H_max`. This means 60% agreement across 2 proposals is very different from 60% across 10 proposals. Encourages diversity.

## Detailed Strategy Examples

### Voting Strategy

```typescript
const engine = new ConsensusEngine({
  strategy: 'voting',
  threshold: 0.6,
  minVoters: 3,
})

const proposals: Proposal[] = [
  { id: 'p1', content: 'Use microservices', reasoning: '...', sourceAgentId: 'architect', sourceSignalId: 's1', confidence: 0.8, timestamp: Date.now() },
  { id: 'p2', content: 'Use monolith', reasoning: '...', sourceAgentId: 'pragmatist', sourceSignalId: 's2', confidence: 0.7, timestamp: Date.now() },
]

const votes: VoteRecord[] = [
  { agentId: 'analyst', proposalId: 'p1', vote: { stance: 'agree', weight: 1, reasoning: 'Scales better' }, timestamp: Date.now() },
  { agentId: 'critic', proposalId: 'p1', vote: { stance: 'agree', weight: 1, reasoning: 'Team is ready' }, timestamp: Date.now() },
  { agentId: 'pragmatist', proposalId: 'p2', vote: { stance: 'agree', weight: 1, reasoning: 'Simpler' }, timestamp: Date.now() },
]

const result = engine.evaluate(proposals, votes)
// result.decided === true (2/3 = 67% >= 60% threshold)
// result.confidence === 0.67
// result.decision === 'Use microservices'
```

### Confidence-Weighted Strategy

```typescript
const engine = new ConsensusEngine({
  strategy: 'confidence-weighted',
  threshold: 0.7,
})

const votes: VoteRecord[] = [
  // Senior agent with high weight
  { agentId: 'senior', proposalId: 'p1', vote: { stance: 'agree', weight: 0.9, reasoning: '...' }, timestamp: Date.now() },
  // Junior agent with low weight
  { agentId: 'junior', proposalId: 'p1', vote: { stance: 'disagree', weight: 0.3, reasoning: '...' }, timestamp: Date.now() },
]

// Weighted ratio: 0.9 / (0.9 + 0.3) = 0.75 >= 0.7 -> consensus reached
// Even though it's 1-1 in raw votes, the senior's weight dominates
```

### Hierarchical Strategy

```typescript
const engine = new ConsensusEngine({
  strategy: 'hierarchical',
  threshold: 0.7,
})

const votes: VoteRecord[] = [
  // Expert agent with highest weight -> immediate override
  { agentId: 'expert', proposalId: 'p1', vote: { stance: 'agree', weight: 0.95, reasoning: 'Domain expertise' }, timestamp: Date.now() },
  // Other agents disagree but are overridden
  { agentId: 'agent-2', proposalId: 'p2', vote: { stance: 'agree', weight: 0.4, reasoning: '...' }, timestamp: Date.now() },
  { agentId: 'agent-3', proposalId: 'p2', vote: { stance: 'agree', weight: 0.5, reasoning: '...' }, timestamp: Date.now() },
]

const result = engine.evaluate(proposals, votes)
// result.decided === true
// result.reasoning === 'Hierarchical override: top voter (weight=0.95) approved'
// Expert overrides the majority
```

### Bayesian Strategy

```typescript
const engine = new ConsensusEngine({
  strategy: 'bayesian',
  threshold: 0.7,
  minVoters: 2,
})

// With Bayesian, each vote updates a belief network via likelihood ratios.
// The BeliefNetwork from @cognitive-swarm/math maintains posterior probabilities.
const result = engine.evaluate(proposals, votes)
// result.confidence is a real posterior probability, not a vote ratio
// result.reasoning includes evidence count:
// "Bayesian posterior 78.3% exceeds threshold 70% after 4 evidence updates"
```

### Entropy Strategy

```typescript
const engine = new ConsensusEngine({
  strategy: 'entropy',
  threshold: 0.6,
})

// With 2 proposals and clear preference:
// H = -0.9*log2(0.9) - 0.1*log2(0.1) = 0.47 bits
// H_max = log2(2) = 1.0 bit
// confidence = 1 - 0.47/1.0 = 0.53 -> below threshold

// With 10 proposals but one dominating:
// H_max = log2(10) = 3.32 bits
// Even moderate agreement yields high normalized confidence
```

## ConsensusResult

```typescript
interface ConsensusResult {
  readonly decided: boolean
  readonly decision?: string         // winning proposal content
  readonly proposalId?: string       // winning proposal ID
  readonly confidence: number        // 0..1, meaning depends on strategy
  readonly votingRecord: readonly VoteRecord[]
  readonly dissent: readonly string[]  // reasoning from disagree votes on the winner
  readonly reasoning: string           // human-readable explanation
  readonly resolvedConflicts: readonly ConflictPair[]
  readonly durationMs: number
}
```

### Interpreting `confidence`

The meaning of `confidence` varies by strategy:

| Strategy | Confidence Meaning | Range |
|----------|-------------------|-------|
| `voting` | Agree votes / total votes | 0-1 |
| `confidence-weighted` | Weighted agree / weighted total | 0-1 |
| `hierarchical` | Top voter's weight (if override) or fallback weighted ratio | 0-1 |
| `bayesian` | Posterior probability P(proposal\|evidence) | 0-1 |
| `entropy` | 1 - H/H_max (normalized information) | 0-1 |

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

interface VotePayload {
  readonly stance: 'agree' | 'disagree' | 'abstain'
  readonly weight: number       // 0..1
  readonly reasoning?: string
}
```

## Custom Strategy

Implement `ConsensusStrategy` to add your own evaluation logic:

```typescript
import type { ConsensusStrategy, ConsensusEvaluation } from '@cognitive-swarm/core'

const unanimityStrategy: ConsensusStrategy = {
  id: 'unanimity',
  evaluate(proposals, votes, config): ConsensusEvaluation {
    // Require ALL voters to agree on the same proposal
    if (proposals.length === 0) {
      return { reached: false, confidence: 0, reasoning: 'No proposals' }
    }

    for (const proposal of proposals) {
      const proposalVotes = votes.filter(v => v.proposalId === proposal.id)
      const allAgree = proposalVotes.length > 0 &&
        proposalVotes.every(v => v.vote.stance === 'agree')
      const allVoted = new Set(votes.map(v => v.agentId)).size >= config.minVoters

      if (allAgree && allVoted) {
        return {
          reached: true,
          winningProposalId: proposal.id,
          confidence: 1.0,
          reasoning: `Unanimous agreement from ${proposalVotes.length} voters`,
        }
      }
    }

    return {
      reached: false,
      confidence: 0,
      reasoning: 'No unanimous agreement found',
    }
  },
}
```

### Custom Strategy with External Validation

```typescript
const externalValidationStrategy: ConsensusStrategy = {
  id: 'validated',
  evaluate(proposals, votes, config): ConsensusEvaluation {
    // First, use confidence-weighted to find the leading proposal
    const weighted = new ConfidenceWeightedStrategy()
    const preliminary = weighted.evaluate(proposals, votes, config)

    if (!preliminary.reached) return preliminary

    // Then apply additional domain-specific validation
    const winner = proposals.find(p => p.id === preliminary.winningProposalId)
    if (winner && winner.content.length < 50) {
      return {
        reached: false,
        confidence: preliminary.confidence * 0.5,
        reasoning: 'Proposal too short for domain requirements',
      }
    }

    return preliminary
  },
}
```

Register via the constructor:

```typescript
const engine = new ConsensusEngine(config, events, [unanimityStrategy, externalValidationStrategy])
// Now available: engine.availableStrategies includes 'unanimity' and 'validated'
```

## ConsensusEvaluation

Output of a single strategy evaluation (internal to the strategy):

```typescript
interface ConsensusEvaluation {
  readonly reached: boolean
  readonly winningProposalId?: string
  readonly confidence: number
  readonly reasoning: string
}
```

## Conflict Resolution

When proposals conflict (detected by the SignalBus), the orchestrator resolves them based on `conflictResolution` config:

### `'debate'` (default)

Structured multi-round debate between conflicting proposals. The `DebateRunner` manages this process.

```typescript
const engine = new ConsensusEngine({
  conflictResolution: 'debate',
  maxDebateRounds: 3,
})

// When two proposals conflict:
// 1. DebateRunner starts a structured debate
// 2. Agents argue for/against each proposal across rounds
// 3. Bayesian posteriors are updated each round
// 4. Debate ends when convergence is reached or maxDebateRounds is hit
// 5. Winner is used in next consensus evaluation
```

### `'majority'`

Skip debate entirely. The proposal with more support (votes) wins the conflict immediately.

```typescript
const engine = new ConsensusEngine({
  conflictResolution: 'majority',
})
// Faster but less nuanced - good for time-sensitive decisions
```

### `'escalate'`

Don't resolve automatically. Emit an `escalate` signal so a higher-level agent or human can intervene.

```typescript
const engine = new ConsensusEngine({
  conflictResolution: 'escalate',
})
// Use when conflicts require human judgment or domain expertise
// The orchestrator's advisor can pick up escalation signals
```

## DebateRunner

Structured debate for conflict resolution. Used by the orchestrator when `conflictResolution: 'debate'` and two proposals conflict.

```typescript
import { DebateRunner } from '@cognitive-swarm/consensus'

const debater = new DebateRunner()
```

### DebateResult

```typescript
interface DebateResult {
  readonly resolved: boolean
  readonly winningProposalId: string | null
  readonly confidence: number
  readonly roundsUsed: number
  readonly signals: readonly Signal[]
}
```

### How Debate Works

1. Two conflicting proposals enter the debate.
2. Each round, agents produce arguments for/against each proposal.
3. Bayesian posteriors for each proposal are updated based on arguments.
4. The debate converges when one proposal's posterior exceeds the threshold, or stops after `maxDebateRounds`.
5. Events emitted: `debate:start`, `debate:round` (per round with posteriors), `debate:end`.

### Debate Events in OTel

Debate creates its own span under the current round span:

```
round [N]
  debate                    [resolved=true, rounds=2, confidence=0.81]
    (event) debate:round    [round=1]
    (event) debate:round    [round=2]
```

## Edge Cases

### All Agents Disagree

When every vote is `stance: 'disagree'` for all proposals:
- All strategies return `decided: false`
- `confidence` will be 0 (voting, confidence-weighted) or near-uniform posteriors (bayesian)
- The orchestrator continues to the next round or hits `maxRounds`

### Single Agent (Below minVoters)

With `minVoters: 2` (default) and only 1 agent voting:
- `canEvaluate()` returns `false`
- `evaluate()` returns `decided: false` with reasoning `"Insufficient voters: 1/2"`
- Set `minVoters: 1` if you have a single-agent swarm

### Timeout Behavior

The `timeoutMs` config is available for orchestrator-level timeout management. The `ConsensusEngine.evaluate()` itself is synchronous and does not enforce timeouts -- the orchestrator is responsible for cancellation if consensus takes too long.

### Equal Support (Tie)

When two proposals have exactly equal support:
- `voting`: the first proposal encountered wins (iteration order)
- `confidence-weighted`: same as voting
- `bayesian`: near-equal posteriors, likely below threshold -> `decided: false`
- `entropy`: high entropy = low confidence -> `decided: false`
- Ties in `hierarchical` are broken by the top voter's preference

### No Proposals

All strategies handle the empty-proposals case:
```typescript
engine.evaluate([], votes)
// { decided: false, confidence: 0, reasoning: 'No proposals submitted' }
```
