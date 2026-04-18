import type { EngineConfig, ErrorHandler, LlmProvider, BanditParams } from '@cognitive-engine/core'
import type { Signal } from './signal.js'
import type { SwarmAgentConfig, AgentContribution, AgentReaction, AgentToolSupport } from './agent.js'
import type { ConsensusConfig, ConsensusResult } from './consensus.js'
import type { VectorMemory } from './memory.js'

/** Configuration for math-based analysis in the solve loop. */
export interface MathConfig {
  /** Normalized entropy below which the swarm is considered converged (default: 0.3). */
  readonly entropyThreshold?: number
  /** Minimum relative information gain per round; stop if below (default: 0.05). */
  readonly minInformationGain?: number
  /** NMI threshold above which agents are considered redundant (default: 0.7). */
  readonly redundancyThreshold?: number
}

/** Resolved math config - all fields required. */
export interface ResolvedMathConfig {
  readonly entropyThreshold: number
  readonly minInformationGain: number
  readonly redundancyThreshold: number
}

/** Why the math module stopped the solve loop early. */
export type MathStoppingReason =
  | 'free-energy-converged'
  | 'learning-stalled'
  | 'entropy-converged'
  | 'information-gain-exhausted'
  | 'cycle-detected'
  | 'cusum-change-detected'
  | 'secretary-threshold'
  | 'fragmentation-predicted'
  | 'surprise-collapsed'

