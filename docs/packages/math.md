# @cognitive-swarm/math

25 mathematical modules that analyze swarm deliberation. Pure TypeScript computation -- no LLM calls.

## Install

```bash
npm install @cognitive-swarm/math
```

## Overview

The orchestrator uses a `MathBridge` to run analysis modules after each round. Each module is also exported individually for standalone use.

## Individual Modules

### Bayesian Inference

```typescript
import { BeliefNetwork, voteToLikelihoodRatio } from '@cognitive-swarm/math'

const network = new BeliefNetwork(proposalIds)
// Update beliefs from vote evidence
const lr = voteToLikelihoodRatio(vote, confidence)
```

### Entropy (Information Theory)

```typescript
import { EntropyTracker, shannonEntropy, klDivergence, jsDivergence } from '@cognitive-swarm/math'

const H = shannonEntropy(distribution)       // Shannon entropy in bits
const kl = klDivergence(p, q)               // KL divergence
const js = jsDivergence(p, q)               // Jensen-Shannon divergence

const tracker = new EntropyTracker()
tracker.addRound(distribution)
const { entropy, gain } = tracker.getResult()
```

### Game Theory

```typescript
import { AgreeChallenge } from '@cognitive-swarm/math'

const game = new AgreeChallenge(payoffConfig)
const decision = game.decide(context)
// Returns whether to agree or challenge based on payoff analysis
```

### Markov Chains

```typescript
import { MarkovChain } from '@cognitive-swarm/math'

const chain = new MarkovChain()
chain.observe(state)
const prediction: ConvergencePrediction = chain.predict()
const cycles: CycleReport = chain.detectCycles()
```

### Mutual Information (Redundancy Detection)

```typescript
import { RedundancyDetector } from '@cognitive-swarm/math'

const detector = new RedundancyDetector()
detector.addEmission(record)
const report: RedundancyReport = detector.analyze()
// report.pairs: PairwiseMI[] -- NMI between agent pairs
// High NMI = redundant agents
```

### Particle Swarm Optimization

```typescript
import { ParticleSwarm } from '@cognitive-swarm/math'

const pso = new ParticleSwarm(config)
const result: PSOStepResult = pso.step()
```

### Topological Data Analysis

```typescript
import { TopologyAnalyzer } from '@cognitive-swarm/math'

const analyzer = new TopologyAnalyzer()
// Cluster analysis, gap detection, persistence diagrams
```

### Opinion Dynamics (Hegselmann-Krause)

```typescript
import { OpinionDynamics } from '@cognitive-swarm/math'

const dynamics = new OpinionDynamics()
// Models opinion convergence/polarization
const report: PolarizationReport = dynamics.analyze()
```

### Replicator Dynamics

```typescript
import { ReplicatorDynamics } from '@cognitive-swarm/math'

const replicator = new ReplicatorDynamics()
replicator.observe(observation)
const report: EvolutionaryReport = replicator.analyze()
// Tracks strategy population evolution
```

### Influence Graph (Spectral Analysis)

```typescript
import { InfluenceGraph } from '@cognitive-swarm/math'

const graph = new InfluenceGraph()
const report: InfluenceReport = graph.analyze()
```

### Optimal Stopping (CUSUM + Secretary Problem)

```typescript
import { OptimalStopping } from '@cognitive-swarm/math'

const stopper = new OptimalStopping(config)
const decision: StoppingDecision = stopper.decide()
```

### Shapley Values

```typescript
import { ShapleyValuator } from '@cognitive-swarm/math'

const valuator = new ShapleyValuator()
const result: ShapleyResult = valuator.compute()
// Cooperative game theory: each agent's marginal contribution
```

### Bayesian Surprise

```typescript
import { SurpriseTracker, bayesianSurprise } from '@cognitive-swarm/math'

const surprise = bayesianSurprise(prior, posterior)
const tracker = new SurpriseTracker(config)
const report: SurpriseReport = tracker.analyze()
```

### Free Energy Principle

```typescript
import { FreeEnergyTracker } from '@cognitive-swarm/math'

const tracker = new FreeEnergyTracker(config)
const report: FreeEnergyReport = tracker.analyze()
// Variational free energy & active inference
```

