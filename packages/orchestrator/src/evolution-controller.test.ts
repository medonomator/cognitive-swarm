import { describe, it, expect, beforeEach } from 'vitest'
import { EvolutionController, type EvolutionAction } from './evolution-controller.js'
import type {
  MathAnalysis,
  AgentContribution,
  ResolvedEvolutionConfig,
} from '@cognitive-swarm/core'

// ── Helpers ────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ResolvedEvolutionConfig>): ResolvedEvolutionConfig {
  return {
    enabled: true,
    maxEvolvedAgents: 3,
    evaluationWindow: 5,
    minValueForKeep: 0.5,
    cooldownRounds: 3,
    nmiPruneThreshold: 0.8,
    ...overrides,
  }
}

function makeMathAnalysis(overrides?: Partial<MathAnalysis>): MathAnalysis {
  return {
    entropy: { final: 0.5, normalized: 0.5, history: [] },
    informationGain: { total: 0.1, perRound: 0.05, lastRound: 0.05 },
    redundancy: null,
    markov: null,
    bayesian: { mapEstimate: null, posteriors: {}, evidenceCount: 0 },
    gameTheory: null,
    opinionDynamics: null,
    replicatorDynamics: null,
    influence: null,
    optimalStopping: null,
    shapley: null,
    surprise: null,
    freeEnergy: null,
    fisher: null,
    beliefDistance: null,
    phaseTransition: null,
    klDivergence: null,
    chaos: null,
    lyapunovStability: null,
    damping: null,
    archetypes: null,
    svd: null,
    proposalEnergy: null,
    projectionConsensus: null,
    stoppingReason: null,
    ...overrides,
  }
}

function makeContributions(
  entries: [string, Partial<AgentContribution>][],
): ReadonlyMap<string, AgentContribution> {
  const map = new Map<string, AgentContribution>()
  for (const [id, partial] of entries) {
    map.set(id, {
      signalsEmitted: partial.signalsEmitted ?? 5,
      proposalsMade: partial.proposalsMade ?? 1,
      votesSubmitted: partial.votesSubmitted ?? 2,
      challengesMade: partial.challengesMade ?? 0,
      avgConfidence: partial.avgConfidence ?? 0.7,
    })
  }
  return map
}

// ── Tests ──────────────────────────────────────────────────────

