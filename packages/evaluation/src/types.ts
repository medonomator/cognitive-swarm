import type {
  SwarmResult,
  AgentWeightProvider,
  VectorMemory,
} from '@cognitive-swarm/core'

/** Configuration for OutcomeTracker. */
export interface OutcomeTrackerConfig {
  /** Number of calibration buckets (0.0, 0.1, ..., 0.9). Default: 10 */
  readonly calibrationBuckets?: number
  /** Reward mapping for 'correct' outcome. Default: 1.0 */
  readonly correctReward?: number
  /** Reward mapping for 'partial' outcome. Default: 0.5 */
  readonly partialReward?: number
  /** Reward mapping for 'incorrect' outcome. Default: 0.0 */
  readonly incorrectReward?: number
}

export interface ResolvedOutcomeTrackerConfig {
  readonly calibrationBuckets: number
  readonly correctReward: number
  readonly partialReward: number
  readonly incorrectReward: number
}

/** Context needed to record an outcome. */
export interface SolveOutcomeContext {
  readonly solveId: string
  readonly result: SwarmResult
  readonly taskType: string
}

/** Options for recording an outcome — pluggable subsystems. */
export interface RecordOptions {
  /** Reputation tracker to update per-agent accuracy. */
  readonly weightProvider?: AgentWeightProvider
  /** Vector memory to reinforce/skip discoveries. */
  readonly memory?: VectorMemory
  /** Human-readable explanation of the verdict. */
  readonly details?: string
}
