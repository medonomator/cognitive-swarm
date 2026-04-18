# @cognitive-swarm/orchestrator

Swarm orchestrator -- ties agents, signals, and consensus into `solve()`.

## Install

```bash
npm install @cognitive-swarm/orchestrator
```

## Overview

The top-level runtime that coordinates multi-agent problem solving. It manages round execution, debate resolution, topology control, token tracking, contribution scoring, mathematical analysis, and final synthesis.

## Usage

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const orchestrator = new SwarmOrchestrator(swarmConfig)
const result = await orchestrator.solve('How should we architect the new service?')
// result: { answer, confidence, contributions, cost, timing, signals }
```

## Exports

| Export | Description |
|--------|-------------|
| `SwarmOrchestrator` | Main entry point -- runs the full solve loop |
| `SwarmAdvisor` | Meta-cognitive layer that injects signals, disables agents, or adjusts topology between rounds |
| `RoundRunner` | Executes a single round of agent reactions |
| `DebateRunner` | Runs structured debates between agents with opposing views |
| `TopologyController` | Controls which agents can see which signals (mesh, star, ring, hierarchy) |
| `ContributionTracker` | Scores each agent's contribution to the final answer |
| `TokenTrackingLlmProvider` | Wraps an LLM provider to track token usage and cost |
| `Synthesizer` | Merges agent contributions into a final coherent answer |
| `MathBridge` | Connects the orchestrator to `@cognitive-swarm/math` analysis |

## License

MIT

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
