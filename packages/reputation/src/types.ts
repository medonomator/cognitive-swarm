/** A record of an agent's performance on a specific task. */
export interface PerformanceRecord {
  readonly agentId: string
  readonly taskType: string
  readonly wasCorrect: boolean
  readonly timestamp: number
  /** Optional confidence of the agent's contribution. */
  readonly confidence?: number
}

/** Reputation score for an agent on a specific task type. */
export interface ReputationScore {
  /** Number of correct outcomes. */
  readonly successes: number
  /** Number of incorrect outcomes. */
  readonly failures: number
  /** Total outcomes. */
  readonly total: number
  /** Success rate ∈ [0, 1]. */
  readonly accuracy: number
  /** Bayesian weight - accounts for sample size via Beta distribution. */
  readonly weight: number
  /** Trend: positive if improving, negative if declining. */
  readonly trend: number
}

/** Full reputation profile for an agent across all task types. */
export interface AgentReputation {
  readonly agentId: string
  /** Overall score across all task types. */
  readonly overall: ReputationScore
  /** Per task-type breakdown. */
  readonly byTaskType: ReadonlyMap<string, ReputationScore>
  /** Task types where this agent excels (accuracy > threshold). */
  readonly strengths: readonly string[]
  /** Task types where this agent struggles (accuracy < threshold). */
  readonly weaknesses: readonly string[]
}

/** Configuration for the reputation tracker. */
export interface ReputationConfig {
  /** Bayesian prior - pseudo-count of successes. Default: 1 (optimistic) */
  readonly priorSuccesses?: number
  /** Bayesian prior - pseudo-count of failures. Default: 1 */
  readonly priorFailures?: number
  /** Minimum accuracy to consider a "strength". Default: 0.7 */
  readonly strengthThreshold?: number
  /** Maximum accuracy to consider a "weakness". Default: 0.4 */
  readonly weaknessThreshold?: number
  /** Number of recent records used for trend computation. Default: 10 */
  readonly trendWindow?: number
}

/** Resolved config with all defaults applied. */
export interface ResolvedReputationConfig {
  readonly priorSuccesses: number
  readonly priorFailures: number
  readonly strengthThreshold: number
  readonly weaknessThreshold: number
  readonly trendWindow: number
}

/** Ranking entry for comparing agents. */
export interface AgentRanking {
  readonly agentId: string
  readonly weight: number
  readonly accuracy: number
  readonly total: number
}
