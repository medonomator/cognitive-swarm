# cognitive-swarm

[![npm](https://img.shields.io/npm/v/cognitive-swarm)](https://www.npmjs.com/package/cognitive-swarm)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/medonomator/cognitive-swarm/blob/main/LICENSE)

**Signal-based swarm intelligence for LLM agents.** Formal consensus, 28 math modules, emergent behavior.

This is the umbrella package — one install gives you everything:

```bash
npm install cognitive-swarm
```

```typescript
import {
  SwarmOrchestrator,
  researchTemplate,
  SignalBus,
  ConsensusEngine,
  shannonEntropy,
  ParticleSwarm,
  ReputationTracker,
  instrumentSwarm,
} from 'cognitive-swarm'
```

## Individual Packages

If you only need specific functionality:

```bash
npm install @cognitive-swarm/math          # 28 math modules (standalone)
npm install @cognitive-swarm/orchestrator   # SwarmOrchestrator
npm install @cognitive-swarm/agent          # LLM agents
npm install @cognitive-swarm/signals        # Signal Bus
npm install @cognitive-swarm/consensus      # Consensus strategies
```

See all 20 packages: [Documentation](https://medonomator.github.io/cognitive-swarm/)

## Links

- [Documentation](https://medonomator.github.io/cognitive-swarm/)
- [GitHub](https://github.com/medonomator/cognitive-swarm)
- [Getting Started](https://medonomator.github.io/cognitive-swarm/guide/getting-started)
