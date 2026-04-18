# @cognitive-swarm/agent

LLM-powered swarm agents with Thompson Sampling strategy selection. Each agent is a full cognitive-engine pipeline with a swarm-specific reaction layer.

## Install

```bash
npm install @cognitive-swarm/agent
```

## SwarmAgent

Each agent wraps a `CognitiveOrchestrator` (perception, memory, emotions, reasoning, metacognition) and adds swarm-specific behavior: signal routing, strategy selection via Thompson Sampling, and personality-driven reactions.

```typescript
import { SwarmAgent } from '@cognitive-swarm/agent'

const agent = new SwarmAgent(
  orchestrator,    // CognitiveOrchestrator from @cognitive-engine
  bandit,          // ThompsonBandit from @cognitive-engine/bandit
  config,          // SwarmAgentConfig
  toolSupport?,    // AgentToolSupport (MCP tools)
)
```

Agents are created internally by `SwarmOrchestrator` from `SwarmAgentDef` objects -- you don't need to construct them directly.

## Agent Lifecycle

```
Creation → Signal Reception → Strategy Selection → Execution → Signal Emission → Feedback → Repeat
```

1. **Creation:** `SwarmOrchestrator` creates agents from `SwarmAgentDef` objects. Each gets its own `CognitiveOrchestrator`, `ThompsonBandit`, `PersonalityFilter`, and `BeliefModel`.
2. **Signal Reception:** `SignalBus` routes signals based on `listens`. Agent checks `shouldReact()`.
3. **Strategy Selection:** Thompson Sampling bandit picks optimal strategy from context vector.
4. **Execution:** `CognitiveOrchestrator` processes prompt built from signal, strategy, history, and ToM context.
5. **Signal Emission:** Response mapped to typed output signals, filtered by `canEmit`.
6. **Feedback:** After consensus, orchestrator calls `recordFeedback()` to update bandit rewards.
7. **Repeat** steps 2-6 until consensus or `maxRounds` reached.

## SwarmAgentConfig

```typescript
interface SwarmAgentConfig {
  readonly id: string
  readonly name: string
  readonly role: string                              // system prompt injected into cognitive pipeline

  readonly personality: PersonalityVector            // drives reaction behavior
  readonly listens: readonly SignalType[]             // which signals this agent processes
  readonly canEmit: readonly SignalType[]             // which signals this agent can emit

  readonly weight?: number                           // vote weight, default: 1.0
  readonly maxConcurrentSignals?: number             // default: 1
  readonly reactionDelayMs?: number                  // artificial delay, default: 0
  readonly strategyActions?: readonly AgentStrategyId[]  // which strategies bandit selects from
  readonly tools?: AgentToolConfig                   // MCP tool access
  readonly onError?: ErrorHandler
}
```

### Configuration Recommendations by Task Type

| Task Type | Key Config | Reasoning |
|-----------|-----------|-----------|
| Analysis / Research | `maxConcurrentSignals: 1`, default strategies | Sequential processing ensures thorough analysis |
| Code Review | `strategyActions: ['analyze', 'challenge', 'support']` | No synthesis needed -- each agent reviews independently |
| Decision Making | `weight: 2.0` for judge agent | Judge's synthesis carries more authority |
| Brainstorming | `reactionDelayMs: 0`, `maxConcurrentSignals: 3` | Fast, parallel idea generation |
| Safety-Critical | `strategyActions: ['analyze', 'challenge', 'defer']` | Never auto-support -- force explicit analysis |

## PersonalityVector

The personality vector drives how an agent reacts to signals. It shapes the probability distribution over strategies the Thompson Sampling bandit samples from, and also controls the `PersonalityFilter` that gates which signals the agent processes.

```typescript
interface PersonalityVector {
  readonly curiosity: number    // 0..1 - drives explore/discover behavior
  readonly caution: number      // 0..1 - drives doubt/challenge behavior
  readonly conformity: number   // 0..1 - drives agree/support behavior
  readonly verbosity: number    // 0..1 - drives signal emission volume
}
```

### How Each Dimension Affects Behavior

All four dimensions are included in the context vector passed to Thompson Sampling. They also control the `PersonalityFilter`:

| Dimension | Bandit Bias | PersonalityFilter Rule | High Value Effect | Low Value Effect |
|-----------|-------------|----------------------|-------------------|------------------|
| **Curiosity** | `analyze`, `propose` | <= 0.3: ignores `discovery` signals | Reacts to more discoveries | Narrow focus |
| **Caution** | `challenge`, `defer` | > 0.7: skips signals with confidence < 0.4 | Selective, confident-only | Engages with speculation |
| **Conformity** | `support` | >= 0.8: ignores `challenge`/`doubt` signals | Agrees, avoids dissent | Pushes back, challenges |
| **Verbosity** | signal volume | (no filter rule) | Longer, detailed responses | Concise output |

