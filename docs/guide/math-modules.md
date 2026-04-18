# Math Modules

cognitive-swarm includes 19 mathematical modules that analyze every round of deliberation. These are pure TypeScript computations - no LLM calls. They control when the swarm stops, which agents to amplify, and whether to inject corrective signals.

## How Math Controls the Swarm

```
Round N complete → Math Bridge analyzes all signals
  │
  ├── Entropy < threshold?           → STOP (converged)
  ├── Free energy decreasing?        → CONTINUE (still learning)
  ├── Surprise spike detected?       → AMPLIFY that agent's signals
  ├── Echo chamber (high MI)?        → INJECT challenger agent
  ├── Fisher information ~= 0?       → STOP (no more learning possible)
  ├── Phase transition detected?     → ALERT (swarm is reorganizing)
  ├── Regret bound exceeded?         → SWITCH strategy
  └── Wasserstein distance high?     → agents haven't converged yet
```

The results are included in `SwarmResult.mathAnalysis` for full observability.

---

## Information Theory

### Shannon Entropy (`entropy.ts`)

Measures remaining uncertainty across the proposal space. The primary convergence criterion.

- **What it calculates:** `H = -Σ p(i) * log2(p(i))` over vote distribution
- **When to stop:** normalized entropy < `mathConfig.entropyThreshold` (default 0.3)
- **Result fields:** `entropy.final`, `entropy.normalized`, `entropy.history`

### Mutual Information (`mutual-information.ts`)

Detects echo chambers by measuring how much information two agents share. High NMI means redundant agents.

- **What it calculates:** `MI(X;Y) = H(X) + H(Y) - H(X,Y)` normalized
- **Effect:** redundant agents (NMI > `redundancyThreshold`) are flagged for pruning
- **Result fields:** `redundancy.averageNMI`, `redundancy.redundantAgents`, `redundancy.mostUniqueAgent`

### Fisher Information (`fisher-information.ts`)

Measures whether agents are still gaining useful signal, or spinning their wheels.

- **What it calculates:** Cramer-Rao bound - ratio of information gained to variance in beliefs
- **Effect:** if efficiency stalls for multiple rounds, triggers `learning-stalled` stopping reason
- **Result fields:** `fisher.overallEfficiency`, `fisher.learningStalled`, `fisher.recommendation`, `fisher.trend`

### Bayesian Surprise (`surprise.ts`)

KL-divergence between prior and posterior for each signal. High surprise = unexpectedly important discovery.

- **What it calculates:** `KL(posterior || prior)` in bits per signal
- **Effect:** agents with consistently high surprise get higher attention weights
- **Result fields:** `surprise.meanSurprise`, `surprise.collapsed`, `surprise.mostInformativeAgent`, `surprise.history`

---

## Probabilistic Reasoning

### Bayesian Inference (`bayesian.ts`)

Agents update beliefs on evidence. Different priors create genuine diversity.

- **What it calculates:** `P(H|E) = P(E|H) * P(H) / P(E)` across all proposals
- **Effect:** provides Bayesian MAP estimate for the consensus engine
- **Result fields:** `bayesian.mapEstimate`, `bayesian.posteriors`, `bayesian.evidenceCount`

### Free Energy Principle (`free-energy.ts`)

Variational free energy `F = complexity - accuracy`. The primary learning health metric.

- **What it calculates:** `F = KL(q||p) - E_q[log p(data|latent)]`
- **Effect:** primary stopping criterion when `F` converges (deltaF ~= 0)
- **Result fields:** `freeEnergy.current`, `freeEnergy.deltaF`, `freeEnergy.converged`, `freeEnergy.recommendation`, `freeEnergy.learningHealth`
- **Recommendations:** `explore | exploit | challenge | stop`

### Causal Inference (`causal-inference.ts`)

Pearl's do-calculus applied to agent signals. Separates causation from correlation.

- **What it calculates:** counterfactual queries on the signal causal graph
- **Effect:** signals with `causalLevel: 'counterfactual'` get higher weight in consensus
- **Integration:** signal metadata `causalLevel` field maps to Pearl's Ladder L1/L2/L3

