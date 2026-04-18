import type {
  PerformanceRecord,
  ReputationScore,
  AgentReputation,
  ReputationConfig,
  ResolvedReputationConfig,
  AgentRanking,
} from './types.js'

// Reputation tracker - Bayesian estimation of agent reliability.
// weight = (alpha + successes) / (alpha + beta + total)

/**
 * Tracks agent reputation across task types.
 *
 * Usage:
 * ```ts
 * const tracker = new ReputationTracker()
 *
 * // After consensus, record who was right
 * tracker.update('agent-1', 'code-review', true)
 * tracker.update('agent-2', 'code-review', false)
 *
 * // Use reputation for weighted voting
 * const weight = tracker.getWeight('agent-1', 'code-review')
 * // -> high weight (was correct)
 *
 * // Get full profile
 * const profile = tracker.getProfile('agent-1')
 * // -> strengths: ['code-review'], weaknesses: []
 * ```
 */
export class ReputationTracker {
  private readonly records: PerformanceRecord[] = []
  private readonly config: ResolvedReputationConfig

  constructor(config?: ReputationConfig) {
    this.config = resolveConfig(config)
  }

  /**
   * Record an agent's performance on a task.
   */
  update(
    agentId: string,
    taskType: string,
    wasCorrect: boolean,
    confidence?: number,
  ): void {
    this.records.push({
      agentId,
      taskType,
      wasCorrect,
      timestamp: Date.now(),
      confidence,
    })
  }

  /**
   * Record multiple performance results at once.
   */
  updateBatch(records: readonly PerformanceRecord[]): void {
    for (const r of records) {
      this.records.push(r)
    }
  }

  /**
   * Get the Bayesian weight for an agent on a task type.
   *
   * Uses Beta distribution posterior mean:
   * weight = (α + successes) / (α + β + total)
   *
   * Returns the prior mean if no data exists.
   */
  getWeight(agentId: string, taskType: string): number {
    return this.computeScore(agentId, taskType).weight
  }

  /**
   * Get detailed reputation score for an agent on a task type.
   */
  getScore(agentId: string, taskType: string): ReputationScore {
    return this.computeScore(agentId, taskType)
  }

  /**
   * Get full reputation profile for an agent.
   */
  getProfile(agentId: string): AgentReputation {
    const taskTypes = this.getTaskTypesForAgent(agentId)
    const byTaskType = new Map<string, ReputationScore>()

    for (const tt of taskTypes) {
      byTaskType.set(tt, this.computeScore(agentId, tt))
    }

    const overall = this.computeScore(agentId)

    const strengths: string[] = []
    const weaknesses: string[] = []

    for (const [tt, score] of byTaskType) {
      if (score.total >= 3 && score.accuracy >= this.config.strengthThreshold) {
        strengths.push(tt)
      }
      if (score.total >= 3 && score.accuracy <= this.config.weaknessThreshold) {
        weaknesses.push(tt)
      }
    }

    return { agentId, overall, byTaskType, strengths, weaknesses }
  }

  /**
   * Rank all agents for a specific task type.
   * Sorted by Bayesian weight descending.
   */
  rankAgents(taskType?: string): readonly AgentRanking[] {
    const agents = this.getAllAgentIds()
    const rankings: AgentRanking[] = agents.map((agentId) => {
      const score = taskType
        ? this.computeScore(agentId, taskType)
        : this.computeScore(agentId)
      return {
        agentId,
        weight: score.weight,
        accuracy: score.accuracy,
        total: score.total,
      }
    })

    rankings.sort((a, b) => b.weight - a.weight)
    return rankings
  }

  /**
   * Get all distinct agent IDs.
   */
  getAllAgentIds(): readonly string[] {
    const ids = new Set<string>()
    for (const r of this.records) ids.add(r.agentId)
    return [...ids]
  }

  get recordCount(): number {
    return this.records.length
  }

  reset(): void {
    this.records.length = 0
  }

  private computeScore(
    agentId: string,
    taskType?: string,
  ): ReputationScore {
    const filtered = this.records.filter(
      (r) =>
        r.agentId === agentId &&
        (taskType === undefined || r.taskType === taskType),
    )

    const successes = filtered.filter((r) => r.wasCorrect).length
    const failures = filtered.length - successes
    const total = filtered.length

    const accuracy = total > 0 ? successes / total : 0.5

    // Beta distribution posterior mean
    const alpha = this.config.priorSuccesses + successes
    const beta = this.config.priorFailures + failures
    const weight = alpha / (alpha + beta)

    // Trend: compare recent window to overall
    const trend = this.computeTrend(filtered)

    return { successes, failures, total, accuracy, weight, trend }
  }

  private computeTrend(records: readonly PerformanceRecord[]): number {
    if (records.length < this.config.trendWindow) return 0

    const recent = records.slice(-this.config.trendWindow)
    const recentRate =
      recent.filter((r) => r.wasCorrect).length / recent.length

    const overallRate =
      records.filter((r) => r.wasCorrect).length / records.length

    return recentRate - overallRate
  }

  private getTaskTypesForAgent(agentId: string): readonly string[] {
    const types = new Set<string>()
    for (const r of this.records) {
      if (r.agentId === agentId) types.add(r.taskType)
    }
    return [...types]
  }
}

function resolveConfig(config?: ReputationConfig): ResolvedReputationConfig {
  return {
    priorSuccesses: config?.priorSuccesses ?? 1,
    priorFailures: config?.priorFailures ?? 1,
    strengthThreshold: config?.strengthThreshold ?? 0.7,
    weaknessThreshold: config?.weaknessThreshold ?? 0.4,
    trendWindow: config?.trendWindow ?? 10,
  }
}