### Examples

```typescript
// A strong critic: high caution, low conformity
const critic = {
  curiosity: 0.6,
  caution: 0.9,
  conformity: 0.1,
  verbosity: 0.5,
}

// An explorer: high curiosity, low caution
const explorer = {
  curiosity: 0.95,
  caution: 0.3,
  conformity: 0.4,
  verbosity: 0.8,
}

// A consensus builder: high conformity
const synthesizer = {
  curiosity: 0.5,
  caution: 0.4,
  conformity: 0.9,
  verbosity: 0.6,
}
```

## Agent Strategies

Each agent selects a strategy per signal using a Thompson Sampling bandit. The bandit adapts over time -- strategies that produce signals influencing consensus get rewarded.

```typescript
type AgentStrategyId =
  | 'analyze'     // deep analysis of the current state
  | 'propose'     // emit a concrete proposal
  | 'challenge'   // emit a challenge to an existing proposal
  | 'support'     // emit a vote of agreement
  | 'synthesize'  // emit a synthesis of multiple signals
  | 'defer'       // abstain (useful when uncertain)
```

### All 6 Strategies Explained

**`analyze`** -- Outputs `discovery` signals. The agent examines the incoming signal and reports factual findings, patterns, or relevant information. Does not take a position -- just provides data.

**`propose`** -- Outputs `proposal` signals. The agent formulates a concrete solution, course of action, or answer. Each proposal gets a unique `proposalId` that other agents can vote on.

**`challenge`** -- Outputs `challenge` or `doubt` signals. The agent critically examines the incoming signal, identifies weaknesses, risks, or alternative interpretations. Essential for preventing groupthink.

**`support`** -- Outputs `vote` signals. The agent evaluates the incoming signal and casts a vote (agree/disagree/abstain). The vote stance is determined by the LLM response's confidence level:
- Confidence >= 0.6 -> `agree`
- Confidence <= 0.3 -> `disagree`
- Between 0.3 and 0.6 -> `abstain`

**`synthesize`** -- Outputs `proposal` signals. Similar to `propose`, but the prompt specifically asks the LLM to combine insights from multiple sources into a coherent whole. Used by synthesizer/judge agents.

**`defer`** -- No output signals. The agent abstains from responding. Useful when the agent is uncertain or when the signal is outside its expertise. No LLM call is made.

### Strategy Output Types

Each strategy maps to specific signal types:

| Strategy | Output Signal Types | Filtered by `canEmit` |
|----------|--------------------|-----------------------|
| `analyze` | `discovery` | Yes |
| `propose` | `proposal` | Yes |
| `challenge` | `challenge`, `doubt` | Yes |
| `support` | `vote` | Yes |
| `synthesize` | `proposal` | Yes |
| `defer` | (none) | N/A |

**Fallback behavior:** If a strategy's output type is not in the agent's `canEmit` list, the agent falls back to the closest allowed type: `discovery -> challenge -> doubt -> proposal -> vote`.

### Strategy Selection Mechanics: Thompson Sampling

Thompson Sampling is a Bayesian approach to the multi-armed bandit problem. Here is how it picks strategies:

1. **Context vector** is built from the incoming signal:
   ```
   [signal.confidence, curiosity, caution, conformity, verbosity, ...signalTypeOneHot]
   ```
   The one-hot encoding covers all 11 signal types (`task:new`, `discovery`, `proposal`, `doubt`, `challenge`, `vote`, `conflict`, `consensus:reached`, `escalate`, `memory:shared`, `tool:result`).

2. **Bandit samples** from its posterior distribution for each available strategy, given the context.

3. **Highest-sampled strategy wins.** Because Thompson Sampling samples randomly from posteriors, it naturally explores (tries less-proven strategies) vs exploits (picks the best-known strategy).

4. **After consensus**, the orchestrator calls `recordFeedback()` to update the bandit:
   - Strategies that led to signals incorporated in the consensus get reward ~1.0
   - Strategies that were ignored or led to rejected positions get reward ~0.0
   - Over time, the bandit learns which strategies work best for each signal type and personality combination

### Restricting Strategies

```typescript
{
  config: {
    id: 'critic',
    strategyActions: ['analyze', 'challenge', 'defer'],
    // This agent never proposes or supports - only analyzes and challenges
  }
}
```

**Common restrictions:**

| Agent Role | Recommended Strategies | Rationale |
|-----------|----------------------|-----------|
| Pure critic | `analyze`, `challenge`, `defer` | Should never agree without analysis |
| Judge/synthesizer | `synthesize`, `support`, `defer` | Should combine, not explore |
| Explorer | `analyze`, `propose` | Should generate, not evaluate |
| Voter only | `support`, `defer` | Cast votes, do not produce content |