/** Math analysis included in SwarmResult. */
export interface MathAnalysis {
  readonly entropy: {
    readonly final: number
    readonly normalized: number
    readonly history: readonly number[]
  }
  readonly informationGain: {
    readonly total: number
    readonly perRound: number
    readonly lastRound: number
  }
  readonly redundancy: {
    readonly averageNMI: number
    readonly redundantAgents: readonly string[]
    readonly mostUniqueAgent: string | undefined
  } | null
  readonly markov: {
    readonly dominantState: string | undefined
    readonly cyclesDetected: boolean
    readonly cycleStates: readonly string[]
  } | null
  readonly bayesian: {
    /** Most likely proposal according to Bayesian posterior. */
    readonly mapEstimate: { readonly proposalId: string; readonly probability: number } | null
    /** Full posterior distribution over proposals. */
    readonly posteriors: Readonly<Record<string, number>>
    /** Total evidence updates applied. */
    readonly evidenceCount: number
  }
  readonly gameTheory: {
    /** Expected number of challengers given current consensus. */
    readonly expectedChallengers: number
    /** Actual number of challenge signals observed. */
    readonly actualChallengers: number
    /** Groupthink risk: expected > actual challengers. */
    readonly groupthinkRisk: 'low' | 'medium' | 'high'
  } | null
  readonly opinionDynamics: {
    /** Predicted number of opinion clusters. */
    readonly clusterCount: number
    /** Polarization index in [0, 1]. */
    readonly polarizationIndex: number
    /** Risk of opinion fragmentation. */
    readonly fragmentationRisk: 'low' | 'medium' | 'high'
    /** Agents that could bridge opinion gaps. */
    readonly bridgingAgents: readonly string[]
  } | null
  readonly replicatorDynamics: {
    /** Strategy with highest fitness. */
    readonly dominantStrategy: string | null
    /** KL divergence from current distribution to ESS equilibrium. */
    readonly convergenceToESS: number
    /** Recommended strategy rebalancing. */
    readonly suggestedShifts: readonly {
      readonly strategy: string
      readonly direction: 'increase' | 'decrease'
      readonly magnitude: number
    }[]
  } | null
  readonly influence: {
    /** Most influential agent. */
    readonly dominantInfluencer: string | undefined
    /** Gini coefficient of influence distribution. */
    readonly influenceConcentration: number
    /** Algebraic connectivity (Fiedler value). */
    readonly fiedlerValue: number
    /** True if removing dominant influencer disconnects the graph. */
    readonly isFragile: boolean
    /** Agents with near-zero influence. */
    readonly isolatedAgents: readonly string[]
  } | null
  readonly optimalStopping: {
    /** Current CUSUM statistic. */
    readonly cusumStatistic: number
    /** Whether exploration phase is complete (Secretary Problem). */
    readonly explorationComplete: boolean
    /** Whether CUSUM detected a change point. */
    readonly changeDetected: boolean
  } | null
  readonly shapley: {
    /** Shapley value per agent (marginal contribution to coalition). */
    readonly values: Readonly<Record<string, number>>
    /** Agents with Shapley value below redundancy threshold. */
    readonly redundantAgents: readonly string[]
    /** Top agents ranked by Shapley value. */
    readonly topContributors: readonly string[]
  } | null
  readonly surprise: {
    /** Mean Bayesian surprise this solve (bits). */
    readonly meanSurprise: number
    /** Surprise trend: positive = increasing, negative = converging. */
    readonly trend: number
    /** True if surprise collapsed (echo chamber / groupthink signal). */
    readonly collapsed: boolean
    /** Agent providing most informative (surprising) signals. */
    readonly mostInformativeAgent: string | null
    /** Agent providing least informative (predictable) signals. */
    readonly leastInformativeAgent: string | null
    /** Per-round surprise history. */
    readonly history: readonly number[]
  } | null
  readonly freeEnergy: {
    /** Current variational free energy F = complexity - accuracy. */
    readonly current: number
    /** Change in F from previous round. Negative = learning. */
    readonly deltaF: number
    /** Rate of free energy descent (slope over recent rounds). */
    readonly descentRate: number
    /** Whether F has converged (primary stopping criterion). */
    readonly converged: boolean
    /** Active inference recommendation. */
    readonly recommendation: {
      readonly action: 'explore' | 'exploit' | 'challenge' | 'stop'
      readonly rationale: string
    }
    /** 'excellent' | 'good' | 'slow' | 'stalled' | 'diverging' */
    readonly learningHealth: string
    /** Dominant component of F: 'complexity' | 'accuracy' | 'balanced'. */
    readonly dominantComponent: string
    /** Per-round F history. */
    readonly history: readonly number[]
  } | null
  readonly fisher: {
    /** Overall learning efficiency in [0, 1] (CR bound / actual variance). */
    readonly overallEfficiency: number
    /** True if efficiency < threshold for N+ rounds. */
    readonly learningStalled: boolean
    /** 'continue' | 'diversify-agents' | 'add-exploration' | 'reduce-agents' | 'stop-early'. */
    readonly recommendation: string
    /** Fisher information trend: positive = improving, negative = diminishing returns. */
    readonly trend: number
    /** Per-round efficiency history. */
    readonly history: readonly number[]
  } | null
  readonly beliefDistance: {
    /** Number of belief clusters among agents. */
    readonly clusterCount: number
    /** All clusters (agent ID groups). */
    readonly clusters: readonly (readonly string[])[]
    /** Optimal consensus distribution (Wasserstein barycenter). */
    readonly optimalConsensus: Readonly<Record<string, number>>
    /** Mean pairwise Wasserstein distance between agents. */
    readonly meanDistance: number
  } | null
  readonly phaseTransition: {
    /** Current phase: 'ordered' | 'critical' | 'disordered'. */
    readonly phase: string
    /** Order parameter (consensus strength). */
    readonly orderParameter: number
    /** Susceptibility (variance × N). Peaks at criticality. */
    readonly susceptibility: number
    /** How close to critical point ∈ [0, 1]. */
    readonly criticalityScore: number
    /** Whether surprise distribution shows power-law (scale-free) signature. */
    readonly scaleFreeSignature: boolean
    /** Recommended control action. */
    readonly control: {
      readonly action: string
      readonly intensity: number
      readonly explorationMultiplier: number
      readonly rationale: string
    }
  } | null
  readonly stoppingReason: MathStoppingReason | null
}

