# @cognitive-swarm/math

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/math)](https://www.npmjs.com/package/@cognitive-swarm/math)

28 mathematical modules for analyzing collective intelligence. Pure TypeScript, zero LLM calls, zero external dependencies.

## Install

```bash
npm install @cognitive-swarm/math
```

## Overview

A **standalone library** -- no dependency on the rest of cognitive-swarm. Every module is a pure mathematical computation: you feed it data, it returns analysis. Can be used independently in any TypeScript/JavaScript project.

Inside the swarm, the orchestrator uses a `MathBridge` to run all 28 modules after each round, producing a unified `MathAnalysis` result.

## Quick Start

```typescript
import { EntropyTracker, BeliefNetwork, AgreeChallenge } from '@cognitive-swarm/math'

// Track convergence via entropy
const tracker = new EntropyTracker()
tracker.setDistribution(new Map([['A', 0.25], ['B', 0.25], ['C', 0.25], ['D', 0.25]]))
tracker.entropy  // 2.0 bits (max uncertainty)

tracker.setDistribution(new Map([['A', 0.7], ['B', 0.1], ['C', 0.1], ['D', 0.1]]))
tracker.shouldContinueNormalized(0.3)  // true -- still above threshold

// Bayesian belief tracking
const net = new BeliefNetwork(['scale-horizontally', 'optimize-queries', 'add-caching'])
net.update({ hypothesisId: 'optimize-queries', likelihoodRatio: 1.9, weight: 1.0 })
net.mapEstimate()  // { hypothesisId: 'optimize-queries', probability: 0.47 }

// Anti-groupthink game theory
const game = new AgreeChallenge({ heroBonus: 3.0, consensusAmplification: 1.5 })
const decision = game.decide({ belief: 0.6, groupConsensus: 0.9, reputationStake: 1.0 })
// decision.action = 'challenge' -- high consensus amplifies hero bonus
```

## Module Summary (28 modules)

| # | Category | Module | Class/Function | Purpose |
|---|----------|--------|----------------|---------|
| 1 | Probabilistic | Bayesian Inference | `BeliefNetwork` | Hypothesis probability tracking |
| 2 | Info Theory | Entropy | `EntropyTracker`, `shannonEntropy` | Uncertainty measurement, stopping criterion |
| 3 | Game Theory | Agree/Challenge | `AgreeChallenge` | Anti-groupthink via payoff analysis |
| 4 | Dynamics | Markov Chains | `MarkovChain` | Signal transition prediction, cycle detection |
| 5 | Info Theory | Mutual Information | `RedundancyDetector` | Redundant agent detection |
| 6 | Optimization | PSO | `ParticleSwarm` | Solution space exploration |
| 7 | Geometry | Topology | `TopologyAnalyzer` | Cluster/gap detection in proposal space |
| 8 | Dynamics | Opinion Dynamics | `OpinionDynamics` | Polarization and fragmentation prediction |
| 9 | Dynamics | Replicator Dynamics | `ReplicatorDynamics` | Evolutionary strategy balancing |
| 10 | Linear Algebra | Influence Graph | `InfluenceGraph` | Eigenvector centrality, connectivity |
| 11 | Decision | Optimal Stopping | `OptimalStopping` | CUSUM + Secretary Problem |
| 12 | Decision | Shapley Values | `ShapleyValuator` | Fair contribution scoring |
| 13 | Info Theory | Bayesian Surprise | `SurpriseTracker` | Attention-weighted signal processing |
| 14 | Probabilistic | Free Energy | `FreeEnergyTracker` | Unified stopping criterion |
| 15 | Probabilistic | Causal Inference | `CausalEngine` | Pearl's do-calculus |
| 16 | Info Theory | Fisher Information | `FisherTracker` | Learning efficiency measurement |
| 17 | Decision | Regret Minimization | `RegretMinimizer` | UCB1 + Thompson Sampling |
| 18 | Dynamics | Phase Transitions | `PhaseTransitionDetector` | Self-organized criticality |
| 19 | Stability | KL-Divergence | `KLDivergenceTracker` | Agent deviation from consensus |
| 20 | Stability | Chaos Detector | `ChaosDetector` | Period analysis, Sharkovskii theorem |
| 21 | Stability | Lyapunov Stability | `LyapunovStability` | Consensus stability analysis |
| 22 | Geometry | Optimal Transport | `wasserstein1`, `BeliefDistanceTracker` | Earth Mover's distance |
| 23 | Stability | Damping Classifier | `DampingClassifier` | Convergence regime classification |
| 24 | Systems | System Archetypes | `ArchetypeDetector` | Meadows pathological patterns |
| 25 | Linear Algebra | SVD Analyzer | `SVDAnalyzer` | Agent-proposal matrix decomposition |
| 26 | Systems | Proposal Energy | `ProposalEnergyTracker` | Stocks & flows momentum model |
| 27 | Linear Algebra | Projection Consensus | `ProjectionConsensus` | Weighted least-squares consensus |
| 28 | Systems | Leverage Points | `classifyLeverage`, `rankByLeverage` | Meadows' 12-level intervention ranking |

## Key Module Examples

### Entropy (stopping criterion)

```typescript
import { EntropyTracker } from '@cognitive-swarm/math'

const tracker = new EntropyTracker()
tracker.setDistribution(new Map([['A', 0.7], ['B', 0.2], ['C', 0.1]]))
tracker.informationGain()              // { gain, relativeGain }
tracker.predictRoundsToConverge(0.5)   // estimated rounds remaining
```

### Redundancy Detection

```typescript
import { RedundancyDetector } from '@cognitive-swarm/math'

const detector = new RedundancyDetector()
detector.record({ agentId: 'expert-1', signalType: 'discovery', topic: 'auth' })
detector.record({ agentId: 'expert-2', signalType: 'discovery', topic: 'auth' })
detector.normalizedMI('expert-1', 'expert-2')  // ~1.0 (redundant)
detector.optimalSize(0.5)                       // recommended swarm size
```

### Optimal Stopping

```typescript
import { OptimalStopping } from '@cognitive-swarm/math'

const stopper = new OptimalStopping(10, { targetGain: 0.05 })
stopper.observeRound({ informationGain: 0.15, bestProposalQuality: 0.6, round: 1 })
const decision = stopper.decide()
// decision.shouldStop, decision.reason
```

### Causal Inference

```typescript
import { CausalEngine } from '@cognitive-swarm/math'

const engine = new CausalEngine()
engine.observe({ 'critic-active': 1, quality: 0.8, 'round-length': 3 })
engine.learnStructure()
const result = engine.intervene('critic-active', 1, 'quality')
// result.estimatedEffect -- causal, not correlational
```

## MathConfig (orchestrator integration)

```typescript
interface MathConfig {
  readonly entropyThreshold?: number       // default: 0.3
  readonly minInformationGain?: number     // default: 0.05
  readonly redundancyThreshold?: number    // default: 0.7
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/math) | [GitHub](https://github.com/medonomator/cognitive-swarm)
