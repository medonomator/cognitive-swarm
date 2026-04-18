import { klDivergence, jsDivergence } from './entropy.js'

// KL-Divergence Tracker — measures belief divergence between agents and consensus.
//
// Complements Wasserstein (optimal transport) with cheaper, directed metrics:
//   D_KL(agent || consensus) — how much agent deviates from consensus (asymmetric)
//   JSD(agent_a, agent_b)    — symmetric divergence between agent pairs
//   D_KL(round_n || round_{n-1}) — consensus drift between rounds

/** Per-agent divergence from consensus. */
export interface AgentDivergence {
  readonly agentId: string
  /** KL divergence from agent's beliefs to consensus (bits). Higher = more deviant. */
  readonly klFromConsensus: number
  /** Whether this agent exceeds the outlier threshold. */
  readonly isOutlier: boolean
}

/** Pairwise Jensen-Shannon divergence between two agents. */
export interface AgentPairJSD {
  readonly agentA: string
  readonly agentB: string
  /** JSD in bits ∈ [0, 1]. */
  readonly jsd: number
}

/** Full KL divergence analysis report. */
export interface KLDivergenceReport {
  /** Per-agent KL divergence from consensus. */
  readonly agentDivergences: readonly AgentDivergence[]
  /** Mean KL divergence across all agents. */
  readonly meanDivergence: number
  /** Agents exceeding outlier threshold. */
  readonly outliers: readonly string[]
  /** Pairwise JSD between all agent pairs. */
  readonly pairwiseJSD: readonly AgentPairJSD[]
  /** Mean pairwise JSD. */
  readonly meanPairwiseJSD: number
  /** KL divergence of current consensus from previous round's consensus. */
  readonly consensusDrift: number
  /** Drift trend: positive = beliefs diverging, negative = converging. */
  readonly driftTrend: number
  /** Per-round drift history. */
  readonly driftHistory: readonly number[]
}

/**
 * Tracks KL-Divergence and Jensen-Shannon divergence across agents.
 *
 * Usage:
 * ```ts
 * const tracker = new KLDivergenceTracker()
 *
 * // Each round: set agent beliefs and consensus
 * tracker.setBeliefs('agent-1', new Map([['A', 0.7], ['B', 0.3]]))
 * tracker.setBeliefs('agent-2', new Map([['A', 0.3], ['B', 0.7]]))
 * tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
 * tracker.endRound()
 *
 * const report = tracker.report()
 * // report.outliers — agents deviating strongly from consensus
 * // report.consensusDrift — how much consensus shifted this round
 * ```
 */
export class KLDivergenceTracker {
  private readonly agentBeliefs = new Map<string, Map<string, number>>()
  private currentConsensus: Map<string, number> | null = null
  private previousConsensus: Map<string, number> | null = null
  private readonly driftHistory: number[] = []
  private readonly outlierThreshold: number

  constructor(outlierThreshold = 0.5) {
    this.outlierThreshold = outlierThreshold
  }

  /** Set an agent's current belief distribution. */
  setBeliefs(agentId: string, beliefs: ReadonlyMap<string, number>): void {
    this.agentBeliefs.set(agentId, new Map(beliefs))
  }

  /** Set the current consensus distribution. */
  setConsensus(consensus: ReadonlyMap<string, number>): void {
    this.currentConsensus = new Map(consensus)
  }

  /** Finalize the round — compute drift and save state for next round. */
  endRound(): void {
    if (this.currentConsensus !== null && this.previousConsensus !== null) {
      const drift = klDivergence(this.currentConsensus, this.previousConsensus)
      this.driftHistory.push(isFinite(drift) ? drift : 0)
    }

    if (this.currentConsensus !== null) {
      this.previousConsensus = new Map(this.currentConsensus)
    }
  }

  /** Generate the full KL divergence report. */
  report(): KLDivergenceReport {
    const agentDivergences: AgentDivergence[] = []
    const outliers: string[] = []

    if (this.currentConsensus !== null && this.currentConsensus.size > 0) {
      for (const [agentId, beliefs] of this.agentBeliefs) {
        const kl = klDivergence(beliefs, this.currentConsensus)
        const klSafe = isFinite(kl) ? kl : 0
        const isOutlier = klSafe > this.outlierThreshold
        agentDivergences.push({ agentId, klFromConsensus: klSafe, isOutlier })
        if (isOutlier) outliers.push(agentId)
      }
    }

    const meanDivergence = agentDivergences.length > 0
      ? agentDivergences.reduce((sum, d) => sum + d.klFromConsensus, 0) / agentDivergences.length
      : 0

    // Pairwise JSD
    const agents = [...this.agentBeliefs.keys()]
    const pairwiseJSD: AgentPairJSD[] = []
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = this.agentBeliefs.get(agents[i]!)!
        const b = this.agentBeliefs.get(agents[j]!)!
        const jsd = jsDivergence(a, b)
        pairwiseJSD.push({ agentA: agents[i]!, agentB: agents[j]!, jsd })
      }
    }

    const meanPairwiseJSD = pairwiseJSD.length > 0
      ? pairwiseJSD.reduce((sum, p) => sum + p.jsd, 0) / pairwiseJSD.length
      : 0

    // Drift
    const consensusDrift = this.driftHistory.length > 0
      ? this.driftHistory[this.driftHistory.length - 1]!
      : 0

    // Drift trend: slope over last 3 readings
    let driftTrend = 0
    if (this.driftHistory.length >= 2) {
      const window = this.driftHistory.slice(-3)
      let sumSlope = 0
      for (let i = 1; i < window.length; i++) {
        sumSlope += window[i]! - window[i - 1]!
      }
      driftTrend = sumSlope / (window.length - 1)
    }

    return {
      agentDivergences,
      meanDivergence,
      outliers,
      pairwiseJSD,
      meanPairwiseJSD,
      consensusDrift,
      driftTrend,
      driftHistory: [...this.driftHistory],
    }
  }

  get agentCount(): number {
    return this.agentBeliefs.size
  }

  get roundCount(): number {
    return this.driftHistory.length
  }

  reset(): void {
    this.agentBeliefs.clear()
    this.currentConsensus = null
    this.previousConsensus = null
    this.driftHistory.length = 0
  }
}
