import type { MathAnalysis } from '@cognitive-swarm/core'

/** Result of a single benchmark run. */
export interface BenchmarkResult {
  readonly name: string
  readonly description: string
  /** Swarm result. */
  readonly swarm: RunResult
  /** Single-model baseline result. */
  readonly baseline: RunResult
  /** Comparison metrics. */
  readonly comparison: Comparison
  /** Full math analysis from the swarm run. */
  readonly mathAnalysis: MathAnalysis | null
  readonly timestamp: number
}

/** Result of one run (swarm or baseline). */
export interface RunResult {
  readonly answer: string
  readonly score: number
  readonly tokensUsed: number
  readonly durationMs: number
  /** Cost estimate in USD. */
  readonly costUsd: number
  /** Number of signals emitted (swarm only). */
  readonly signalCount?: number
  /** Rounds used (swarm only). */
  readonly roundsUsed?: number
}

/** Side-by-side comparison. */
export interface Comparison {
  /** Score difference: swarm - baseline. Positive = swarm wins. */
  readonly scoreDelta: number
  /** Cost ratio: swarm / baseline. < 1 = swarm cheaper. */
  readonly costRatio: number
  /** Speed ratio: swarm / baseline. < 1 = swarm faster. */
  readonly speedRatio: number
  /** Quality per dollar ratio: swarm / baseline. > 1 = swarm better value. */
  readonly qualityPerDollar: number
  /** Winner of this benchmark. */
  readonly winner: 'swarm' | 'baseline' | 'tie'
}

/** A benchmark definition. */
export interface BenchmarkDef {
  readonly name: string
  readonly description: string
  run(apiKey: string): Promise<BenchmarkResult>
}

/** Pricing per 1M tokens for cost estimation. */
export interface ModelPricing {
  readonly inputPer1M: number
  readonly outputPer1M: number
}

/** All benchmark results aggregated. */
export interface BenchmarkReport {
  readonly results: readonly BenchmarkResult[]
  readonly swarmWins: number
  readonly baselineWins: number
  readonly ties: number
  readonly totalSwarmCost: number
  readonly totalBaselineCost: number
  readonly timestamp: number
}
