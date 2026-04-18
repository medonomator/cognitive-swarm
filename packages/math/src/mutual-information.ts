import { shannonEntropy } from './entropy.js'

// Mutual information - redundancy detection between agents.
// I(X;Y) = H(X) + H(Y) - H(X,Y)
// High MI = redundant, low MI = unique perspectives.

/** Signal emission record for MI computation. */
export interface EmissionRecord {
  readonly agentId: string
  readonly signalType: string
  /** Topic or content hash - groups signals by what they're about. */
  readonly topic: string
}

/** Pairwise MI result between two agents. */
export interface PairwiseMI {
  readonly agentA: string
  readonly agentB: string
  /** Mutual information in bits. */
  readonly mi: number
  /** Normalized MI ∈ [0, 1] using NMI = 2·MI / (H(A) + H(B)). */
  readonly normalized: number
}

/** Redundancy analysis result. */
export interface RedundancyReport {
  /** Agents that are highly redundant with at least one other. */
  readonly redundant: readonly string[]
  /** Agent with lowest average MI (most unique perspective). */
  readonly mostUnique: string | undefined
  /** All pairwise MI values. */
  readonly pairwise: readonly PairwiseMI[]
  /** Average MI across all pairs. */
  readonly averageMI: number
}

/**
 * Computes mutual information between agents based on
 * their signal emission patterns.
 *
 * Usage:
 * ```ts
 * const detector = new RedundancyDetector()
 * detector.record({ agentId: 'a1', signalType: 'discovery', topic: 'security' })
 * detector.record({ agentId: 'a2', signalType: 'discovery', topic: 'security' })
 * detector.record({ agentId: 'a3', signalType: 'discovery', topic: 'performance' })
 *
 * const mi = detector.mutualInformation('a1', 'a2') // high - same topics
 * const mi2 = detector.mutualInformation('a1', 'a3') // low - different topics
 *
 * const report = detector.analyze(0.7) // find redundant agents
 * ```
 */
export class RedundancyDetector {
  private readonly emissions: EmissionRecord[] = []

  record(emission: EmissionRecord): void {
    this.emissions.push(emission)
  }

  recordBatch(emissions: readonly EmissionRecord[]): void {
    for (const e of emissions) {
      this.emissions.push(e)
    }
  }

  /**
   * Compute mutual information between two agents.
   *
   * I(A;B) = H(A) + H(B) - H(A,B)
   *
   * Where the random variables are the topic distributions
   * of each agent's emissions.
   */
  mutualInformation(agentA: string, agentB: string): number {
    const topicsA = this.getTopicDistribution(agentA)
    const topicsB = this.getTopicDistribution(agentB)

    if (topicsA.size === 0 || topicsB.size === 0) return 0

    const hA = shannonEntropy(topicsA)
    const hB = shannonEntropy(topicsB)
    const hAB = this.pooledEntropy(agentA, agentB)

    // I(A;B) = H(A) + H(B) - H(A,B)
    // Can be slightly negative due to floating point - clamp to 0
    return Math.max(0, hA + hB - hAB)
  }

  /**
   * Normalized mutual information ∈ [0, 1].
   * NMI = 2 × I(A;B) / (H(A) + H(B))
   *
   * NMI = 0: completely independent
   * NMI = 1: identical topic distributions
   */
  normalizedMI(agentA: string, agentB: string): number {
    const topicsA = this.getTopicDistribution(agentA)
    const topicsB = this.getTopicDistribution(agentB)

    if (topicsA.size === 0 || topicsB.size === 0) return 0

    const hA = shannonEntropy(topicsA)
    const hB = shannonEntropy(topicsB)
    const denom = hA + hB

    // When both agents have zero entropy (single topic each),
    // check if they discuss the same topic -> fully redundant.
    if (denom === 0) {
      return this.sameTopicSet(topicsA, topicsB) ? 1 : 0
    }

    const mi = this.mutualInformation(agentA, agentB)
    return Math.min(1, (2 * mi) / denom)
  }

