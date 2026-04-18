# Consensus

The consensus engine evaluates proposals and votes after each round using one of 5 pluggable strategies. Dissent is always preserved in the result -- the losing side is never discarded. This page covers each strategy's algorithm in detail, the debate runner, configuration, and how to write custom strategies.

## Configuration

```typescript
interface ConsensusConfig {
  /** Strategy name. Default: 'confidence-weighted' */
  strategy?: 'confidence-weighted' | 'voting' | 'hierarchical' | 'bayesian' | 'entropy'
  /** 0..1, how strong consensus must be. Default: 0.7 */
  threshold?: number
  /** Per-round timeout in ms. Default: 30,000 */
  timeoutMs?: number
  /** Minimum unique voters required before evaluation. Default: 2 */
  minVoters?: number
  /** Max rounds for structured debate. Default: 3 */
  maxDebateRounds?: number
  /** What to do when conflicting proposals are detected. Default: 'debate' */
  conflictResolution?: 'debate' | 'escalate' | 'majority'
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `strategy` | `'confidence-weighted'` | Which voting algorithm to use. |
| `threshold` | `0.7` | Minimum confidence/ratio to declare consensus. |
| `timeoutMs` | `30,000` | Per-round timeout. |
| `minVoters` | `2` | `canEvaluate()` returns false until this many unique agents have voted. |
| `maxDebateRounds` | `3` | How many structured debate rounds before giving up. |
| `conflictResolution` | `'debate'` | How to handle detected proposal conflicts. |

## ConsensusEngine API

```typescript
class ConsensusEngine {
  constructor(
    config?: ConsensusConfig,
    events?: TypedEventEmitter<SwarmEventMap>,
    customStrategies?: readonly ConsensusStrategy[],
  )

  /** Evaluate proposals and votes. Returns ConsensusResult. */
  evaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
  ): ConsensusResult

  /** Check if enough votes have been collected to attempt evaluation. */
  canEvaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
  ): boolean

  /** Get the active strategy ID. */
  get activeStrategy(): string

  /** Get available strategy IDs. */
  get availableStrategies(): readonly string[]
}
```

### How the Orchestrator Uses It

The orchestrator calls `canEvaluate()` + `evaluate()` at the end of each round:

```
Round completes
  │
  ├── Extract proposals from signal history
  ├── Extract votes from signal history
  ├── Apply attention weights (surprise-based, clamped [0.8, 1.2])
  ├── Apply reputation weights (if advisor enabled)
  │
  ├── canEvaluate(proposals, votes)?
  │     └── Need >= minVoters unique voters + >= 1 proposal
  │
  └── evaluate(proposals, votes) → ConsensusResult
        ├── decided: true → STOP solve loop
        └── decided: false → continue (or trigger debate if 2+ proposals)
```

## Strategies

### Confidence Weighted (default)

```typescript
consensus: { strategy: 'confidence-weighted', threshold: 0.7 }
```

**Algorithm:**

For each proposal:
1. Collect all votes targeting this proposal
2. Sum `agreeWeight = Sigma(weight)` for all `stance === 'agree'`
3. Sum `totalWeight = Sigma(weight)` for all votes (agree + disagree + abstain)
4. Compute `weightedRatio = agreeWeight / totalWeight`
5. The proposal with the highest `weightedRatio` wins if it exceeds `threshold`

```
weightedRatio = Sum(weight_i, where stance_i = 'agree')
              / Sum(weight_i, for all votes)
