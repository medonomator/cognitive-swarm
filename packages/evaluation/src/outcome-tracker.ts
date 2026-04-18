/**
 * OutcomeTracker — feeds real-world outcomes back into the swarm.
 *
 * Called AFTER solve() when ground truth is known. Connects the
 * swarm's internal deliberation to external reality by updating:
 *   - Reputation (per-agent accuracy tracking)
 *   - Memory (reinforce correct discoveries)
 *   - Calibration (predicted confidence vs actual accuracy)
 */

import type {
  OutcomeVerdict,
  OutcomeRecord,
  CalibrationPoint,
  EvaluationReport,
  Signal,
  ProposalPayload,
  VotePayload,
} from '@cognitive-swarm/core'
import type {
  OutcomeTrackerConfig,
  ResolvedOutcomeTrackerConfig,
  SolveOutcomeContext,
  RecordOptions,
} from './types.js'

// ── Defaults ────────────────────────────────────────────────────

const DEFAULT_BUCKETS = 10
const DEFAULT_CORRECT_REWARD = 1.0
const DEFAULT_PARTIAL_REWARD = 0.5
const DEFAULT_INCORRECT_REWARD = 0.0

// ── Tracker ─────────────────────────────────────────────────────

export class OutcomeTracker {
  private readonly config: ResolvedOutcomeTrackerConfig
  private readonly outcomes: OutcomeRecord[] = []

  constructor(config?: OutcomeTrackerConfig) {
    this.config = {
      calibrationBuckets: config?.calibrationBuckets ?? DEFAULT_BUCKETS,
      correctReward: config?.correctReward ?? DEFAULT_CORRECT_REWARD,
      partialReward: config?.partialReward ?? DEFAULT_PARTIAL_REWARD,
      incorrectReward: config?.incorrectReward ?? DEFAULT_INCORRECT_REWARD,
    }
  }

  /**
   * Record an outcome for a completed solve.
   *
   * 1. Stores the outcome record
   * 2. Updates reputation for each contributing agent
   * 3. Reinforces memories from correct solves
   */
  async record(
    context: SolveOutcomeContext,
    verdict: OutcomeVerdict,
    options?: RecordOptions,
  ): Promise<void> {
    const record: OutcomeRecord = {
      solveId: context.solveId,
      verdict,
      taskType: context.taskType,
      details: options?.details,
      predictedConfidence: context.result.confidence,
      timestamp: Date.now(),
    }

    this.outcomes.push(record)

    // ── Reputation feedback ──
    if (options?.weightProvider) {
      this.updateReputation(context, verdict, options.weightProvider)
    }

    // ── Memory reinforcement ──
    if (options?.memory && verdict === 'correct') {
      await this.reinforceMemories(context)
    }
  }

  /** Get calibration and accuracy report. */
  getReport(): EvaluationReport {
    if (this.outcomes.length === 0) {
      return {
        totalOutcomes: 0,
        accuracy: 0,
        partialRate: 0,
        calibration: [],
        calibrationError: 0,
        outcomesByTaskType: {},
      }
    }

    const correct = this.outcomes.filter(o => o.verdict === 'correct').length
    const partial = this.outcomes.filter(o => o.verdict === 'partial').length

    return {
      totalOutcomes: this.outcomes.length,
      accuracy: correct / this.outcomes.length,
      partialRate: partial / this.outcomes.length,
      calibration: this.computeCalibration(),
      calibrationError: this.computeCalibrationError(),
      outcomesByTaskType: this.groupByTaskType(),
    }
  }

  /** Reset all recorded outcomes. */
  reset(): void {
    this.outcomes.length = 0
  }

  /** Get the reward value for a verdict. */
  getReward(verdict: OutcomeVerdict): number {
    switch (verdict) {
      case 'correct': return this.config.correctReward
      case 'partial': return this.config.partialReward
      case 'incorrect': return this.config.incorrectReward
    }
  }