  /**
   * Full redundancy analysis across all agents.
   *
   * @param threshold - NMI above which agents are considered redundant (default: 0.7)
   */
  analyze(threshold = 0.7): RedundancyReport {
    const agents = this.getAgentIds()
    const pairwise: PairwiseMI[] = []

    // Compute all pairwise MI values
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agentA = agents[i]!
        const agentB = agents[j]!
        const mi = this.mutualInformation(agentA, agentB)
        const normalized = this.normalizedMI(agentA, agentB)
        pairwise.push({ agentA, agentB, mi, normalized })
      }
    }

    // Find redundant agents (NMI > threshold with any other)
    const redundantSet = new Set<string>()
    for (const pair of pairwise) {
      if (pair.normalized > threshold) {
        redundantSet.add(pair.agentA)
        redundantSet.add(pair.agentB)
      }
    }

    // Find most unique agent (lowest average NMI)
    let mostUnique: string | undefined
    let lowestAvgNMI = Infinity

    for (const agent of agents) {
      const agentPairs = pairwise.filter(
        (p) => p.agentA === agent || p.agentB === agent,
      )
      if (agentPairs.length === 0) {
        mostUnique = agent
        lowestAvgNMI = 0
        continue
      }

      const avgNMI =
        agentPairs.reduce((sum, p) => sum + p.normalized, 0) /
        agentPairs.length

      if (avgNMI < lowestAvgNMI) {
        lowestAvgNMI = avgNMI
        mostUnique = agent
      }
    }

    // Average MI across all pairs
    const averageMI =
      pairwise.length > 0
        ? pairwise.reduce((sum, p) => sum + p.mi, 0) / pairwise.length
        : 0

    return {
      redundant: [...redundantSet],
      mostUnique,
      pairwise,
      averageMI,
    }
  }

  /**
   * Suggest optimal swarm size by finding the point where
   * adding more agents yields diminishing unique information.
   *
   * Sorts agents by uniqueness (lowest avg NMI first) and
   * returns the count where marginal NMI exceeds threshold.
   */
  optimalSize(maxMarginalNMI = 0.5): number {
    const agents = this.getAgentIds()
    if (agents.length <= 1) return agents.length

    // Rank agents by uniqueness (lowest average NMI first)
    const avgNMIs = agents.map((agent) => {
      const pairs = agents
        .filter((other) => other !== agent)
        .map((other) => this.normalizedMI(agent, other))

      const avg =
        pairs.length > 0
          ? pairs.reduce((s, v) => s + v, 0) / pairs.length
          : 0

      return { agent, avgNMI: avg }
    })

    avgNMIs.sort((a, b) => a.avgNMI - b.avgNMI)

    // Add agents one by one; stop when marginal agent is too redundant
    let optimalCount = 1
    for (let i = 1; i < avgNMIs.length; i++) {
      if (avgNMIs[i]!.avgNMI > maxMarginalNMI) break
      optimalCount++
    }

    return optimalCount
  }

  getAgentIds(): readonly string[] {
    const ids = new Set<string>()
    for (const e of this.emissions) ids.add(e.agentId)
    return [...ids]
  }

  reset(): void {
    this.emissions.length = 0
  }

  get emissionCount(): number {
    return this.emissions.length
  }

  /** Check if two distributions cover the same topics. */
  private sameTopicSet(
    a: Map<string, number>,
    b: Map<string, number>,
  ): boolean {
    if (a.size !== b.size) return false
    for (const key of a.keys()) {
      if (!b.has(key)) return false
    }
    return true
  }

  private getTopicDistribution(agentId: string): Map<string, number> {
    const counts = new Map<string, number>()
    for (const e of this.emissions) {
      if (e.agentId !== agentId) continue
      counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1)
    }
    return counts
  }

  /**
   * Compute pooled entropy H(A|B) - entropy of the merged topic distribution.
   *
   * Used in MI formula: I(A;B) = H(A) + H(B) - H(A∪B)
   * When agents discuss identical topics, H(A|B) ~ H(A) -> MI ~ H(A) (high).
   * When agents discuss disjoint topics, H(A|B) > H(A)+H(B) -> MI ~ 0.
   */
  private pooledEntropy(agentA: string, agentB: string): number {
    const counts = new Map<string, number>()

    for (const e of this.emissions) {
      if (e.agentId !== agentA && e.agentId !== agentB) continue
      counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1)
    }

    return shannonEntropy(counts)
  }
}
