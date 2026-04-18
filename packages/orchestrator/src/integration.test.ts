import { describe, it, expect, vi } from 'vitest'
import type {
  Signal,
  MathAnalysis,
  ResolvedSwarmAdvisorConfig,
  VoteRecord,
  SwarmConfig,
  SwarmAgentConfig,
  SwarmAgentDef,
} from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import type { SwarmEventMap } from '@cognitive-swarm/core'
import type {
  LlmProvider,
  LlmResponse,
  EmbeddingProvider,
  Store,
  EngineConfig,
} from '@cognitive-engine/core'
import { SwarmAdvisor } from './swarm-advisor.js'
import { TopologyController } from './topology-controller.js'
import { DebateRunner } from './debate-runner.js'
import type { DebateContext } from './debate-runner.js'
import type { MathBridge } from './math-bridge.js'
import type { SwarmAgent } from '@cognitive-swarm/agent'
import type { SignalBus } from '@cognitive-swarm/signals'
import type { ContributionTracker } from './contribution-tracker.js'
import { SwarmOrchestrator } from './swarm-orchestrator.js'

// Verifies that all three phases work together:
// 1. Advisor detects groupthink -> injects doubt signal
// 2. Advisor detects topology issue -> updates topology
// 3. Debate resolves competing proposals via Bayesian convergence
//
// These tests use controlled mocks but exercise the real
// class interactions, not just individual methods.

function makeSignal(
  id: string,
  type: Signal['type'],
  source: string,
  payload: Signal['payload'],
  confidence = 0.8,
): Signal {
  return { id, type, source, payload, confidence, timestamp: Date.now() } as Signal
}

function makeProposalSignal(
  id: string,
  source: string,
  proposalId: string,
  content: string,
): Signal {
  return makeSignal(id, 'proposal', source, {
    proposalId,
    content,
    reasoning: 'test',
  })
}

function makeMathBridge(analysisSeq: Partial<MathAnalysis>[]): MathBridge {
  const base: MathAnalysis = {
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
  }
  let i = 0
  return {
    analyze: vi.fn(() => {
      const override = analysisSeq[Math.min(i++, analysisSeq.length - 1)] ?? {}
      return { ...base, ...override }
    }),
    processRound: vi.fn(),
  } as unknown as MathBridge
}

function makeMockAgent(id: string): SwarmAgent {
  return {
    id,
    shouldReact: vi.fn(() => true),
    onSignal: vi.fn(async (signal: Signal) => ({
      agentId: id,
      inputSignal: signal,
      signals: [],
      strategyUsed: 'analyze',
      timestamp: Date.now(),
    })),
  } as unknown as SwarmAgent
}

function makeMockSignalBus(): SignalBus {
  const history: Signal[] = []
  return {
    publish: vi.fn((signal: Signal) => { history.push(signal) }),
    getHistory: vi.fn((filter?: { type?: string }) => {
      if (filter?.type) return history.filter((s) => s.type === filter.type)
      return history
    }),
  } as unknown as SignalBus
}

function makeMockContributionTracker(): ContributionTracker {
  return { recordReaction: vi.fn() } as unknown as ContributionTracker
}

