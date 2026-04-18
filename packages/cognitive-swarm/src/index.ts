// ============================================================
// cognitive-swarm — umbrella package
// npm install cognitive-swarm
// ============================================================

// ── Core types & interfaces ──────────────────────────────────
export type {
  // Signals
  CausalLevel, SignalType, SignalPayloadMap, Signal, SignalMetadata,
  TaskPayload, DiscoveryPayload, ProposalPayload, DoubtPayload,
  ChallengePayload, VotePayload, ConflictPayload, ConsensusReachedPayload,
  EscalatePayload, SharedMemoryPayload, ToolResultPayload,
  SignalFilter, ConflictPair,
  // Agent
  PersonalityVector, AgentStrategyId, SwarmAgentConfig, ResolvedSwarmAgentConfig,
  AgentReaction, AgentContribution,
  // Tools
  McpTransportConfig, McpServerConfig, AgentToolConfig, ResolvedAgentToolConfig,
  AgentTool, AgentToolCall, AgentToolResult,
  ToolPromptInjector, ToolCallParser, ToolExecutor, AgentToolSupport,
  // Consensus
  ConsensusStrategyId, ConflictResolutionMode, ConsensusConfig, ResolvedConsensusConfig,
  Proposal, VoteRecord, ConsensusResult, ConsensusStrategy, ConsensusEvaluation,
  // Signal Bus
  SignalBusConfig, ResolvedSignalBusConfig,
  // Events
  SwarmEventMap, RoundStartEvent, RoundEndEvent, SynthesisCompleteEvent,
  SignalDeliveryEvent, AgentErrorEvent, ConsensusFailedEvent,
  ToolCalledEvent, EvolutionSpawnedEvent, EvolutionDissolvedEvent,
  // Advisor
  AgentWeightProvider, SwarmAdvisorConfig, ResolvedSwarmAdvisorConfig,
  SwarmAdvice, SwarmAdviceInjectSignal, SwarmAdviceDisableAgent,
  SwarmAdviceUpdateTopology, AdvisorReport, DebateResult,
  // Topology
  TopologyConfig, ResolvedTopologyConfig,
  // Agent Defs
  SwarmAgentDef, SynthesizerConfig,
  // Math
  MathConfig, ResolvedMathConfig, MathStoppingReason, MathAnalysis,
  SwarmControlSignals,
  // Orchestrator Config
  SwarmConfig, ResolvedSwarmConfig, SwarmBanditStorage,
  RetryConfig, ResolvedRetryConfig,
  CheckpointStorage, SolveCheckpoint,
  // Results
  SwarmResult, SwarmCost, SwarmTiming, SwarmEvent,
  // Evaluation
  OutcomeVerdict, OutcomeRecord, CalibrationPoint,
  EvaluationReport, OutcomeEvaluator,
  // Evolution
  EvolutionConfig, ResolvedEvolutionConfig,
  EvolutionSpawnEntry, EvolutionDissolveEntry, EvolutionReport,
  // Memory
  VectorMemoryEntry, VectorMemory,
} from '@cognitive-swarm/core'

export { TypedEventEmitter } from '@cognitive-swarm/core'

// ── Signal Bus ───────────────────────────────────────────────
export { SignalBus, ConflictDetector } from '@cognitive-swarm/signals'

// ── Consensus Engine ─────────────────────────────────────────
export {
  ConsensusEngine,
  VotingStrategy, ConfidenceWeightedStrategy,
  HierarchicalStrategy, BayesianStrategy, EntropyStrategy,
} from '@cognitive-swarm/consensus'

// ── Agent ────────────────────────────────────────────────────
export type { AgentBeliefState } from '@cognitive-swarm/agent'
export { SwarmAgent, PersonalityFilter, BeliefModel } from '@cognitive-swarm/agent'

// ── Orchestrator ─────────────────────────────────────────────
export type {
  RoundContext, RoundResult, DebateContext, Topology,
  AgentSelectionConfig, EvolutionAction, AgentCalibration,
  GlobalWorkspaceConfig, WorkspacePartition,
  AgentPrediction, PredictionError, MetaAgentConfig,
} from '@cognitive-swarm/orchestrator'

export {
  SwarmOrchestrator,
  SwarmAdvisor,
  TokenTrackingLlmProvider, TokenBudgetExceededError,
  ContributionTracker, RoundRunner, DebateRunner,
  TopologyController, Synthesizer, MathBridge,
  AgentSelector, ResilientLlmProvider, CircuitOpenError,
  FileCheckpointStorage, EvolutionController,
  CalibrationTracker, GlobalWorkspace, resolveGlobalWorkspaceConfig,
  PredictionEngine, MetaAgent,
} from '@cognitive-swarm/orchestrator'