---

## Game Theory & Decision

### Nash Equilibrium (`game-theory.ts`)

Makes challenging suspicious consensus mathematically optimal. This is why devil's advocates emerge.

- **What it calculates:** expected vs actual number of challengers under Nash equilibrium
- **Effect:** if actual challengers < expected, groupthink risk is high - advisor injects doubt signal
- **Result fields:** `gameTheory.expectedChallengers`, `gameTheory.actualChallengers`, `gameTheory.groupthinkRisk`

### Shapley Values (`shapley.ts`)

Fair attribution of each agent's marginal contribution to the coalition.

- **What it calculates:** `phi_i = Σ_{S} [|S|!(n-|S|-1)!/n!] * [v(S∪{i}) - v(S)]`
- **Effect:** agents with near-zero Shapley value are candidates for pruning
- **Result fields:** `shapley.values`, `shapley.redundantAgents`, `shapley.topContributors`

### Regret Minimization (`regret-minimization.ts`)

UCB1 + Thompson Sampling with provable regret bounds for agent strategy selection.

- **What it calculates:** regret = best_strategy_reward - chosen_strategy_reward, tracked with UCB1
- **Effect:** Thompson Sampling bandit for each agent selects strategies with provable `O(sqrt(T log T))` regret bounds
- **Integration:** each agent's bandit updates after each round based on whether its signals influenced consensus

### Optimal Stopping (`optimal-stopping.ts`)

CUSUM change point detection + secretary problem for deciding when to commit.

- **What it calculates:** CUSUM statistic tracks signal mean; secretary problem tracks exploration fraction
- **Effect:** `cusum-change-detected` or `secretary-threshold` stopping reasons
- **Result fields:** `optimalStopping.cusumStatistic`, `optimalStopping.explorationComplete`, `optimalStopping.changeDetected`

---

## Dynamics & Optimization

### Markov Chains (`markov.ts`)

Predicts convergence time, detects stuck loops, estimates total solve cost.

- **What it calculates:** transition matrix from signal type sequences, steady-state distribution
- **Effect:** detects cycles (agent A challenges → agent B doubts → agent A challenges → ...) → `cycle-detected` stop
- **Result fields:** `markov.dominantState`, `markov.cyclesDetected`, `markov.cycleStates`

### Particle Swarm Optimization (`pso.ts`)

Agents explore the solution space following PSO dynamics.

- **What it calculates:** particle positions in belief space, velocity updates toward personal/global best
- **Effect:** used for initializing agent beliefs and amplifying exploration in early rounds

### Replicator Dynamics (`replicator-dynamics.ts`)

Evolutionary strategy balancing. Strategies that work get reinforced.

- **What it calculates:** `dx_i/dt = x_i * (f_i - avg_f)` where f_i is strategy fitness
- **Effect:** strategies with high fitness increase in frequency; ESS (evolutionarily stable strategy) convergence tracked
- **Result fields:** `replicatorDynamics.dominantStrategy`, `replicatorDynamics.convergenceToESS`, `replicatorDynamics.suggestedShifts`

### Opinion Dynamics (`opinion-dynamics.ts`)

Hegselmann-Krause model simulates how agent opinions cluster and polarize.

- **What it calculates:** agent opinion positions, confidence bounds, clustering
- **Effect:** predicts fragmentation before it happens; flags bridging agents
- **Result fields:** `opinionDynamics.clusterCount`, `opinionDynamics.polarizationIndex`, `opinionDynamics.fragmentationRisk`, `opinionDynamics.bridgingAgents`

### Phase Transition (`phase-transition.ts`)

Self-organized criticality - detects when the swarm is at a "tipping point."

- **What it calculates:** order parameter, susceptibility (variance × N), scale-free signature in surprise distribution
- **Effect:** at criticality, exploration multiplier is increased to prevent getting stuck
- **Result fields:** `phaseTransition.phase` (`ordered | critical | disordered`), `phaseTransition.criticalityScore`, `phaseTransition.control`

---

## Geometry & Topology

### Topological Data Analysis (`topology.ts`)