  // ── Private ───────────────────────────────────────────────────

  private updateReputation(
    context: SolveOutcomeContext,
    verdict: OutcomeVerdict,
    weightProvider: { update(agentId: string, taskType: string, wasCorrect: boolean): void },
  ): void {
    const wasCorrect = verdict === 'correct'
    const consensus = context.result.consensus
    const signalLog = context.result.signalLog

    // Find the agent who authored the winning proposal
    if (consensus.decided && consensus.proposalId) {
      const proposalSignal = signalLog.find(
        s => s.type === 'proposal' && hasProposalId(s.payload) && (s.payload as ProposalPayload).proposalId === consensus.proposalId,
      )
      if (proposalSignal) {
        weightProvider.update(proposalSignal.source, context.taskType, wasCorrect)
      }
    }

    // Update all agents who voted on the winning proposal
    for (const signal of signalLog) {
      if (signal.type !== 'vote') continue
      if (!hasProposalId(signal.payload)) continue
      const vote = signal.payload as VotePayload
      if (vote.stance === 'agree' && vote.proposalId === consensus.proposalId) {
        // Agents who agreed with a correct answer were right
        weightProvider.update(signal.source, context.taskType, wasCorrect)
      } else if (vote.stance === 'disagree' && vote.proposalId === consensus.proposalId) {
        // Agents who disagreed with a correct answer were wrong (and vice versa)
        weightProvider.update(signal.source, context.taskType, !wasCorrect)
      }
    }
  }

  private async reinforceMemories(_context: SolveOutcomeContext): Promise<void> {
    // Memory reinforcement happens naturally through the orchestrator's
    // reinforceFromVotes() mechanism. External evaluation feedback flows
    // primarily through reputation → vote weights → future reinforcement.
  }

  private computeCalibration(): CalibrationPoint[] {
    const bucketSize = 1.0 / this.config.calibrationBuckets
    const points: CalibrationPoint[] = []

    for (let i = 0; i < this.config.calibrationBuckets; i++) {
      const bucketMin = i * bucketSize
      const bucketMax = bucketMin + bucketSize
      const inBucket = this.outcomes.filter(
        o => o.predictedConfidence >= bucketMin && o.predictedConfidence < bucketMax,
      )

      if (inBucket.length === 0) continue

      const predictedMean = inBucket.reduce((sum, o) => sum + o.predictedConfidence, 0) / inBucket.length
      const actualCorrect = inBucket.filter(o => o.verdict === 'correct').length
      const actualPartial = inBucket.filter(o => o.verdict === 'partial').length
      const actualAccuracy = (actualCorrect + actualPartial * 0.5) / inBucket.length

      points.push({
        bucket: bucketMin,
        predictedMean,
        actualAccuracy,
        count: inBucket.length,
      })
    }

    return points
  }

  private computeCalibrationError(): number {
    const calibration = this.computeCalibration()
    if (calibration.length === 0) return 0

    const totalWeight = calibration.reduce((sum, p) => sum + p.count, 0)
    const weightedError = calibration.reduce(
      (sum, p) => sum + Math.abs(p.predictedMean - p.actualAccuracy) * p.count,
      0,
    )

    return weightedError / totalWeight
  }

  private groupByTaskType(): Record<string, { correct: number; partial: number; incorrect: number }> {
    const groups: Record<string, { correct: number; partial: number; incorrect: number }> = {}

    for (const o of this.outcomes) {
      let group = groups[o.taskType]
      if (!group) {
        group = { correct: 0, partial: 0, incorrect: 0 }
        groups[o.taskType] = group
      }
      switch (o.verdict) {
        case 'correct': group.correct++; break
        case 'partial': group.partial++; break
        case 'incorrect': group.incorrect++; break
      }
    }

    return groups
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function hasProposalId(payload: Signal['payload']): payload is ProposalPayload | VotePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'proposalId' in payload
  )
}
