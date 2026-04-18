# cognitive-swarm

**Swarm intelligence for LLM agents.** Not a pipeline. Not a chat loop. A signal-based swarm with formal consensus, 28 mathematical modules, and emergent behavior.

[![CI](https://github.com/medonomator/cognitive-swarm/actions/workflows/ci.yml/badge.svg)](https://github.com/medonomator/cognitive-swarm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@cognitive-swarm/orchestrator.svg)](https://www.npmjs.com/package/@cognitive-swarm/orchestrator)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Docs](https://img.shields.io/badge/docs-website-blue.svg)](https://medonomator.github.io/cognitive-swarm/)

## Quick Start

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const swarm = new SwarmOrchestrator({
  agents: createAgents(llmProvider),
  maxRounds: 5,
  consensus: { strategy: 'confidence-weighted', threshold: 0.7 },
  // Production-ready resilience
  tokenBudget: 10_000,
  retry: { maxRetries: 2, baseDelayMs: 500, circuitBreakerThreshold: 3 },
})

const result = await swarm.solve('Should we use microservices or a monolith?')

console.log(result.answer)       // Synthesized answer from all agents
console.log(result.confidence)   // 0.87
console.log(result.consensus)    // Full voting record, dissent preserved
console.log(result.cost)         // { tokens: 4200, estimatedUsd: 0.0063 }
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
| [`@cognitive-swarm/core`](packages/core) | Types, interfaces, and event system |
| [`@cognitive-swarm/signals`](packages/signals) | Signal Bus — the nervous system |
| [`@cognitive-swarm/agent`](packages/agent) | LLM-powered swarm agents with Thompson Bandit |
| [`@cognitive-swarm/consensus`](packages/consensus) | 5 consensus strategies |
| [`@cognitive-swarm/orchestrator`](packages/orchestrator) | SwarmOrchestrator — the main entry point |
| [`@cognitive-swarm/math`](packages/math) | 28 mathematical modules (see below) |
| [`@cognitive-swarm/memory-pool`](packages/memory-pool) | In-memory shared knowledge |
| [`@cognitive-swarm/memory-qdrant`](packages/memory-qdrant) | Persistent vector memory (Qdrant) |
| [`@cognitive-swarm/reputation`](packages/reputation) | Agent reliability tracking |
| [`@cognitive-swarm/introspection`](packages/introspection) | Deadlock detection, echo chamber detection |
| [`@cognitive-swarm/composer`](packages/composer) | Dynamic swarm composition |
| [`@cognitive-swarm/templates`](packages/templates) | Pre-built swarm configs (research, code review, debug, decision) |
| [`@cognitive-swarm/evolution`](packages/evolution) | Self-evolving swarm — agents spawn agents |
| [`@cognitive-swarm/evaluation`](packages/evaluation) | Outcome evaluation and grounding |
| [`@cognitive-swarm/benchmarks`](packages/benchmarks) | Performance benchmarking harness |
| [`@cognitive-swarm/mcp`](packages/mcp) | Model Context Protocol tool integration |
| [`@cognitive-swarm/otel`](packages/otel) | OpenTelemetry distributed tracing (20 event types) |
| [`@cognitive-swarm/a2a`](packages/a2a) | A2A protocol — interop with any agent framework |
| [`@cognitive-swarm/tools-web-fetch`](packages/tools-web-fetch) | Web fetch & scrape MCP server |
| [`@cognitive-swarm/tools-web-search`](packages/tools-web-search) | Web search MCP server (Brave Search) |

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
const swarm = new SwarmOrchestrator({
  agents,
  // Retry with exponential backoff + circuit breaker
  retry: {
    maxRetries: 3,
    baseDelayMs: 500,        // Exponential: 500ms → 1s → 2s (±20% jitter)
    circuitBreakerThreshold: 5, // Opens after 5 consecutive failures, 30s cooldown
  },
  // Token budget — hard limit across all agents
  tokenBudget: 50_000,
  // Checkpoint — resume interrupted solves
  checkpoint: new FileCheckpointStorage('./checkpoints'),
})

// Resume from where it left off after a crash
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
for await (const event of swarm.solveWithStream('Analyze this codebase')) {
  switch (event.type) {
    case 'solve:start':       // Task begins
    case 'round:start':       // New deliberation round
    case 'signal:emitted':    // Agent emitted a signal
    case 'agent:reacted':     // Agent processed signals
    case 'consensus:check':   // Consensus evaluation
    case 'math:round-analysis': // Math bridge results (entropy, surprise, etc.)
    case 'advisor:action':    // Swarm advisor intervention
    case 'synthesis:complete': // Final answer synthesized
    case 'solve:complete':    // Full result with costs and timing
  }
}
```

## A2A Protocol (Agent-to-Agent)

Expose any cognitive-swarm as a standard [A2A](https://google.github.io/A2A/) agent. Any framework (CrewAI, AutoGen, LangChain) can call it via HTTP.

```typescript
import { createA2AHandler, createA2AServer } from '@cognitive-swarm/a2a'

const handler = createA2AHandler({
  name: 'Research Swarm',
  description: 'Multi-agent deliberation for complex analysis',
  url: 'http://localhost:4000',
  skills: [{ id: 'analyze', name: 'Analysis', description: 'Deep analysis' }],
  orchestratorFactory: { create: () => new SwarmOrchestrator(config) },
})

const server = createA2AServer(handler, { port: 4000 })
await server.start()
// GET  http://localhost:4000/health                       → { status: 'ok' }
// GET  http://localhost:4000/.well-known/agent-card.json  → Agent Card
// POST http://localhost:4000                              → JSON-RPC (tasks/send, tasks/sendSubscribe)
```

Features: 1MB body limit, graceful shutdown with connection tracking, health endpoint.

## MCP (Model Context Protocol)

Give swarm agents access to external tools via [MCP](https://modelcontextprotocol.io/):

```typescript
import { McpToolRegistry, McpToolExecutor } from '@cognitive-swarm/mcp'

const registry = new McpToolRegistry()
await registry.connect({
  name: 'github',
  transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
})

// Agents can now call GitHub tools (search repos, read files, create PRs)
// Tools execute in parallel via Promise.all
```

## OpenTelemetry

Zero-overhead when no provider is configured. Full span hierarchy with 20 event types when enabled.

```typescript
import { instrumentSwarm } from '@cognitive-swarm/otel'

const instrumented = instrumentSwarm(orchestrator)
const result = await instrumented.solve('task')
// Traces: solve → round → agent/debate → consensus → math → synthesis
// All 20 events produce spans: topology changes, signal delivery, votes, conflicts...
```

## Pre-built Templates

```typescript
import { researchTemplate, codeReviewTemplate, decisionTemplate, debugTemplate } from '@cognitive-swarm/templates'

const research   = researchTemplate({ engine })    // 5 agents: explorer, analyst, critic, synthesizer, fact-checker
const codeReview = codeReviewTemplate({ engine })   // Security, perf, arch, bugs, tests
const decision   = decisionTemplate({ engine })     // Pros, cons, risk, precedent, devil's advocate, judge
const debug      = debugTemplate({ engine })        // 7 agents: reproducer, tracer, hypothesizer, ...
```

## Self-Evolving Swarm

Agents detect gaps in collective expertise and vote to spawn new specialists. No other framework has this.

```
Day 1:  5 agents → basic analysis
Day 12: anomaly-detector can't diagnose Docker issues
        → gap:detected → swarm votes → spawns docker-specialist
Day 25: docker-specialist caught 3 real issues → PERMANENT
Day 40: DNS issue → spawns network-analyst (temporary) → dissolved after 2 days
Month 3: Swarm grew from 5 → 8 agents, all self-created
```

## Examples

```bash
# Research: multi-agent analysis with 5 specialized agents
OPENAI_API_KEY=sk-... npx tsx examples/research/index.ts

# Decision: structured deliberation with 6 agents + devil's advocate
OPENAI_API_KEY=sk-... npx tsx examples/decision/index.ts

# Debug: 7 agents collaboratively diagnose issues
OPENAI_API_KEY=sk-... npx tsx examples/debug/index.ts

# Streaming: real-time events + OTel + token budget + retry
OPENAI_API_KEY=sk-... npx tsx examples/streaming/index.ts
```

## Cost Efficiency

Running a 5-agent swarm with GPT-4o-mini costs **~$0.003–0.01 per solve** (3–5 rounds, ~2K–5K tokens). The math layer adds negligible overhead — it's pure TypeScript computation, no LLM calls.

```
5 agents × 3 rounds × GPT-4o-mini = ~$0.006
Math analysis (28 modules):          ~$0.000 (CPU only)
Synthesis (1 LLM call):              ~$0.001
                              Total: ~$0.007
```

Scale to Opus 4.6 for enterprise: ~$0.50–1.00 per complex analysis.

## Development

```bash
npm install        # Install all dependencies
npm run build      # Build all 20 packages
npm run test       # Run tests across all packages
npm run lint       # Lint all packages
```

Requires Node.js >= 20. Monorepo managed by Turborepo.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guide.

## License

[Apache-2.0](LICENSE)