/**
 * Control signals produced by math analysis to feed back into swarm behavior.
 * This closes the loop: math measures → control signals → swarm adapts → math measures.
 */
export interface SwarmControlSignals {
  /** Per-agent attention weights from surprise history. Higher = more informative. */
  readonly attentionWeights: Readonly<Record<string, number>>
  /** Exploration multiplier from phase transition detector. >1 = broaden, <1 = narrow. */
  readonly explorationMultiplier: number
  /** Active inference recommendation from free energy. */
  readonly freeEnergyAction: 'explore' | 'exploit' | 'challenge' | 'stop'
  /** Whether to inject a challenge signal (from phase detector or free energy). */
  readonly shouldInjectChallenge: boolean
  /** Target for challenge/exploration (most uncertain hypothesis). */
  readonly challengeTarget: string | null
  /** Learning health assessment. */
  readonly learningHealth: string
  /** Current phase of swarm dynamics. */
  readonly phase: string
}

/**
 * Provides Bayesian weights for agents based on past performance.
 *
 * ReputationTracker from @cognitive-swarm/reputation implements this.
 * Define here so core stays dependency-free.
 */
export interface AgentWeightProvider {
  /** Get the Bayesian weight for an agent (default taskType = overall). */
  getWeight(agentId: string, taskType?: string): number
  /** Record whether an agent's vote aligned with consensus. */
  update(agentId: string, taskType: string, wasCorrect: boolean): void
}

/** User-facing topology adaptation configuration. */
export interface TopologyConfig {
  /** Enable adaptive topology (default: false - all-to-all). */
  readonly enabled?: boolean
  /** Minimum Fiedler value before topology restricts connections (default: 0.3). */
  readonly minConnectivity?: number
  /** Influence Gini above which to deconcentrate the dominant influencer (default: 0.6). */
  readonly maxInfluenceConcentration?: number
  /** Remove mutual edges between redundant agents (default: true). */
  readonly pruneRedundantLinks?: boolean
  /** Preserve full connectivity for bridging agents (default: true). */
  readonly protectBridgingAgents?: boolean
}

/** Resolved topology config - all fields required. */
export interface ResolvedTopologyConfig {
  readonly enabled: boolean
  readonly minConnectivity: number
  readonly maxInfluenceConcentration: number
  readonly pruneRedundantLinks: boolean
  readonly protectBridgingAgents: boolean
}

/** User-facing advisor configuration. All features opt-in via this config. */
export interface SwarmAdvisorConfig {
  /** Enable groupthink detection and corrective doubt signals (default: true). */
  readonly groupthinkCorrection?: boolean
  /** Enable Shapley-based agent pruning mid-task (default: false - aggressive, opt-in). */
  readonly agentPruning?: boolean
  /** Enable reputation-weighted voting (default: true). */
  readonly reputationWeighting?: boolean
  /** External weight provider (e.g. ReputationTracker) for cross-session learning. */
  readonly weightProvider?: AgentWeightProvider
  /** Minimum rounds before the advisor can act (default: 2). */
  readonly warmupRounds?: number
  /** Adaptive topology configuration (default: disabled). */
  readonly topology?: TopologyConfig
}

/** Resolved advisor config - all fields required. */
export interface ResolvedSwarmAdvisorConfig {
  readonly groupthinkCorrection: boolean
  readonly agentPruning: boolean
  readonly reputationWeighting: boolean
  readonly weightProvider: AgentWeightProvider | null
  readonly warmupRounds: number
  readonly topology: ResolvedTopologyConfig | null
}

/**
 * An action recommended by the SwarmAdvisor.
 * Discriminated union on `type`.
 */
export type SwarmAdvice =
  | SwarmAdviceInjectSignal
  | SwarmAdviceDisableAgent
  | SwarmAdviceUpdateTopology

export interface SwarmAdviceInjectSignal {
  readonly type: 'inject-signal'
  readonly signal: Signal
  readonly reason: string
}