describe('EvolutionController', () => {
  let controller: EvolutionController

  beforeEach(() => {
    controller = new EvolutionController(makeConfig())
  })

  describe('gap detection', () => {
    it('detects critical-challenger gap from game theory', () => {
      const math = makeMathAnalysis({
        gameTheory: {
          actualChallengers: 0,
          expectedChallengers: 2,
          groupthinkRisk: 'high',
        },
      })

      // First round: registers gap with 1 confirmation
      let actions = controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      expect(actions).toHaveLength(0) // needs 2+ confirmations

      // Second round: confirms gap → spawn
      actions = controller.evaluateRound(2, math, makeContributions([]), ['a1'])
      expect(actions).toHaveLength(1)
      expect(actions[0]!.type).toBe('spawn')
      if (actions[0]!.type === 'spawn') {
        expect(actions[0]!.domain).toBe('critical-challenger')
      }
    })

    it('does not spawn for low urgency gaps', () => {
      // influence.isolatedAgents triggers bridge-connector with urgency 0.5 < 0.6 threshold
      const math = makeMathAnalysis({
        influence: {
          dominantInfluencer: 'a1',
          influenceConcentration: 0.5,
          fiedlerValue: 0.3,
          isFragile: false,
          isolatedAgents: ['a3'],
        },
      })

      // Even with multiple rounds, urgency 0.5 is below 0.6 threshold
      controller.evaluateRound(1, math, makeContributions([]), ['a1', 'a2', 'a3'])
      controller.evaluateRound(2, math, makeContributions([]), ['a1', 'a2', 'a3'])
      const actions = controller.evaluateRound(3, math, makeContributions([]), ['a1', 'a2', 'a3'])
      expect(actions).toHaveLength(0)
    })

    it('detects stagnation from low info gain + high entropy', () => {
      const math = makeMathAnalysis({
        entropy: { final: 0.8, normalized: 0.8, history: [] },
        informationGain: { total: 0.01, perRound: 0.005, lastRound: 0.005 },
      })

      controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      const actions = controller.evaluateRound(2, math, makeContributions([]), ['a1'])
      expect(actions).toHaveLength(1)
      expect(actions[0]!.type).toBe('spawn')
      if (actions[0]!.type === 'spawn') {
        expect(actions[0]!.domain).toBe('lateral-thinker')
      }
    })
  })

  describe('spawning guardrails', () => {
    it('respects maxEvolvedAgents cap', () => {
      const controller = new EvolutionController(makeConfig({ maxEvolvedAgents: 1 }))
      const math = makeMathAnalysis({
        gameTheory: { actualChallengers: 0, expectedChallengers: 2, groupthinkRisk: 'high' },
        entropy: { final: 0.8, normalized: 0.8, history: [] },
        informationGain: { total: 0.01, perRound: 0.005, lastRound: 0.005 },
      })

      // Both gaps detected and confirmed
      controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      const actions = controller.evaluateRound(2, math, makeContributions([]), ['a1'])

      // Only 1 should spawn (cap = 1)
      const spawns = actions.filter(a => a.type === 'spawn')
      expect(spawns).toHaveLength(1)
    })

    it('applies domain cooldown after dissolution', () => {
      const math = makeMathAnalysis({
        gameTheory: { actualChallengers: 0, expectedChallengers: 2, groupthinkRisk: 'high' },
      })

      // Spawn the agent
      controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      const spawnActions = controller.evaluateRound(2, math, makeContributions([]), ['a1'])
      expect(spawnActions).toHaveLength(1)

      // Force dissolution by running past evaluation window with zero contributions
      const config = makeConfig({ evaluationWindow: 1, minValueForKeep: 0.5 })
      const controller2 = new EvolutionController(config)

      controller2.evaluateRound(1, math, makeContributions([]), ['a1'])
      const spawn2 = controller2.evaluateRound(2, math, makeContributions([]), ['a1'])
      expect(spawn2.filter(a => a.type === 'spawn')).toHaveLength(1)

      // The evolved agent should now get evaluated — find its ID from the report
      const report = controller2.getReport()
      const evolvedId = report.spawned[0]!.agentId

      // Next round with zero contributions → should dissolve
      const dissolveActions = controller2.evaluateRound(3, math, makeContributions([
        [evolvedId, { signalsEmitted: 0, proposalsMade: 0 }],
      ]), ['a1', evolvedId])

      const dissolves = dissolveActions.filter(a => a.type === 'dissolve')
      expect(dissolves.length).toBeGreaterThanOrEqual(1)

      // Now the domain is in cooldown — shouldn't spawn again
      const postDissolve = controller2.evaluateRound(4, math, makeContributions([]), ['a1'])
      const reSpawns = postDissolve.filter(a => a.type === 'spawn')
      expect(reSpawns).toHaveLength(0)
    })

    it('prevents duplicate domain spawns', () => {
      const math = makeMathAnalysis({
        gameTheory: { actualChallengers: 0, expectedChallengers: 2, groupthinkRisk: 'high' },
      })

      // First spawn
      controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      const first = controller.evaluateRound(2, math, makeContributions([]), ['a1'])
      expect(first.filter(a => a.type === 'spawn')).toHaveLength(1)

      // Same gap signal continues — should NOT spawn again
      controller.evaluateRound(3, math, makeContributions([]), ['a1'])
      const second = controller.evaluateRound(4, math, makeContributions([]), ['a1'])
      expect(second.filter(a => a.type === 'spawn')).toHaveLength(0)
    })
  })

  describe('NMI pruning', () => {
    it('prunes redundant evolved agents', () => {
      const math = makeMathAnalysis({
        gameTheory: { actualChallengers: 0, expectedChallengers: 2, groupthinkRisk: 'high' },
      })

      // Spawn an agent
      controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      const spawn = controller.evaluateRound(2, math, makeContributions([]), ['a1'])
      expect(spawn).toHaveLength(1)

      const evolvedId = controller.getReport().spawned[0]!.agentId

      // Now add redundancy info pointing to evolved agent
      const mathWithRedundancy = makeMathAnalysis({
        redundancy: {
          averageNMI: 0.9, // above 0.8 threshold
          redundantAgents: [evolvedId],
          mostUniqueAgent: 'a1',
        },
      })

      const pruneActions = controller.evaluateRound(3, mathWithRedundancy, makeContributions([
        [evolvedId, { signalsEmitted: 5, proposalsMade: 2 }],
      ]), ['a1', evolvedId])

      const dissolves = pruneActions.filter(a => a.type === 'dissolve')
      expect(dissolves).toHaveLength(1)
      if (dissolves[0]!.type === 'dissolve') {
        expect(dissolves[0]!.agentId).toBe(evolvedId)
        expect(dissolves[0]!.reason).toContain('Redundant')
      }
    })

    it('does not prune base agents', () => {
      const math = makeMathAnalysis({
        redundancy: {
          averageNMI: 0.95,
          redundantAgents: ['base-agent-1'], // not an evolved agent
          mostUniqueAgent: 'a1',
        },
      })

      const actions = controller.evaluateRound(1, math, makeContributions([]), ['base-agent-1', 'a1'])
      const dissolves = actions.filter(a => a.type === 'dissolve')
      expect(dissolves).toHaveLength(0)
    })
  })

  describe('report', () => {
    it('tracks spawn and dissolve history', () => {
      const report = controller.getReport()
      expect(report.spawned).toHaveLength(0)
      expect(report.dissolved).toHaveLength(0)
      expect(report.activeEvolvedCount).toBe(0)
    })

    it('increments activeEvolvedCount on spawn', () => {
      const math = makeMathAnalysis({
        gameTheory: { actualChallengers: 0, expectedChallengers: 2, groupthinkRisk: 'high' },
      })

      controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      controller.evaluateRound(2, math, makeContributions([]), ['a1'])

      const report = controller.getReport()
      expect(report.spawned).toHaveLength(1)
      expect(report.activeEvolvedCount).toBe(1)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      const math = makeMathAnalysis({
        gameTheory: { actualChallengers: 0, expectedChallengers: 2, groupthinkRisk: 'high' },
      })
      controller.evaluateRound(1, math, makeContributions([]), ['a1'])
      controller.evaluateRound(2, math, makeContributions([]), ['a1'])

      controller.reset()
      const report = controller.getReport()
      expect(report.spawned).toHaveLength(0)
      expect(report.dissolved).toHaveLength(0)
      expect(report.activeEvolvedCount).toBe(0)
    })
  })
})