## Belief Model (Theory of Mind)

Each agent maintains a `BeliefModel` that tracks other agents' mental states (L1 Theory of Mind). Updated from received signals.

```typescript
interface AgentBeliefState {
  readonly stances: ReadonlyMap<string, 'agree' | 'disagree' | 'abstain'>
  readonly dominantOutputTypes: readonly SignalType[]
  readonly recentConcerns: readonly string[]
  readonly avgConfidence: number
  readonly signalCount: number
}
```

### How it Works

The `BeliefModel` incrementally updates from every signal the agent receives:

1. **Stances:** When another agent emits a `vote` signal, the belief model records their stance (agree/disagree/abstain) keyed by `proposalId`.

2. **Dominant output types:** Tracks a histogram of signal types emitted by each other agent. The top 3 most frequent types are reported as `dominantOutputTypes`.

3. **Recent concerns:** Extracts text from `challenge` and `doubt` signals (last 5 per agent). These are specific worries or objections the other agent has raised.

4. **Average confidence:** Running mean of `signal.confidence` across all signals from that agent.

### Theory of Mind in Practice

The belief model generates a prompt section that is injected into the agent's LLM call:

```
OTHER AGENTS' POSITIONS (anticipate their objections, address directly):
[agent-critic] voted: 0 agree, 2 disagree | mainly: challenge | concern: "SQL injection risk in user input handling" | avg confidence: 0.72
[agent-explorer] voted: 1 agree, 0 disagree | mainly: discovery | avg confidence: 0.85
```

This enables agents to:
- Anticipate objections from known critics
- Build on discoveries from explorers
- Address specific concerns rather than talking past each other
- Adjust their approach based on the group's current state

### Capacity Limits

- Maximum 20 agents tracked per belief model (oldest evicted on overflow)
- Maximum 5 recent concerns stored per tracked agent
- Agents with fewer than 2 observed signals are excluded from the Theory of Mind prompt
- Concern text is truncated to 150 characters

## Personality Filter

The `PersonalityFilter` determines whether an agent should react to a given signal based on its personality vector. It runs before the Thompson Sampling bandit, acting as a fast pre-filter.

**Filter rules:**

| Condition | Result |
|-----------|--------|
| `caution > 0.7` AND `signal.confidence < 0.4` | Skip (too uncertain for cautious agent) |
| Signal type is `challenge` or `doubt` AND `conformity >= 0.8` | Skip (conformist ignores dissent) |
| Signal type is `discovery` AND `curiosity <= 0.3` | Skip (not curious enough) |
| Otherwise | React |

**Note:** These rules interact with each other. An agent with `caution: 0.8, conformity: 0.9, curiosity: 0.2` will ignore low-confidence signals, all challenges/doubts, AND discoveries -- effectively making it react only to high-confidence proposals and votes.

## Signal Processing Pipeline

The full pipeline when an agent receives a signal:

```
1. shouldReact(signal)
   ├── Is this signal from myself? → skip
   ├── Am I at maxConcurrentSignals? → skip
   ├── Is signal.type in my listens list? → if not, skip
   └── PersonalityFilter.shouldReact(signal) → if false, skip

2. selectStrategy(signal)
   ├── Build context vector: [confidence, curiosity, caution, conformity, verbosity, ...typeOneHot]
   ├── Filter available strategies to config.strategyActions
   └── Thompson Sampling bandit.select(context, actions) → strategy

3. executeStrategy(signal, strategy)
   ├── If strategy === 'defer' → return []
   ├── Build prompt from role + history + ToM + signal + strategy
   ├── If tools configured → tool loop (up to maxToolCalls iterations)
   └── CognitiveOrchestrator.process(agentId, prompt) → CognitiveResponse

4. buildOutputSignals(signal, strategy, response)
   ├── Map strategy → allowed output signal types
   ├── Filter by canEmit (with fallback to closest allowed type)
   ├── Build typed payload (discovery/proposal/challenge/doubt/vote)
   ├── Infer causal level (correlation/intervention/counterfactual)
   └── Return Signal[]
```

### Causal Level Inference

Each output signal is tagged with a causal reasoning level based on Pearl's Ladder of Causation:

| Strategy / Output | Causal Level | Meaning |
|-------------------|-------------|---------|
| `analyze`, `support` | `correlation` | "We observe X correlating with Y" |
| `propose`, `synthesize` | `intervention` | "If we do X, then Y" |
| `challenge`, `doubt` | `counterfactual` | "What if this assumption is wrong?" |

This metadata can be used by downstream systems (e.g., evolution, composer) to assess the depth of reasoning.

## Tool Support