export interface SwarmAdviceDisableAgent {
  readonly type: 'disable-agent'
  readonly agentId: string
  readonly reason: string
}

export interface SwarmAdviceUpdateTopology {
  readonly type: 'update-topology'
  readonly neighbors: ReadonlyMap<string, ReadonlySet<string>>
  readonly reason: string
}

/** Report produced by the advisor after a solve(). */
export interface AdvisorReport {
  /** Number of groupthink corrections injected. */
  readonly groupthinkCorrections: number
  /** Agent IDs that were disabled via Shapley pruning. */
  readonly disabledAgents: readonly string[]
  /** Whether reputation weighting was applied to votes. */
  readonly reputationApplied: boolean
  /** All advice actions taken during the solve. */
  readonly actions: readonly SwarmAdvice[]
  /** Number of topology updates applied. */
  readonly topologyUpdates: number
  /** Final topology state (null = all-to-all). */
  readonly finalTopology: ReadonlyMap<string, ReadonlySet<string>> | null
}

/** Result of a structured debate between competing proposals. */
export interface DebateResult {
  /** Whether the debate resolved the conflict. */
  readonly resolved: boolean
  /** Winning proposal ID, or null if unresolved. */
  readonly winningProposalId: string | null
  /** Bayesian posterior confidence of the winner (0-1). */
  readonly confidence: number
  /** Number of debate rounds used. */
  readonly roundsUsed: number
  /** All signals generated during the debate. */
  readonly signals: readonly Signal[]
}

/** Everything needed to build one SwarmAgent. */
export interface SwarmAgentDef {
  readonly config: SwarmAgentConfig
  readonly engine: EngineConfig
  readonly toolSupport?: AgentToolSupport
}

/** Config for the optional synthesizer (final answer generation). */
export interface SynthesizerConfig {
  readonly llm: LlmProvider
  readonly prompt?: string
}

/**
 * Minimal bandit storage interface for dependency injection.
 * Compatible with BanditStorage from @cognitive-engine/bandit.
 */
export interface SwarmBanditStorage {
  getParams(actionId: string): Promise<BanditParams | null>
  saveParams(params: BanditParams): Promise<void>
  listActionIds(): Promise<string[]>
}

/** LLM retry configuration. */
export interface RetryConfig {
  /** Max retry attempts per LLM call (default: 3). */
  readonly maxRetries?: number
  /** Base delay in ms for exponential backoff (default: 1000). */
  readonly baseDelayMs?: number
  /** Max delay in ms cap (default: 10000). */
  readonly maxDelayMs?: number
  /** Enable circuit breaker — disable agent after N consecutive failures (default: 5). */
  readonly circuitBreakerThreshold?: number
}

/** Resolved retry config with defaults applied. */
export interface ResolvedRetryConfig {
  readonly maxRetries: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
  readonly circuitBreakerThreshold: number
}

/**
 * Checkpoint storage for resumable solves.
 * Implementations can use files, Redis, databases, etc.
 */
export interface CheckpointStorage {
  /** Save a checkpoint. */
  save(id: string, data: SolveCheckpoint): Promise<void>
  /** Load a checkpoint, or null if not found. */
  load(id: string): Promise<SolveCheckpoint | null>
  /** Delete a checkpoint. */
  delete(id: string): Promise<void>
}

/** Serializable solve state for resume. */
export interface SolveCheckpoint {
  readonly task: string
  readonly roundsCompleted: number
  readonly signals: readonly Signal[]
  readonly agentContributions: ReadonlyMap<string, AgentContribution>
  readonly tokensUsed: number
  readonly timestamp: number
}

