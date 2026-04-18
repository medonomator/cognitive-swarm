// Bayesian inference
export {
  BeliefNetwork,
  voteToLikelihoodRatio,
} from './bayesian.js'
export type { Evidence, BeliefState } from './bayesian.js'

// Information theory
export {
  EntropyTracker,
  shannonEntropy,
  klDivergence,
  jsDivergence,
} from './entropy.js'
export type { EntropyResult, InformationGain } from './entropy.js'

// Game theory
export { AgreeChallenge } from './game-theory.js'
export type {
  PayoffConfig,
  StrategyDecision,
  StrategyContext,
} from './game-theory.js'

// Markov chains
export { MarkovChain } from './markov.js'
export type { ConvergencePrediction, CycleReport } from './markov.js'

// Mutual information
export { RedundancyDetector } from './mutual-information.js'
export type {
  EmissionRecord,
  PairwiseMI,
  RedundancyReport,
} from './mutual-information.js'

// Particle Swarm Optimization
export { ParticleSwarm } from './pso.js'
export type {
  PSOConfig,
  Particle,
  PSOStepResult,
} from './pso.js'

// Topological Data Analysis
export { TopologyAnalyzer } from './topology.js'
export type {
  TopologyPoint,
  Cluster,
  Gap,
  PersistencePair,
} from './topology.js'

// Opinion Dynamics (Hegselmann-Krause)
export { OpinionDynamics } from './opinion-dynamics.js'
export type {
  OpinionState,
  OpinionCluster,
  PolarizationReport,
} from './opinion-dynamics.js'

// Replicator Dynamics (evolutionary strategy balancing)
export { ReplicatorDynamics } from './replicator-dynamics.js'
export type {
  StrategyObservation,
  StrategyShift,
  EvolutionaryReport,
} from './replicator-dynamics.js'

// Influence Graph (spectral analysis)
export { InfluenceGraph } from './influence-graph.js'
export type {
  InfluenceEdge,
  InfluenceReport,
} from './influence-graph.js'

// Optimal Stopping (CUSUM + Secretary Problem)
export { OptimalStopping } from './optimal-stopping.js'
export type {
  CUSUMConfig,
  StoppingDecision,
} from './optimal-stopping.js'

// Shapley Values (cooperative game theory)
export { ShapleyValuator } from './shapley.js'
export type { ShapleyResult } from './shapley.js'

// Bayesian Surprise (attention-weighted signal processing)
export { SurpriseTracker, bayesianSurprise } from './surprise.js'
export type {
  SurpriseMeasurement,
  SurpriseReport,
  SurpriseConfig,
} from './surprise.js'

// Free Energy Principle (variational free energy & active inference)
export { FreeEnergyTracker } from './free-energy.js'
export type {
  FreeEnergyState,
  ActiveInferenceAction,
  FreeEnergyReport,
  FreeEnergyConfig,
} from './free-energy.js'

// Causal Inference (Pearl's do-calculus)
export { CausalEngine } from './causal-inference.js'
export type {
  CausalEdge,
  CausalNode,
  InterventionResult,
  CounterfactualResult,
  CausalReport,
} from './causal-inference.js'

// Fisher Information (learning efficiency & Cramér-Rao bound)
export { FisherTracker } from './fisher-information.js'
export type {
  FisherAnalysis,
  LearningEfficiencyReport,
  LearningRecommendation,
} from './fisher-information.js'

// Regret Minimization (UCB1, Thompson Sampling, provable bounds)
export { RegretMinimizer } from './regret-minimization.js'
export type {
  BanditArm,
  ArmSelection,
  RegretReport,
} from './regret-minimization.js'

// Phase Transition (self-organized criticality)
export { PhaseTransitionDetector } from './phase-transition.js'
export type {
  SwarmPhase,
  PhaseState,
  PhaseControl,
  PhaseReport,
  PhaseTransitionConfig,
} from './phase-transition.js'

// Optimal Transport (Wasserstein distance & barycenters)
export {
  wasserstein1,
  wassersteinBarycenter,
  BeliefDistanceTracker,
} from './optimal-transport.js'
export type {
  WassersteinResult,
  TransportFlow,
  BarycenterResult,
  BeliefDistance,
} from './optimal-transport.js'
