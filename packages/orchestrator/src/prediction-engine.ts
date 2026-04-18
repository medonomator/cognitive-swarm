import type { Signal, SignalType } from '@cognitive-swarm/core'

/**
 * Predictive Processing Engine
 *
 * Each agent predicts the distribution of signal types it expects in the
 * next round. After the round, we compute prediction error (KL divergence
 * between expected and actual distributions). High error = the agent was
 * surprised = it has valuable new information → prioritize it.
 *
 * This replaces/augments top-K agent selection with a principled mechanism:
 * - Surprised agents get priority (they have new info)
 * - Redundant agents are naturally deprioritized (their predictions match reality)
 *
 * Theoretical basis: Lesson 12 (Predictive Processing), Free Energy Principle.
 */

/** An agent's prediction of what signal types will appear next round. */
export interface AgentPrediction {
  readonly agentId: string
  /** Expected probability distribution over signal types (must sum to 1). */
  readonly expectedTypeDistribution: ReadonlyMap<SignalType, number>
  readonly round: number
}

/** Prediction error result for one agent. */
export interface PredictionError {
  readonly agentId: string
  /** KL divergence between predicted and actual (bits). Higher = more surprised. */
  readonly error: number
  /** Normalized error in [0, 1] for easy comparison. */
  readonly normalizedError: number
  readonly round: number
}

/** All signal types we track predictions for. */
const PREDICTED_TYPES: readonly SignalType[] = [
  'discovery', 'proposal', 'challenge', 'doubt', 'vote',
  'conflict', 'tool:result', 'escalate',
]

const SMOOTHING_EPSILON = 0.01

export class PredictionEngine {
  /**
   * History of signal type distributions per round, used by agents to
   * form predictions based on recent patterns.
   */
  private readonly roundHistory: Map<SignalType, number>[] = []

  /** Latest prediction errors per agent. */
  private readonly latestErrors = new Map<string, PredictionError>()

  /**
   * Generate predictions for an agent based on signal history.
   * Uses exponential moving average of recent round distributions.
   *
   * This is a lightweight statistical prediction — no LLM call needed.
   */
  generatePrediction(agentId: string, round: number): AgentPrediction {
    const distribution = new Map<SignalType, number>()

    if (this.roundHistory.length === 0) {
      // Cold start: uniform distribution
      const uniformProb = 1 / PREDICTED_TYPES.length
      for (const type of PREDICTED_TYPES) {
        distribution.set(type, uniformProb)
      }
    } else {
      // Exponential moving average of recent rounds (last 3)
      const recentRounds = this.roundHistory.slice(-3)
      const totalCounts = new Map<SignalType, number>()
      let totalSignals = 0

      for (const roundDist of recentRounds) {
        for (const type of PREDICTED_TYPES) {
          const count = roundDist.get(type) ?? 0
          totalCounts.set(type, (totalCounts.get(type) ?? 0) + count)
          totalSignals += count
        }
      }

      // Normalize to probability distribution with Laplace smoothing
      const smoothedTotal = totalSignals + SMOOTHING_EPSILON * PREDICTED_TYPES.length
      for (const type of PREDICTED_TYPES) {
        const count = (totalCounts.get(type) ?? 0) + SMOOTHING_EPSILON
        distribution.set(type, count / smoothedTotal)
      }
    }

    return { agentId, expectedTypeDistribution: distribution, round }
  }

  /**
   * Compute prediction error after a round completes.
   * Updates internal state with the actual signal distribution.
   */
  computeErrors(
    agentPredictions: readonly AgentPrediction[],
    actualSignals: readonly Signal[],
    round: number,
  ): readonly PredictionError[] {
    // Build actual distribution
    const actualCounts = new Map<SignalType, number>()
    let totalActual = 0
    for (const signal of actualSignals) {
      const count = actualCounts.get(signal.type) ?? 0
      actualCounts.set(signal.type, count + 1)
      totalActual++
    }

    // Store for future predictions
    this.roundHistory.push(new Map(actualCounts))

    if (totalActual === 0) {
      return agentPredictions.map(p => ({
        agentId: p.agentId,
        error: 0,
        normalizedError: 0,
        round,
      }))
    }

    // Build actual probability distribution with smoothing
    const actualDist = new Map<SignalType, number>()
    const smoothedTotal = totalActual + SMOOTHING_EPSILON * PREDICTED_TYPES.length
    for (const type of PREDICTED_TYPES) {
      const count = (actualCounts.get(type) ?? 0) + SMOOTHING_EPSILON
      actualDist.set(type, count / smoothedTotal)
    }

    // Compute KL divergence for each agent's prediction
    const errors: PredictionError[] = []
    let maxError = 0

    for (const prediction of agentPredictions) {
      let kl = 0
      for (const type of PREDICTED_TYPES) {
        const pActual = actualDist.get(type) ?? SMOOTHING_EPSILON
        const pPredicted = prediction.expectedTypeDistribution.get(type) ?? SMOOTHING_EPSILON
        // KL(actual || predicted) = Σ p_actual × log(p_actual / p_predicted)
        if (pActual > 0) {
          kl += pActual * Math.log2(pActual / pPredicted)
        }
      }

      // KL divergence is always >= 0
      const error = Math.max(0, kl)
      if (error > maxError) maxError = error

      errors.push({ agentId: prediction.agentId, error, normalizedError: 0, round })
    }

    // Normalize errors to [0, 1]
    const normalized = errors.map(e => ({
      ...e,
      normalizedError: maxError > 0 ? e.error / maxError : 0,
    }))

    // Store latest errors
    for (const err of normalized) {
      this.latestErrors.set(err.agentId, err)
    }

    return normalized
  }

  /** Get the latest prediction error for an agent (for AgentSelector scoring). */
  getLatestError(agentId: string): PredictionError | null {
    return this.latestErrors.get(agentId) ?? null
  }

  /** Get prediction error score for agent selection (higher = should be selected). */
  getPredictionPriority(agentId: string): number {
    const err = this.latestErrors.get(agentId)
    if (!err) return 0.5 // neutral prior for cold start
    // Surprised agents get higher priority
    return 0.3 + 0.7 * err.normalizedError
  }

  /** Reset between solves. */
  reset(): void {
    this.roundHistory.length = 0
    this.latestErrors.clear()
  }
}
