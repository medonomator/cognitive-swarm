import { describe, it, expect } from 'vitest'
import type { MathAnalysis, ResolvedTopologyConfig } from '@cognitive-swarm/core'
import { TopologyController } from './topology-controller.js'

const AGENTS = ['agent-1', 'agent-2', 'agent-3', 'agent-4']

function makeConfig(
  overrides: Partial<ResolvedTopologyConfig> = {},
): ResolvedTopologyConfig {
  return {
    enabled: true,
    minConnectivity: 0.3,
    maxInfluenceConcentration: 0.6,
    pruneRedundantLinks: true,
    protectBridgingAgents: true,
    ...overrides,
  }
}

function makeAnalysis(overrides: Partial<MathAnalysis> = {}): MathAnalysis {
  return {
    entropy: { final: 0.5, normalized: 0.5, history: [0.5] },
    informationGain: { total: 0.3, perRound: 0.15, lastRound: 0.1 },
    redundancy: null,
    markov: null,
    bayesian: { mapEstimate: null, posteriors: {}, evidenceCount: 0 },
    gameTheory: null,
    opinionDynamics: null,
    replicatorDynamics: null,
    influence: null,
    optimalStopping: null,
    shapley: null,
    stoppingReason: null,
    ...overrides,
  }
}

/** Get neighbor count for an agent in a topology. */
function neighborCount(
  topology: ReadonlyMap<string, ReadonlySet<string>> | null | undefined,
  agentId: string,
): number {
  if (!topology) return -1
  return topology.get(agentId)?.size ?? -1
}

