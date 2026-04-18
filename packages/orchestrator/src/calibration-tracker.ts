import type {
  AgentReaction,
  ConsensusResult,
  Signal,
} from '@cognitive-swarm/core'

/**
 * Self-Model Calibration Tracker
 *
 * Computes how well-calibrated each agent's confidence is.
 * An agent is well-calibrated if "90% confident" means correct 90% of the time.
 *
 * Calibration data persists across solves — the more runs, the better the
 * adjustment factor becomes. Within a single solve, this adjusts output
 * signal confidence using historical calibration.
 *
 * Theoretical basis: Lesson 9 (Self-Models), ECE metric.
 */

/** Per-agent calibration data. */
export interface AgentCalibration {
  /** Expected Calibration Error: |accuracy - confidence| weighted by bucket size. */
  readonly calibrationError: number
  /** Ratio of predictions where confidence > actual accuracy. */
  readonly overconfidenceRatio: number
  /** Multiply raw confidence by this to get calibrated confidence. */
  readonly adjustmentFactor: number
  /** Number of data points (more = more reliable). */
  readonly sampleCount: number
}

/** Single observation: agent stated confidence X, outcome was Y. */
interface CalibrationSample {
  readonly agentId: string
  readonly statedConfidence: number
  /** 1 if the agent's signal aligned with consensus, 0 otherwise. */
  readonly wasCorrect: number
}

const BUCKET_COUNT = 10
const MIN_SAMPLES_FOR_ADJUSTMENT = 5

/**
 * Tracks agent calibration across solves.
 * Call `recordSolveOutcome()` after each solve, then use
 * `getCalibration()` to get per-agent adjustment factors.
 */
export class CalibrationTracker {
  private readonly samples: CalibrationSample[] = []

  /**
   * Record calibration samples from a completed solve.
   * Compares each agent's signal confidence against consensus outcome.
   */
  recordSolveOutcome(
    reactions: readonly AgentReaction[],
    consensus: ConsensusResult,
    signalLog: readonly Signal[],
  ): void {
    if (!consensus.decided || !consensus.proposalId) return

    // Build a map of proposal signals
    const proposalSignals = signalLog.filter(s => s.type === 'proposal')
    const winningProposalSignal = proposalSignals.find(s =>
      hasProposalId(s.payload) && s.payload.proposalId === consensus.proposalId,
    )
    if (!winningProposalSignal) return

    // For each vote reaction, check if it aligned with consensus
    for (const reaction of reactions) {
      for (const signal of reaction.signals) {
        if (signal.type === 'vote' && isVotePayload(signal.payload)) {
          if (signal.payload.proposalId === consensus.proposalId) {
            const wasCorrect = signal.payload.stance === 'agree' ? 1 : 0
            this.samples.push({
              agentId: reaction.agentId,
              statedConfidence: signal.confidence,
              wasCorrect,
            })
          }
        }
        // Proposals: did the agent's proposal win?
        if (signal.type === 'proposal' && hasProposalId(signal.payload)) {
          const wasCorrect = signal.payload.proposalId === consensus.proposalId ? 1 : 0
          this.samples.push({
            agentId: reaction.agentId,
            statedConfidence: signal.confidence,
            wasCorrect,
          })
        }
      }
    }
  }

  /** Get calibration for a specific agent. */
  getCalibration(agentId: string): AgentCalibration {
    const agentSamples = this.samples.filter(s => s.agentId === agentId)
    return computeCalibration(agentSamples)
  }

  /** Get calibration for all agents that have sufficient data. */
  getAllCalibrations(): ReadonlyMap<string, AgentCalibration> {
    const byAgent = new Map<string, CalibrationSample[]>()
    for (const sample of this.samples) {
      const list = byAgent.get(sample.agentId) ?? []
      list.push(sample)
      byAgent.set(sample.agentId, list)
    }

    const result = new Map<string, AgentCalibration>()
    for (const [agentId, samples] of byAgent) {
      if (samples.length >= MIN_SAMPLES_FOR_ADJUSTMENT) {
        result.set(agentId, computeCalibration(samples))
      }
    }
    return result
  }

  /** Adjust a raw confidence value using calibration data. */
  adjustConfidence(agentId: string, rawConfidence: number): number {
    const cal = this.getCalibration(agentId)
    if (cal.sampleCount < MIN_SAMPLES_FOR_ADJUSTMENT) return rawConfidence
    return Math.max(0.05, Math.min(0.99, rawConfidence * cal.adjustmentFactor))
  }

  /** Import previously saved samples (for cross-session persistence). */
  importSamples(samples: readonly CalibrationSample[]): void {
    this.samples.push(...samples)
  }

  /** Export all samples for persistence. */
  exportSamples(): readonly CalibrationSample[] {
    return [...this.samples]
  }

  /** Total sample count. */
  get totalSamples(): number {
    return this.samples.length
  }
}

function computeCalibration(samples: readonly CalibrationSample[]): AgentCalibration {
  if (samples.length === 0) {
    return { calibrationError: 0, overconfidenceRatio: 0, adjustmentFactor: 1, sampleCount: 0 }
  }

  // Bucket by stated confidence: [0.0-0.1), [0.1-0.2), ..., [0.9-1.0]
  const buckets: { confidenceSum: number; correctSum: number; count: number }[] =
    Array.from({ length: BUCKET_COUNT }, () => ({ confidenceSum: 0, correctSum: 0, count: 0 }))

  let overconfident = 0

  for (const sample of samples) {
    const bucket = Math.min(BUCKET_COUNT - 1, Math.floor(sample.statedConfidence * BUCKET_COUNT))
    buckets[bucket]!.confidenceSum += sample.statedConfidence
    buckets[bucket]!.correctSum += sample.wasCorrect
    buckets[bucket]!.count++

    if (sample.statedConfidence > sample.wasCorrect) {
      overconfident++
    }
  }

  // ECE = Σ (bucket_size / total) × |accuracy - avg_confidence|
  let ece = 0
  for (const b of buckets) {
    if (b.count === 0) continue
    const avgConf = b.confidenceSum / b.count
    const accuracy = b.correctSum / b.count
    ece += (b.count / samples.length) * Math.abs(accuracy - avgConf)
  }

  // Compute adjustment factor: mean(actual_accuracy) / mean(stated_confidence)
  const meanConfidence = samples.reduce((s, x) => s + x.statedConfidence, 0) / samples.length
  const meanAccuracy = samples.reduce((s, x) => s + x.wasCorrect, 0) / samples.length

  const adjustmentFactor = meanConfidence > 0.01
    ? Math.max(0.3, Math.min(1.5, meanAccuracy / meanConfidence))
    : 1

  return {
    calibrationError: ece,
    overconfidenceRatio: overconfident / samples.length,
    adjustmentFactor,
    sampleCount: samples.length,
  }
}

function hasProposalId(
  payload: Signal['payload'],
): payload is { proposalId: string } & Signal['payload'] {
  return typeof payload === 'object' && payload !== null && 'proposalId' in payload
}

function isVotePayload(
  payload: Signal['payload'],
): payload is { proposalId: string; stance: string } & Signal['payload'] {
  return typeof payload === 'object' && payload !== null && 'proposalId' in payload && 'stance' in payload
}
