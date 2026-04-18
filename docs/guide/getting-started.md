# Getting Started

## Installation

```bash
npm install @cognitive-swarm/orchestrator
```

This pulls in all required packages: `@cognitive-swarm/core`, `@cognitive-swarm/signals`, `@cognitive-swarm/consensus`, `@cognitive-swarm/agent`, `@cognitive-swarm/math`.

Or install individual packages for custom setups:

```bash
npm install @cognitive-swarm/core @cognitive-swarm/signals @cognitive-swarm/consensus
```

## Requirements

- Node.js >= 20
- TypeScript >= 5.0 (recommended, not required)
- An LLM provider (OpenAI is used in examples)

## Complete Working Example

Copy-paste this and run it:

```typescript
// solve.ts
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { OpenAiLlmProvider } from '@cognitive-engine/provider-openai'
import { MemoryStore } from '@cognitive-engine/store-memory'

// 1. Create the LLM provider and engine config
const llm = new OpenAiLlmProvider({
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
})
const engine = { llm, embedding: null, store: new MemoryStore() }

// 2. Define agents
const agents = [
  {
    config: {
      id: 'analyst',
      name: 'Analyst',
      role: 'Analyze problems from first principles. Break down complex questions into components.',
      personality: {
        curiosity: 0.9,    // high curiosity → explores broadly
        caution: 0.6,      // moderate caution → balanced risk
        conformity: 0.3,   // low conformity → independent thinking
        verbosity: 0.7,    // somewhat verbose → detailed analysis
      },
      listens: ['task:new', 'proposal', 'challenge'] as const,
      canEmit: ['discovery', 'proposal', 'vote'] as const,
    },
    engine,
  },
  {
    config: {
      id: 'critic',
      name: 'Critic',
      role: 'Challenge assumptions and find weaknesses. Look for what others missed.',
      personality: {
        curiosity: 0.7,
        caution: 0.9,      // very cautious → catches risks
        conformity: 0.1,   // very independent → won't agree easily
        verbosity: 0.6,
      },
      listens: ['task:new', 'proposal', 'discovery'] as const,
      canEmit: ['doubt', 'challenge', 'vote'] as const,
    },
    engine,
  },
  {
    config: {
      id: 'synthesizer',
      name: 'Synthesizer',
      role: 'Find common ground between proposals. Build on others\' ideas.',
      personality: {
        curiosity: 0.6,
        caution: 0.5,
        conformity: 0.6,   // moderate conformity → builds bridges
        verbosity: 0.8,
      },
      listens: ['task:new', 'proposal', 'doubt', 'challenge'] as const,
      canEmit: ['discovery', 'proposal', 'vote'] as const,
    },
    engine,
  },
]

// 3. Create the orchestrator
const swarm = new SwarmOrchestrator({
  agents,
  maxRounds: 5,
  consensus: {
    strategy: 'confidence-weighted',
    threshold: 0.7,
    conflictResolution: 'debate',
    maxDebateRounds: 3,
  },
  tokenBudget: 20_000,
  math: {
    entropyThreshold: 0.3,
  },
})

// 4. Solve
const result = await swarm.solve('Should we use microservices or a monolith for our new SaaS product?')

// 5. Inspect the result
console.log('=== Answer ===')
console.log(result.answer)
console.log()
console.log('=== Confidence ===')
console.log(result.confidence.toFixed(2))
console.log()
console.log('=== Consensus ===')
console.log(`Decided: ${result.consensus.decided}`)
console.log(`Strategy: confidence-weighted`)
console.log(`Dissent: ${result.consensus.dissent.length} counter-arguments`)
for (const d of result.consensus.dissent) {
  console.log(`  - ${d}`)
}
console.log()
console.log('=== Voting Record ===')
for (const vote of result.consensus.votingRecord) {
  console.log(`  ${vote.agentId}: ${vote.vote.stance} (weight: ${vote.vote.weight.toFixed(2)})`)
  if (vote.vote.reasoning) {
    console.log(`    "${vote.vote.reasoning}"`)
  }
}
console.log()
console.log('=== Agent Contributions ===')
for (const [agentId, contrib] of result.agentContributions) {
  console.log(`  ${agentId}: ${contrib.signalsEmitted} signals, ` +
              `${contrib.proposalsMade} proposals, ` +
              `avg confidence ${contrib.avgConfidence.toFixed(2)}`)
}
console.log()
console.log('=== Math ===')
console.log(`  Entropy: ${result.mathAnalysis.entropy.normalized.toFixed(3)}`)
console.log(`  Stopping reason: ${result.mathAnalysis.stoppingReason ?? 'max rounds'}`)
console.log()
console.log('=== Cost ===')
console.log(`  Tokens: ${result.cost.tokens}`)
console.log(`  Cost: $${result.cost.estimatedUsd.toFixed(4)}`)
console.log(`  Time: ${result.timing.totalMs}ms (${result.timing.roundsUsed} rounds)`)

// 6. Cleanup
swarm.destroy()
```

Run it:

```bash
OPENAI_API_KEY=sk-... npx tsx solve.ts
```

## Streaming Example

Watch the swarm think in real-time:

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { OpenAiLlmProvider } from '@cognitive-engine/provider-openai'
import { MemoryStore } from '@cognitive-engine/store-memory'

const llm = new OpenAiLlmProvider({ model: 'gpt-4o-mini' })
const engine = { llm, embedding: null, store: new MemoryStore() }

