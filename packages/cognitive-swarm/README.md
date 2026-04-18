# cognitive-swarm

**Swarm intelligence for LLM agents.** Not a pipeline. Not a chat loop. A signal-based swarm with formal consensus, 28 mathematical modules, and emergent behavior.

[![npm](https://img.shields.io/npm/v/cognitive-swarm)](https://www.npmjs.com/package/cognitive-swarm)
[![CI](https://github.com/medonomator/cognitive-swarm/actions/workflows/ci.yml/badge.svg)](https://github.com/medonomator/cognitive-swarm/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/medonomator/cognitive-swarm/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Docs](https://img.shields.io/badge/docs-website-blue.svg)](https://medonomator.github.io/cognitive-swarm/)

## Install

```bash
npm install cognitive-swarm
```

This umbrella package installs and re-exports everything. You can also install individual packages if you only need specific functionality:

```bash
npm install @cognitive-swarm/math          # 28 math modules (standalone, no LLM dependency)
npm install @cognitive-swarm/orchestrator   # SwarmOrchestrator only
npm install @cognitive-swarm/signals        # Signal Bus only
```

## Quick Start

```typescript
import { SwarmOrchestrator, researchTemplate } from 'cognitive-swarm'

const swarm = new SwarmOrchestrator({
  ...researchTemplate({ engine }),
  maxRounds: 5,
  consensus: { strategy: 'confidence-weighted', threshold: 0.7 },
  tokenBudget: 10_000,
  retry: { maxRetries: 2, baseDelayMs: 500, circuitBreakerThreshold: 3 },
})

const result = await swarm.solve('Should we use microservices or a monolith?')

console.log(result.answer)       // Synthesized answer from all agents
console.log(result.confidence)   // 0.87
console.log(result.consensus)    // Full voting record, dissent preserved
console.log(result.cost)         // { tokens, estimatedUsd }
console.log(result.timing)       // { totalMs: 4200, roundsUsed: 3 }
```

## Why cognitive-swarm?

| | CrewAI | AutoGen | LangGraph | **cognitive-swarm** |
|---|---|---|---|---|
| **Paradigm** | Role-based crews | Chat loops | State graphs | Signal-based swarm |
| **Communication** | Sequential handoff | Direct messages | Edge transitions | Typed signals on shared bus |
| **Consensus** | Last agent wins | Discussion until timeout | Explicit routing | 5 strategies with confidence scoring |
| **Conflict resolution** | None | None | Manual branching | Structured debate + mathematical resolution |
| **Self-correction** | None | Human-in-the-loop | Conditional edges | Metacognition + devil's advocate (emergent) |
| **When to stop** | Fixed steps | Token limit | End node | Free energy + entropy — math decides |
| **Learning** | None | None | None | Thompson Sampling adapts strategy per context |
| **Math verification** | None | None | None | 28 modules: Bayesian, causal, game theory, ... |
| **Resilience** | None | Basic retry | None | Retry + circuit breaker + token budget + checkpoints |
| **Observability** | Logs | Logs | LangSmith | OpenTelemetry (20 span types) |
| **Interoperability** | Custom | Custom | Custom | A2A + MCP protocols |

### The Key Insight

In existing frameworks, agents follow a script. In cognitive-swarm, agents **react to signals** — discoveries, doubts, proposals, challenges, votes. Behavior emerges from interaction, not orchestration.

A devil's advocate doesn't exist because you created a "critic agent." It emerges because game theory makes challenging suspicious consensus **mathematically optimal**.

## Architecture

```
                         Signal Bus
        ┌────────────────────────────────────────┐
        │  discovery, proposal, doubt, challenge, │
        │  vote, conflict, consensus, escalate    │
        └──┬───────┬───────┬───────┬───────┬─────┘
           │       │       │       │       │
        ┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐
        │Agent│ │Agent│ │Agent│ │Agent│ │Agent│
        │  1  │ │  2  │ │  3  │ │  4  │ │  5  │
        └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
           │       │       │       │       │
     ┌─────▼───────▼───────▼───────▼───────▼─────┐
     │              Math Bridge (28 modules)       │
     │  entropy │ bayesian │ game-theory │ causal  │
     │  surprise │ free-energy │ fisher │ regret   │
     │  shapley │ markov │ pso │ topology │ ...    │
     └────────────────────┬──────────────────────-─┘
                          │
     ┌────────────────────▼────────────────────────┐
     │              Consensus Engine                │
     │  confidence-weighted │ supermajority │       │
     │  hierarchical │ Bayesian │ entropy-based     │
     └────────────────────┬────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │ Synthesis │ → SwarmResult
                    └───────────┘
```

Each agent has a full cognitive pipeline (via [cognitive-engine](https://github.com/medonomator/cognitive-engine)): perception, memory, emotions, reasoning, and metacognition. Not just an LLM with a system prompt.

## Packages

| Package | Description |
|---------|-------------|
| [`@cognitive-swarm/core`](https://www.npmjs.com/package/@cognitive-swarm/core) | Types, interfaces, and event system |
| [`@cognitive-swarm/signals`](https://www.npmjs.com/package/@cognitive-swarm/signals) | Signal Bus — the nervous system |
| [`@cognitive-swarm/agent`](https://www.npmjs.com/package/@cognitive-swarm/agent) | LLM-powered swarm agents with Thompson Bandit |
| [`@cognitive-swarm/consensus`](https://www.npmjs.com/package/@cognitive-swarm/consensus) | 5 consensus strategies |
| [`@cognitive-swarm/orchestrator`](https://www.npmjs.com/package/@cognitive-swarm/orchestrator) | SwarmOrchestrator — the main entry point |
| [`@cognitive-swarm/math`](https://www.npmjs.com/package/@cognitive-swarm/math) | 28 mathematical modules (see below) |
| [`@cognitive-swarm/memory-pool`](https://www.npmjs.com/package/@cognitive-swarm/memory-pool) | In-memory shared knowledge |
| [`@cognitive-swarm/memory-qdrant`](https://www.npmjs.com/package/@cognitive-swarm/memory-qdrant) | Persistent vector memory (Qdrant) |
| [`@cognitive-swarm/reputation`](https://www.npmjs.com/package/@cognitive-swarm/reputation) | Agent reliability tracking |
| [`@cognitive-swarm/introspection`](https://www.npmjs.com/package/@cognitive-swarm/introspection) | Deadlock detection, echo chamber detection |
| [`@cognitive-swarm/composer`](https://www.npmjs.com/package/@cognitive-swarm/composer) | Dynamic swarm composition |
| [`@cognitive-swarm/templates`](https://www.npmjs.com/package/@cognitive-swarm/templates) | Pre-built swarm configs (research, code review, debug, decision) |
| [`@cognitive-swarm/evolution`](https://www.npmjs.com/package/@cognitive-swarm/evolution) | Self-evolving swarm — agents spawn agents |
| [`@cognitive-swarm/evaluation`](https://www.npmjs.com/package/@cognitive-swarm/evaluation) | Outcome evaluation and grounding |
| [`@cognitive-swarm/mcp`](https://www.npmjs.com/package/@cognitive-swarm/mcp) | Model Context Protocol tool integration |
| [`@cognitive-swarm/otel`](https://www.npmjs.com/package/@cognitive-swarm/otel) | OpenTelemetry distributed tracing (20 event types) |
| [`@cognitive-swarm/a2a`](https://www.npmjs.com/package/@cognitive-swarm/a2a) | A2A protocol — interop with any agent framework |
| [`@cognitive-swarm/tools-web-fetch`](https://www.npmjs.com/package/@cognitive-swarm/tools-web-fetch) | Web fetch & scrape MCP server |
| [`@cognitive-swarm/tools-web-search`](https://www.npmjs.com/package/@cognitive-swarm/tools-web-search) | Web search MCP server (Brave Search) |

## Mathematical Foundation

Not prompt engineering. **28 computational mathematics modules** with LLMs as components.

### Information Theory
| Module | What it does |
|--------|-------------|
| **Shannon Entropy** | Measures remaining uncertainty — swarm stops when entropy is low, not after N rounds |
| **Mutual Information** | Detects echo chambers, prunes redundant agents, amplifies unique perspectives |
| **Fisher Information** | Measures learning efficiency — are agents still gaining useful signal, or spinning wheels? |
| **Bayesian Surprise** | KL-divergence between prior and posterior — flags unexpectedly important discoveries |

### Probabilistic Reasoning
| Module | What it does |
|--------|-------------|
| **Bayesian Inference** | Agents update beliefs on evidence; different priors create genuine diversity |
| **Free Energy Principle** | Variational free energy + active inference — tells agents what to explore next |
| **Causal Inference** | Pearl's do-calculus — separates causation from correlation, supports counterfactuals |

### Game Theory & Decision
| Module | What it does |
|--------|-------------|
| **Nash Equilibrium** | Makes challenging suspicious consensus mathematically optimal (devil's advocate) |
| **Shapley Values** | Fair attribution — which agent's contribution actually mattered for the answer? |
| **Regret Minimization** | UCB1 + Thompson Sampling with provable O(√T log T) regret bounds |
| **Optimal Stopping** | CUSUM + secretary problem — when to commit vs. keep exploring |

### Dynamics & Optimization
| Module | What it does |
|--------|-------------|
| **Markov Chains** | Predicts convergence time, detects stuck loops, estimates total cost |
| **Particle Swarm (PSO)** | Agents explore solution space following proven swarm optimization algorithms |
| **Replicator Dynamics** | Evolutionary strategy balancing — strategies that work get reinforced |
| **Opinion Dynamics** | Hegselmann-Krause model — simulates how agent opinions cluster and polarize |
| **Phase Transition** | Self-organized criticality — detects when the swarm is at a critical "tipping point" |

### Geometry & Topology
| Module | What it does |
|--------|-------------|
| **Topological Data Analysis** | Finds gaps in explored solution space, directs agents to unexplored regions |
| **Optimal Transport** | Wasserstein distance between belief distributions — measures how far agents diverge |

### How Math Controls the Swarm

The Math Bridge runs after every round, producing control signals:

```
Round N complete → Math Bridge analyzes all signals
  │
  ├── Entropy < threshold?          → STOP (converged)
  ├── Free energy decreasing?       → CONTINUE (still learning)
  ├── Surprise spike detected?      → AMPLIFY that signal
  ├── Echo chamber (high MI)?       → INJECT challenger agent
  ├── Fisher information ≈ 0?       → STOP (no more learning possible)
  ├── Phase transition detected?    → ALERT (swarm is reorganizing)
  ├── Regret bound exceeded?        → SWITCH strategy
  └── Wasserstein distance high?    → agents haven't converged yet
```

## Resilience

Production-ready with built-in fault tolerance:

```typescript
import { SwarmOrchestrator, FileCheckpointStorage } from 'cognitive-swarm'

const swarm = new SwarmOrchestrator({
  agents,
  retry: {
    maxRetries: 3,
    baseDelayMs: 500,
    circuitBreakerThreshold: 5,
  },
  tokenBudget: 50_000,
  checkpoint: new FileCheckpointStorage('./checkpoints'),
})

const result = await swarm.solveResumable('complex task', 'checkpoint-id')
```

## 7-Layer Memory Architecture

```
┌─────────────────────────────────────────┐
│  Layer 1: Working Memory (per-round)     │  Signal bus — ephemeral, this round only
├─────────────────────────────────────────┤
│  Layer 2: Agent Episodic Memory          │  Each agent's own reasoning history
├─────────────────────────────────────────┤
│  Layer 3: Signal History                 │  Complete signal log across all rounds
├─────────────────────────────────────────┤
│  Layer 4: Shared Memory Pool             │  In-memory facts shared between agents
├─────────────────────────────────────────┤
│  Layer 5: Vector Memory (Qdrant)         │  Persistent semantic search across sessions
├─────────────────────────────────────────┤
│  Layer 6: Bandit Memory                  │  Thompson Sampling — which strategy works where
├─────────────────────────────────────────┤
│  Layer 7: Reputation Memory              │  Agent reliability scores, trust history
└─────────────────────────────────────────┘
```

Layers 1–3 are ephemeral. Layers 4–7 persist across sessions, enabling the swarm to get smarter over time.

## Streaming

Real-time event stream with 20 event types:

```typescript
import { SwarmOrchestrator } from 'cognitive-swarm'

for await (const event of swarm.solveWithStream('Analyze this codebase')) {
  switch (event.type) {
    case 'solve:start':         // Task begins
    case 'round:start':         // New deliberation round
    case 'signal:emitted':      // Agent emitted a signal
    case 'agent:reacted':       // Agent processed signals
    case 'consensus:check':     // Consensus evaluation
    case 'math:round-analysis': // Math bridge results
    case 'advisor:action':      // Swarm advisor intervention
    case 'synthesis:complete':  // Final answer synthesized
    case 'solve:complete':      // Full result with costs and timing
  }
}
```

## A2A Protocol (Agent-to-Agent)

Expose any cognitive-swarm as a standard [A2A](https://google.github.io/A2A/) agent:

```typescript
import { createA2AHandler, createA2AServer, SwarmOrchestrator } from 'cognitive-swarm'

const handler = createA2AHandler({
  name: 'Research Swarm',
  description: 'Multi-agent deliberation for complex analysis',
  url: 'http://localhost:4000',
  skills: [{ id: 'analyze', name: 'Analysis', description: 'Deep analysis' }],
  orchestratorFactory: { create: () => new SwarmOrchestrator(config) },
})

const server = createA2AServer(handler, { port: 4000 })
await server.start()
```

## MCP (Model Context Protocol)

Give swarm agents access to external tools via [MCP](https://modelcontextprotocol.io/):

```typescript
import { McpToolRegistry } from 'cognitive-swarm'

const registry = new McpToolRegistry()
await registry.connect({
  name: 'github',
  transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
})
```

## OpenTelemetry

```typescript
import { instrumentSwarm } from 'cognitive-swarm'

const instrumented = instrumentSwarm(orchestrator)
const result = await instrumented.solve('task')
```

## Pre-built Templates

```typescript
import { researchTemplate, codeReviewTemplate, decisionTemplate, debugTemplate } from 'cognitive-swarm'

const research   = researchTemplate({ engine })    // 5 agents
const codeReview = codeReviewTemplate({ engine })   // Security, perf, arch, bugs, tests
const decision   = decisionTemplate({ engine })     // Pros, cons, risk, devil's advocate, judge
const debug      = debugTemplate({ engine })        // 7 agents: reproducer, tracer, hypothesizer, ...
```

## Self-Evolving Swarm

Agents detect gaps in collective expertise and vote to spawn new specialists:

```
Day 1:  5 agents → basic analysis
Day 12: anomaly-detector can't diagnose Docker issues
        → gap:detected → swarm votes → spawns docker-specialist
Day 25: docker-specialist caught 3 real issues → PERMANENT
Month 3: Swarm grew from 5 → 8 agents, all self-created
```

## Cost Tracking

Every `SwarmResult` includes detailed cost information:

```typescript
const result = await swarm.solve('task')
console.log(result.cost.tokens)       // Total tokens used across all agents
console.log(result.cost.estimatedUsd) // Estimated cost based on model pricing
console.log(result.timing.totalMs)    // Total wall-clock time
console.log(result.timing.roundsUsed) // Rounds until consensus
```

The math layer (28 modules) adds zero LLM cost — it's pure TypeScript computation, no API calls. Cost per token is configurable via `SwarmConfig.costPerToken`.

## Documentation

- [Full Documentation](https://medonomator.github.io/cognitive-swarm/)
- [Getting Started](https://medonomator.github.io/cognitive-swarm/guide/getting-started)
- [Architecture](https://medonomator.github.io/cognitive-swarm/guide/architecture)
- [GitHub](https://github.com/medonomator/cognitive-swarm)

## License

[Apache-2.0](https://github.com/medonomator/cognitive-swarm/blob/main/LICENSE)
