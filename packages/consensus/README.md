# @cognitive-swarm/consensus

Consensus engine -- how the cognitive swarm makes decisions.

## Install

```bash
npm install @cognitive-swarm/consensus
```

## Overview

Evaluates proposals from swarm agents and determines group agreement using pluggable strategies. Ships with five built-in strategies covering simple voting, confidence-weighted aggregation, hierarchical authority, Bayesian belief updating, and entropy-based convergence detection.

## Usage

```typescript
import {
  ConsensusEngine,
  VotingStrategy,
  ConfidenceWeightedStrategy,
  HierarchicalStrategy,
  BayesianStrategy,
  EntropyStrategy,
} from '@cognitive-swarm/consensus'

const engine = new ConsensusEngine(config)

// Register a custom or built-in strategy
engine.registerStrategy('voting', new VotingStrategy())

// Evaluate proposals after a round of voting
const result = engine.evaluate(proposals, votes)
// result: { accepted, proposal, confidence, reason }
```

## Strategies

| Strategy | Description |
|----------|-------------|
| `VotingStrategy` | Simple majority/supermajority vote counting |
| `ConfidenceWeightedStrategy` | Weights votes by each agent's self-reported confidence |
| `HierarchicalStrategy` | Senior agents have higher authority in tie-breaking |
| `BayesianStrategy` | Updates belief probabilities with each vote as evidence |
| `EntropyStrategy` | Measures information-theoretic convergence across votes |

## License

MIT

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