const swarm = new SwarmOrchestrator({
  agents: [
    { config: { id: 'analyst', name: 'Analyst', role: 'Analyze problems',
        personality: { curiosity: 0.9, caution: 0.6, conformity: 0.3, verbosity: 0.7 },
        listens: ['task:new', 'proposal', 'challenge'],
        canEmit: ['discovery', 'proposal', 'vote'] }, engine },
    { config: { id: 'critic', name: 'Critic', role: 'Challenge assumptions',
        personality: { curiosity: 0.7, caution: 0.9, conformity: 0.1, verbosity: 0.6 },
        listens: ['task:new', 'proposal', 'discovery'],
        canEmit: ['doubt', 'challenge', 'vote'] }, engine },
  ],
  maxRounds: 5,
  tokenBudget: 15_000,
})

for await (const event of swarm.solveWithStream('Migrate to a new database engine?')) {
  switch (event.type) {
    case 'round:start':
      console.log(`\n--- Round ${event.round} ---`)
      break
    case 'signal:emitted':
      console.log(`  [${event.signal.source}] ${event.signal.type}`)
      break
    case 'math:round-analysis':
      console.log(`  entropy: ${event.normalizedEntropy.toFixed(3)}, ` +
                  `gain: ${event.informationGain.toFixed(3)}`)
      break
    case 'consensus:check':
      console.log(`  consensus: decided=${event.result.decided}` +
                  ` confidence=${event.result.confidence.toFixed(2)}`)
      break
    case 'solve:complete':
      console.log(`\n=== Result ===`)
      console.log(event.result.answer)
      console.log(`Confidence: ${event.result.confidence.toFixed(2)}`)
      console.log(`Cost: $${event.result.cost.estimatedUsd.toFixed(4)}`)
      break
  }
}

swarm.destroy()
```

## Using Pre-built Templates

The fastest way to get started is with pre-built swarm templates:

```typescript
import { researchTemplate, decisionTemplate } from '@cognitive-swarm/templates'

const engine = { llm, embedding: null, store: new MemoryStore() }

// 5-agent research swarm: explorer, analyst, critic, synthesizer, fact-checker
const research = researchTemplate({ engine })
const result = await research.solve('What are the tradeoffs of WebAssembly?')

// 6-agent decision swarm with devil's advocate
const decision = decisionTemplate({ engine })
const result2 = await decision.solve('Migrate to a new database engine?')
```

## Environment Setup

```bash
# .env
OPENAI_API_KEY=sk-...

# Optional: Qdrant for persistent vector memory across sessions
QDRANT_URL=http://localhost:6333

# Optional: OpenTelemetry for distributed tracing
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## Running the Examples

```bash
git clone https://github.com/medonomator/cognitive-swarm
cd cognitive-swarm
npm install

# Research: 5-agent analysis
OPENAI_API_KEY=sk-... npx tsx examples/research/index.ts

# Decision: structured deliberation with devil's advocate
OPENAI_API_KEY=sk-... npx tsx examples/decision/index.ts

# Streaming: real-time events
OPENAI_API_KEY=sk-... npx tsx examples/streaming/index.ts
```

## What Happens Under the Hood

When you call `swarm.solve()`, the round-based loop runs:

```
1. INIT
   ├── Create task:new signal and publish to signal bus
   └── Recall relevant memories from vector memory (if Qdrant configured)

2. ROUND LOOP (round 1..maxRounds)
   ├── Agent reactions: each agent reads the signal, runs its cognitive
   │   pipeline (perception → reasoning), selects a strategy via Thompson
   │   Sampling bandit, and emits 0..N signals
   │
   ├── Math bridge: 28 modules analyze signals — entropy, free energy,
   │   surprise, Bayesian posteriors, game theory equilibria, phase
   │   transitions, chaos detection, ...
   │
   ├── Consensus check: the configured strategy evaluates proposals + votes
   │   If consensus reached → break
   │   If competing proposals → structured debate (up to 3 rounds)
   │
   ├── Advisor (optional): groupthink correction, Shapley pruning, topology
   │
   └── Evolution (optional): detect gaps, spawn specialists, dissolve underperformers

3. SYNTHESIS
   └── Optional LLM call to synthesize a coherent answer from consensus

4. RETURN SwarmResult
   Answer + confidence + full voting record + dissent + math analysis +
   cost + timing + agent contributions
```

## Key Concepts

### Personality Vectors

Each agent has a personality that influences its behavior:

| Trait | Low (0.0) | High (1.0) |
|-------|-----------|------------|
| `curiosity` | Focused, stays on topic | Explores broadly, makes unexpected connections |
| `caution` | Risk-taking, decisive | Risk-averse, careful, emits more doubts |
| `conformity` | Independent, contrarian | Consensus-seeking, agrees more often |
| `verbosity` | Concise, minimal signals | Detailed, emits more signals per round |

### Signal Types

Your agent declarations control behavior:
- `listens` -- which signal types the agent receives
- `canEmit` -- which signal types the agent can send

Common patterns:
- Analyst: listens to `task:new`, `proposal`, `challenge` / emits `discovery`, `proposal`, `vote`
- Critic: listens to `task:new`, `proposal`, `discovery` / emits `doubt`, `challenge`, `vote`
- Synthesizer: listens to everything / emits `proposal`, `vote`

### Thompson Sampling

Each agent uses a Thompson Sampling bandit to choose strategies:
- `analyze` -- examine the signal and discover facts
- `propose` -- generate a concrete proposal
- `challenge` -- argue against something
- `support` -- agree with or reinforce something
- `synthesize` -- combine ideas from multiple signals
- `defer` -- skip (emit nothing)

The bandit learns which strategies work in which contexts. After consensus, agents that contributed to the winning proposal get higher rewards, reinforcing the strategies that led to good outcomes.