/** User-facing swarm orchestrator config. */
export interface SwarmConfig {
  readonly agents: readonly SwarmAgentDef[]
  readonly consensus?: ConsensusConfig
  readonly maxRounds?: number
  readonly maxSignals?: number
  readonly timeout?: number
  readonly synthesizer?: SynthesizerConfig
  readonly memory?: VectorMemory
  readonly math?: MathConfig
  readonly advisor?: SwarmAdvisorConfig
  readonly onError?: ErrorHandler
  /** Custom bandit storage shared by all agents. Defaults to in-memory (resets each run). */
  readonly banditStorage?: SwarmBanditStorage
  /** Selective agent activation. If set, only top-K agents activate per signal. */
  readonly agentSelection?: {
    /** Max agents to activate per signal. */
    readonly topK?: number
    /** Min score spread to trigger selection. Below this, all activate (exploration). Default 0.15. */
    readonly minSpread?: number
  }
  /** LLM retry configuration. Enables exponential backoff + circuit breaker. */
  readonly retry?: RetryConfig
  /** Token budget. If set, solve stops when budget is exhausted. */
  readonly tokenBudget?: number
  /** Checkpoint storage for resumable solves. */
  readonly checkpoint?: CheckpointStorage
}

/** Resolved swarm config - all fields required. */
export interface ResolvedSwarmConfig {
  readonly agents: readonly SwarmAgentDef[]
  readonly consensus: ConsensusConfig
  readonly maxRounds: number
  readonly maxSignals: number
  readonly timeout: number
  readonly synthesizer: SynthesizerConfig | null
  readonly memory: VectorMemory | null
  readonly math: ResolvedMathConfig
  readonly advisor: ResolvedSwarmAdvisorConfig | null
  readonly onError: ErrorHandler
  readonly banditStorage: SwarmBanditStorage | null
  readonly agentSelection: {
    readonly topK?: number
    readonly minSpread?: number
  } | null
  readonly retry: ResolvedRetryConfig
  readonly tokenBudget: number | null
  readonly checkpoint: CheckpointStorage | null
}

/** Final result of a swarm solve(). */
export interface SwarmResult {
  readonly answer: string
  readonly confidence: number
  readonly consensus: ConsensusResult
  readonly signalLog: readonly Signal[]
  readonly agentContributions: ReadonlyMap<string, AgentContribution>
  readonly cost: SwarmCost
  readonly timing: SwarmTiming
  readonly mathAnalysis: MathAnalysis
  readonly advisorReport: AdvisorReport | null
  readonly debateResults: readonly DebateResult[]
}

export interface SwarmCost {
  readonly tokens: number
  readonly estimatedUsd: number
}

export interface SwarmTiming {
  readonly totalMs: number
  readonly roundsUsed: number
}

/** Events yielded by solveWithStream(). Discriminated union on `type`. */
export type SwarmEvent =
  | { readonly type: 'solve:start'; readonly task: string }
  | { readonly type: 'round:start'; readonly round: number }
  | { readonly type: 'signal:emitted'; readonly signal: Signal }
  | { readonly type: 'agent:reacted'; readonly reaction: AgentReaction }
  | {
      readonly type: 'consensus:check'
      readonly result: ConsensusResult
    }
  | {
      readonly type: 'round:end'
      readonly round: number
      readonly signalCount: number
    }
  | { readonly type: 'synthesis:start' }
  | { readonly type: 'synthesis:complete'; readonly answer: string }
  | {
      readonly type: 'math:round-analysis'
      readonly round: number
      readonly entropy: number
      readonly normalizedEntropy: number
      readonly informationGain: number
    }
  | { readonly type: 'advisor:action'; readonly advice: SwarmAdvice }
  | { readonly type: 'debate:start'; readonly proposalA: string; readonly proposalB: string }
  | { readonly type: 'debate:round'; readonly round: number; readonly posteriors: Readonly<Record<string, number>> }
  | { readonly type: 'debate:end'; readonly result: DebateResult }
  | { readonly type: 'topology:updated'; readonly neighbors: ReadonlyMap<string, ReadonlySet<string>>; readonly reason: string }
  | { readonly type: 'solve:complete'; readonly result: SwarmResult }
