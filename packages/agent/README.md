# @cognitive-swarm/agent

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/agent)](https://www.npmjs.com/package/@cognitive-swarm/agent)

LLM-powered swarm agents with Thompson Sampling strategy selection and Theory of Mind.

## Install

```bash
npm install @cognitive-swarm/agent
```

## Overview

Each agent wraps a `CognitiveOrchestrator` (perception, memory, emotions, reasoning, metacognition) and adds swarm behavior: signal routing, strategy selection via Thompson Sampling, personality-driven reactions, and belief tracking of other agents.

Agents are created internally by `SwarmOrchestrator` from `SwarmAgentDef` objects -- you don't construct them directly.

## Quick Start

```typescript
import { agentDef } from '@cognitive-swarm/templates'

const securityExpert = agentDef({
  id: 'security-expert',
  name: 'Security Expert',
  role: 'Identify security vulnerabilities, OWASP Top 10, injection risks.',
  personality: {
    curiosity: 0.5,
    caution: 0.85,
    conformity: 0.15,
    verbosity: 0.6,
  },
  listens: ['task:new', 'proposal', 'discovery'],
  canEmit: ['challenge', 'doubt', 'discovery', 'vote'],
  weight: 1.5,
  strategyActions: ['analyze', 'challenge', 'defer'],
}, { engine })
```

## Agent Lifecycle

```
Creation -> Signal Reception -> Strategy Selection -> Execution -> Signal Emission -> Feedback -> Repeat
```

1. **Signal Reception** -- SignalBus routes signals based on `listens`
2. **Personality Filter** -- pre-filters signals based on personality thresholds
3. **Strategy Selection** -- Thompson Sampling bandit picks optimal strategy
4. **Execution** -- CognitiveOrchestrator processes prompt with signal, strategy, history, and ToM context
5. **Signal Emission** -- response mapped to typed output signals, filtered by `canEmit`
6. **Feedback** -- after consensus, bandit rewards are updated

## PersonalityVector

```typescript
interface PersonalityVector {
  readonly curiosity: number    // 0..1 - drives explore/discover
  readonly caution: number      // 0..1 - drives doubt/challenge
  readonly conformity: number   // 0..1 - drives agree/support
  readonly verbosity: number    // 0..1 - signal emission volume
}
```

### Personality Filter Rules

| Condition | Result |
|-----------|--------|
| `caution > 0.7` AND `signal.confidence < 0.4` | Skip |
| `conformity >= 0.8` AND signal is `challenge`/`doubt` | Skip |
| `curiosity <= 0.3` AND signal is `discovery` | Skip |

## Agent Strategies

Six strategies available, selected per-signal via Thompson Sampling:

| Strategy | Output | Description |
|----------|--------|-------------|
| `analyze` | `discovery` | Deep analysis, reports findings |
| `propose` | `proposal` | Formulates concrete solution |
| `challenge` | `challenge`, `doubt` | Critically examines, identifies weaknesses |
| `support` | `vote` | Evaluates and casts vote |
| `synthesize` | `proposal` | Combines insights from multiple sources |
| `defer` | (none) | Abstains, no LLM call |

### Restricting Strategies

| Agent Role | Recommended Strategies |
|-----------|----------------------|
| Pure critic | `analyze`, `challenge`, `defer` |
| Judge/synthesizer | `synthesize`, `support`, `defer` |
| Explorer | `analyze`, `propose` |
| Voter only | `support`, `defer` |

## Belief Model (Theory of Mind)

Each agent tracks other agents' mental states (L1 ToM), injected into the LLM prompt:

```
OTHER AGENTS' POSITIONS:
[agent-critic] voted: 0 agree, 2 disagree | mainly: challenge | concern: "SQL injection risk" | avg confidence: 0.72
[agent-explorer] voted: 1 agree, 0 disagree | mainly: discovery | avg confidence: 0.85
```

Limits: max 20 tracked agents, 5 concerns per agent, 150 char concern truncation.

## Tool Support

Agents can use external tools via MCP:

```typescript
{
  config: {
    tools: {
      servers: [{ uri: 'http://localhost:3001/mcp', name: 'web-search' }],
      maxToolCalls: 3,
      toolTimeoutMs: 15_000,
      personalityGating: true,
    },
  },
}
```

Tool results are broadcast as `tool:result` signals visible to all agents.

## Configuration

```typescript
interface SwarmAgentConfig {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly personality: PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly weight?: number                    // default: 1.0
  readonly maxConcurrentSignals?: number      // default: 1
  readonly reactionDelayMs?: number           // default: 0
  readonly strategyActions?: readonly AgentStrategyId[]
  readonly tools?: AgentToolConfig
}
```

## AgentReaction

```typescript
interface AgentReaction {
  readonly agentId: string
  readonly inResponseTo: string
  readonly signals: readonly Signal[]
  readonly strategyUsed: AgentStrategyId
  readonly processingTimeMs: number
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/agent) | [GitHub](https://github.com/medonomator/cognitive-swarm)