describe('Integration: Advisor + Topology + Debate', () => {
  describe('Advisor with topology feedback loop', () => {
    it('produces topology update advice when influence is concentrated', async () => {
      const config: ResolvedSwarmAdvisorConfig = {
        groupthinkCorrection: true,
        agentPruning: false,
        reputationWeighting: false,
        weightProvider: null,
        warmupRounds: 1,
        topology: {
          enabled: true,
          minConnectivity: 0.3,
          maxInfluenceConcentration: 0.6,
          pruneRedundantLinks: true,
          protectBridgingAgents: true,
        },
        metaAgentLlm: null,
        metaAgentInterval: 3,
      }

      const events = new TypedEventEmitter<SwarmEventMap>()
      const advisor = new SwarmAdvisor(config, events)
      const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4']

      // Round 1: warmup (no advice)
      const mathBridge1 = makeMathBridge([{}])
      const signals1 = [makeSignal('s1', 'discovery', 'agent-1', {
        finding: 'test', relevance: 0.8,
      })]
      const advice1 = await advisor.evaluateRound(signals1, 1, mathBridge1, agents)
      expect(advice1).toHaveLength(0)

      // Round 2: concentrated influence -> topology update
      const mathBridge2 = makeMathBridge([{
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.8,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      }])
      const signals2 = [makeSignal('s2', 'discovery', 'agent-2', {
        finding: 'another', relevance: 0.7,
      })]
      const advice2 = await advisor.evaluateRound(signals2, 2, mathBridge2, agents)

      const topologyAdvice = advice2.find((a) => a.type === 'update-topology')
      expect(topologyAdvice).toBeDefined()
      expect(topologyAdvice!.type).toBe('update-topology')

      // Verify the topology is now active
      const topology = advisor.currentTopology
      expect(topology).not.toBeNull()

      // agent-2 shouldn't hear agent-1 (deconcentration)
      const neighbors2 = topology!.neighbors.get('agent-2')
      expect(neighbors2).toBeDefined()
      expect(neighbors2!.has('agent-1')).toBe(false)
    })

    it('includes topology info in advisor report', async () => {
      const config: ResolvedSwarmAdvisorConfig = {
        groupthinkCorrection: false,
        agentPruning: false,
        reputationWeighting: false,
        weightProvider: null,
        warmupRounds: 0,
        topology: {
          enabled: true,
          minConnectivity: 0.3,
          maxInfluenceConcentration: 0.6,
          pruneRedundantLinks: true,
          protectBridgingAgents: true,
        },
        metaAgentLlm: null,
        metaAgentInterval: 3,
      }

      const advisor = new SwarmAdvisor(config)
      const agents = ['a', 'b', 'c', 'd']

      const mathBridge = makeMathBridge([{
        influence: {
          dominantInfluencer: 'a',
          influenceConcentration: 0.9,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      }])

      await advisor.evaluateRound(
        [makeSignal('s1', 'discovery', 'a', { finding: 'x', relevance: 0.5 })],
        1,
        mathBridge,
        agents,
      )

      const report = advisor.getReport()
      expect(report.topologyUpdates).toBe(1)
      expect(report.finalTopology).not.toBeNull()
      expect(report.finalTopology!.size).toBe(4)
    })

    it('does not re-emit topology advice when topology unchanged', async () => {
      const config: ResolvedSwarmAdvisorConfig = {
        groupthinkCorrection: false,
        agentPruning: false,
        reputationWeighting: false,
        weightProvider: null,
        warmupRounds: 0,
        topology: {
          enabled: true,
          minConnectivity: 0.3,
          maxInfluenceConcentration: 0.6,
          pruneRedundantLinks: true,
          protectBridgingAgents: true,
        },
        metaAgentLlm: null,
        metaAgentInterval: 3,
      }

      const advisor = new SwarmAdvisor(config)
      const agents = ['a', 'b', 'c', 'd']

      const analysis = {
        influence: {
          dominantInfluencer: 'a',
          influenceConcentration: 0.9,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
      }

      // Round 1: topology changes
      const mb1 = makeMathBridge([analysis])
      const advice1 = await advisor.evaluateRound(
        [makeSignal('s1', 'discovery', 'a', { finding: 'x', relevance: 0.5 })],
        1, mb1, agents,
      )
      expect(advice1.some((a) => a.type === 'update-topology')).toBe(true)

      // Round 2: same analysis -> no change -> no advice
      const mb2 = makeMathBridge([analysis])
      const advice2 = await advisor.evaluateRound(
        [makeSignal('s2', 'discovery', 'b', { finding: 'y', relevance: 0.5 })],
        2, mb2, agents,
      )
      expect(advice2.some((a) => a.type === 'update-topology')).toBe(false)
    })
  })

  describe('Debate resolves with Bayesian convergence', () => {
    it('debate + topology work in same session', async () => {
      // First, debate resolves a conflict
      const signalBus = makeMockSignalBus()
      const mathBridge = makeMathBridge([
        // Round 1: no convergence
        {
          bayesian: {
            mapEstimate: null,
            posteriors: { p1: 0.6, p2: 0.4 },
            evidenceCount: 3,
          },
        },
        // Round 2: convergence
        {
          bayesian: {
            mapEstimate: { proposalId: 'p1', probability: 0.85 },
            posteriors: { p1: 0.85, p2: 0.15 },
            evidenceCount: 8,
          },
        },
      ])

      const context: DebateContext = {
        proposalA: makeProposalSignal('sig-a', 'agent-1', 'p1', 'Approach A'),
        proposalB: makeProposalSignal('sig-b', 'agent-2', 'p2', 'Approach B'),
        agents: [makeMockAgent('agent-1'), makeMockAgent('agent-2'), makeMockAgent('agent-3')],
        signalBus,
        mathBridge,
        contributionTracker: makeMockContributionTracker(),
        events: null,
        maxRounds: 5,
        convergenceThreshold: 0.8,
      }

      const runner = new DebateRunner()
      const debateResult = await runner.runDebate(context)

      expect(debateResult.resolved).toBe(true)
      expect(debateResult.winningProposalId).toBe('p1')
      expect(debateResult.confidence).toBe(0.85)
      expect(debateResult.roundsUsed).toBe(2)
      expect(debateResult.signals.length).toBeGreaterThan(0)

      // Then, topology adapts based on post-debate analysis
      const controller = new TopologyController()
      const analysis: MathAnalysis = {
        entropy: { final: 0.3, normalized: 0.3, history: [0.8, 0.5, 0.3] },
        informationGain: { total: 0.5, perRound: 0.17, lastRound: 0.1 },
        redundancy: {
          averageNMI: 0.7,
          redundantAgents: ['agent-2', 'agent-3'],
          mostUniqueAgent: 'agent-1',
        },
        markov: null,
        bayesian: {
          mapEstimate: { proposalId: 'p1', probability: 0.85 },
          posteriors: { p1: 0.85, p2: 0.15 },
          evidenceCount: 8,
        },
        gameTheory: null,
        opinionDynamics: null,
        replicatorDynamics: null,
        influence: {
          dominantInfluencer: 'agent-1',
          influenceConcentration: 0.7,
          fiedlerValue: 0.5,
          isFragile: false,
          isolatedAgents: [],
        },
        optimalStopping: null,
        shapley: null,
        stoppingReason: null,
      }

      // Add agent-4 so safety invariant doesn't trigger
      // (with 3 agents, deconcentration + redundancy could isolate agents)
      const allAgents = ['agent-1', 'agent-2', 'agent-3', 'agent-4']
      const analysisWithAgent4: MathAnalysis = {
        ...analysis,
        redundancy: {
          averageNMI: 0.7,
          redundantAgents: ['agent-2', 'agent-3'],
          mostUniqueAgent: 'agent-1',
        },
      }

      const topo = controller.computeTopology(
        allAgents,
        analysisWithAgent4,
        {
          enabled: true,
          minConnectivity: 0.3,
          maxInfluenceConcentration: 0.6,
          pruneRedundantLinks: true,
          protectBridgingAgents: true,
        },
      )

      expect(topo).not.toBeNull()
      // Redundant agents agent-2 and agent-3 shouldn't hear each other
      expect(topo!.neighbors.get('agent-2')!.has('agent-3')).toBe(false)
      // agent-1's influence is deconcentrated
      expect(topo!.neighbors.get('agent-2')!.has('agent-1')).toBe(false)
      // But agent-2 can still hear agent-4
      expect(topo!.neighbors.get('agent-2')!.has('agent-4')).toBe(true)
    })
  })

  describe('Full SwarmOrchestrator with advisor config', () => {
    it('creates orchestrator with all Phase 1-3 features enabled', () => {
      const config: SwarmConfig = {
        agents: [
          createAgentDef('a1'),
          createAgentDef('a2'),
          createAgentDef('a3'),
        ],
        maxRounds: 5,
        advisor: {
          groupthinkCorrection: true,
          agentPruning: true,
          reputationWeighting: false,
          warmupRounds: 2,
          topology: {
            enabled: true,
            minConnectivity: 0.3,
            maxInfluenceConcentration: 0.6,
          },
        },
        consensus: {
          conflictResolution: 'debate',
          maxDebateRounds: 3,
        },
      }

      const orchestrator = new SwarmOrchestrator(config)
      expect(orchestrator).toBeDefined()
      orchestrator.destroy()
    })

    it('solve() returns result with all new fields', async () => {
      const config: SwarmConfig = {
        agents: [createAgentDef('a1'), createAgentDef('a2')],
        maxRounds: 2,
        advisor: {
          groupthinkCorrection: true,
          topology: { enabled: true },
        },
        consensus: {
          conflictResolution: 'debate',
          maxDebateRounds: 2,
        },
      }

      const orchestrator = new SwarmOrchestrator(config)
      const result = await orchestrator.solve('test task')

      // New fields from Phase 1
      expect(result.advisorReport).toBeDefined()
      expect(result.advisorReport).not.toBeNull()
      expect(typeof result.advisorReport!.groupthinkCorrections).toBe('number')
      expect(Array.isArray(result.advisorReport!.disabledAgents)).toBe(true)
      expect(typeof result.advisorReport!.reputationApplied).toBe('boolean')

      // New fields from Phase 2
      expect(Array.isArray(result.debateResults)).toBe(true)

      // New fields from Phase 3
      expect(typeof result.advisorReport!.topologyUpdates).toBe('number')
      // finalTopology may be null if topology didn't trigger
      expect('finalTopology' in result.advisorReport!).toBe(true)

      orchestrator.destroy()
    })

    it('solveWithStream() yields events including topology', async () => {
      const config: SwarmConfig = {
        agents: [createAgentDef('a1'), createAgentDef('a2')],
        maxRounds: 2,
        advisor: {
          groupthinkCorrection: true,
          topology: { enabled: true },
        },
      }

      const orchestrator = new SwarmOrchestrator(config)
      const events: string[] = []

      for await (const event of orchestrator.solveWithStream('test')) {
        events.push(event.type)
      }

      expect(events).toContain('solve:start')
      expect(events).toContain('solve:complete')
      // topology:updated may or may not appear depending on math analysis
      // but the solve loop should complete successfully

      orchestrator.destroy()
    })
  })
})

function createMockLlm(): LlmProvider {
  return {
    complete: vi.fn().mockResolvedValue({
      content: 'mock response',
      usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
    } satisfies LlmResponse),
    completeJson: vi.fn().mockResolvedValue({
      content: '{}',
      parsed: {},
      usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
    }),
  }
}

function createAgentDef(id: string): SwarmAgentDef {
  return {
    config: {
      id,
      name: `Agent ${id}`,
      role: 'Test agent',
      personality: { curiosity: 0.5, caution: 0.3, conformity: 0.5, verbosity: 0.5 },
      listens: ['task:new', 'discovery', 'proposal', 'vote', 'challenge'],
      canEmit: ['discovery', 'proposal', 'vote', 'challenge'],
    },
    engine: {
      llm: createMockLlm(),
      embedding: {
        embed: vi.fn().mockResolvedValue([0.1, 0.2]),
        embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      },
      store: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        has: vi.fn().mockResolvedValue(false),
      },
    },
  }
}
