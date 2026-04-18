# @cognitive-swarm/math

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/math)](https://www.npmjs.com/package/@cognitive-swarm/math)

28 mathematical modules for analyzing collective intelligence. Pure TypeScript computation -- zero LLM calls, zero dependencies beyond the package itself.

## Install

```bash
npm install @cognitive-swarm/math
```

## Overview

`@cognitive-swarm/math` is a **standalone library** -- it has no dependency on the rest of cognitive-swarm and can be used independently in any TypeScript/JavaScript project. Every module is a pure mathematical computation: you feed it data, it returns analysis.

Inside the swarm, the orchestrator uses a `MathBridge` to run all 28 modules after each deliberation round, producing a unified `MathAnalysis` result. But each module is also exported individually for direct use.

### MathConfig

When used with the orchestrator, the math layer is configured via `MathConfig`:

```typescript
interface MathConfig {
  /** Normalized entropy below which the swarm is considered converged (default: 0.3). */
  readonly entropyThreshold?: number
  /** Minimum relative information gain per round; stop if below (default: 0.05). */
  readonly minInformationGain?: number
  /** NMI threshold above which agents are considered redundant (default: 0.7). */
  readonly redundancyThreshold?: number
}
```

### MathBridge

The `MathBridge` is the orchestrator's integration layer. After each round it:
1. Feeds vote data, signal emissions, and posterior distributions into all 28 modules
2. Collects results into a single `MathAnalysis` object
3. Provides stopping recommendations based on free energy, entropy, CUSUM, and surprise
4. Passes phase transition controls back to the advisor for exploration/exploitation tuning

You never call `MathBridge` directly -- the orchestrator handles it. This documentation focuses on the individual modules.

---

## Module Summary

| # | Category | Module | Class / Function | What it does |
|---|----------|--------|-----------------|--------------|
| 1 | Probabilistic | Bayesian Inference | `BeliefNetwork` | Updates hypothesis probabilities as evidence arrives |
| 2 | Information Theory | Entropy | `EntropyTracker`, `shannonEntropy` | Measures uncertainty; stopping criterion |
| 3 | Game Theory | Game Theory | `AgreeChallenge` | Prevents groupthink via payoff analysis |
| 4 | Dynamics | Markov Chains | `MarkovChain` | Signal transition prediction and cycle detection |
| 5 | Information Theory | Mutual Information | `RedundancyDetector` | Detects redundant agents |
| 6 | Dynamics | PSO | `ParticleSwarm` | Explores solution space in embeddings |
| 7 | Geometry | Topology | `TopologyAnalyzer` | Finds clusters and gaps in proposal space |
| 8 | Dynamics | Opinion Dynamics | `OpinionDynamics` | Predicts polarization and fragmentation |
| 9 | Dynamics | Replicator Dynamics | `ReplicatorDynamics` | Evolutionary strategy balancing |
| 10 | Linear Algebra | Influence Graph | `InfluenceGraph` | Eigenvector centrality and connectivity |
| 11 | Decision | Optimal Stopping | `OptimalStopping` | CUSUM + Secretary Problem |
| 12 | Decision | Shapley Values | `ShapleyValuator` | Fair contribution scoring |
| 13 | Information Theory | Bayesian Surprise | `SurpriseTracker` | Attention-weighted signal processing |
| 14 | Probabilistic | Free Energy | `FreeEnergyTracker` | Unified stopping criterion |
| 15 | Probabilistic | Causal Inference | `CausalEngine` | Pearl's do-calculus |
| 16 | Information Theory | Fisher Information | `FisherTracker` | Learning efficiency measurement |
| 17 | Decision | Regret Minimization | `RegretMinimizer` | UCB1 + Thompson Sampling |
| 18 | Dynamics | Phase Transitions | `PhaseTransitionDetector` | Self-organized criticality |
| 19 | Stability | KL-Divergence Tracker | `KLDivergenceTracker` | Agent deviation from consensus |
| 20 | Stability | Chaos Detector | `ChaosDetector` | Period analysis and Sharkovskii theorem |
| 21 | Stability | Lyapunov Stability | `LyapunovStability` | Consensus stability analysis |
| 22 | Geometry | Optimal Transport | `wasserstein1`, `BeliefDistanceTracker` | Earth Mover's distance between distributions |
| 23 | Stability | Damping Classifier | `DampingClassifier` | Convergence regime classification |
| 24 | Systems | System Archetypes | `ArchetypeDetector` | Meadows pathological patterns |
| 25 | Linear Algebra | SVD Analyzer | `SVDAnalyzer` | Agent-proposal matrix decomposition |
| 26 | Systems | Proposal Energy | `ProposalEnergyTracker` | Stocks & flows momentum model |
| 27 | Linear Algebra | Projection Consensus | `ProjectionConsensus` | Weighted least-squares consensus |
| 28 | Systems | Leverage Points | `classifyLeverage`, `rankByLeverage` | Meadows' 12-level intervention ranking |

---

## Category 1: Information Theory

### 1. Entropy (`EntropyTracker`, `shannonEntropy`, `klDivergence`, `jsDivergence`)

**What it is.** Shannon entropy measures the uncertainty in a probability distribution. Maximum entropy means all options are equally likely (complete uncertainty); zero entropy means one option has probability 1 (certainty).

**Why it matters for swarm.** Entropy is the primary stopping criterion. When the swarm's belief distribution has low normalized entropy, consensus has been reached and further rounds are wasteful.

**Key formulas:**

```typescript
// Shannon entropy (bits)
// H(X) = -Sum p(x_i) * log2(p(x_i))
// H = 0     -> complete certainty (one option dominates)
// H = log2(N) -> max uncertainty (uniform over N options)

// KL divergence (asymmetric, always >= 0)
// D_KL(P || Q) = Sum p_i * log2(p_i / q_i)

// Jensen-Shannon divergence (symmetric, bounded [0, 1])
// JSD(P, Q) = (D_KL(P||M) + D_KL(Q||M)) / 2,  M = (P+Q)/2
```

**API:**

```typescript
// Standalone functions
function shannonEntropy(distribution: ReadonlyMap<string, number>): number
function klDivergence(p: ReadonlyMap<string, number>, q: ReadonlyMap<string, number>): number
function jsDivergence(p: ReadonlyMap<string, number>, q: ReadonlyMap<string, number>): number

// Stateful tracker
class EntropyTracker {
  setDistribution(distribution: ReadonlyMap<string, number>): void
  get entropy(): number
  analyze(): EntropyResult        // { entropy, maxEntropy, normalized, hypothesisCount }
  shouldContinue(threshold: number): boolean
  shouldContinueNormalized(threshold: number): boolean
  informationGain(): InformationGain  // { before, after, gain, relativeGain }
  averageGainPerRound(): number
  predictRoundsToConverge(targetEntropy: number): number
  getHistory(): readonly number[]
  get roundCount(): number
}
```

**Code example:**

```typescript
import { EntropyTracker, shannonEntropy, klDivergence } from '@cognitive-swarm/math'

const tracker = new EntropyTracker()

// Round 1: uniform beliefs — max uncertainty
tracker.setDistribution(new Map([['A', 0.25], ['B', 0.25], ['C', 0.25], ['D', 0.25]]))
tracker.entropy  // 2.0 bits (log2(4))

// Round 2: converging toward A
tracker.setDistribution(new Map([['A', 0.7], ['B', 0.1], ['C', 0.1], ['D', 0.1]]))
tracker.entropy  // ~1.36 bits

tracker.shouldContinueNormalized(0.3)  // true — still above threshold
tracker.informationGain()              // { gain: 0.64, relativeGain: 0.32, ... }
tracker.predictRoundsToConverge(0.5)   // estimated rounds remaining

// Compare two distributions directly
const prior = new Map([['A', 0.5], ['B', 0.5]])
const posterior = new Map([['A', 0.8], ['B', 0.2]])
klDivergence(posterior, prior)  // 0.278 bits — beliefs shifted moderately
```

---

### 5. Mutual Information (`RedundancyDetector`)

**What it is.** Mutual information I(A;B) measures how much knowing agent A's signals tells you about agent B's signals. High MI means the agents are saying the same things (redundant). Low MI means they bring unique perspectives.

**Why it matters for swarm.** Redundant agents waste compute. The detector identifies which agents can be removed without losing information diversity, and suggests the optimal swarm size.

**Key formula:**

```typescript
// Mutual information
// I(A;B) = H(A) + H(B) - H(A,B)

// Normalized MI (scale-independent, in [0, 1])
// NMI = 2 * I(A;B) / (H(A) + H(B))
// NMI = 0 -> completely independent
// NMI = 1 -> identical topic distributions
```

**API:**

```typescript
class RedundancyDetector {
  record(emission: EmissionRecord): void          // { agentId, signalType, topic }
  recordBatch(emissions: readonly EmissionRecord[]): void
  mutualInformation(agentA: string, agentB: string): number
  normalizedMI(agentA: string, agentB: string): number
  analyze(threshold?: number): RedundancyReport   // default threshold: 0.7
  optimalSize(maxMarginalNMI?: number): number
  getAgentIds(): readonly string[]
}
```

**Code example:**

```typescript
import { RedundancyDetector } from '@cognitive-swarm/math'

const detector = new RedundancyDetector()

// Two agents discuss the same topics — redundant
detector.record({ agentId: 'security-expert', signalType: 'discovery', topic: 'auth' })
detector.record({ agentId: 'security-expert', signalType: 'proposal', topic: 'auth' })
detector.record({ agentId: 'sec-reviewer', signalType: 'discovery', topic: 'auth' })
detector.record({ agentId: 'sec-reviewer', signalType: 'proposal', topic: 'auth' })

// Third agent covers different ground
detector.record({ agentId: 'perf-expert', signalType: 'discovery', topic: 'latency' })
detector.record({ agentId: 'perf-expert', signalType: 'proposal', topic: 'caching' })

detector.normalizedMI('security-expert', 'sec-reviewer')  // ~1.0 (redundant)
detector.normalizedMI('security-expert', 'perf-expert')    // ~0.0 (unique)

const report = detector.analyze(0.7)
// report.redundant = ['security-expert', 'sec-reviewer']
// report.mostUnique = 'perf-expert'

detector.optimalSize(0.5)  // 2 — only 2 unique perspectives
```

---

### 13. Bayesian Surprise (`SurpriseTracker`, `bayesianSurprise`)

**What it is.** Bayesian surprise is the KL divergence from posterior to prior: how much a signal changed your beliefs. High surprise = highly informative. Low surprise = confirms what you already believed.

**Why it matters for swarm.** Not all signals are equally valuable. A surprising disagreement from a trusted agent carries far more information than a predictable agreement. The tracker amplifies surprising signals and detects surprise collapse (groupthink/echo chamber).

**Key formula:**

```typescript
// Bayesian Surprise
// S = D_KL(posterior || prior) = Sum posterior(i) * log2(posterior(i) / prior(i))
// S = 0   -> signal changed nothing
// S >> 0  -> signal flipped beliefs
```

**API:**

```typescript
function bayesianSurprise(
  posterior: ReadonlyMap<string, number>,
  prior: ReadonlyMap<string, number>,
): number

class SurpriseTracker {
  constructor(config?: Partial<SurpriseConfig>)
  measure(sourceId: string, prior: ReadonlyMap<string, number>,
          posterior: ReadonlyMap<string, number>): SurpriseMeasurement
  endRound(): SurpriseReport
  roundReport(): SurpriseReport
  agentAttentionWeight(agentId: string): number
  getHistory(): readonly number[]
  get roundCount(): number
}

interface SurpriseConfig {
  readonly minSurpriseThreshold: number   // default: 0.01
  readonly attentionAlpha: number         // default: 2.0
  readonly trendWindow: number            // default: 5
  readonly collapseThreshold: number      // default: 0.05
}
```

**Code example:**

```typescript
import { SurpriseTracker } from '@cognitive-swarm/math'

const tracker = new SurpriseTracker({ attentionAlpha: 2.0 })

const prior = new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]])
const posterior = new Map([['A', 0.3], ['B', 0.5], ['C', 0.2]])

const m = tracker.measure('agent-critic', prior, posterior)
// m.surprise ≈ 0.12 bits (moderate belief shift)
// m.attentionWeight ≈ 1.24 (amplified for being surprising)

const report = tracker.endRound()
// report.surpriseCollapse = false
// report.mostInformativeAgent = 'agent-critic'
// report.trend < 0 means surprise is decreasing (converging)
```

---

### 16. Fisher Information (`FisherTracker`)

**What it is.** Fisher information I(theta) measures how much information observations carry about an unknown parameter. The Cramer-Rao bound gives the theoretical minimum variance: `Var(theta_hat) >= 1/I(theta)`. Comparing actual variance to this bound reveals learning efficiency.

**Why it matters for swarm.** If efficiency is low (say 0.1), 90% of observations are wasted -- agents are producing correlated or uninformative signals. The tracker diagnoses bottlenecks and recommends actions: diversify agents, add exploration, or stop early.

**Key formula:**

```typescript
// For Bernoulli parameter theta = P(leading hypothesis):
// I(theta) = n / (theta * (1 - theta))
// Cramer-Rao bound: Var(theta_hat) >= theta*(1-theta) / n
// Efficiency = Cramer-Rao bound / actual variance, in [0, 1]
```

**API:**

```typescript
class FisherTracker {
  constructor(stallThreshold?: number, stallWindowSize?: number)
  observeRound(posteriors: ReadonlyMap<string, number>): void
  report(): LearningEfficiencyReport
  get roundCount(): number
}

interface LearningEfficiencyReport {
  readonly perHypothesis: Record<string, FisherAnalysis>
  readonly overallEfficiency: number        // weighted average [0, 1]
  readonly learningStalled: boolean         // true if stuck for N rounds
  readonly recommendation: LearningRecommendation
  readonly trend: number                    // positive = improving
  readonly history: readonly number[]
}

type LearningRecommendation =
  | 'continue'          // efficiency > 0.5
  | 'diversify-agents'  // too correlated
  | 'add-exploration'   // Fisher info near zero
  | 'reduce-agents'     // effective sample size << agent count
  | 'stop-early'        // nothing left to learn
```

**Code example:**

```typescript
import { FisherTracker } from '@cognitive-swarm/math'

const tracker = new FisherTracker()

tracker.observeRound(new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]))
tracker.observeRound(new Map([['A', 0.7], ['B', 0.2], ['C', 0.1]]))
tracker.observeRound(new Map([['A', 0.72], ['B', 0.18], ['C', 0.1]]))

const report = tracker.report()
// report.overallEfficiency = 0.65
// report.recommendation = 'continue'
// report.perHypothesis['A'].effectiveSampleSize = 4.2
```

---

## Category 2: Probabilistic Reasoning

### 1. Bayesian Inference (`BeliefNetwork`)

**What it is.** Maintains a probability distribution over hypotheses (proposals) and updates it via Bayes' theorem as evidence (votes) arrives. Works in log-space for numerical stability with many updates.

**Why it matters for swarm.** This is the core belief tracker. Every vote from every agent is converted to a likelihood ratio and fed into the network. The posterior distribution over proposals IS the swarm's current opinion.

**Key formula:**

```typescript
// Bayes' theorem in log-space:
// log P(H|E) = log P(H) + weight * log(likelihoodRatio) - log(Z)
//
// Likelihood ratio conversion:
// agree with weight w  -> LR = 1 + w  (evidence FOR)
// disagree with weight w -> LR = 1/(1+w) (evidence AGAINST)
// abstain -> LR = 1 (uninformative)
```

**API:**

```typescript
class BeliefNetwork {
  constructor(hypothesisIds: readonly string[])
  update(evidence: Evidence): void
  updateBatch(evidences: readonly Evidence[]): void
  posterior(hypothesisId: string): number
  mapEstimate(): { hypothesisId: string; probability: number }
  getState(): BeliefState
  addHypothesis(id: string, prior: number): void
  get evidenceCount(): number
  get hypothesisCount(): number
}

interface Evidence {
  readonly hypothesisId: string
  readonly likelihoodRatio: number  // >1 supports, <1 opposes, =1 neutral
  readonly weight: number
}

function voteToLikelihoodRatio(
  stance: 'agree' | 'disagree' | 'abstain',
  weight: number,
): number
```

**Code example:**

```typescript
import { BeliefNetwork, voteToLikelihoodRatio } from '@cognitive-swarm/math'

const net = new BeliefNetwork(['scale-horizontally', 'optimize-queries', 'add-caching'])
// Starts with uniform prior: 0.333 each

// Agent-DBA votes: optimize-queries is the way
const lr = voteToLikelihoodRatio('agree', 0.9) // LR = 1.9
net.update({ hypothesisId: 'optimize-queries', likelihoodRatio: lr, weight: 1.0 })

// Agent-SRE disagrees with horizontal scaling
net.update({
  hypothesisId: 'scale-horizontally',
  likelihoodRatio: voteToLikelihoodRatio('disagree', 0.7), // LR = 0.59
  weight: 1.0,
})

net.posterior('optimize-queries')    // ~0.47 (shifted toward)
net.posterior('scale-horizontally')  // ~0.22 (shifted away)
net.mapEstimate()                    // { hypothesisId: 'optimize-queries', probability: 0.47 }
```

---

### 14. Free Energy Principle (`FreeEnergyTracker`)

**What it is.** Friston's variational free energy provides a single scalar that bounds surprise. F = Complexity - Accuracy, where complexity is how far beliefs moved from the prior and accuracy is how well they explain observations. Minimizing F is equivalent to learning.

**Why it matters for swarm.** Instead of checking 6+ separate stopping criteria (entropy, information gain, CUSUM, Secretary, surprise, fragmentation), you track ONE number. When deltaF approaches 0, no more learning is happening. This also provides active inference recommendations: what action would minimize expected free energy?

**Key formula:**

```typescript
// Free Energy: F = lambda * complexity - accuracy
// complexity = KL(posterior || prior)   -- how far beliefs moved
// accuracy   = log(quality_score)       -- how well beliefs explain the task
//
// deltaF < 0 -> learning (continue)
// deltaF ~ 0 -> converged (stop)
// deltaF > 0 -> diverging (something wrong)
```

**API:**

```typescript
class FreeEnergyTracker {
  constructor(config?: Partial<FreeEnergyConfig>)
  setPrior(prior: ReadonlyMap<string, number>): void
  observeRound(posterior: ReadonlyMap<string, number>, accuracy: number): FreeEnergyState
  report(): FreeEnergyReport
  shouldStop(): boolean
  get currentF(): number
  get roundCount(): number
}

interface FreeEnergyConfig {
  readonly convergenceThreshold: number  // default: 0.01
  readonly convergenceWindow: number     // default: 3
  readonly complexityWeight: number      // default: 1.0
}

interface FreeEnergyReport {
  readonly current: FreeEnergyState
  readonly history: readonly FreeEnergyState[]
  readonly descentRate: number
  readonly converged: boolean
  readonly recommendation: ActiveInferenceAction  // 'explore' | 'exploit' | 'challenge' | 'stop'
  readonly dominantComponent: 'complexity' | 'accuracy' | 'balanced'
  readonly learningHealth: 'excellent' | 'good' | 'slow' | 'stalled' | 'diverging'
}
```

**Code example:**

```typescript
import { FreeEnergyTracker } from '@cognitive-swarm/math'

const fe = new FreeEnergyTracker({ convergenceThreshold: 0.01, convergenceWindow: 3 })

fe.setPrior(new Map([['A', 0.33], ['B', 0.33], ['C', 0.33]]))

// Round 1: beliefs shift, accuracy moderate
fe.observeRound(new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]), 0.6)

// Round 2: beliefs sharpen, accuracy improves
fe.observeRound(new Map([['A', 0.7], ['B', 0.2], ['C', 0.1]]), 0.8)

const report = fe.report()
// report.learningHealth = 'good'
// report.recommendation.action = 'exploit' (still learning)
// report.converged = false

fe.shouldStop()  // false — still improving
```

---

### 15. Causal Inference (`CausalEngine`)

**What it is.** Pearl's do-calculus distinguishes correlation from causation. Observing "critic active AND high quality" might be because hard problems activate both. `do(activate critic)` tells you the *causal* effect. The engine learns a DAG from data and answers intervention and counterfactual queries.

**Why it matters for swarm.** Allows answering "what IF we change agent composition?" based on causal effect, not just observed correlation. Optimal agent selection becomes principled rather than heuristic.

**Key formula:**

```typescript
// Backdoor adjustment formula:
// P(Y | do(X=x)) = Sum_z P(Y | X=x, Z=z) * P(Z=z)
// where Z is a valid adjustment set (backdoor criterion)
//
// Counterfactual (3-step):
// 1. Abduction: infer noise from actual observation
// 2. Action: set X = x
// 3. Prediction: compute Y under modified model
```

**API:**

```typescript
class CausalEngine {
  observe(snapshot: Record<string, number>): void
  learnStructure(): void
  intervene(interventionVar: string, value: number, outcomeVar: string): InterventionResult
  counterfactual(interventionVar: string, value: number,
                 outcomeVar: string, context: Record<string, number>): CounterfactualResult
  report(): CausalReport
  dSeparated(x: string, y: string, z: readonly string[]): boolean
  get observationCount(): number
  get variableCount(): number
}

interface InterventionResult {
  readonly intervention: string
  readonly interventionValue: number
  readonly outcome: string
  readonly estimatedEffect: number
  readonly identifiable: boolean
  readonly adjustmentSet: readonly string[]
  readonly confidence: number
}
```

**Code example:**

```typescript
import { CausalEngine } from '@cognitive-swarm/math'

const engine = new CausalEngine()

// Record swarm metrics across many rounds
for (let i = 0; i < 50; i++) {
  engine.observe({
    'critic-active': Math.random() > 0.5 ? 1 : 0,
    'quality': 0.4 + Math.random() * 0.5,
    'round-length': 2 + Math.floor(Math.random() * 4),
  })
}

engine.learnStructure()

// "What happens if we force the critic to be active?"
const result = engine.intervene('critic-active', 1, 'quality')
// result.estimatedEffect ≈ 0.75 (causal, not just correlational)
// result.identifiable = true
// result.adjustmentSet = ['round-length']
```

---

## Category 3: Game Theory & Decision

### 3. Game Theory (`AgreeChallenge`)

**What it is.** A payoff-based strategic decision model. When group consensus is high, the hero bonus is amplified, making it mathematically profitable to challenge. This causes devil's advocates to emerge from pure game theory -- no explicit "be contrarian" instruction needed.

**Why it matters for swarm.** Prevents groupthink mathematically. Without this, agents rationally agree with the majority. The consensus amplification mechanism makes challenging dominant positions the Nash equilibrium strategy when consensus is too strong.

**Key formula:**

```typescript
// Effective hero bonus (amplified by consensus):
// h_eff = heroBonus * (1 + consensusAmplification * groupConsensus)
//
// Expected values:
// E[agree]     = belief * (1 + groupthinkCost) - groupthinkCost
// E[challenge] = h_eff - belief * (h_eff + disruptionCost)
//
// Critical belief threshold (below -> challenge, above -> agree):
// b* = (h_eff + c) / (1 + c + h_eff + d)
```

**API:**

```typescript
class AgreeChallenge {
  constructor(payoffs?: Partial<PayoffConfig>)
  decide(context: StrategyContext): StrategyDecision
  criticalBelief(groupConsensus: number, reputationStake?: number): number
  expectedChallengers(beliefs: readonly number[], groupConsensus: number,
                      reputationStakes?: readonly number[]): number
}

interface PayoffConfig {
  readonly groupthinkCost: number           // default: 2.0
  readonly heroBonus: number                // default: 3.0
  readonly disruptionCost: number           // default: 1.0
  readonly consensusAmplification: number   // default: 1.5
}

interface StrategyContext {
  readonly belief: number           // [0, 1] — confidence proposal is correct
  readonly groupConsensus: number   // [0, 1] — 1 = unanimous
  readonly reputationStake: number  // [0, inf) — how much to lose
}
```

**Code example:**

```typescript
import { AgreeChallenge } from '@cognitive-swarm/math'

const game = new AgreeChallenge({ heroBonus: 3.0, consensusAmplification: 1.5 })

// Agent is 60% sure proposal is right, but group is 90% aligned
const decision = game.decide({
  belief: 0.6,
  groupConsensus: 0.9,
  reputationStake: 1.0,
})
// decision.action = 'challenge' — high consensus amplifies hero bonus
// decision.margin = 0.45 (positive = challenge is better)
// decision.challengeProbability = 1.0

// At what belief level does challenging become unprofitable?
game.criticalBelief(0.9)  // ~0.72 — below this, always challenge

// For 5 agents with these beliefs, how many would challenge at 90% consensus?
game.expectedChallengers([0.5, 0.6, 0.7, 0.8, 0.9], 0.9)  // ~3
```

---

### 11. Optimal Stopping (`OptimalStopping`)

**What it is.** Combines two classical stopping rules. CUSUM (Cumulative Sum) detects when information gain drops below target -- the signal quality changed. Secretary Problem says explore T/e rounds (~37%), then stop at the first result better than anything seen during exploration.

**Why it matters for swarm.** Determines when to stop deliberating. Too early wastes potential; too late wastes compute. The dual mechanism catches both gradual degradation (CUSUM) and having found the best option (Secretary).

**Key formula:**

```typescript
// CUSUM: S_t = max(0, S_{t-1} + (targetGain - actualGain))
// Stop when S_t > threshold (gain has been below target for too long)
//
// Secretary Problem: explore T/e rounds (approx 37% of max)
// Then stop at first result better than best seen during exploration
// Optimal probability of selecting the best: 1/e ~ 36.8%
```

**API:**

```typescript
class OptimalStopping {
  constructor(maxRounds: number, cusumConfig?: Partial<CUSUMConfig>)
  observeRound(metrics: {
    readonly informationGain: number
    readonly bestProposalQuality: number
    readonly round: number
  }): void
  decide(): StoppingDecision
  cusumValue(): number
  isChangeDetected(): boolean
  isExplorationComplete(): boolean
  optimalExplorationLength(): number
}

interface StoppingDecision {
  readonly shouldStop: boolean
  readonly reason: 'cusum-change-detected' | 'secretary-threshold' | 'continue'
  readonly cusumStatistic: number
  readonly explorationComplete: boolean
  readonly roundsObserved: number
  readonly bestSeenDuringExploration: number
  readonly bestSeen: number
}
```

**Code example:**

```typescript
import { OptimalStopping } from '@cognitive-swarm/math'

const stopper = new OptimalStopping(10, { targetGain: 0.05, threshold: 0.3 })
// Exploration length: floor(10/e) = 3 rounds

// Rounds 1-3: exploration phase
stopper.observeRound({ informationGain: 0.15, bestProposalQuality: 0.6, round: 1 })
stopper.observeRound({ informationGain: 0.12, bestProposalQuality: 0.65, round: 2 })
stopper.observeRound({ informationGain: 0.08, bestProposalQuality: 0.7, round: 3 })

// Round 4: exploitation — found something better than exploration best
stopper.observeRound({ informationGain: 0.06, bestProposalQuality: 0.85, round: 4 })

const decision = stopper.decide()
// decision.shouldStop = true
// decision.reason = 'secretary-threshold'
// decision.bestSeen = 0.85
```

---

### 12. Shapley Values (`ShapleyValuator`)

**What it is.** From cooperative game theory, the Shapley value gives each agent's fair contribution by averaging their marginal value across all possible coalition orderings. O(2^n) exact computation for n <= 15, Monte Carlo approximation for larger swarms.

**Why it matters for swarm.** Identifies which agents actually contribute value and which are free-riders. Used for reputation updates, optimal sub-team formation, and detecting redundant agents (Shapley value < threshold).

**Key formula:**

```typescript
// Shapley value for agent i:
// phi_i = Sum over S not containing i:
//   |S|! * (n-|S|-1)! / n!  *  [v(S union {i}) - v(S)]
//
// Properties:
// - Sum of all Shapley values = v(grand coalition)
// - Symmetric agents get equal value
// - Null agents (contribute nothing) get 0
```

**API:**

```typescript
class ShapleyValuator {
  constructor(agents: readonly string[])
  setCoalitionValue(coalition: readonly string[], value: number): void
  setValueFunction(fn: (coalition: readonly string[]) => number): void
  computeExact(): ShapleyResult               // O(2^n), n <= 15
  computeApproximate(samples?: number): ShapleyResult  // Monte Carlo, default 1000
  shapleyValue(agentId: string): number
  findRedundant(threshold: number): readonly string[]
  optimalCoalition(k: number): readonly string[]
  get agentCount(): number
}

interface ShapleyResult {
  readonly values: ReadonlyMap<string, number>  // sums to totalValue
  readonly totalValue: number
}
```

**Code example:**

```typescript
import { ShapleyValuator } from '@cognitive-swarm/math'

const sv = new ShapleyValuator(['analyst', 'critic', 'builder'])

// Define value function: what's the quality with each subset?
sv.setValueFunction((coalition) => {
  let score = 0
  if (coalition.includes('analyst')) score += 0.4
  if (coalition.includes('critic')) score += 0.3
  if (coalition.includes('builder')) score += 0.2
  // Synergy: analyst + critic together is more than sum
  if (coalition.includes('analyst') && coalition.includes('critic')) score += 0.15
  return score
})

const result = sv.computeExact()
// result.values -> { analyst: 0.425, critic: 0.325, builder: 0.2 }
// result.totalValue = 0.95 (grand coalition)

sv.findRedundant(0.1)      // [] — nobody below 0.1
sv.optimalCoalition(2)     // ['analyst', 'critic'] — best 2-agent team
```

---

### 17. Regret Minimization (`RegretMinimizer`)

**What it is.** Multi-armed bandit with UCB1 (deterministic optimistic exploration) and Thompson Sampling (Bayesian posterior sampling). Provides provable regret bounds: O(sqrt(K * T * ln T)) where K is strategies and T is rounds.

**Why it matters for swarm.** Upgrades replicator dynamics with theoretical guarantees. Used for strategy selection (which signal type to emit), agent activation (which agents to wake), and exploration budget allocation.

**Key formula:**

```typescript
// UCB1: select argmax_a [ mean_a + sqrt(2 * ln(t) / n_a) ]
// The confidence bonus shrinks as we learn more about each arm.
//
// Thompson Sampling: sample theta ~ Beta(alpha, beta), select max theta.
// alpha = successes + 1, beta = failures + 1 (starts at Beta(1,1) = uniform)
//
// Regret bound: R(T) <= O(sqrt(K * T * ln T))
```

**API:**

```typescript
class RegretMinimizer {
  constructor(armIds: readonly string[])
  selectArm(method?: 'ucb1' | 'thompson'): ArmSelection
  update(armId: string, reward: number): void    // reward in [0, 1]
  report(): RegretReport
  getArms(): readonly BanditArm[]
  addArm(id: string): void
  get armCount(): number
  get rounds(): number
}

interface RegretReport {
  readonly arms: readonly BanditArm[]
  readonly totalPulls: number
  readonly cumulativeRegret: number
  readonly theoreticalBound: number
  readonly efficiency: number       // regret / bound, lower = better
  readonly bestArm: string | null
  readonly converged: boolean
}
```

**Code example:**

```typescript
import { RegretMinimizer } from '@cognitive-swarm/math'

const bandit = new RegretMinimizer(['propose', 'challenge', 'support', 'analyze'])

for (let round = 0; round < 20; round++) {
  const choice = bandit.selectArm('thompson')
  // Simulate: challenges tend to produce higher quality
  const reward = choice.armId === 'challenge' ? 0.7 + Math.random() * 0.3
    : 0.3 + Math.random() * 0.4
  bandit.update(choice.armId, reward)
}

const report = bandit.report()
// report.bestArm = 'challenge'
// report.cumulativeRegret = 3.2
// report.theoreticalBound = 8.7
// report.efficiency = 0.37 (well below bound — good exploration)
// report.converged = true (confident about best arm)
```

---

## Category 4: Dynamics & Optimization

### 4. Markov Chains (`MarkovChain`)

**What it is.** Learns transition probabilities between signal types from observed sequences. Predicts future swarm behavior via Monte Carlo simulation and computes the stationary distribution (long-run equilibrium).

**Why it matters for swarm.** Predicts convergence time (how many rounds to reach consensus), detects signal flow cycles (proposal -> doubt -> proposal -> doubt...), and computes the long-run probability of reaching any target state.

**Key formula:**

```typescript
// Transition probability: P(to | from) = count(from->to) / count(from->*)
//
// Stationary distribution pi: piP = pi  (eigenvector with eigenvalue 1)
// Computed via power iteration: pi(t+1) = pi(t) * P
//
// Convergence: Monte Carlo simulation from current state to target
```

**API:**

```typescript
class MarkovChain {
  observe(from: string, to: string): void
  observeSequence(sequence: readonly string[]): void
  transitionProbability(from: string, to: string): number
  transitionRow(from: string): ReadonlyMap<string, number>
  getTransitionMatrix(): { states: readonly string[]; matrix: readonly (readonly number[])[] }
  predictConvergence(targetState: string, maxSteps: number,
                     simulations?: number, startState?: string): ConvergencePrediction
  computeStationaryDistribution(iterations?: number): ReadonlyMap<string, number>
  detectCycles(massThreshold?: number): CycleReport
  get observedStates(): ReadonlySet<string>
  get transitionCount(): number
}
```

**Code example:**

```typescript
import { MarkovChain } from '@cognitive-swarm/math'

const mc = new MarkovChain()
mc.observe('task:new', 'discovery')
mc.observe('discovery', 'proposal')
mc.observe('discovery', 'doubt')
mc.observe('proposal', 'vote')
mc.observe('doubt', 'discovery')
mc.observe('vote', 'consensus:reached')

mc.transitionProbability('discovery', 'proposal')  // 0.5
mc.transitionProbability('discovery', 'doubt')     // 0.5

const pred = mc.predictConvergence('consensus:reached', 20)
// pred.expectedSteps ≈ 5.3
// pred.probability ≈ 0.87 (87% chance of reaching consensus in 20 steps)

const cycles = mc.detectCycles()
// cycles.detected = true
// cycles.states = ['discovery', 'doubt'] (discovery <-> doubt loop)
// cycles.cycleMass = 0.4 (40% of time spent in the cycle)
```

---

### 6. Particle Swarm Optimization (`ParticleSwarm`)

**What it is.** Each agent is a particle in embedding space, attracted to both its personal best position and the global best. Inertia preserves exploration diversity. Used for navigating continuous solution spaces.

**Why it matters for swarm.** When proposals are embedded as vectors, PSO guides agents toward promising regions while maintaining exploration of underexplored areas. The diversity metric tells you when the swarm has collapsed to a single point (converged or stuck).

**Key formula:**

```typescript
// Velocity update:
// v(t+1) = w*v(t) + c1*r1*(pBest - x) + c2*r2*(gBest - x)
//
// Position update:
// x(t+1) = x(t) + v(t+1)
//
// w = inertia (0.7), c1 = cognitive (1.5), c2 = social (1.5)
// r1, r2 = random in [0, 1]
```

**API:**

```typescript
class ParticleSwarm {
  constructor(dimensions: number, config?: Partial<PSOConfig>)
  addParticle(id: string, position: readonly number[]): void
  updateFitness(id: string, fitness: number): void
  setPosition(id: string, position: readonly number[]): void
  step(): PSOStepResult
  suggestExploration(): { direction: readonly number[]; centroid: readonly number[] }
  getGlobalBest(): { position: readonly number[]; fitness: number }
  getParticle(id: string): Particle | undefined
  get particleCount(): number
  get iteration(): number
}

interface PSOConfig {
  readonly inertia: number         // default: 0.7
  readonly cognitiveCoeff: number  // default: 1.5
  readonly socialCoeff: number     // default: 1.5
  readonly maxVelocity: number     // default: 1.0
}
```

**Code example:**

```typescript
import { ParticleSwarm } from '@cognitive-swarm/math'

const pso = new ParticleSwarm(3, { inertia: 0.7, socialCoeff: 1.5 })

pso.addParticle('agent-1', [0.1, 0.2, 0.3])
pso.addParticle('agent-2', [0.8, 0.7, 0.6])
pso.addParticle('agent-3', [0.5, 0.5, 0.5])

// Agent-1 found a good solution
pso.updateFitness('agent-1', 0.9)

const result = pso.step()
// result.gBestFitness = 0.9
// result.diversity = 0.35 (agents spread out)
// Particles attracted toward agent-1's position

const explore = pso.suggestExploration()
// explore.direction = [0.6, 0.4, -0.2] (opposite to most-explored region)
```

---

### 8. Opinion Dynamics (`OpinionDynamics`)

**What it is.** Hegselmann-Krause bounded confidence model. Each agent averages the opinions of others that are within its confidence bound (epsilon). High epsilon = conformist (listens to everyone). Low epsilon = independent (only listens to similar opinions). Predicts whether the swarm will reach consensus, polarize into factions, or fragment.

**Why it matters for swarm.** Identifies bridging agents who can connect divergent opinion clusters, predicts fragmentation risk before it happens, and estimates how many more rounds until equilibrium.

**Key formula:**

```typescript
// Hegselmann-Krause update:
// x_i(t+1) = mean of { x_j(t) : |x_j(t) - x_i(t)| <= epsilon_i }
//
// Mapping from agent conformity to epsilon:
// epsilon = 0.1 + 0.5 * conformity
// conformity=0 -> eps=0.1 (stubborn)
// conformity=1 -> eps=0.6 (very open)
//
// Polarization index = normalized variance, [0, 1]
```

**API:**

```typescript
class OpinionDynamics {
  constructor(defaultEpsilon?: number)
  setOpinion(agentId: string, opinion: number, epsilon?: number): void
  setFromConformity(agentId: string, opinion: number, conformity: number): void
  step(): ReadonlyMap<string, number>
  predict(maxSteps?: number): PolarizationReport
  polarizationIndex(): number
  findBridgingAgentsCurrent(): readonly string[]
  getOpinions(): ReadonlyMap<string, number>
  get agentCount(): number
}

interface PolarizationReport {
  readonly clusterCount: number
  readonly clusters: readonly OpinionCluster[]
  readonly polarizationIndex: number             // [0, 1]
  readonly convergenceEstimate: number           // rounds
  readonly fragmentationRisk: 'low' | 'medium' | 'high'
  readonly bridgingAgents: readonly string[]
}
```

**Code example:**

```typescript
import { OpinionDynamics } from '@cognitive-swarm/math'

const hk = new OpinionDynamics()

hk.setOpinion('agent-hawk', 0.9, 0.2)    // strong opinion, narrow confidence
hk.setOpinion('agent-dove', 0.1, 0.2)    // opposite opinion, narrow confidence
hk.setOpinion('agent-moderate', 0.5, 0.5) // middle ground, wide confidence

const report = hk.predict()
// report.clusterCount = 2 (hawks and doves don't converge)
// report.fragmentationRisk = 'medium'
// report.bridgingAgents = ['agent-moderate'] (can reach both clusters)
// report.convergenceEstimate = 12 rounds
// report.polarizationIndex = 0.64
```

---

### 9. Replicator Dynamics (`ReplicatorDynamics`)

**What it is.** Evolutionary strategy balancing from population biology. Strategies with above-average fitness grow in frequency; below-average strategies shrink. Finds the Evolutionary Stable Strategy (ESS) that no mutant can invade.

**Why it matters for swarm.** Balances signal types (propose, challenge, support, analyze) by evolving their frequencies toward the equilibrium mix. If challenges are rare but valuable, replicator dynamics will increase challenge frequency until the system finds balance.

**Key formula:**

```typescript
// Replicator equation:
// x_i(t+1) = x_i(t) * f_i(t) / phi(t)
// where phi = sum x_i * f_i (population average fitness)
//
// Above-average fitness strategies grow.
// Below-average strategies shrink.
// Minimum frequency floor prevents total extinction.
```

**API:**

```typescript
class ReplicatorDynamics {
  constructor(strategies: readonly string[])
  observeRound(frequencies: ReadonlyMap<string, number>,
               fitness: ReadonlyMap<string, number>): void
  step(freq?: Map<string, number>,
       fit?: ReadonlyMap<string, number>): Map<string, number>
  findEquilibrium(maxSteps?: number): ReadonlyMap<string, number>
  isESSStable(strategy: string): boolean
  analyze(): EvolutionaryReport
  get rounds(): number
}

interface EvolutionaryReport {
  readonly currentDistribution: ReadonlyMap<string, number>
  readonly fitnessValues: ReadonlyMap<string, number>
  readonly equilibrium: ReadonlyMap<string, number>
  readonly convergenceToESS: number        // KL divergence to ESS
  readonly suggestedShifts: readonly StrategyShift[]
  readonly dominantStrategy: string | null
  readonly averageFitness: number
}
```

**Code example:**

```typescript
import { ReplicatorDynamics } from '@cognitive-swarm/math'

const rd = new ReplicatorDynamics(['propose', 'challenge', 'support', 'analyze'])

// Round 1: too many proposals, challenges are rare but valuable
rd.observeRound(
  new Map([['propose', 0.6], ['challenge', 0.1], ['support', 0.2], ['analyze', 0.1]]),
  new Map([['propose', 0.3], ['challenge', 0.9], ['support', 0.4], ['analyze', 0.5]]),
)

const report = rd.analyze()
// report.dominantStrategy = 'challenge' (highest fitness)
// report.suggestedShifts = [
//   { strategy: 'challenge', direction: 'increase', magnitude: 0.25 },
//   { strategy: 'propose', direction: 'decrease', magnitude: 0.3 },
// ]
// report.equilibrium -> { propose: 0.2, challenge: 0.35, support: 0.25, analyze: 0.2 }
```

---

### 18. Phase Transitions (`PhaseTransitionDetector`)

**What it is.** Detects the critical point between order (groupthink) and disorder (chaos) where collective intelligence peaks. Uses susceptibility chi = Var(m) * N which peaks at the phase transition, analogous to the Ising model in physics.

**Why it matters for swarm.** The swarm operates best at criticality -- maximum responsiveness, maximum information transmission. Too ordered = groupthink. Too disordered = chaos. The detector provides control recommendations to maintain the critical point.

**Key formula:**

```typescript
// Order parameter: m = MAP probability (consensus strength)
//   m -> 1/K: disordered (no consensus)
//   m -> 1:   ordered (full consensus)
//
// Susceptibility: chi = Var(m) * N   (over sliding window)
// chi peaks at the critical point
//
// Power-law signature: CV > 1 AND skewness > 1
```

**API:**

```typescript
class PhaseTransitionDetector {
  constructor(config?: Partial<PhaseTransitionConfig>)
  observeRound(orderParameter: number, roundSurprises: readonly number[]): void
  detect(): PhaseState
  recommend(): PhaseControl
  report(): PhaseReport
  get roundCount(): number
}

interface PhaseState {
  readonly phase: 'ordered' | 'critical' | 'disordered'
  readonly orderParameter: number
  readonly susceptibility: number
  readonly criticalityScore: number   // [0, 1], 1 = at criticality
  readonly scaleFreeSignature: boolean
  readonly trend: number
}

interface PhaseControl {
  readonly action: 'maintain' | 'increase-exploration' | 'decrease-exploration' | 'inject-challenge'
  readonly intensity: number           // [0, 1]
  readonly rationale: string
  readonly explorationMultiplier: number
}
```

**Code example:**

```typescript
import { PhaseTransitionDetector } from '@cognitive-swarm/math'

const detector = new PhaseTransitionDetector({
  orderedThreshold: 0.8,
  disorderedThreshold: 0.35,
})

detector.observeRound(0.45, [0.3, 0.1, 0.8, 0.02, 1.5])
detector.observeRound(0.50, [0.2, 0.4, 0.6, 0.1])
detector.observeRound(0.48, [0.5, 0.3, 0.7, 0.9])

const state = detector.detect()
// state.phase = 'critical'
// state.criticalityScore = 0.85
// state.scaleFreeSignature = true (power-law fluctuations)

const control = detector.recommend()
// control.action = 'maintain'
// control.explorationMultiplier = 1.0
```

---

## Category 5: Geometry & Topology

### 7. Topological Data Analysis (`TopologyAnalyzer`)

**What it is.** Finds clusters, gaps, and persistent features in proposal embedding space using single-linkage hierarchical clustering and persistent homology (dimension 0 -- connected components). Long-lived components are real clusters; short-lived ones are noise.

**Why it matters for swarm.** Shows WHERE ideas are concentrated and where gaps exist. Gap midpoints become exploration targets -- the swarm is told "nobody has proposed anything in this region of solution space."

**API:**

```typescript
class TopologyAnalyzer {
  addPoint(point: TopologyPoint): void         // { id, embedding, label? }
  addPoints(points: readonly TopologyPoint[]): void
  findClusters(threshold: number): readonly Cluster[]
  findGaps(clusterThreshold: number): readonly Gap[]
  persistenceDiagram(): readonly PersistencePair[]
  suggestExploration(clusterThreshold: number):
    { direction: readonly number[]; reason: string } | null
  get pointCount(): number
}

interface Cluster {
  readonly id: number
  readonly points: readonly TopologyPoint[]
  readonly centroid: readonly number[]
  readonly diameter: number
}

interface Gap {
  readonly clusterA: number
  readonly clusterB: number
  readonly midpoint: readonly number[]
  readonly distance: number
}

interface PersistencePair {
  readonly birth: number       // distance where feature appeared
  readonly death: number       // distance where feature merged
  readonly persistence: number // lifetime (longer = more significant)
  readonly dimension: 0
}
```

**Code example:**

```typescript
import { TopologyAnalyzer } from '@cognitive-swarm/math'

const tda = new TopologyAnalyzer()

// Two clusters of proposals in embedding space
tda.addPoint({ id: 'scale-up', embedding: [0.1, 0.2, 0.15] })
tda.addPoint({ id: 'scale-out', embedding: [0.15, 0.22, 0.12] })
tda.addPoint({ id: 'optimize', embedding: [0.9, 0.8, 0.85] })
tda.addPoint({ id: 'refactor', embedding: [0.85, 0.75, 0.88] })

const clusters = tda.findClusters(0.3)
// 2 clusters: {scale-up, scale-out} and {optimize, refactor}

const gaps = tda.findGaps(0.3)
// gaps[0].midpoint = [0.5, 0.5, 0.5] — unexplored middle ground

const suggestion = tda.suggestExploration(0.3)
// suggestion.direction = [0.5, 0.5, 0.5]
// suggestion.reason = 'Gap between cluster 0 and 1 (distance: 1.05)'

const persistence = tda.persistenceDiagram()
// persistence[0].persistence = 0.85 (long-lived = real cluster boundary)
```

---

### 22. Optimal Transport (`wasserstein1`, `wassersteinBarycenter`, `BeliefDistanceTracker`)

**What it is.** Wasserstein (Earth Mover's) distance measures the minimum "work" to transform one distribution into another. Unlike KL divergence, it is always finite (no division-by-zero), satisfies the triangle inequality, and is geometrically meaningful. The barycenter is the mathematically optimal consensus point.

**Why it matters for swarm.** KL divergence returns Infinity when distributions have different supports (agent believes in proposal X, consensus doesn't). Wasserstein always returns a meaningful finite distance. The barycenter computes the ideal consensus as the distribution that minimizes total transport cost from all agents.

**Key formula:**

```typescript
// Wasserstein-1 (Earth Mover's Distance):
// W1(P, Q) = min over transport plans T: Sum T_ij * d(i,j)
// subject to: row sums = P, column sums = Q
//
// For small N: exact greedy algorithm
// For large N: Sinkhorn approximation (entropic regularization)
//
// Barycenter: beta = argmin_c Sum w_i * W1(c, P_i)
// Under uniform ground metric: reduces to weighted average
```

**API:**

```typescript
function wasserstein1(
  p: ReadonlyMap<string, number>,
  q: ReadonlyMap<string, number>,
  groundDistance?: (a: string, b: string) => number,
): WassersteinResult  // { distance, transportPlan }

function wassersteinBarycenter(
  distributions: readonly ReadonlyMap<string, number>[],
  weights?: readonly number[],
): BarycenterResult  // { distribution, totalCost, individualCosts }

class BeliefDistanceTracker {
  setBeliefs(agentId: string, beliefs: ReadonlyMap<string, number>): void
  pairwiseDistances(): readonly BeliefDistance[]
  clusterAgents(threshold: number): readonly (readonly string[])[]
  optimalConsensus(): BarycenterResult
  agentDrift(agentId: string): { mean: number; recent: number }
  get agentCount(): number
}
```

**Code example:**

```typescript
import { wasserstein1, wassersteinBarycenter, BeliefDistanceTracker } from '@cognitive-swarm/math'

const p = new Map([['A', 0.9], ['B', 0.1], ['C', 0.0]])
const q = new Map([['A', 0.0], ['B', 0.1], ['C', 0.9]])

const result = wasserstein1(p, q)
// result.distance = 0.9 (finite! KL would return Infinity)
// result.transportPlan = [{ from: 'A', to: 'C', mass: 0.9, cost: 1 }]

// Compute optimal consensus from 3 agents
const consensus = wassersteinBarycenter([
  new Map([['A', 0.8], ['B', 0.2]]),
  new Map([['A', 0.3], ['B', 0.7]]),
  new Map([['A', 0.5], ['B', 0.5]]),
])
// consensus.distribution ≈ { A: 0.53, B: 0.47 }

// Track distances over time
const tracker = new BeliefDistanceTracker()
tracker.setBeliefs('agent-1', new Map([['A', 0.9], ['B', 0.1]]))
tracker.setBeliefs('agent-2', new Map([['A', 0.2], ['B', 0.8]]))

const clusters = tracker.clusterAgents(0.3)
// [[agent-1], [agent-2]] — too far apart to cluster
```

---

## Category 6: Stability & Chaos

### 19. KL-Divergence Tracker (`KLDivergenceTracker`)

**What it is.** Tracks per-agent KL divergence from consensus and pairwise Jensen-Shannon divergence between agents. Monitors consensus drift between rounds.

**Why it matters for swarm.** Identifies outlier agents who deviate strongly from consensus (potential dissenters or innovators). Tracks whether beliefs are converging or diverging over time. The drift trend is a leading indicator of instability.

**API:**

```typescript
class KLDivergenceTracker {
  constructor(outlierThreshold?: number)   // default: 0.5
  setBeliefs(agentId: string, beliefs: ReadonlyMap<string, number>): void
  setConsensus(consensus: ReadonlyMap<string, number>): void
  endRound(): void
  report(): KLDivergenceReport
  get agentCount(): number
  get roundCount(): number
}

interface KLDivergenceReport {
  readonly agentDivergences: readonly AgentDivergence[]
  readonly meanDivergence: number
  readonly outliers: readonly string[]
  readonly pairwiseJSD: readonly AgentPairJSD[]
  readonly meanPairwiseJSD: number
  readonly consensusDrift: number      // how much consensus shifted this round
  readonly driftTrend: number          // positive = diverging, negative = converging
  readonly driftHistory: readonly number[]
}
```

**Code example:**

```typescript
import { KLDivergenceTracker } from '@cognitive-swarm/math'

const tracker = new KLDivergenceTracker(0.5) // outlier threshold

tracker.setBeliefs('conformist', new Map([['A', 0.6], ['B', 0.4]]))
tracker.setBeliefs('rebel', new Map([['A', 0.1], ['B', 0.9]]))
tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
tracker.endRound()

const report = tracker.report()
// report.outliers = ['rebel'] (KL > 0.5 from consensus)
// report.meanPairwiseJSD = 0.28 (agents disagree significantly)
// report.consensusDrift = 0 (first round, no previous consensus)
```

---

### 20. Chaos Detector (`ChaosDetector`)

**What it is.** Detects chaos in opinion dynamics via period analysis, Sharkovskii's theorem (period-3 implies all periods), Feigenbaum period-doubling cascade (1->2->4->8->chaos), and Lyapunov exponent estimation. Provides risk assessment and actionable recommendations.

**Why it matters for swarm.** When proposals oscillate (A wins, then B, then A...), the answer might be a synthesis, not forcing convergence. Period-3 oscillation is a critical chaos signal. The Feigenbaum cascade warns of approaching chaos before it hits.

**Key formula:**

```typescript
// Period detection: repeating winner pattern of length p
// Sharkovskii: period-3 point exists -> periods of ALL lengths exist (Li-Yorke chaos)
// Feigenbaum cascade: 1 -> 2 -> 4 -> 8 -> chaos, ratio converges to delta ~ 4.669
// Lyapunov exponent: lambda = mean(log|derivative|)
//   lambda > 0: chaos (trajectories diverge exponentially)
//   lambda < 0: stable orbit
```

**API:**

```typescript
class ChaosDetector {
  observeWinner(winnerId: string, confidence?: number): void
  report(): ChaosReport
  get roundCount(): number
}

interface ChaosReport {
  readonly period: number               // 0 = no cycle
  readonly sharkovskiiTriggered: boolean
  readonly doublingDetected: boolean
  readonly periodHistory: readonly number[]
  readonly feigenbaumRatio: number | null
  readonly lyapunovExponent: number
  readonly chaosRisk: 'none' | 'low' | 'moderate' | 'high' | 'critical'
  readonly recommendation: 'continue' | 'monitor' | 'synthesize' | 'restructure' | 'force-decision'
  readonly estimatedRoundsToChaos: number | null
}
```

**Code example:**

```typescript
import { ChaosDetector } from '@cognitive-swarm/math'

const detector = new ChaosDetector()

// Period-2 oscillation: proposals alternate
detector.observeWinner('scale-up', 0.6)
detector.observeWinner('optimize', 0.55)
detector.observeWinner('scale-up', 0.58)
detector.observeWinner('optimize', 0.52)
detector.observeWinner('scale-up', 0.56)
detector.observeWinner('optimize', 0.54)

const report = detector.report()
// report.period = 2
// report.chaosRisk = 'low'
// report.recommendation = 'synthesize' — competing views are complementary
// report.lyapunovExponent < 0 (stable oscillation)
```

---

### 21. Lyapunov Stability (`LyapunovStability`)

**What it is.** Treats consensus as an equilibrium point and measures how agent beliefs deviate from it. The Lyapunov function V = sum(belief_i - consensus)^2 is a natural energy measure. If V consistently decreases (V_dot < 0), the consensus is asymptotically stable and will persist under perturbation.

**Why it matters for swarm.** Reaching consensus is not enough -- you need to know if it will HOLD. Asymptotic stability means the consensus survives challenges. Marginal stability means any perturbation breaks it. The adjustedConfidence value modulates the raw confidence score by stability.

**Key formula:**

```typescript
// Lyapunov function: V(t) = (1/N) * Sum_i (belief_i - consensus)^2
// Time derivative: V_dot = V(t) - V(t-1)
//   V_dot < 0 consistently -> asymptotically stable
//   V_dot ~ 0              -> marginally stable (fragile)
//   V_dot > 0              -> unstable (consensus dissolving)
//
// Routh-Hurwitz: fits characteristic polynomial to V(t) time series,
// checks if all roots have negative real parts (algebraic stability)
```

**API:**

```typescript
class LyapunovStability {
  constructor(config?: LyapunovConfig)
  observe(agentBeliefs: ReadonlyMap<string, number>, consensusValue: number): void
  report(rawConfidence?: number): LyapunovReport
  get roundCount(): number
}

interface LyapunovReport {
  readonly lyapunovV: number
  readonly lyapunovDot: number
  readonly stable: boolean
  readonly type: 'asymptotic' | 'marginal' | 'unstable'
  readonly perturbationTolerance: number
  readonly adjustedConfidence: number       // raw confidence * stability factor
  readonly convergenceRate: number          // exponential decay rate
  readonly history: readonly number[]
  readonly routhHurwitz: RouthHurwitzResult | null
}
```

**Code example:**

```typescript
import { LyapunovStability } from '@cognitive-swarm/math'

const lyapunov = new LyapunovStability()

// Round 1: agents spread out
lyapunov.observe(new Map([['a1', 0.9], ['a2', 0.4], ['a3', 0.7]]), 0.7)

// Round 2: agents converge
lyapunov.observe(new Map([['a1', 0.85], ['a2', 0.55], ['a3', 0.72]]), 0.72)

// Round 3: even closer
lyapunov.observe(new Map([['a1', 0.78], ['a2', 0.65], ['a3', 0.73]]), 0.73)

const report = lyapunov.report(0.75)
// report.type = 'asymptotic' (V decreasing consistently)
// report.adjustedConfidence = 0.83 (boosted: consensus is solid)
// report.perturbationTolerance = 0.7 (can absorb significant challenges)
// report.convergenceRate = -0.4 (exponential decay)
```

---

### 23. Damping Classifier (`DampingClassifier`)

**What it is.** Classifies the convergence regime of a time series (entropy, opinion variance, etc.) using second-order system damping theory. Overdamped (zeta > 1) = converged too fast, potential groupthink. Critically damped (zeta = 1) = optimal. Underdamped (zeta < 1) = oscillating, needs more rounds.

**Why it matters for swarm.** An overdamped swarm is a warning sign -- alternatives may not have been explored. An underdamped swarm tells you to expect oscillations and plan accordingly. The settling-rounds estimate predicts when oscillation will decay.

**Key formula:**

```typescript
// Second-order system: y'' + 2*zeta*omega*y' + omega^2*y = 0
// zeta > 1:  overdamped  (monotone convergence, too fast)
// zeta = 1:  critically damped (optimal speed)
// zeta < 1:  underdamped (oscillates before settling)
//
// Logarithmic decrement (for underdamped):
// zeta = delta / sqrt(4*pi^2 + delta^2)
// where delta = ln(A1/A2), A1/A2 = successive peak amplitudes
//
// Settling time ~ 3 / (zeta * omega)
```

**API:**

```typescript
class DampingClassifier {
  constructor(config?: DampingConfig)
  observe(value: number): void
  report(): DampingReport
  get roundCount(): number
}

interface DampingReport {
  readonly dampingRatio: number          // zeta
  readonly naturalFrequency: number      // omega
  readonly regime: 'overdamped' | 'critically-damped' | 'underdamped' | 'undetermined'
  readonly diagnostic: string
  readonly oscillationCount: number
  readonly settlingRounds: number | null
}
```

**Code example:**

```typescript
import { DampingClassifier } from '@cognitive-swarm/math'

const classifier = new DampingClassifier()

// Feed entropy values each round — rapid convergence
classifier.observe(0.95)
classifier.observe(0.60)
classifier.observe(0.35)
classifier.observe(0.32)
classifier.observe(0.31)

const report = classifier.report()
// report.regime = 'overdamped'
// report.dampingRatio = 2.1
// report.diagnostic = 'Consensus converged very quickly (zeta=2.10).
//   Risk: alternatives may not have been adequately explored.'
// report.oscillationCount = 0
```

---

## Category 7: Linear Algebra

### 10. Influence Graph (`InfluenceGraph`)

**What it is.** A directed weighted graph where edges represent how much one agent's signals influenced another's votes. Computes eigenvector centrality (PageRank-like) via power iteration and algebraic connectivity (Fiedler value) of the graph Laplacian.

**Why it matters for swarm.** Identifies the dominant influencer, isolated agents, and fragile network structures. High Gini coefficient of centrality means influence is concentrated (potential single point of failure). Low Fiedler value means the network could split.

**Key formula:**

```typescript
// Eigenvector centrality: dominant eigenvector of adjacency matrix A^T
// via power iteration: v(t+1) = A^T * v(t) / ||A^T * v(t)||
//
// Algebraic connectivity (Fiedler value):
// lambda_2 = second-smallest eigenvalue of graph Laplacian L = D - A
// lambda_2 = 0 -> disconnected graph
// lambda_2 > 0 -> connected, higher = more robust
```

**API:**

```typescript
class InfluenceGraph {
  addEdge(edge: InfluenceEdge): void    // { from, to, weight }
  computeCentrality(iterations?: number): ReadonlyMap<string, number>
  algebraicConnectivity(): number
  analyze(): InfluenceReport
  robustnessCheck(agentId: string): { connected: boolean; components: number }
  get edgeCount(): number
  get nodeCount(): number
}

interface InfluenceReport {
  readonly centrality: ReadonlyMap<string, number>
  readonly fiedlerValue: number
  readonly dominantInfluencer: string | undefined
  readonly isolatedAgents: readonly string[]
  readonly influenceConcentration: number   // Gini coefficient [0, 1]
  readonly isFragile: boolean               // removing dominant disconnects graph
}
```

**Code example:**

```typescript
import { InfluenceGraph } from '@cognitive-swarm/math'

const graph = new InfluenceGraph()

graph.addEdge({ from: 'architect', to: 'developer', weight: 0.9 })
graph.addEdge({ from: 'architect', to: 'tester', weight: 0.6 })
graph.addEdge({ from: 'developer', to: 'tester', weight: 0.4 })
graph.addEdge({ from: 'tester', to: 'architect', weight: 0.3 })

const report = graph.analyze()
// report.dominantInfluencer = 'architect'
// report.fiedlerValue = 0.42 (connected but not very robust)
// report.influenceConcentration = 0.35 (somewhat unequal)
// report.isFragile = false

// What if the architect is removed?
graph.robustnessCheck('architect')
// { connected: true, components: 1 } — graph survives
```

---

### 25. SVD Analyzer (`SVDAnalyzer`)

**What it is.** Decomposes the agent x proposal vote matrix A = U * Sigma * V^T to find latent debate dimensions. If the first singular value explains >80% of variance, the swarm is debating one thing along one axis, even if there are 5 proposals on paper.

**Why it matters for swarm.** Reveals the true dimensionality of disagreement. A 1-dimensional debate with 5 proposals means 4 proposals are redundant (just variations on the same axis). High effective rank means genuine multi-dimensional disagreement requiring synthesis, not simple majority voting.

**Key formula:**

```typescript
// Singular Value Decomposition: A = U * Sigma * V^T
// Sigma contains singular values sigma_1 >= sigma_2 >= ...
//
// Explained variance: sigma_i^2 / Sum(sigma_j^2)
// Effective rank: dimensions explaining > 95% of variance
//
// Computed via power iteration on A^T * A (eigenvalues = sigma_i^2)
// with deflation for successive singular values
```

**API:**

```typescript
class SVDAnalyzer {
  recordVote(agentId: string, proposalId: string, strength: number): void
  report(): SVDReport
  get agentCount(): number
  get proposalCount(): number
}

interface SVDReport {
  readonly singularValues: readonly number[]
  readonly explainedVariance: readonly number[]    // per dimension, [0, 1]
  readonly cumulativeVariance: readonly number[]
  readonly effectiveRank: number
  readonly oneDimensional: boolean                 // true if first dim > 80%
  readonly proposalCount: number
  readonly agentCount: number
  readonly diagnostic: string
}
```

**Code example:**

```typescript
import { SVDAnalyzer } from '@cognitive-swarm/math'

const svd = new SVDAnalyzer()

// Agents disagree along one axis: A vs B
svd.recordVote('hawk-1', 'aggressive', 0.9)
svd.recordVote('hawk-1', 'conservative', -0.8)
svd.recordVote('hawk-2', 'aggressive', 0.7)
svd.recordVote('hawk-2', 'conservative', -0.6)
svd.recordVote('dove-1', 'aggressive', -0.5)
svd.recordVote('dove-1', 'conservative', 0.9)

const report = svd.report()
// report.effectiveRank = 1
// report.oneDimensional = true
// report.explainedVariance[0] = 0.95
// report.diagnostic = 'Debate is essentially 1-dimensional (95% variance
//   in first component). Despite 2 proposals, agents disagree along a single axis.'
```

---

### 27. Projection Consensus (`ProjectionConsensus`)

**What it is.** Weighted least-squares consensus via the projection theorem. The consensus point c* minimizes the total weighted squared distance from all agent beliefs: c* = sum(w_i * belief_i) / sum(w_i). Faster than Wasserstein barycenter but less general.

**Why it matters for swarm.** Provides the fastest possible consensus computation (closed-form, no iteration). The residuals show how far each agent is from consensus, and the "tight" flag indicates whether consensus is genuine or forced.

**Key formula:**

```typescript
// Weighted least-squares consensus:
// c* = argmin_c Sum_i w_i * ||belief_i - c||^2
//
// Closed-form solution:
// c*[k] = Sum_i w_i * belief_i[k] / Sum_i w_i
//
// Total residual: Sum_i w_i * ||belief_i - c*||^2
// Lower residual = more agreement
```

**API:**

```typescript
class ProjectionConsensus {
  setBeliefs(agentId: string, belief: ReadonlyMap<string, number>, weight?: number): void
  compute(tightThreshold?: number): ProjectionResult   // default: 0.05
  get agentCount(): number
}

interface ProjectionResult {
  readonly consensus: ReadonlyMap<string, number>
  readonly totalResidual: number
  readonly agentResiduals: ReadonlyMap<string, number>
  readonly meanResidual: number
  readonly tight: boolean    // true if meanResidual < threshold
}
```

**Code example:**

```typescript
import { ProjectionConsensus } from '@cognitive-swarm/math'

const proj = new ProjectionConsensus()

proj.setBeliefs('senior-dev', new Map([['refactor', 0.8], ['rewrite', 0.2]]), 2.0)
proj.setBeliefs('junior-dev', new Map([['refactor', 0.3], ['rewrite', 0.7]]), 0.5)
proj.setBeliefs('manager', new Map([['refactor', 0.6], ['rewrite', 0.4]]), 1.0)

const result = proj.compute()
// Consensus weighted toward senior-dev (weight 2.0):
// result.consensus ≈ { refactor: 0.67, rewrite: 0.33 }
// result.tight = true (agents not too far apart)
// result.agentResiduals -> shows junior-dev has highest residual
```

---

## Category 8: Systems Thinking

### 24. System Archetypes (`ArchetypeDetector`)

**What it is.** Detects three Meadows/Senge system archetypes in swarm behavior: Limits to Growth (signal volume up, information gain down), Shifting the Burden (spawning agents doesn't fix root cause), and Tragedy of the Commons (redundant agents degrade collective signal quality).

**Why it matters for swarm.** These are structural pathologies that can't be fixed by parameter tuning. Each archetype comes with a recommended leverage point for intervention at the right systemic level.

**API:**

```typescript
class ArchetypeDetector {
  constructor(config?: ArchetypeConfig)
  observe(metrics: ArchetypeMetrics): void
  report(): ArchetypeReport
  get observationCount(): number
}

interface ArchetypeMetrics {
  readonly infoGainTrend: number
  readonly signalVolume: number
  readonly prevSignalVolume: number
  readonly evolvedAgentCount: number
  readonly totalSpawns: number
  readonly totalDissolves: number
  readonly averageNMI: number
  readonly shapleyConcentration: number
  readonly persistentGap: boolean
}

interface ArchetypeReport {
  readonly detected: readonly DetectedArchetype[]
  readonly hasArchetypes: boolean
  readonly primary: DetectedArchetype | null   // highest confidence
}

interface DetectedArchetype {
  readonly name: 'limits-to-growth' | 'shifting-the-burden' | 'tragedy-of-the-commons'
  readonly confidence: number
  readonly description: string
  readonly leveragePoint: string
  readonly leverageLevel: LeverageLevel    // Meadows' 1-12
}
```

**Code example:**

```typescript
import { ArchetypeDetector } from '@cognitive-swarm/math'

const detector = new ArchetypeDetector()

detector.observe({
  infoGainTrend: -0.02,
  signalVolume: 12, prevSignalVolume: 8,
  evolvedAgentCount: 2, totalSpawns: 3, totalDissolves: 1,
  averageNMI: 0.7, shapleyConcentration: 2.5,
  persistentGap: true,
})

detector.observe({
  infoGainTrend: -0.04,
  signalVolume: 18, prevSignalVolume: 12,
  evolvedAgentCount: 3, totalSpawns: 4, totalDissolves: 2,
  averageNMI: 0.75, shapleyConcentration: 2.8,
  persistentGap: true,
})

const report = detector.report()
// report.detected includes:
// - 'limits-to-growth': "Signal volume increasing but info gain declining..."
//     leverageLevel: 4 (self-organization)
// - 'shifting-the-burden': "Spawned 4 agents but gap persists..."
//     leverageLevel: 3 (system goals)
// - 'tragedy-of-the-commons': "Highly redundant signals, few unique contributors..."
//     leverageLevel: 5 (rules)
```

---

### 26. Proposal Energy (`ProposalEnergyTracker`)

**What it is.** A stocks & flows model for proposals. Each proposal has energy that changes via inflows (agree votes), outflows (disagree votes), and decay (time). Momentum is an EMA-smoothed derivative. Complements Bayesian posteriors with a "momentum" view.

**Why it matters for swarm.** A proposal with declining energy despite no active opposition is losing passive support (decay). A proposal with stable energy despite challenges is robust. The "rising fastest" proposal might not be the current leader but could overtake it.

**Key formula:**

```typescript
// Stock equation:
// energy(t) = energy(t-1) + inflow - outflow - decay
//
// Momentum: EMA of delta
// momentum(t) = alpha * delta(t) + (1-alpha) * momentum(t-1)
// alpha = 0.3, decay = 0.05 per round
```

**API:**

```typescript
class ProposalEnergyTracker {
  constructor(decay?: number)                                    // default: 0.05
  recordVote(proposalId: string, stance: 'agree' | 'disagree', strength: number): void
  endRound(): void
  report(): ProposalEnergyReport
  get proposalCount(): number
}

interface ProposalEnergyReport {
  readonly proposals: readonly ProposalEnergy[]
  readonly leader: string | null
  readonly risingFastest: string | null
  readonly totalEnergy: number
  readonly clearLeader: boolean    // energy > 2x second place
}

interface ProposalEnergy {
  readonly proposalId: string
  readonly energy: number
  readonly delta: number
  readonly momentum: number
  readonly totalInflow: number
  readonly totalOutflow: number
  readonly trend: 'rising' | 'stable' | 'declining'
}
```

**Code example:**

```typescript
import { ProposalEnergyTracker } from '@cognitive-swarm/math'

const tracker = new ProposalEnergyTracker(0.05)

// Round 1: proposal A gets strong support
tracker.recordVote('microservices', 'agree', 0.9)
tracker.recordVote('microservices', 'agree', 0.8)
tracker.recordVote('monolith', 'agree', 0.5)
tracker.endRound()

// Round 2: A faces challenge, B gains momentum
tracker.recordVote('microservices', 'disagree', 0.7)
tracker.recordVote('monolith', 'agree', 0.9)
tracker.recordVote('monolith', 'agree', 0.6)
tracker.endRound()

const report = tracker.report()
// report.leader = 'microservices' (still has more total energy)
// report.risingFastest = 'monolith' (positive momentum)
// microservices: trend = 'declining', momentum = -0.4
// monolith: trend = 'rising', momentum = 0.35
// report.clearLeader = false (close race)
```

---

### 28. Leverage Points (`classifyLeverage`, `rankByLeverage`, `leverageCategoryName`)

**What it is.** Meadows' 12 places to intervene in a system, ranked from weakest (12: constants/parameters) to strongest (1: transcending paradigms). Maps swarm advisor actions to their leverage level.

**Why it matters for swarm.** When the advisor must choose between "adjust threshold" and "restructure task," leverage points tell it that restructuring (level 4) is far more impactful than threshold tweaking (level 12). Prioritizes high-leverage interventions.

**The 12 levels:**

```
12. Constants & parameters       (adjust-threshold, adjust-weight)
11. Buffer sizes                 (adjust-rounds)
10. Stock-and-flow structures    (add-agent, remove-agent)
 9. Delays                       (add-cooldown)
 8. Balancing feedback loops     (inject-doubt, inject-challenge)
 7. Reinforcing feedback loops   (reputation-boost)
 6. Information flows            (update-topology, inject-discovery)
 5. Rules of the system          (enforce-diversity, prune-redundant)
 4. Self-organization            (evolve-agent, restructure-task)
 3. Goals of the system          (reframe-problem)
 2. Mindset/paradigm             (change-personality)
 1. Transcending paradigms
```

**API:**

```typescript
function classifyLeverage(action: string): LeverageIntervention
function rankByLeverage(actions: readonly string[]): readonly LeverageIntervention[]
function leverageCategoryName(level: LeverageLevel): string

type LeverageLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

interface LeverageIntervention {
  readonly action: string
  readonly level: LeverageLevel
  readonly rationale: string
  readonly category: string
}
```

**Code example:**

```typescript
import { classifyLeverage, rankByLeverage, leverageCategoryName } from '@cognitive-swarm/math'

// Classify a single action
const lev = classifyLeverage('update-topology')
// lev.level = 6
// lev.category = 'Information flows'
// lev.rationale = 'Changing who sees whom fundamentally alters information access.'

// Rank multiple actions by leverage (strongest first)
const ranked = rankByLeverage([
  'adjust-threshold',   // level 12
  'inject-challenge',   // level 8
  'evolve-agent',       // level 4
  'update-topology',    // level 6
])
// ranked[0].action = 'evolve-agent' (level 4 — strongest)
// ranked[1].action = 'update-topology' (level 6)
// ranked[2].action = 'inject-challenge' (level 8)
// ranked[3].action = 'adjust-threshold' (level 12 — weakest)

leverageCategoryName(4)  // 'Self-organization'
```

---

## Full Analysis

The complete `MathAnalysis` result type is defined in `@cognitive-swarm/core` and included in `SwarmResult.mathAnalysis`. It aggregates outputs from all 28 modules into a single object covering entropy, information gain, redundancy, game theory decisions, Markov predictions, free energy state, phase transition status, stability metrics, chaos detection, and archetype warnings.
