# Consensus

The consensus engine evaluates proposals and votes after each round using one of 5 pluggable strategies. Dissent is always preserved in the result - the losing side is never discarded.

## Configuration

```typescript
interface ConsensusConfig {
  strategy?: 'confidence-weighted' | 'voting' | 'hierarchical' | 'bayesian' | 'entropy'
  threshold?: number           // 0..1, how strong consensus must be (default: 0.7)
  timeoutMs?: number           // per-round timeout
  minVoters?: number           // minimum voters required
  maxDebateRounds?: number     // rounds for structured debate
  conflictResolution?: 'debate' | 'escalate' | 'majority'
}
```

## Strategies

### Confidence Weighted

The default strategy. Each vote is weighted by the agent's confidence in its vote (`VotePayload.weight`). The proposal with the highest weighted score wins if it crosses the threshold.

**Best for:** General use. Naturally amplifies high-confidence signals and dampens uncertain ones.

```typescript
consensus: { strategy: 'confidence-weighted', threshold: 0.7 }
```

**How it works:**
- For each proposal, sum `weight * (1 if agree, -1 if disagree, 0 if abstain)` across all votes
- Normalize to [0, 1]
- Winner must exceed `threshold`

### Bayesian

Treats votes as evidence and updates a prior distribution over proposals. The MAP (maximum a posteriori) estimate wins. Integrates naturally with the Math Bridge's Bayesian analysis.

**Best for:** Tasks where agents have calibrated confidence scores. Works well with reputation-weighted voting.

```typescript
consensus: { strategy: 'bayesian', threshold: 0.75 }
```

**How it works:**
- Start with uniform prior over proposals
- Each vote updates posterior via Bayes' theorem
- Winner is the proposal with highest posterior if it exceeds threshold

### Entropy-Based

Uses information theory - consensus is reached when the entropy of the vote distribution drops below a threshold, meaning agents have converged on a shared belief.

**Best for:** Exploratory tasks where you want the swarm to keep deliberating until genuinely uncertain agents make up their minds.

```typescript
consensus: { strategy: 'entropy', threshold: 0.7 }
```

**How it works:**
- Compute Shannon entropy H of the vote distribution
- Normalize to [0, 1]: normalized entropy = H / H_max
- Consensus reached when (1 - normalized_entropy) > threshold

### Hierarchical

Agents have explicit weights (`SwarmAgentConfig.weight`). Higher-weighted agents' votes count more. Useful when some agents have domain expertise over others.

**Best for:** Mixed-expertise swarms where some agents (e.g., a security expert) should have authority on specific signal types.

```typescript
consensus: {
  strategy: 'hierarchical',
  threshold: 0.65
}
// Agents configured with weight: 2.0 count double
```

### Voting

Simple supermajority. Each agent gets one vote regardless of confidence. The proposal with more than `threshold` fraction of agree votes wins.

**Best for:** Democratic decision-making, or when you don't trust agent confidence calibration.

```typescript
consensus: { strategy: 'voting', threshold: 0.6 }
```

## Conflict Resolution

When the signal bus detects conflicting proposals, the configured resolution mode kicks in:

```typescript
conflictResolution: 'debate'    // structured multi-round debate (default)
conflictResolution: 'majority'  // immediate majority vote
conflictResolution: 'escalate'  // emit escalate signal, return unresolved
```

### Structured Debate

The debate runner runs the two conflicting proposals through N rounds of targeted exchange:

```
Round 1: Both proposals get a chance to argue their case
Round 2: Each agent challenges the opposing proposal
Round 3: Votes are collected with Bayesian posteriors updated
...
Winner: Proposal with highest Bayesian posterior confidence
```

## ConsensusResult

```typescript
interface ConsensusResult {
  readonly decided: boolean
  readonly decision?: string         // winning proposal content
  readonly proposalId?: string
  readonly confidence: number        // 0..1
  readonly votingRecord: readonly VoteRecord[]  // every vote, preserved
  readonly dissent: readonly string[]           // agents that disagreed
  readonly reasoning: string
  readonly resolvedConflicts: readonly ConflictPair[]
  readonly durationMs: number
}
```

Dissent is first-class. The `dissent` array contains the IDs of agents that voted against the winning proposal, and `votingRecord` contains every individual vote with reasoning.

## Custom Strategies

Implement `ConsensusStrategy` to add your own strategy without modifying the engine:

```typescript
import type { ConsensusStrategy, ConsensusEvaluation } from '@cognitive-swarm/consensus'

const myStrategy: ConsensusStrategy = {
  id: 'custom-weighted',
  evaluate(proposals, votes, config): ConsensusEvaluation {
    // your logic here
    return {
      reached: true,
      winningProposalId: 'proposal-1',
      confidence: 0.85,
      reasoning: 'Custom evaluation logic'
    }
  }
}
```