```

**Key property:** agents with higher vote weight have more influence. An agent that votes `agree` with `weight: 0.9` contributes more than one with `weight: 0.3`.

**Important nuance:** causal levels (`correlation`/`intervention`/`counterfactual`) do NOT affect vote weight in this strategy. The source code explicitly documents: "causal levels affect signal routing priority, NOT vote weight." This prevents counterfactual challenges from drowning out agreement.

**Best for:** General use. Naturally amplifies high-confidence signals and dampens uncertain ones.

---

### Bayesian

```typescript
consensus: { strategy: 'bayesian', threshold: 0.75 }
```

**Algorithm:**

Uses a `BeliefNetwork` from `@cognitive-swarm/math` to maintain posterior probabilities over proposals:

1. Initialize uniform prior: `P(proposal_i) = 1/N` for all N proposals
2. For each vote, convert to a likelihood ratio:
   ```typescript
   voteToLikelihoodRatio(stance, weight):
     agree  → 1 + weight        // evidence FOR
     disagree → 1 / (1 + weight) // evidence AGAINST
     abstain → 1.0               // uninformative
   ```
3. Update posterior via Bayes' theorem:
   ```
   P(H|E) = P(E|H) * P(H) / P(E)
   ```
4. The MAP (maximum a posteriori) estimate wins if its probability exceeds `threshold`

**Key property:** multiple weak votes can outweigh one strong vote. Abstentions are genuinely uninformative (LR=1). Confidence is a real posterior probability, not a vote ratio.

**Best for:** Tasks where agents have calibrated confidence scores. Works well with reputation-weighted voting. Integrates naturally with the Math Bridge's Bayesian analysis module.

---

### Entropy-Based

```typescript
consensus: { strategy: 'entropy', threshold: 0.7 }
```

**Algorithm:**

Uses information theory to measure agreement *quality*, not just majority size:

1. For each proposal, sum `weight` of all `agree` votes to get `support_i`
2. Compute Shannon entropy: `H = -Sum(p_i * log2(p_i))` where `p_i = support_i / total_support`
3. Compute max entropy: `H_max = log2(N)` for N proposals
4. Confidence = `1 - H/H_max`
5. Consensus reached when `confidence >= threshold`

```
H = -Sum(p_i * log2(p_i))    where p_i = support_i / total_support
confidence = 1 - H / H_max
```

**Key property:** 60% agreement across 2 proposals (H low, confidence high) is very different from 60% across 10 proposals (H high, confidence low). This strategy captures that distinction.

**Best for:** Exploratory tasks where you want the swarm to keep deliberating until genuinely uncertain agents make up their minds. Good when proposal count varies.

---

### Hierarchical

```typescript
consensus: { strategy: 'hierarchical', threshold: 0.65 }
// Agents configured with weight: 2.0 count double
```

**Algorithm:**

1. Find the voter with the highest `vote.weight` across all votes
2. If that top voter voted `agree` on any proposal, that proposal wins **immediately** with confidence = the top voter's weight
3. If the top voter did NOT agree with anything, fall back to `ConfidenceWeightedStrategy`

```
top_voter = argmax(vote.weight for all votes)

if top_voter.stance == 'agree':
    winner = top_voter.proposalId
    confidence = top_voter.weight
else:
    fallback to confidence-weighted
```

**Key property:** a single high-authority agent can override the group. This is intentional for scenarios with domain experts.

**Best for:** Mixed-expertise swarms where some agents (e.g., a security expert reviewing security proposals) should have veto/override authority.

---

### Simple Voting

```typescript
consensus: { strategy: 'voting', threshold: 0.6 }
```

**Algorithm:**

1. For each proposal, count votes: `agrees = count(stance === 'agree')`, `total = count(all stances)`
2. Compute `ratio = agrees / total`
3. Best proposal is the one with the highest ratio
4. Consensus reached when `bestRatio >= threshold`

```
ratio = count(agree) / count(all_votes)
```

**Key property:** each agent gets exactly one vote regardless of weight or confidence. Pure democracy.

**Best for:** Democratic decision-making, or when you don't trust agent confidence calibration. Simplest to reason about.

## Strategy Comparison

| Strategy | Weights matter? | How confidence is computed | Convergence speed |
|---|---|---|---|
| **confidence-weighted** | Yes | `agreeWeight / totalWeight` | Medium |
| **bayesian** | Yes (via LR) | Posterior probability | Slower (needs evidence) |
| **entropy** | Yes (support sums) | `1 - H/H_max` | Depends on proposal count |
| **hierarchical** | Yes (top voter overrides) | Top voter's weight | Fast (if expert agrees) |
| **voting** | No | `agrees / total` | Fast |

## Conflict Resolution

When the signal bus detects conflicting proposals (two proposals from different agents), the configured resolution mode kicks in:

### Structured Debate (`conflictResolution: 'debate'`)

The `DebateRunner` runs adversarial rounds between the two top-scoring proposals. This is the default.

**How it works internally:**

```
DebateRunner.runDebate(context)
  │
  ├── Emit 'debate:start' event
  │
  └── For round 1..maxDebateRounds:
       │
       ├── 1. Create two challenge signals
       │     ├── Challenge A: "Examine weaknesses in Proposal A: ..."
       │     └── Challenge B: "Examine weaknesses in Proposal B: ..."
       │     Source: 'debate-moderator'
       │     Confidence: 0.9
       │
       ├── 2. Publish challenges to signal bus
       │
       ├── 3. Run a normal round via RoundRunner
       │     (agents respond naturally to challenges)
       │
       ├── 4. Feed new signals to MathBridge for Bayesian updates
       │
       ├── 5. Check convergence:
       │     Does either proposal's Bayesian posterior >= 0.8?
       │     (DEFAULT_CONVERGENCE_THRESHOLD = 0.8)
       │     ├── YES → Return DebateResult(resolved: true)
       │     └── NO  → Continue to next round
       │
       └── Emit 'debate:round' with Bayesian posteriors
  │
  └── If maxRounds exhausted: return DebateResult(resolved: false)