Finds gaps in the explored solution space and directs agents to unexplored regions.

- **What it calculates:** persistent homology - connected components (H0) and loops (H1) in signal space
- **Effect:** high H1 (unexplored loops) triggers exploration multiplier increase

### Optimal Transport (`optimal-transport.ts`)

Wasserstein distance between belief distributions - measures how far agents actually diverge.

- **What it calculates:** Earth Mover's Distance between pairs of agent vote distributions
- **Effect:** high mean Wasserstein distance means agents haven't converged; consensus threshold is harder to reach
- **Result fields:** `beliefDistance.clusterCount`, `beliefDistance.clusters`, `beliefDistance.meanDistance`, `beliefDistance.optimalConsensus`

---

## Additional Modules

### KL Tracker (`kl-tracker.ts`)

KL-divergence analysis: per-agent divergence from consensus + drift over time.

- **Result fields:** `klDivergence.meanDivergence`, `klDivergence.outliers`, `klDivergence.consensusDrift`, `klDivergence.driftTrend`

### Lyapunov Stability (`lyapunov-stability.ts`)

Formal consensus stability analysis using Lyapunov function theory.

- **What it calculates:** `V = Σ(belief_i - consensus)²`, `V_dot`, Routh-Hurwitz stability test
- **Result fields:** `lyapunovStability.stable`, `lyapunovStability.type`, `lyapunovStability.adjustedConfidence`, `lyapunovStability.convergenceRate`

### Chaos Detector (`chaos-detector.ts`)

Period analysis, Sharkovskii theorem, Feigenbaum cascade detection.

- **What it calculates:** oscillation periods, largest Lyapunov exponent, period-doubling cascade
- **Effect:** period-3 → Li-Yorke chaos guaranteed → `chaos-critical` stopping reason
- **Result fields:** `chaos.period`, `chaos.sharkovskiiTriggered`, `chaos.lyapunovExponent`, `chaos.chaosRisk`

### Damping Classifier (`damping-classifier.ts`)

Classifies the convergence regime (overdamped, critically damped, underdamped).

- **What it calculates:** damping ratio ζ, natural frequency ω, settling time estimate
- **Result fields:** `damping.dampingRatio`, `damping.regime`, `damping.settlingRounds`

### SVD Analyzer (`svd-analyzer.ts`)

Singular value decomposition of the agent-proposal debate matrix.

- **What it calculates:** singular values, explained variance, effective rank
- **Effect:** if debate is 1-dimensional (one axis explains >95% variance), agents are all arguing about the same thing
- **Result fields:** `svd.effectiveRank`, `svd.oneDimensional`, `svd.explainedVariance`

### Proposal Energy (`proposal-energy.ts`)

Stocks and flows momentum tracking for proposals.

- **What it calculates:** energy inflow (votes, support), outflow (challenges, doubts), net momentum
- **Result fields:** `proposalEnergy.leader`, `proposalEnergy.risingFastest`, `proposalEnergy.clearLeader`, `proposalEnergy.trends`

### Projection Consensus (`projection-consensus.ts`)

Weighted least-squares alternative to majority voting.

- **What it calculates:** find optimal consensus distribution minimizing total residual
- **Result fields:** `projectionConsensus.consensus`, `projectionConsensus.totalResidual`, `projectionConsensus.tight`

### Leverage Points (`leverage-points.ts`)

System dynamics leverage point analysis.

- **What it calculates:** Meadows' 12 leverage points applied to swarm dynamics
- **Effect:** identifies highest-leverage intervention points for the advisor

### System Archetypes (`system-archetypes.ts`)

Detects structural pathological patterns from system dynamics.

- **What it calculates:** "Limits to Growth," "Shifting the Burden," "Tragedy of the Commons," etc.
- **Result fields:** `archetypes.detected[]`, `archetypes.primaryName`, `archetypes.primaryConfidence`

## Configuring Math

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  math: {
    entropyThreshold: 0.3,      // stop when normalized entropy < this
    minInformationGain: 0.05,   // stop if info gain per round < this
    redundancyThreshold: 0.7,   // flag agents with NMI > this as redundant
  },
})
```