Agents can use external tools via MCP (Model Context Protocol):

```typescript
interface AgentToolConfig {
  readonly servers: readonly McpServerConfig[]
  readonly maxToolCalls?: number        // default: 3 per reaction
  readonly toolTimeoutMs?: number       // default: 30_000
  readonly personalityGating?: boolean  // high-caution agents use tools more conservatively
}
```

Tool calls loop: prompt with tools -> LLM response -> parse tool calls -> execute -> emit `tool:result` signals -> follow-up prompt with results -> repeat until no more calls or `maxToolCalls` exhausted.

Tool results are broadcast as `tool:result` signals visible to all agents.

```typescript
agentDef({
  id: 'researcher',
  name: 'Web Researcher',
  role: 'Search the web for relevant information to verify claims',
  personality: 'analytical',
  listens: ['task:new', 'proposal'],
  canEmit: ['discovery', 'vote'],
  tools: {
    servers: [{ uri: 'http://localhost:3001/mcp', name: 'web-search' }],
    maxToolCalls: 3,
    toolTimeoutMs: 15_000,
  },
}, { engine })
```

## Concurrency Handling

Agents process signals sequentially by default (`maxConcurrentSignals: 1`). This prevents race conditions in the belief model and signal history.

If you increase `maxConcurrentSignals`, be aware:
- Multiple signals may be processed simultaneously
- The belief model updates are not atomic (but are append-only, so this is safe)
- Signal history may interleave (order is preserved per-signal but not across concurrent signals)
- The `activeTasks` counter gates concurrency -- if at capacity, `shouldReact()` returns false

```typescript
// Sequential (default, safest)
{ maxConcurrentSignals: 1 }

// Parallel processing (for high-throughput scenarios)
{ maxConcurrentSignals: 3 }
```

## Cross-Round Context

Agents maintain a signal history (last 20 signals, self-signals excluded) that provides context across rounds. The prompt includes summaries of what other agents said, enabling agents to build on discoveries, reference specific prior claims, and avoid duplicate analysis.

## AgentReaction

The result of an agent processing a signal:

```typescript
interface AgentReaction {
  readonly agentId: string
  readonly inResponseTo: string       // signal ID that triggered this reaction
  readonly signals: readonly Signal[] // signals emitted in response
  readonly strategyUsed: AgentStrategyId
  readonly processingTimeMs: number
}
```

**On error:** If the cognitive pipeline throws, the agent catches the error, calls `onError`, and returns an empty reaction with `strategyUsed: 'defer'` and `signals: []`. The swarm continues without this agent's contribution for that round.

## AgentContribution

Tracked across a full solve:

```typescript
interface AgentContribution {
  readonly agentId: string
  readonly signalsEmitted: number
  readonly proposalsMade: number
  readonly challengesMade: number
  readonly votesCast: number
  readonly avgConfidence: number
}
```

Available in `SwarmResult.agentContributions`.

## Debug Traces

Use `SwarmResult.agentContributions` and `@cognitive-swarm/introspection` to understand agent decisions:

**Common patterns to look for:**
- Agent with 0 signals emitted: check `listens`, `canEmit`, and personality filter thresholds
- Agent always defers: bandit has not learned useful strategies yet
- Agent challenges everything: caution too high or conformity too low
- Agent agrees with everything: conformity too high (>= 0.8 blocks challenges)

## Example: Creating a Specialized Expert Agent

```typescript
import { agentDef } from '@cognitive-swarm/templates'

// A security expert that only analyzes and challenges, never proposes
const securityExpert = agentDef({
  id: 'security-expert',
  name: 'Security Expert',
  role: 'Identify security vulnerabilities, OWASP Top 10, injection risks, auth bypass, data exposure. Never approve code with unvalidated input.',
  personality: {
    curiosity: 0.5,    // moderately interested in discoveries
    caution: 0.85,     // very cautious -- skips low-confidence signals
    conformity: 0.15,  // very non-conformist -- always challenges
    verbosity: 0.6,    // detailed but not excessive
  },
  listens: ['task:new', 'proposal', 'discovery'],
  canEmit: ['challenge', 'doubt', 'discovery', 'vote'],
  weight: 1.5,  // security concerns get extra weight
  strategyActions: ['analyze', 'challenge', 'defer'],  // never proposes or supports
}, { engine })
```

**Why these choices:**
- `caution: 0.85` -- above the 0.7 threshold, so it ignores uncertain signals. A security reviewer should only comment on things it is confident about.
- `conformity: 0.15` -- well below 0.8, so it engages with challenges and doubts from other agents.
- `strategyActions` excludes `propose` and `support` -- this agent should only find problems, not suggest fixes (leave that to the fixer agent).
- `weight: 1.5` -- security issues should weigh more heavily in consensus.