```

In subsequent rounds (round > 0), challenges become more pointed: "Previous arguments have not resolved this. Provide new evidence or reasoning against: ..."

**Debate result:**
```typescript
interface DebateResult {
  readonly resolved: boolean
  readonly winningProposalId: string | null
  readonly confidence: number
  readonly roundsUsed: number
  readonly signals: readonly Signal[]  // all signals emitted during debate
}
```

After a resolved debate, the orchestrator re-runs consensus evaluation with all accumulated votes and signals.

### Majority Vote (`conflictResolution: 'majority'`)

Skips debate entirely. Immediate majority vote using the configured strategy to decide.

### Escalate (`conflictResolution: 'escalate'`)

Emits an `escalate` signal and returns an unresolved consensus result. The calling system decides what to do.

## ConsensusResult

```typescript
interface ConsensusResult {
  readonly decided: boolean                          // was consensus reached?
  readonly decision?: string                         // winning proposal content
  readonly proposalId?: string                       // winning proposal ID
  readonly confidence: number                        // 0..1
  readonly votingRecord: readonly VoteRecord[]       // every vote, preserved
  readonly dissent: readonly string[]                // REASONING of agents that disagreed
  readonly reasoning: string                         // human-readable explanation
  readonly resolvedConflicts: readonly ConflictPair[]
  readonly durationMs: number                        // how long evaluation took
}
```

**Dissent is first-class.** The `dissent` array contains the *reasoning* strings from votes that disagreed with the winning proposal. This is not just agent IDs -- it's the actual counter-arguments. The full `votingRecord` preserves every individual vote with stance, weight, and reasoning.

## Input Types

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
  readonly vote: VotePayload        // stance, weight, reasoning
  readonly timestamp: number
  readonly causalLevel?: CausalLevel
}
```

## Custom Strategies

Implement `ConsensusStrategy` and pass it to the constructor:

```typescript
import type {
  ConsensusStrategy,
  ConsensusEvaluation,
  Proposal,
  VoteRecord,
  ResolvedConsensusConfig,
} from '@cognitive-swarm/core'

const expertVetoStrategy: ConsensusStrategy = {
  id: 'expert-veto',
  evaluate(
    proposals: readonly Proposal[],
    votes: readonly VoteRecord[],
    config: ResolvedConsensusConfig,
  ): ConsensusEvaluation {
    // Find votes from 'expert' agent
    const expertVotes = votes.filter(v => v.agentId === 'expert')
    const vetoed = expertVotes
      .filter(v => v.vote.stance === 'disagree')
      .map(v => v.proposalId)

    // Remove vetoed proposals
    const viable = proposals.filter(p => !vetoed.includes(p.id))

    if (viable.length === 0) {
      return {
        reached: false,
        confidence: 0,
        reasoning: 'Expert vetoed all proposals',
      }
    }

    // Pick highest-confidence viable proposal
    const winner = viable.sort((a, b) => b.confidence - a.confidence)[0]!
    return {
      reached: true,
      winningProposalId: winner.id,
      confidence: winner.confidence,
      reasoning: `Expert approved; confidence ${winner.confidence}`,
    }
  },
}

// Register when creating the engine
const engine = new ConsensusEngine(
  { strategy: 'expert-veto', threshold: 0.5 },
  events,
  [expertVetoStrategy],  // custom strategies array
)
```

The `ConsensusEngine` stores all strategies in a `Map<string, ConsensusStrategy>` and looks up the active one by `config.strategy`. Custom strategies are merged into the same map, so they can override built-in strategies.

## Vote Weight Pipeline

Before votes reach the consensus engine, the orchestrator applies two optional transformations:

```
Raw votes from signal bus
  │
  ├── 1. Attention weights (surprise-based)
  │     weight *= clamp(attentionWeight, 0.8, 1.2)
  │     Mild nudge — surprise informs routing, not votes
  │
  ├── 2. Reputation weights (if advisor enabled)
  │     weight *= reputationScore
  │     Based on agent's historical accuracy
  │
  └── Final votes → ConsensusEngine.evaluate()
```

The attention weight clamping to `[0.8, 1.2]` is intentionally conservative. Unbounded attention (up to 3x in earlier versions) was causing surprising agents to drown out agreement and block consensus.
