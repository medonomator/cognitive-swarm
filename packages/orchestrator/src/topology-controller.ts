import type {
  MathAnalysis,
  ResolvedTopologyConfig,
} from '@cognitive-swarm/core'

/** Agent communication topology - who can hear whom. */
export interface Topology {
  readonly neighbors: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * Computes and maintains adaptive communication topology.
 *
 * Separated from SwarmAdvisor (SRP): advisor decides *when* to update,
 * controller decides *how* to compute neighbor sets from metrics.
 */
export class TopologyController {
  private current: Topology | null = null

  /** Current topology (null = all-to-all). */
  get topology(): Topology | null {
    return this.current
  }

  /**
   * Compute new topology from math analysis.
   *
   * Returns null if all-to-all is appropriate (no restrictions needed,
   * or safety guards prevent restriction).
   */
  computeTopology(
    allAgentIds: readonly string[],
    analysis: MathAnalysis,
    config: ResolvedTopologyConfig,
  ): Topology | null {
    if (!config.enabled) {
      this.current = null
      return null
    }

    if (allAgentIds.length < 3) {
      this.current = null
      return null
    }

    if (analysis.influence && analysis.influence.fiedlerValue < config.minConnectivity) {
      this.current = null
      return null
    }

    const neighbors = new Map<string, Set<string>>()
    for (const agentId of allAgentIds) {
      neighbors.set(agentId, new Set(allAgentIds.filter((id) => id !== agentId)))
    }

    const bridgingAgents = new Set(analysis.opinionDynamics?.bridgingAgents ?? [])

    let modified = false

    if (analysis.influence && analysis.influence.influenceConcentration > config.maxInfluenceConcentration) {
      const dominant = analysis.influence.dominantInfluencer
      if (dominant) {
        modified = this.deconcentrateInfluence(neighbors, dominant, bridgingAgents) || modified
      }
    }

    if (analysis.opinionDynamics && analysis.opinionDynamics.clusterCount >= 2) {
      modified = this.isolateClusters(neighbors, allAgentIds, analysis, bridgingAgents) || modified
    }

    if (config.pruneRedundantLinks && analysis.redundancy) {
      const redundantAgents = analysis.redundancy.redundantAgents
      modified = this.pruneRedundantLinks(neighbors, redundantAgents, bridgingAgents) || modified
    }

    if (config.protectBridgingAgents && bridgingAgents.size > 0) {
      for (const bridgeId of bridgingAgents) {
        const agentNeighbors = neighbors.get(bridgeId)
        if (!agentNeighbors) continue
        for (const otherId of allAgentIds) {
          if (otherId !== bridgeId) {
            agentNeighbors.add(otherId)
            neighbors.get(otherId)?.add(bridgeId)
          }
        }
      }
    }

    if (!modified) {
      this.current = null
      return null
    }

    // Safety: every agent must have at least 1 neighbor
    for (const agentId of allAgentIds) {
      const agentNeighbors = neighbors.get(agentId)
      if (!agentNeighbors || agentNeighbors.size === 0) {
        this.current = null
        return null
      }
    }

    const frozen = new Map<string, ReadonlySet<string>>()
    for (const [id, set] of neighbors) {
      frozen.set(id, new Set(set))
    }

    this.current = { neighbors: frozen }
    return this.current
  }

  /** Check if a specific agent should receive a signal from a specific source. */
  canReceive(receiverId: string, sourceId: string): boolean {
    if (!this.current) return true
    const neighbors = this.current.neighbors.get(receiverId)
    if (!neighbors) return true
    return neighbors.has(sourceId)
  }

  /** Reset to all-to-all. */
  reset(): void {
    this.current = null
  }

  /**
   * Remove edges FROM the dominant influencer TO non-bridging agents.
   * Non-bridging agents stop hearing the dominant influencer, breaking hub-and-spoke.
   */
  private deconcentrateInfluence(
    neighbors: Map<string, Set<string>>,
    dominantId: string,
    bridgingAgents: ReadonlySet<string>,
  ): boolean {
    let changed = false

    for (const [agentId, agentNeighbors] of neighbors) {
      if (agentId === dominantId) continue
      if (bridgingAgents.has(agentId)) continue

      if (agentNeighbors.has(dominantId)) {
        agentNeighbors.delete(dominantId)
        changed = true
      }
    }

    return changed
  }

  /**
   * Isolate opinion clusters.
   *
   * Agents in the same cluster keep full connectivity.
   * Cross-cluster edges are removed except via bridging agents.
   *
   * Uses a simple heuristic: assign agents to clusters based on their
   * position relative to bridging agents. Agents that are bridging
   * agents belong to all clusters.
   */
  private isolateClusters(
    neighbors: Map<string, Set<string>>,
    allAgentIds: readonly string[],
    analysis: MathAnalysis,
    bridgingAgents: ReadonlySet<string>,
  ): boolean {
    if (!analysis.influence) return false

    const isolated = analysis.influence.isolatedAgents
    const dominant = analysis.influence.dominantInfluencer

    if (isolated.length === 0) return false

    const isolatedSet = new Set(isolated)
    let changed = false

    for (const agentId of allAgentIds) {
      if (bridgingAgents.has(agentId)) continue

      const agentNeighbors = neighbors.get(agentId)
      if (!agentNeighbors) continue

      const agentIsIsolated = isolatedSet.has(agentId)

      for (const neighborId of [...agentNeighbors]) {
        if (bridgingAgents.has(neighborId)) continue
        if (neighborId === dominant) continue

        const neighborIsIsolated = isolatedSet.has(neighborId)

        if (agentIsIsolated !== neighborIsIsolated) {
          agentNeighbors.delete(neighborId)
          changed = true
        }
      }
    }

    return changed
  }

  /**
   * Remove mutual edges between redundant agents.
   * Forces them to develop independent perspectives from other sources.
   */
  private pruneRedundantLinks(
    neighbors: Map<string, Set<string>>,
    redundantAgents: readonly string[],
    bridgingAgents: ReadonlySet<string>,
  ): boolean {
    if (redundantAgents.length < 2) return false

    let changed = false

    for (let i = 0; i < redundantAgents.length; i++) {
      const agentA = redundantAgents[i]!
      if (bridgingAgents.has(agentA)) continue

      for (let j = i + 1; j < redundantAgents.length; j++) {
        const agentB = redundantAgents[j]!
        if (bridgingAgents.has(agentB)) continue

        const neighborsA = neighbors.get(agentA)
        const neighborsB = neighbors.get(agentB)

        if (neighborsA?.has(agentB)) {
          neighborsA.delete(agentB)
          changed = true
        }
        if (neighborsB?.has(agentA)) {
          neighborsB.delete(agentA)
          changed = true
        }
      }
    }

    return changed
  }
}
