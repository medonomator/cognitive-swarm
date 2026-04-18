// Hegselmann-Krause bounded confidence model.
// Predicts consensus, polarization, or fragmentation.
// conformity -> epsilon: high conformity = wide bounds = listens to more agents.

/** Agent opinion state. */
export interface OpinionState {
  readonly agentId: string
  /** Opinion value ∈ [0, 1]. */
  readonly opinion: number
  /** Confidence bound (ε). Higher = listens to more agents. */
  readonly epsilon: number
}

/** A cluster of converged opinions. */
export interface OpinionCluster {
  /** Mean opinion of the cluster. */
  readonly center: number
  /** Agent IDs in this cluster. */
  readonly members: readonly string[]
}

/** Full polarization analysis. */
export interface PolarizationReport {
  /** Number of predicted opinion clusters. */
  readonly clusterCount: number
  /** Predicted opinion clusters after convergence. */
  readonly clusters: readonly OpinionCluster[]
  /** Polarization index ∈ [0, 1]. 0 = consensus, 1 = max polarization. */
  readonly polarizationIndex: number
  /** Estimated rounds to reach equilibrium. */
  readonly convergenceEstimate: number
  /** Risk of opinion fragmentation. */
  readonly fragmentationRisk: 'low' | 'medium' | 'high'
  /** Agents positioned between clusters who could bridge gaps. */
  readonly bridgingAgents: readonly string[]
}

/** Default confidence bound when not specified per-agent. */
const DEFAULT_EPSILON = 0.3

/** Convergence threshold. */
const CONVERGENCE_DELTA = 0.001

/** Max simulation steps to prevent infinite loops. */
const MAX_STEPS = 200

/** Cluster merge distance. */
const CLUSTER_EPSILON = 0.05

/**
 * Hegselmann-Krause bounded confidence model.
 *
 * Usage:
 * ```ts
 * const hk = new OpinionDynamics()
 *
 * // Agent opinions from proposal confidences
 * hk.setOpinion('agent-1', 0.8, 0.4)  // opinion=0.8, ε=0.4 (conformist)
 * hk.setOpinion('agent-2', 0.2, 0.2)  // opinion=0.2, ε=0.2 (independent)
 * hk.setOpinion('agent-3', 0.5, 0.3)  // opinion=0.5, ε=0.3 (moderate)
 *
 * const report = hk.predict()
 * // report.clusterCount === 2 (agents 1+3 converge, agent 2 stays)
 * // report.fragmentationRisk === 'medium'
 * // report.bridgingAgents === ['agent-3'] (between the clusters)
 * ```
 */
export class OpinionDynamics {
  private readonly defaultEpsilon: number
  private opinions = new Map<string, number>()
  private epsilons = new Map<string, number>()
  private history: Map<string, number[]> = new Map()
  private stepCount = 0

  constructor(defaultEpsilon = DEFAULT_EPSILON) {
    this.defaultEpsilon = defaultEpsilon
  }

  /** Set an agent's opinion with optional per-agent confidence bound. */
  setOpinion(agentId: string, opinion: number, epsilon?: number): void {
    this.opinions.set(agentId, clamp01(opinion))
    this.epsilons.set(agentId, epsilon ?? this.defaultEpsilon)

    if (!this.history.has(agentId)) {
      this.history.set(agentId, [])
    }
    this.history.get(agentId)!.push(clamp01(opinion))
  }

  /**
   * Set opinions from conformity values.
   * Maps PersonalityVector.conformity to epsilon:
   *   ε = 0.1 + 0.5 × conformity
   *   conformity=0 -> eps=0.1 (stubborn)
   *   conformity=1 -> eps=0.6 (very open)
   */
  setFromConformity(
    agentId: string,
    opinion: number,
    conformity: number,
  ): void {
    const epsilon = 0.1 + 0.5 * clamp01(conformity)
    this.setOpinion(agentId, opinion, epsilon)
  }

  /**
   * Simulate one HK step - each agent averages opinions
   * of all agents within its confidence bound.
   *
   * Returns the new opinion map.
   */
  step(): ReadonlyMap<string, number> {
    const agents = [...this.opinions.keys()]
    const newOpinions = new Map<string, number>()

    for (const agent of agents) {
      const myOpinion = this.opinions.get(agent)!
      const myEpsilon = this.epsilons.get(agent)!

      // Find neighbors within epsilon
      let sum = 0
      let count = 0
      for (const other of agents) {
        const otherOpinion = this.opinions.get(other)!
        if (Math.abs(otherOpinion - myOpinion) <= myEpsilon) {
          sum += otherOpinion
          count++
        }
      }

      newOpinions.set(agent, count > 0 ? sum / count : myOpinion)
    }

    // Update state
    for (const [agent, opinion] of newOpinions) {
      this.opinions.set(agent, opinion)
      this.history.get(agent)?.push(opinion)
    }
    this.stepCount++

    return newOpinions
  }