describe('TopologyController', () => {
  describe('defaults', () => {
    it('returns null (all-to-all) when no analysis data triggers rules', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.3, // below threshold
          fiedlerValue: 0.5,           // above safety
          isFragile: false,
          isolatedAgents: [],
        },
      })

      const topology = controller.computeTopology(AGENTS, analysis, config)
      expect(topology).toBeNull()
    })

    it('returns null when disabled', () => {
      const controller = new TopologyController()
      const config = makeConfig({ enabled: false })
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.9,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      })

      const topology = controller.computeTopology(AGENTS, analysis, config)
      expect(topology).toBeNull()
    })

    it('returns null for fewer than 3 agents', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis()

      const topology = controller.computeTopology(['a', 'b'], analysis, config)
      expect(topology).toBeNull()
    })
  })

  describe('safety guard (Fiedler value)', () => {
    it('returns null when fiedlerValue is below minConnectivity', () => {
      const controller = new TopologyController()
      const config = makeConfig({ minConnectivity: 0.3 })
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.9,
          fiedlerValue: 0.1, // below threshold - fragile
          isFragile: true,
          isolatedAgents: [],
        },
      })

      const topology = controller.computeTopology(AGENTS, analysis, config)
      expect(topology).toBeNull()
    })
  })

  describe('influence deconcentration', () => {
    it('removes edges FROM dominant influencer to non-bridging agents', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.8, // above threshold
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      })

      const topology = controller.computeTopology(AGENTS, analysis, config)
      expect(topology).not.toBeNull()

      // agent-2, agent-3, agent-4 should NOT have agent-1 as neighbor
      const neighbors2 = topology!.neighbors.get('agent-2')!
      expect(neighbors2.has('agent-1')).toBe(false)

      const neighbors3 = topology!.neighbors.get('agent-3')!
      expect(neighbors3.has('agent-1')).toBe(false)

      // agent-1 still has all others as neighbors (can still hear them)
      const neighbors1 = topology!.neighbors.get('agent-1')!
      expect(neighbors1.has('agent-2')).toBe(true)
      expect(neighbors1.has('agent-3')).toBe(true)
    })
  })

  describe('cluster isolation', () => {
    it('removes cross-cluster edges except via bridging agents', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: undefined,
          influenceConcentration: 0.3,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: ['agent-3', 'agent-4'], // these form the "isolated" cluster
        },
        opinionDynamics: {
          clusterCount: 2,
          polarizationIndex: 0.7,
          fragmentationRisk: 'medium',
          bridgingAgents: [], // no bridges
        },
      })

      const topology = controller.computeTopology(AGENTS, analysis, config)
      expect(topology).not.toBeNull()

      // agent-1 (non-isolated) should NOT hear agent-3 (isolated)
      expect(topology!.neighbors.get('agent-1')!.has('agent-3')).toBe(false)
      expect(topology!.neighbors.get('agent-1')!.has('agent-4')).toBe(false)

      // agent-3 (isolated) should NOT hear agent-1 (non-isolated)
      expect(topology!.neighbors.get('agent-3')!.has('agent-1')).toBe(false)

      // Same cluster still connected
      expect(topology!.neighbors.get('agent-1')!.has('agent-2')).toBe(true)
      expect(topology!.neighbors.get('agent-3')!.has('agent-4')).toBe(true)
    })
  })

  describe('redundancy pruning', () => {
    it('removes mutual edges between redundant agents', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: undefined,
          influenceConcentration: 0.3,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
        redundancy: {
          averageNMI: 0.8,
          redundantAgents: ['agent-2', 'agent-3'],
          mostUniqueAgent: 'agent-1',
        },
      })

      const topology = controller.computeTopology(AGENTS, analysis, config)
      expect(topology).not.toBeNull()

      // agent-2 and agent-3 should not hear each other
      expect(topology!.neighbors.get('agent-2')!.has('agent-3')).toBe(false)
      expect(topology!.neighbors.get('agent-3')!.has('agent-2')).toBe(false)

      // But they still hear others
      expect(topology!.neighbors.get('agent-2')!.has('agent-1')).toBe(true)
      expect(topology!.neighbors.get('agent-3')!.has('agent-1')).toBe(true)
    })
  })

  describe('bridge protection', () => {
    it('restores full connectivity for bridging agents', () => {
      const controller = new TopologyController()
      const config = makeConfig({ protectBridgingAgents: true })
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.8,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: ['agent-3', 'agent-4'],
        },
        opinionDynamics: {
          clusterCount: 2,
          polarizationIndex: 0.7,
          fragmentationRisk: 'medium',
          bridgingAgents: ['agent-2'], // agent-2 bridges clusters
        },
      })

      const topology = controller.computeTopology(AGENTS, analysis, config)
      expect(topology).not.toBeNull()

      // Bridging agent-2 should have full connectivity
      const bridge = topology!.neighbors.get('agent-2')!
      expect(bridge.has('agent-1')).toBe(true)
      expect(bridge.has('agent-3')).toBe(true)
      expect(bridge.has('agent-4')).toBe(true)

      // Others should be able to hear bridging agent
      expect(topology!.neighbors.get('agent-1')!.has('agent-2')).toBe(true)
      expect(topology!.neighbors.get('agent-3')!.has('agent-2')).toBe(true)
    })
  })

  describe('safety invariant', () => {
    it('returns null if any agent would have 0 neighbors', () => {
      // This is a pathological case - influence deconcentration + redundancy pruning
      // could theoretically leave an agent with 0 neighbors
      const controller = new TopologyController()
      const config = makeConfig({ protectBridgingAgents: false })
      const agents = ['agent-1', 'agent-2', 'agent-3']

      // agent-1 is dominant, gets pruned from agent-2 and agent-3's neighbors
      // agent-2 and agent-3 are redundant, get pruned from each other
      // -> agent-2 would have 0 neighbors (can't hear agent-1, can't hear agent-3)
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.8,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
        redundancy: {
          averageNMI: 0.9,
          redundantAgents: ['agent-2', 'agent-3'],
          mostUniqueAgent: 'agent-1',
        },
      })

      const topology = controller.computeTopology(agents, analysis, config)
      // Safety invariant kicks in - returns null
      expect(topology).toBeNull()
    })
  })

  describe('canReceive', () => {
    it('returns true when no topology is set', () => {
      const controller = new TopologyController()
      expect(controller.canReceive('agent-1', 'agent-2')).toBe(true)
    })

    it('returns true for neighbors', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.8,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      })

      controller.computeTopology(AGENTS, analysis, config)

      // agent-1 can still hear agent-2
      expect(controller.canReceive('agent-1', 'agent-2')).toBe(true)
    })

    it('returns false for non-neighbors', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.8,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      })

      controller.computeTopology(AGENTS, analysis, config)

      // agent-2 can't hear agent-1 (deconcentrated)
      expect(controller.canReceive('agent-2', 'agent-1')).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears topology back to all-to-all', () => {
      const controller = new TopologyController()
      const config = makeConfig()
      const analysis = makeAnalysis({
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.8,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      })

      controller.computeTopology(AGENTS, analysis, config)
      expect(controller.topology).not.toBeNull()

      controller.reset()
      expect(controller.topology).toBeNull()
      expect(controller.canReceive('agent-2', 'agent-1')).toBe(true)
    })
  })
})
