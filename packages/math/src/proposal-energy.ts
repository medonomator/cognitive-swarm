// Proposal Energy Tracker — stocks & flows model for proposals.
//
// Each proposal has an "energy" that changes over time:
//   energy(t) = energy(t-1) + agree_votes - disagree_votes - decay
//
// Proposal with declining energy = losing support.
// Proposal with stable energy despite challenges = robust.
// This complements Bayesian posteriors with a "momentum" view.

/** Per-proposal energy state. */
export interface ProposalEnergy {
  readonly proposalId: string
  /** Current energy level. */
  readonly energy: number
  /** Energy change from previous round. */
  readonly delta: number
  /** Momentum: smoothed derivative of energy. */
  readonly momentum: number
  /** Total inflows (agree votes). */
  readonly totalInflow: number
  /** Total outflows (disagree votes + decay). */
  readonly totalOutflow: number
  /** Whether this proposal is gaining or losing. */
  readonly trend: 'rising' | 'stable' | 'declining'
}

/** Full stocks & flows report. */
export interface ProposalEnergyReport {
  /** All tracked proposals with their energy states. */
  readonly proposals: readonly ProposalEnergy[]
  /** Proposal with highest energy. */
  readonly leader: string | null
  /** Proposal with strongest positive momentum. */
  readonly risingFastest: string | null
  /** Total energy across all proposals (system "heat"). */
  readonly totalEnergy: number
  /** Whether any proposal has clear dominance (energy > 2× second). */
  readonly clearLeader: boolean
}

/** Energy decay rate per round (prevents stale proposals from persisting). */
const DEFAULT_DECAY = 0.05

/** Momentum smoothing factor (EMA α). */
const MOMENTUM_ALPHA = 0.3

/**
 * Tracks proposal energy using stocks & flows model.
 *
 * Usage:
 * ```ts
 * const tracker = new ProposalEnergyTracker()
 *
 * // Round 1: proposal A gets support
 * tracker.recordVote('prop-A', 'agree', 0.8)
 * tracker.recordVote('prop-A', 'agree', 0.7)
 * tracker.recordVote('prop-B', 'agree', 0.5)
 * tracker.endRound()
 *
 * // Round 2: A faces challenge, B gains
 * tracker.recordVote('prop-A', 'disagree', 0.6)
 * tracker.recordVote('prop-B', 'agree', 0.9)
 * tracker.endRound()
 *
 * const report = tracker.report()
 * // prop-A: declining, prop-B: rising
 * ```
 */
export class ProposalEnergyTracker {
  private readonly energy = new Map<string, number>()
  private readonly prevEnergy = new Map<string, number>()
  private readonly momentum = new Map<string, number>()
  private readonly totalInflow = new Map<string, number>()
  private readonly totalOutflow = new Map<string, number>()
  private readonly roundInflow = new Map<string, number>()
  private readonly roundOutflow = new Map<string, number>()
  private readonly decay: number

  constructor(decay = DEFAULT_DECAY) {
    this.decay = decay
  }

  /** Record a vote for a proposal this round. Strength must be non-negative. */
  recordVote(proposalId: string, stance: 'agree' | 'disagree', strength: number): void {
    const s = Math.abs(strength)
    if (!this.energy.has(proposalId)) {
      this.energy.set(proposalId, 0)
      this.momentum.set(proposalId, 0)
      this.totalInflow.set(proposalId, 0)
      this.totalOutflow.set(proposalId, 0)
    }

    if (stance === 'agree') {
      this.roundInflow.set(proposalId, (this.roundInflow.get(proposalId) ?? 0) + s)
    } else {
      this.roundOutflow.set(proposalId, (this.roundOutflow.get(proposalId) ?? 0) + s)
    }
  }

  /** Finalize the round: apply flows, decay, and update momentum. */
  endRound(): void {
    for (const proposalId of this.energy.keys()) {
      const prev = this.energy.get(proposalId)!
      this.prevEnergy.set(proposalId, prev)

      const inflow = this.roundInflow.get(proposalId) ?? 0
      const outflow = this.roundOutflow.get(proposalId) ?? 0

      // Stock equation: E(t) = E(t-1) + inflow - outflow - decay
      const newEnergy = Math.max(0, prev + inflow - outflow - this.decay)
      this.energy.set(proposalId, newEnergy)

      // Update totals
      this.totalInflow.set(proposalId, (this.totalInflow.get(proposalId) ?? 0) + inflow)
      this.totalOutflow.set(proposalId, (this.totalOutflow.get(proposalId) ?? 0) + outflow + this.decay)

      // Momentum (EMA of delta)
      const delta = newEnergy - prev
      const prevMomentum = this.momentum.get(proposalId) ?? 0
      this.momentum.set(proposalId, MOMENTUM_ALPHA * delta + (1 - MOMENTUM_ALPHA) * prevMomentum)
    }

    // Reset round accumulators
    this.roundInflow.clear()
    this.roundOutflow.clear()
  }

  /** Generate the full energy report. */
  report(): ProposalEnergyReport {
    const proposals: ProposalEnergy[] = []

    for (const proposalId of this.energy.keys()) {
      const energy = this.energy.get(proposalId)!
      const prev = this.prevEnergy.get(proposalId) ?? energy
      const delta = energy - prev
      const mom = this.momentum.get(proposalId) ?? 0

      let trend: 'rising' | 'stable' | 'declining'
      if (mom > 0.05) trend = 'rising'
      else if (mom < -0.05) trend = 'declining'
      else trend = 'stable'

      proposals.push({
        proposalId,
        energy,
        delta,
        momentum: mom,
        totalInflow: this.totalInflow.get(proposalId) ?? 0,
        totalOutflow: this.totalOutflow.get(proposalId) ?? 0,
        trend,
      })
    }

    // Sort by energy descending
    proposals.sort((a, b) => b.energy - a.energy)

    const leader = proposals[0]?.proposalId ?? null
    const totalEnergy = proposals.reduce((s, p) => s + p.energy, 0)

    const risingCandidates = proposals.filter(p => p.trend === 'rising')
    const risingFastest = risingCandidates.length > 0
      ? risingCandidates.reduce((a, b) => a.momentum > b.momentum ? a : b).proposalId
      : null

    const clearLeader = proposals.length >= 2 &&
      proposals[0]!.energy > 2 * proposals[1]!.energy &&
      proposals[0]!.energy > 0.5

    return {
      proposals,
      leader,
      risingFastest,
      totalEnergy,
      clearLeader,
    }
  }

  get proposalCount(): number {
    return this.energy.size
  }

  reset(): void {
    this.energy.clear()
    this.prevEnergy.clear()
    this.momentum.clear()
    this.totalInflow.clear()
    this.totalOutflow.clear()
    this.roundInflow.clear()
    this.roundOutflow.clear()
  }
}