  /**
   * Run simulation to equilibrium and predict outcome.
   *
   * Simulates HK dynamics until opinions converge (max change < delta)
   * or maxSteps reached. Returns full polarization report.
   */
  predict(maxSteps = MAX_STEPS): PolarizationReport {
    // Snapshot current state for restoration
    const initialOpinions = new Map(this.opinions)
    const initialHistory = new Map<string, number[]>()
    for (const [k, v] of this.history) {
      initialHistory.set(k, [...v])
    }
    const initialSteps = this.stepCount

    // Run simulation
    let stepsToConverge = 0
    for (let i = 0; i < maxSteps; i++) {
      const before = new Map(this.opinions)
      this.step()
      stepsToConverge++

      // Check convergence
      let maxDelta = 0
      for (const [agent, opinion] of this.opinions) {
        const prev = before.get(agent) ?? opinion
        maxDelta = Math.max(maxDelta, Math.abs(opinion - prev))
      }

      if (maxDelta < CONVERGENCE_DELTA) break
    }

    // Analyze final state
    const clusters = this.detectClusters()
    const polarization = this.computePolarization()
    const bridging = this.findBridgingAgents(clusters)

    const clusterCount = clusters.length
    let fragmentationRisk: 'low' | 'medium' | 'high' = 'low'
    if (clusterCount >= 3) {
      fragmentationRisk = 'high'
    } else if (clusterCount === 2) {
      fragmentationRisk = polarization > 0.5 ? 'high' : 'medium'
    }

    const report: PolarizationReport = {
      clusterCount,
      clusters,
      polarizationIndex: polarization,
      convergenceEstimate: stepsToConverge,
      fragmentationRisk,
      bridgingAgents: bridging,
    }

    // Restore state (predict is non-destructive)
    this.opinions = initialOpinions
    this.history = initialHistory
    this.stepCount = initialSteps

    return report
  }

  /** Current polarization index (variance-based). */
  polarizationIndex(): number {
    return this.computePolarization()
  }

  /** Agents positioned between opinion clusters. */
  findBridgingAgentsCurrent(): readonly string[] {
    const clusters = this.detectClusters()
    return this.findBridgingAgents(clusters)
  }

  /** Opinion history for all agents. */
  getHistory(): ReadonlyMap<string, readonly number[]> {
    const result = new Map<string, readonly number[]>()
    for (const [k, v] of this.history) {
      result.set(k, [...v])
    }
    return result
  }

  /** Current opinions. */
  getOpinions(): ReadonlyMap<string, number> {
    return new Map(this.opinions)
  }

  /** Number of agents tracked. */
  get agentCount(): number {
    return this.opinions.size
  }

  /** Reset all state. */
  reset(): void {
    this.opinions.clear()
    this.epsilons.clear()
    this.history.clear()
    this.stepCount = 0
  }

  /** Detect opinion clusters using simple distance-based merging. */
  private detectClusters(): OpinionCluster[] {
    const agents = [...this.opinions.entries()]
      .sort((a, b) => a[1] - b[1])

    if (agents.length === 0) return []

    const clusters: { members: string[]; sum: number }[] = []

    for (const [agentId, opinion] of agents) {
      // Try to merge with last cluster
      const last = clusters[clusters.length - 1]
      if (last !== undefined) {
        const lastCenter = last.sum / last.members.length
        if (Math.abs(opinion - lastCenter) <= CLUSTER_EPSILON) {
          last.members.push(agentId)
          last.sum += opinion
          continue
        }
      }

      // New cluster
      clusters.push({ members: [agentId], sum: opinion })
    }

    return clusters.map((c) => ({
      center: c.sum / c.members.length,
      members: c.members,
    }))
  }

  /**
   * Polarization index: normalized variance of opinions.
   * 0 = all opinions identical, 1 = maximally spread.
   * Uses population variance, scaled by max possible variance (0.25 for [0,1]).
   */
  private computePolarization(): number {
    if (this.opinions.size < 2) return 0

    const values = [...this.opinions.values()]
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length

    // Max variance for [0,1] is 0.25 (half at 0, half at 1)
    return Math.min(1, variance / 0.25)
  }

  /**
   * Find agents positioned between clusters.
   * A bridging agent is within epsilon of agents in multiple clusters.
   */
  private findBridgingAgents(clusters: OpinionCluster[]): string[] {
    if (clusters.length < 2) return []

    const bridges: string[] = []

    for (const [agentId, opinion] of this.opinions) {
      const epsilon = this.epsilons.get(agentId) ?? this.defaultEpsilon
      let reachableClusters = 0

      for (const cluster of clusters) {
        const canReach = cluster.members.some((memberId) => {
          const memberOpinion = this.opinions.get(memberId) ?? 0
          return Math.abs(opinion - memberOpinion) <= epsilon
        })
        if (canReach) reachableClusters++
      }

      if (reachableClusters >= 2) {
        bridges.push(agentId)
      }
    }

    return bridges
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}
