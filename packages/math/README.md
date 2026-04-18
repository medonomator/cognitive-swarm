# @cognitive-swarm/math

Mathematical foundations -- Bayesian inference, entropy, game theory, Markov chains, and more.

## Install

```bash
npm install @cognitive-swarm/math
```

## Overview

A pure-math toolkit that powers the swarm's analytical capabilities. Every module is stateless or self-contained, with no dependency on the rest of the swarm runtime -- use them independently or let the orchestrator wire them in automatically.

## Modules

### Bayesian Inference
```typescript
import { BeliefNetwork, voteToLikelihoodRatio } from '@cognitive-swarm/math'
const net = new BeliefNetwork(prior)
net.update(evidence)
```

### Information Theory
```typescript
import { EntropyTracker, shannonEntropy, klDivergence, jsDivergence } from '@cognitive-swarm/math'
```

### Game Theory
```typescript
import { AgreeChallenge } from '@cognitive-swarm/math'
// Models agree/challenge dynamics between agents with configurable payoffs
```

### Markov Chains
```typescript
import { MarkovChain } from '@cognitive-swarm/math'
const chain = new MarkovChain(transitionMatrix)
chain.predictConvergence()
```

### Mutual Information
```typescript
import { RedundancyDetector } from '@cognitive-swarm/math'
// Detects redundant agents by measuring pairwise mutual information
```

### Particle Swarm Optimization
```typescript
import { ParticleSwarm } from '@cognitive-swarm/math'
```

### Topological Data Analysis
```typescript
import { TopologyAnalyzer } from '@cognitive-swarm/math'
// Clustering, gap detection, persistence pairs
```

### Opinion Dynamics (Hegselmann-Krause)
```typescript
import { OpinionDynamics } from '@cognitive-swarm/math'
// Models opinion convergence and polarization
```

### Replicator Dynamics
```typescript
import { ReplicatorDynamics } from '@cognitive-swarm/math'
// Evolutionary strategy balancing across agents
```

### Influence Graph
```typescript
import { InfluenceGraph } from '@cognitive-swarm/math'
// Spectral analysis of agent influence networks
```

### Optimal Stopping (CUSUM + Secretary Problem)
```typescript
import { OptimalStopping } from '@cognitive-swarm/math'
// Decides when the swarm should stop iterating
```

### Shapley Values
```typescript
import { ShapleyValuator } from '@cognitive-swarm/math'
// Fair attribution of each agent's marginal contribution
```

## License

Apache-2.0

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