// ── Math (28 modules) ────────────────────────────────────────
export {
  // Bayesian
  BeliefNetwork, voteToLikelihoodRatio,
  // Entropy
  EntropyTracker, shannonEntropy, klDivergence, jsDivergence,
  // Game Theory
  AgreeChallenge,
  // Markov
  MarkovChain,
  // Mutual Information
  RedundancyDetector,
  // PSO
  ParticleSwarm,
  // Topology
  TopologyAnalyzer,
  // Opinion Dynamics
  OpinionDynamics,
  // Replicator Dynamics
  ReplicatorDynamics,
  // Influence Graph
  InfluenceGraph,
  // Optimal Stopping
  OptimalStopping,
  // Shapley Values
  ShapleyValuator,
  // Surprise
  SurpriseTracker, bayesianSurprise,
  // Free Energy
  FreeEnergyTracker,
  // Causal Inference
  CausalEngine,
  // Fisher Information
  FisherTracker,
  // Regret Minimization
  RegretMinimizer,
  // Phase Transitions
  PhaseTransitionDetector,
  // KL Divergence
  KLDivergenceTracker,
  // Chaos Detection
  ChaosDetector,
  // Lyapunov Stability
  LyapunovStability,
  // Optimal Transport
  wasserstein1, wassersteinBarycenter, BeliefDistanceTracker,
  // Damping
  DampingClassifier,
  // System Archetypes
  ArchetypeDetector,
  // SVD
  SVDAnalyzer,
  // Proposal Energy
  ProposalEnergyTracker,
  // Projection Consensus
  ProjectionConsensus,
  // Leverage Points
  classifyLeverage, rankByLeverage, leverageCategoryName,
} from '@cognitive-swarm/math'

// ── Evolution ────────────────────────────────────────────────
export type {
  AgentProfile, PairwiseSimilarity, GapSignal, SpawnProposal,
  EvaluationResult, PruneReport, PruneCandidate,
  MergeSuggestion, PersonalityTuning,
  EvolverConfig, ResolvedEvolverConfig,
  OptimizerConfig, ResolvedOptimizerConfig,
} from '@cognitive-swarm/evolution'

export { SwarmEvolver, SwarmOptimizer } from '@cognitive-swarm/evolution'

// ── Evaluation ───────────────────────────────────────────────
export type {
  EvaluatorLlmProvider,
  OutcomeTrackerConfig, ResolvedOutcomeTrackerConfig,
  SolveOutcomeContext, RecordOptions,
} from '@cognitive-swarm/evaluation'

export { OutcomeTracker, LlmOutcomeEvaluator } from '@cognitive-swarm/evaluation'

// ── Composer ─────────────────────────────────────────────────
export type {
  AgentCandidate, CompositionResult, SelectionReason,
  ComposerConfig, ResolvedComposerConfig, AgentActivity,
} from '@cognitive-swarm/composer'

export { DynamicComposer } from '@cognitive-swarm/composer'

// ── Reputation ───────────────────────────────────────────────
export type {
  PerformanceRecord, ReputationScore, AgentReputation,
  ReputationConfig, ResolvedReputationConfig, AgentRanking,
} from '@cognitive-swarm/reputation'

export { ReputationTracker } from '@cognitive-swarm/reputation'

// ── Introspection ────────────────────────────────────────────
export type {
  SignalEvent, SignalGraph, SignalEdge,
  GroupThinkReport, DeadlockReport, SignalCycle,
  CostReport, AgentCostEntry,
} from '@cognitive-swarm/introspection'

export { SwarmIntrospector } from '@cognitive-swarm/introspection'

// ── Templates ────────────────────────────────────────────────
export type { TemplateProviders, PersonalityPreset, AgentDefOptions } from '@cognitive-swarm/templates'

export {
  PERSONALITIES, agentDef,
  codeReviewTemplate, researchTemplate,
  decisionTemplate, debugTemplate,
} from '@cognitive-swarm/templates'

// ── Memory ───────────────────────────────────────────────────
export type {
  SharedMemory, MemoryState, ShareMemoryInput,
  MemorySearchResult, MemoryPoolConfig, ResolvedMemoryPoolConfig, PoolStats,
} from '@cognitive-swarm/memory-pool'

export { SharedMemoryPool } from '@cognitive-swarm/memory-pool'

export type { QdrantMemoryConfig } from '@cognitive-swarm/memory-qdrant'
export { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'

// ── OpenTelemetry ────────────────────────────────────────────
export type {
  InstrumentableOrchestrator, InstrumentedOrchestrator,
  InstrumentSwarmOptions,
} from '@cognitive-swarm/otel'

export { instrumentSwarm, SpanManager, getTracer, ATTR } from '@cognitive-swarm/otel'

// ── MCP (Model Context Protocol) ─────────────────────────────
export type { McpTool, ToolCall, ToolResult } from '@cognitive-swarm/mcp'

export {
  McpToolRegistry, McpToolExecutor,
  ToolPromptBuilder, ToolResponseParser, createToolSupport,
} from '@cognitive-swarm/mcp'

// ── A2A (Agent-to-Agent Protocol) ────────────────────────────
export type {
  CreateA2AHandlerOptions, A2AServer, A2ASwarmServerConfig,
  A2AServerOptions, A2ASkillDef, Orchestratable,
  OrchestratorFactory, StreamVerbosity,
} from '@cognitive-swarm/a2a'

export {
  createA2AHandler, createA2AServer,
  SwarmAgentExecutor, buildAgentCard, mapSwarmEventToA2A,
} from '@cognitive-swarm/a2a'
