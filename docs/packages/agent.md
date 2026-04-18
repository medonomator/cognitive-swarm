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
  readonly maxConcurrentSignals?: number             // default: 10
  readonly reactionDelayMs?: number                  // artificial delay, default: 0
  readonly strategyActions?: readonly AgentStrategyId[]  // which strategies bandit selects from
  readonly tools?: AgentToolConfig                   // MCP tool access
  readonly onError?: ErrorHandler
}
```

## PersonalityVector

The personality vector drives how an agent reacts to signals. It shapes the probability distribution over strategies the Thompson Sampling bandit samples from.

```typescript
interface PersonalityVector {
  readonly curiosity: number    // 0..1 - drives explore/discover behavior
  readonly caution: number      // 0..1 - drives doubt/challenge behavior
  readonly conformity: number   // 0..1 - drives agree/support behavior
  readonly verbosity: number    // 0..1 - drives signal emission volume
}
```

Examples:

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

Restrict which strategies an agent can use:

```typescript
{
  config: {
    id: 'critic',
    strategyActions: ['analyze', 'challenge', 'defer'],
    // This agent never proposes or supports - only analyzes and challenges
  }
}
```

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

The belief model generates a prompt section describing other agents' positions, helping agents anticipate objections and address them directly.

## Personality Filter

The `PersonalityFilter` determines whether an agent should react to a given signal based on its personality vector. High-caution agents are more likely to react to proposals (to challenge them), while high-conformity agents are more likely to support.

## Tool Support

Agents can use external tools via MCP:

```typescript
interface AgentToolConfig {
  readonly servers: readonly McpServerConfig[]
  readonly maxToolCalls?: number        // default: 5 per reaction
  readonly toolTimeoutMs?: number       // default: 10_000
  readonly personalityGating?: boolean  // high-caution agents use tools more conservatively
}
```

Tool results are emitted as `tool:result` signals on the bus, visible to all agents.

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