### Causal Inference (Pearl's do-calculus)

```typescript
import { CausalEngine } from '@cognitive-swarm/math'

const engine = new CausalEngine()
const intervention: InterventionResult = engine.doIntervention(node, value)
const counterfactual: CounterfactualResult = engine.counterfactual(query)
const report: CausalReport = engine.analyze()
```

### Fisher Information

```typescript
import { FisherTracker } from '@cognitive-swarm/math'

const tracker = new FisherTracker()
const report: LearningEfficiencyReport = tracker.analyze()
// Measures learning efficiency via Cramer-Rao bound
```

### Regret Minimization

```typescript
import { RegretMinimizer } from '@cognitive-swarm/math'

const minimizer = new RegretMinimizer()
const selection: ArmSelection = minimizer.select()
const report: RegretReport = minimizer.analyze()
```

### Phase Transition

```typescript
import { PhaseTransitionDetector } from '@cognitive-swarm/math'

const detector = new PhaseTransitionDetector(config)
const report: PhaseReport = detector.analyze()
// Detects self-organized criticality in swarm dynamics
```

### KL-Divergence Tracker

```typescript
import { KLDivergenceTracker } from '@cognitive-swarm/math'

const tracker = new KLDivergenceTracker()
const report: KLDivergenceReport = tracker.analyze()
// Tracks agent divergence from consensus distribution
```

### Chaos Detection

```typescript
import { ChaosDetector } from '@cognitive-swarm/math'

const detector = new ChaosDetector()
detector.observe(value)
const report: ChaosReport = detector.analyze()
// Period analysis, Sharkovskii theorem, Feigenbaum constants
```

### Lyapunov Stability

```typescript
import { LyapunovStability } from '@cognitive-swarm/math'

const stability = new LyapunovStability(config)
const report: LyapunovReport = stability.analyze()
// Routh-Hurwitz stability, convergence rate
```

### Optimal Transport

```typescript
import { wasserstein1, wassersteinBarycenter, BeliefDistanceTracker } from '@cognitive-swarm/math'

const distance = wasserstein1(distributionA, distributionB)
const barycenter = wassersteinBarycenter(distributions, weights)
const tracker = new BeliefDistanceTracker()
```

### Damping Classifier

```typescript
import { DampingClassifier } from '@cognitive-swarm/math'

const classifier = new DampingClassifier(config)
const report: DampingReport = classifier.analyze()
// Classifies convergence regime: overdamped, underdamped, critically damped
```

### System Archetypes

```typescript
import { ArchetypeDetector } from '@cognitive-swarm/math'

const detector = new ArchetypeDetector(config)
const report: ArchetypeReport = detector.analyze()
// Detects structural pathological patterns
```

### SVD Analyzer

```typescript
import { SVDAnalyzer } from '@cognitive-swarm/math'

const analyzer = new SVDAnalyzer()
const report: SVDReport = analyzer.analyze()
// Agent-proposal matrix decomposition for dimension reduction
```

### Proposal Energy

```typescript
import { ProposalEnergyTracker } from '@cognitive-swarm/math'

const tracker = new ProposalEnergyTracker()
const report: ProposalEnergyReport = tracker.analyze()
// Stocks & flows model of proposal momentum
```

### Projection Consensus

```typescript
import { ProjectionConsensus } from '@cognitive-swarm/math'

const proj = new ProjectionConsensus()
const result: ProjectionResult = proj.compute(agentVotes, weights)
// Weighted least-squares optimal consensus distribution
```

### Leverage Points

```typescript
import { classifyLeverage, rankByLeverage, leverageCategoryName } from '@cognitive-swarm/math'

const level: LeverageLevel = classifyLeverage(intervention)
const ranked = rankByLeverage(interventions)
// Meadows' 12 leverage points ranked by systemic impact
```

## MathConfig

```typescript
interface MathConfig {
  readonly entropyThreshold?: number      // default: 0.3
  readonly minInformationGain?: number    // default: 0.05
  readonly redundancyThreshold?: number   // default: 0.7
}
```

## Full Analysis

The full `MathAnalysis` result type is defined in `@cognitive-swarm/core` and included in `SwarmResult.mathAnalysis`.
