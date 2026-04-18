# Math Modules

cognitive-swarm includes **28 mathematical modules** that analyze every round of deliberation. These are pure TypeScript computations -- no LLM calls. They control when the swarm stops, which agents to amplify, and whether to inject corrective signals.

## How Math Controls the Swarm

After each round, the `MathBridge` runs all 28 modules on the signal history. The results produce two outputs:

1. **`MathAnalysis`** -- included in `SwarmResult.mathAnalysis` for full observability
2. **`SwarmControlSignals`** -- fed back into the orchestrator to control behavior:

```
Round N complete → MathBridge.processRound(newSignals, allProposals, allVotes)
  │
  ├── Entropy < threshold?           → STOP (converged)
  ├── Free energy converging?        → CONTINUE (still learning)
  ├── Free energy diverging?         → INJECT challenge
  ├── Surprise spike detected?       → AMPLIFY that agent's signals
  ├── Echo chamber (high MI)?        → FLAG redundant agents for pruning
  ├── Fisher information ≈ 0?        → STOP (no more learning possible)
  ├── Phase transition detected?     → INCREASE exploration multiplier
  ├── Ordered phase (groupthink)?    → INJECT challenge signal
  ├── Regret bound exceeded?         → SWITCH strategy via bandit
  ├── Wasserstein distance high?     → agents haven't converged yet
  ├── Cycle detected (Markov)?       → STOP (stuck loop)
  ├── Chaos critical (period-3)?     → STOP (Li-Yorke chaos)
  ├── CUSUM change detected?         → STOP (regime change)
  └── Secretary threshold reached?   → STOP (seen enough)
```

## Configuring Math

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  math: {
    entropyThreshold: 0.3,      // stop when normalized entropy < this (default: 0.3)
    minInformationGain: 0.05,   // stop if info gain per round < this (default: 0.05)
    redundancyThreshold: 0.7,   // flag agents with NMI > this as redundant (default: 0.7)
  },
})
```

---

## All 28 Modules

### Information Theory (4 modules)

#### 1. Shannon Entropy (`entropy.ts`)

The primary convergence criterion. Measures remaining uncertainty across the proposal space.

| Export | Type |
|--------|------|
| `EntropyTracker` | Class |
| `shannonEntropy(distribution)` | Function |
| `klDivergence(p, q)` | Function |
| `jsDivergence(p, q)` | Function |

```typescript
// Core computation
H = -Sum(p_i * log2(p_i))   // over vote distribution
normalized = H / H_max       // H_max = log2(N) for N proposals
```

- **When to stop:** `normalized < mathConfig.entropyThreshold` (default 0.3)
- **Result fields:** `entropy.final`, `entropy.normalized`, `entropy.history` (per-round)
- **Used by:** orchestrator stopping check, entropy consensus strategy

#### 2. Mutual Information (`mutual-information.ts`)

Detects echo chambers by measuring how much information two agents share.

| Export | Type |
|--------|------|
| `RedundancyDetector` | Class |

```typescript
// Core computation
MI(X;Y) = H(X) + H(Y) - H(X,Y)
NMI = MI / max(H(X), H(Y))    // Normalized to [0, 1]
```

- **Effect:** agents with NMI > `redundancyThreshold` are flagged for pruning by the advisor
- **Result fields:** `redundancy.averageNMI`, `redundancy.redundantAgents[]`, `redundancy.mostUniqueAgent`

#### 3. Fisher Information (`fisher-information.ts`)

Measures whether agents are still gaining useful signal, or spinning their wheels.

| Export | Type |
|--------|------|
| `FisherTracker` | Class |

```typescript
// Cramer-Rao bound: ratio of information gained to variance in beliefs
efficiency = informationGained / beliefVariance
```

- **Effect:** if efficiency stalls for multiple rounds → `learning-stalled` stopping reason
- **Result fields:** `fisher.overallEfficiency`, `fisher.learningStalled`, `fisher.recommendation`, `fisher.trend`
- **Recommendations:** `'increase-diversity'` | `'maintain'` | `'reduce-noise'` | `'converge'`

#### 4. Bayesian Surprise (`surprise.ts`)

KL-divergence between prior and posterior for each signal. High surprise = unexpectedly important discovery.

| Export | Type |
|--------|------|
| `SurpriseTracker` | Class |
| `bayesianSurprise(prior, posterior)` | Function |

```typescript
// KL(posterior || prior) in bits per signal
surprise = Sum(posterior_i * log2(posterior_i / prior_i))
```

- **Effect:** agents with consistently high surprise get higher attention weights (via `SwarmControlSignals.attentionWeights`)
- **Result fields:** `surprise.meanSurprise`, `surprise.collapsed`, `surprise.mostInformativeAgent`, `surprise.history`

---

### Probabilistic Reasoning (3 modules)

#### 5. Bayesian Inference (`bayesian.ts`)

Agents update beliefs on evidence. Different priors create genuine diversity.

| Export | Type |
|--------|------|
| `BeliefNetwork` | Class |
| `voteToLikelihoodRatio(stance, weight)` | Function |

```typescript
// Core computation
P(H|E) = P(E|H) * P(H) / P(E)

