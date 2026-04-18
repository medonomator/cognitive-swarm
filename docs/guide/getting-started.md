# Getting Started

## Installation

```bash
npm install @cognitive-swarm/orchestrator
```

Or install individual packages:

```bash
npm install @cognitive-swarm/core @cognitive-swarm/signals @cognitive-swarm/consensus
```

## Requirements

- Node.js >= 20
- TypeScript >= 5.0 (recommended)
- An LLM provider (OpenAI is used in examples)

## Quick Example

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { OpenAiLlmProvider } from '@cognitive-engine/provider-openai'

const llm = new OpenAiLlmProvider({ model: 'gpt-4o-mini' })
const engine = { llm, embedding: null, store: new MemoryStore() }

const swarm = new SwarmOrchestrator({
  agents: [
    {
      config: {
        id: 'analyst',
        name: 'Analyst',
        role: 'Analyze problems from first principles',
        personality: { curiosity: 0.9, caution: 0.6, conformity: 0.3, verbosity: 0.7 },
        listens: ['task:new', 'proposal', 'challenge'],
        canEmit: ['discovery', 'proposal', 'vote'],
      },
      engine,
    },
    {
      config: {
        id: 'critic',
        name: 'Critic',
        role: 'Challenge assumptions and find weaknesses',
        personality: { curiosity: 0.7, caution: 0.9, conformity: 0.1, verbosity: 0.6 },
        listens: ['task:new', 'proposal', 'discovery'],
        canEmit: ['doubt', 'challenge', 'vote'],
      },
      engine,
    },
  ],
  maxRounds: 5,
  consensus: { strategy: 'confidence-weighted', threshold: 0.7 },
  tokenBudget: 10_000,
})

const result = await swarm.solve('Should we use microservices or a monolith?')

console.log(result.answer)       // Synthesized answer from all agents
console.log(result.confidence)   // 0.87
console.log(result.consensus)    // Full voting record, dissent preserved
console.log(result.cost)         // { tokens: 4200, estimatedUsd: 0.0063 }
console.log(result.timing)       // { totalMs: 4200, roundsUsed: 3 }
```

## Using Pre-built Templates

The fastest way to get started is with pre-built swarm templates:

```typescript
import { researchTemplate, decisionTemplate } from '@cognitive-swarm/templates'

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

# Optional: Qdrant for persistent vector memory
QDRANT_URL=http://localhost:6333

# Optional: OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## Running Examples

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

1. **Round start** - the task signal is placed on the signal bus
2. **Agent reactions** - each agent that listens to the signal type reacts, emitting new signals (discoveries, proposals, doubts, challenges)
3. **Math bridge** - after each round, 19 math modules analyze all signals: entropy, free energy, surprise, Bayesian posteriors, game theory equilibria
4. **Consensus check** - the configured strategy evaluates proposals and votes
5. **Advisor** - optionally injects corrective signals if groupthink is detected
6. **Convergence** - the loop ends when entropy is below threshold, free energy converges, or max rounds is reached
7. **Synthesis** - an optional LLM call synthesizes the final answer from the consensus