// Vote to likelihood ratio:
agree   → LR = 1 + weight
disagree → LR = 1 / (1 + weight)
abstain  → LR = 1.0  (uninformative)
```

- **Effect:** provides Bayesian MAP estimate for the consensus engine's bayesian strategy
- **Result fields:** `bayesian.mapEstimate` (`{ proposalId, probability }`), `bayesian.posteriors` (`Record<string, number>`), `bayesian.evidenceCount`

#### 6. Free Energy Principle (`free-energy.ts`)

Variational free energy F = complexity - accuracy. The primary learning health metric.

| Export | Type |
|--------|------|
| `FreeEnergyTracker` | Class |

```typescript
// Core computation
F = KL(q || p) - E_q[log p(data|latent)]
deltaF = F_current - F_previous
```

- **Effect:** primary stopping criterion when `deltaF ≈ 0` (converged)
- **Result fields:** `freeEnergy.current`, `freeEnergy.deltaF`, `freeEnergy.converged`, `freeEnergy.recommendation`, `freeEnergy.learningHealth`
- **Recommendations:** `'explore'` | `'exploit'` | `'challenge'` | `'stop'`
- **Feedback:** `challenge` recommendation triggers `shouldInjectChallenge` in control signals

#### 7. Causal Inference (`causal-inference.ts`)

Pearl's do-calculus applied to agent signals. Separates causation from correlation.

| Export | Type |
|--------|------|
| `CausalEngine` | Class |

- **What it calculates:** counterfactual queries on the signal causal graph
- **Effect:** signals with `metadata.causalLevel: 'counterfactual'` get higher routing priority (not vote weight)
- **Integration:** signal metadata `causalLevel` maps to Pearl's Ladder L1/L2/L3

---

### Game Theory & Decision (4 modules)

#### 8. Nash Equilibrium (`game-theory.ts`)

Makes challenging suspicious consensus mathematically optimal. This is why devil's advocates emerge.

| Export | Type |
|--------|------|
| `AgreeChallenge` | Class |

```typescript
// Expected challengers under Nash equilibrium vs actual
expectedChallengers = f(payoffMatrix, agentCount)
groupthinkRisk = expectedChallengers > actualChallengers ? 'high' : 'low'
```

- **Effect:** if `actualChallengers < expectedChallengers`, groupthink risk is high -- advisor injects doubt signal, evolution spawns `critical-challenger`
- **Result fields:** `gameTheory.expectedChallengers`, `gameTheory.actualChallengers`, `gameTheory.groupthinkRisk`

#### 9. Shapley Values (`shapley.ts`)

Fair attribution of each agent's marginal contribution to the coalition.

| Export | Type |
|--------|------|
| `ShapleyValuator` | Class |

```typescript
// Core computation
phi_i = Sum_S [|S|! * (n-|S|-1)! / n!] * [v(S ∪ {i}) - v(S)]
```

- **Effect:** agents with near-zero Shapley value are candidates for pruning by the advisor
- **Result fields:** `shapley.values` (`Record<string, number>`), `shapley.redundantAgents[]`, `shapley.topContributors[]`

#### 10. Regret Minimization (`regret-minimization.ts`)

UCB1 + Thompson Sampling with provable regret bounds for agent strategy selection.

| Export | Type |
|--------|------|
| `RegretMinimizer` | Class |

```typescript
// Regret = best_strategy_reward - chosen_strategy_reward
// UCB1: select argmax(mean_reward + sqrt(2*ln(T)/n_i))
// Bound: O(sqrt(T * log(T)))
```

- **Effect:** Thompson Sampling bandit for each agent selects strategies with provable `O(sqrt(T log T))` regret bounds
- **Integration:** each agent's bandit updates after each round based on whether its signals influenced consensus

#### 11. Optimal Stopping (`optimal-stopping.ts`)

CUSUM change point detection + secretary problem for deciding when to commit.

| Export | Type |
|--------|------|
| `OptimalStopping` | Class |

```typescript
// CUSUM: S_n = max(0, S_{n-1} + (x_n - mu_0 - k))
// Secretary: explore first 1/e ≈ 37% of rounds, then commit to first
//            signal that beats all explored signals
```

- **Effect:** `cusum-change-detected` or `secretary-threshold` stopping reasons
- **Result fields:** `optimalStopping.cusumStatistic`, `optimalStopping.explorationComplete`, `optimalStopping.changeDetected`

---

### Dynamics & Optimization (4 modules)

#### 12. Markov Chains (`markov.ts`)

Predicts convergence time, detects stuck loops, estimates total solve cost.

| Export | Type |
|--------|------|
| `MarkovChain` | Class |

```typescript
// Build transition matrix from signal type sequences
// Detect cycles: A→challenge → B→doubt → A→challenge → ...
// Compute steady-state distribution
```

- **Effect:** detects cycles → `cycle-detected` stopping reason
- **Result fields:** `markov.dominantState`, `markov.cyclesDetected`, `markov.cycleStates`

#### 13. Particle Swarm Optimization (`pso.ts`)

Agents explore the solution space following PSO dynamics.

| Export | Type |
|--------|------|
| `ParticleSwarm` | Class |

```typescript
// Velocity update:
// v_i = w*v_i + c1*r1*(pBest_i - x_i) + c2*r2*(gBest - x_i)
// Position update: x_i = x_i + v_i
```

- **Effect:** used for initializing agent beliefs and amplifying exploration in early rounds
- **Result fields:** particle positions, velocities, personal/global best

#### 14. Replicator Dynamics (`replicator-dynamics.ts`)

Evolutionary strategy balancing. Strategies that work get reinforced.

| Export | Type |
|--------|------|
| `ReplicatorDynamics` | Class |

```typescript
// dx_i/dt = x_i * (f_i - avg_f)
// where f_i = strategy fitness, avg_f = average fitness
// ESS = strategy that cannot be invaded by any mutant
```

- **Effect:** strategies with high fitness increase in frequency; ESS convergence tracked
- **Result fields:** `replicatorDynamics.dominantStrategy`, `replicatorDynamics.convergenceToESS`, `replicatorDynamics.suggestedShifts[]`
- **Evolution trigger:** if a strategy shift has `magnitude > 0.7` and `direction === 'increase'`, evolution spawns a specialist for that strategy

#### 15. Opinion Dynamics (`opinion-dynamics.ts`)

Hegselmann-Krause model simulates how agent opinions cluster and polarize.

| Export | Type |
|--------|------|
| `OpinionDynamics` | Class |

```typescript
// Bounded confidence model:
// agent_i updates opinion by averaging all agents within
// confidence bound epsilon of its current position
// Predicts fragmentation before it happens
```

- **Effect:** predicts fragmentation before it happens; flags bridging agents
- **Result fields:** `opinionDynamics.clusterCount`, `opinionDynamics.polarizationIndex`, `opinionDynamics.fragmentationRisk`, `opinionDynamics.bridgingAgents`

---

### Geometry & Topology (2 modules)

#### 16. Topological Data Analysis (`topology.ts`)

Finds gaps in the explored solution space and directs agents to unexplored regions.

| Export | Type |
|--------|------|
| `TopologyAnalyzer` | Class |

```typescript
// Persistent homology:
// H0 = connected components (how many disconnected idea clusters)
// H1 = loops (unexplored regions surrounded by explored territory)
```

- **Effect:** high H1 (unexplored loops) → exploration multiplier increase
- **Result fields:** points, clusters, gaps, persistence pairs

#### 17. Optimal Transport (`optimal-transport.ts`)

Wasserstein distance between belief distributions -- measures how far agents actually diverge.

| Export | Type |
|--------|------|
| `wasserstein1(p, q)` | Function |
| `wassersteinBarycenter(distributions, weights)` | Function |
| `BeliefDistanceTracker` | Class |

```typescript
// Earth Mover's Distance between pairs of agent vote distributions
// W1(p, q) = min_gamma Sum(gamma_ij * |x_i - y_j|)
```

- **Effect:** high mean Wasserstein distance = agents haven't converged
- **Result fields:** `beliefDistance.clusterCount`, `beliefDistance.clusters`, `beliefDistance.meanDistance`, `beliefDistance.optimalConsensus`

---

### Stability & Chaos (4 modules)

#### 18. Phase Transition (`phase-transition.ts`)

Self-organized criticality -- detects when the swarm is at a "tipping point."

| Export | Type |
|--------|------|
| `PhaseTransitionDetector` | Class |

```typescript
// Order parameter = dominance of leading proposal
// Susceptibility = variance * N
// Phase: ordered (groupthink) | critical (sweet spot) | disordered (chaos)
```

- **Effect:** at criticality, exploration is increased; at ordered phase, a challenge signal is injected to restore criticality
- **Result fields:** `phaseTransition.phase`, `phaseTransition.criticalityScore`, `phaseTransition.control`
- **Feedback:** `phase === 'ordered'` triggers `shouldInjectChallenge` in control signals

#### 19. Lyapunov Stability (`lyapunov-stability.ts`)

Formal consensus stability analysis using Lyapunov function theory.

| Export | Type |
|--------|------|
| `LyapunovStability` | Class |

```typescript
// V = Sum(belief_i - consensus)^2    (Lyapunov function)
// V_dot = dV/dt                       (rate of change)
// Routh-Hurwitz stability test
// Stable if V_dot < 0 (system converging to consensus)
```

- **Result fields:** `lyapunovStability.stable`, `lyapunovStability.type` (`'asymptotically-stable'` | `'marginally-stable'` | `'unstable'`), `lyapunovStability.adjustedConfidence`, `lyapunovStability.convergenceRate`

#### 20. Chaos Detector (`chaos-detector.ts`)

Period analysis, Sharkovskii theorem, Feigenbaum cascade detection.

| Export | Type |
|--------|------|
| `ChaosDetector` | Class |

```typescript
// Detects oscillation periods in confidence history
// Period-3 → Li-Yorke chaos GUARANTEED (Sharkovskii theorem)
// Feigenbaum cascade: period-1 → 2 → 4 → 8 → chaos
```

- **Effect:** period-3 → `chaos-critical` stopping reason
- **Result fields:** `chaos.period`, `chaos.sharkovskiiTriggered`, `chaos.lyapunovExponent`, `chaos.chaosRisk`

#### 21. Damping Classifier (`damping-classifier.ts`)

Classifies the convergence regime.

| Export | Type |
|--------|------|
| `DampingClassifier` | Class |

```typescript
// Damping ratio zeta from confidence oscillation amplitude decay
// zeta > 1: overdamped (slow convergence, no oscillation)
// zeta = 1: critically damped (fastest convergence)
// zeta < 1: underdamped (oscillating but converging)
// zeta < 0: unstable (diverging)
```

- **Result fields:** `damping.dampingRatio`, `damping.regime` (`'overdamped'` | `'critically-damped'` | `'underdamped'` | `'unstable'`), `damping.settlingRounds`

---

### Linear Algebra & Decomposition (2 modules)

#### 22. SVD Analyzer (`svd-analyzer.ts`)

Singular value decomposition of the agent-proposal debate matrix.

| Export | Type |
|--------|------|
| `SVDAnalyzer` | Class |

```typescript
// M = U * S * V^T  where M[i][j] = agent_i's stance on proposal_j
// Effective rank = number of singular values > threshold
// If effectiveRank == 1, all agents are arguing about the same axis
```

- **Effect:** 1-dimensional debate (rank=1) → may need new perspectives
- **Result fields:** `svd.effectiveRank`, `svd.oneDimensional`, `svd.explainedVariance[]`

#### 23. Projection Consensus (`projection-consensus.ts`)

Weighted least-squares alternative to majority voting.

| Export | Type |
|--------|------|
| `ProjectionConsensus` | Class |

```typescript
// Find optimal consensus distribution minimizing total weighted residual:
// c* = argmin_c Sum(w_i * ||v_i - c||^2)
// where v_i = agent i's vote distribution, w_i = agent weight
```

- **Result fields:** `projectionConsensus.consensus` (`Record<string, number>`), `projectionConsensus.totalResidual`, `projectionConsensus.tight`
- **Evolution trigger:** if projection consensus disagrees with Bayesian MAP and `!tight`, spawns a `lateral-thinker`

---

### Stocks & Flows (1 module)

#### 24. Proposal Energy (`proposal-energy.ts`)

Momentum tracking for proposals using stocks and flows model.

| Export | Type |
|--------|------|
| `ProposalEnergyTracker` | Class |

```typescript
// Energy inflow: agree votes, supporting discoveries
// Energy outflow: disagree votes, challenges, doubts
// Net momentum = inflow - outflow over time
```

- **Result fields:** `proposalEnergy.leader`, `proposalEnergy.risingFastest`, `proposalEnergy.clearLeader`, `proposalEnergy.trends`
- **Evolution trigger:** if a rising proposal is neither the MAP leader nor the energy leader, spawns a `lateral-thinker` to advocate for it

---

### Network Analysis (2 modules)

#### 25. Influence Graph (`influence-graph.ts`)

Spectral analysis of agent-to-agent influence.

| Export | Type |
|--------|------|
| `InfluenceGraph` | Class |

```typescript
// Build directed graph: agent_i → agent_j if i's signals influenced j's signals
// Spectral analysis: eigenvalues of adjacency matrix
// Detect isolated agents, influence concentration, bridging agents
```

- **Result fields:** `influence.isolatedAgents[]`, `influence.centralAgents[]`, `influence.bridgingAgents[]`
- **Evolution trigger:** isolated agents → spawns `bridge-connector`

#### 26. KL Tracker (`kl-tracker.ts`)

KL-divergence analysis: per-agent divergence from consensus + drift over time.

| Export | Type |
|--------|------|
| `KLDivergenceTracker` | Class |

```typescript
// For each agent: KL(agent_distribution || consensus_distribution)
// Track drift: is an agent moving toward or away from consensus?
// Outlier detection: agents with KL > mean + 2*std
```

- **Result fields:** `klDivergence.meanDivergence`, `klDivergence.outliers[]`, `klDivergence.consensusDrift`, `klDivergence.driftTrend`

---

### System Dynamics (2 modules)

#### 27. Leverage Points (`leverage-points.ts`)

Meadows' 12 leverage points applied to swarm dynamics.

| Export | Type |
|--------|------|
| `classifyLeverage(intervention)` | Function |
| `rankByLeverage(interventions)` | Function |
| `leverageCategoryName(level)` | Function |

```typescript
// Ranks interventions by systemic impact:
// Level 12 (weakest): Constants, parameters
// Level 1 (strongest): Paradigm shift
// Applied to advisor's possible interventions
```

- **Effect:** identifies highest-leverage intervention points for the advisor

#### 28. System Archetypes (`system-archetypes.ts`)

Detects structural pathological patterns from system dynamics.

| Export | Type |
|--------|------|
| `ArchetypeDetector` | Class |

```typescript
// Detects patterns:
// - "Limits to Growth" (progress + hidden constraint)
// - "Shifting the Burden" (symptoms treated, not root cause)
// - "Tragedy of the Commons" (agents deplete shared resource)
// - "Fixes that Fail" (short-term fix creates long-term problem)
// - "Escalation" (agents compete instead of collaborate)
```

- **Result fields:** `archetypes.detected[]`, `archetypes.primaryName`, `archetypes.primaryConfidence`

---

## Module Count Summary

| Category | Count | Modules |
|----------|-------|---------|
| Information Theory | 4 | entropy, mutual-information, fisher-information, surprise |
| Probabilistic Reasoning | 3 | bayesian, free-energy, causal-inference |
| Game Theory & Decision | 4 | game-theory, shapley, regret-minimization, optimal-stopping |
| Dynamics & Optimization | 4 | markov, pso, replicator-dynamics, opinion-dynamics |
| Geometry & Topology | 2 | topology, optimal-transport |
| Stability & Chaos | 4 | phase-transition, lyapunov-stability, chaos-detector, damping-classifier |
| Linear Algebra | 2 | svd-analyzer, projection-consensus |
| Stocks & Flows | 1 | proposal-energy |
| Network Analysis | 2 | influence-graph, kl-tracker |
| System Dynamics | 2 | leverage-points, system-archetypes |
| **Total** | **28** | |
