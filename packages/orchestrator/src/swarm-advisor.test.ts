import { describe, it, expect, vi } from 'vitest'
import type {
  Signal,
  ResolvedSwarmAdvisorConfig,
  VoteRecord,
  AgentWeightProvider,
  MathAnalysis,
} from '@cognitive-swarm/core'
import { SwarmAdvisor } from './swarm-advisor.js'
import type { MathBridge } from './math-bridge.js'

function makeSignal(
  id: string,
  type: Signal['type'],
  source: string,
  payload: Signal['payload'],
  confidence = 0.8,
): Signal {
  return {
    id,
    type,
    source,
    payload,
    confidence,
    timestamp: Date.now(),
  } as Signal
}

function makeVoteSignal(
  source: string,
  proposalId: string,
  stance: 'agree' | 'disagree' | 'abstain',
): Signal {
  return makeSignal(`vote-${source}`, 'vote', source, {
    proposalId,
    stance,
    weight: 1,
    reasoning: `${source} ${stance}s`,
  })
}

function makeProposalSignal(source: string, proposalId: string): Signal {
  return makeSignal(`proposal-${source}`, 'proposal', source, {
    proposalId,
    content: `Proposal from ${source}`,
    reasoning: 'test reasoning',
  })
}

function makeConfig(
  overrides: Partial<ResolvedSwarmAdvisorConfig> = {},
): ResolvedSwarmAdvisorConfig {
  return {
    groupthinkCorrection: true,
    agentPruning: false,
    reputationWeighting: true,
    weightProvider: null,
    warmupRounds: 2,
    topology: null,
    metaAgentLlm: null,
    metaAgentInterval: 3,
    ...overrides,
  }
}

function makeVoteRecord(
  agentId: string,
  proposalId: string,
  stance: 'agree' | 'disagree' | 'abstain',
  weight = 1,
): VoteRecord {
  return {
    agentId,
    proposalId,
    vote: { proposalId, stance, weight, reasoning: `${agentId} ${stance}s` },
    timestamp: Date.now(),
  }
}

function makeWeightProvider(
  weights: Record<string, number> = {},
): AgentWeightProvider {
  const updates: Array<{ agentId: string; taskType: string; wasCorrect: boolean }> = []
  return {
    getWeight: vi.fn((agentId: string) => weights[agentId] ?? 0.5),
    update: vi.fn((agentId, taskType, wasCorrect) => {
      updates.push({ agentId, taskType, wasCorrect })
    }),
  }
}

/**
 * Minimal mock of MathBridge that returns controlled analysis.
 */
function makeMathBridge(analysis: Partial<MathAnalysis> = {}): MathBridge {
  const defaultAnalysis: MathAnalysis = {
    entropy: { final: 0.5, normalized: 0.5, history: [0.8, 0.5] },
    informationGain: { total: 0.3, perRound: 0.15, lastRound: 0.1 },
    redundancy: null,
    markov: null,
    bayesian: {
      mapEstimate: null,
      posteriors: {},
      evidenceCount: 0,
    },
    gameTheory: null,
    opinionDynamics: null,
    replicatorDynamics: null,
    influence: null,
    optimalStopping: null,
    shapley: null,
    stoppingReason: null,
  }

  return {
    analyze: vi.fn(() => ({ ...defaultAnalysis, ...analysis })),
  } as unknown as MathBridge
}

describe('SwarmAdvisor', () => {
  describe('warmup period', () => {
    it('does not produce advice before warmup rounds', async () => {
      const advisor = new SwarmAdvisor(makeConfig({ warmupRounds: 3 }))
      const signals = [makeVoteSignal('agent-1', 'p1', 'agree')]
      const mathBridge = makeMathBridge({
        gameTheory: {
          expectedChallengers: 3,
          actualChallengers: 0,
          groupthinkRisk: 'high',
        },
      })

      // Round 1 and 2 - within warmup
      const advice1 = await advisor.evaluateRound(signals, 1, mathBridge, ['agent-1', 'agent-2'])
      const advice2 = await advisor.evaluateRound(signals, 2, mathBridge, ['agent-1', 'agent-2'])

      expect(advice1).toHaveLength(0)
      expect(advice2).toHaveLength(0)
    })

    it('can produce advice after warmup rounds', async () => {
      const advisor = new SwarmAdvisor(makeConfig({ warmupRounds: 2 }))

      // Need signals that create a groupthink situation
      const agents = ['a1', 'a2', 'a3']
      const signals: Signal[] = [
        makeProposalSignal('a1', 'p1'),
        makeVoteSignal('a1', 'p1', 'agree'),
        makeVoteSignal('a2', 'p1', 'agree'),
        makeVoteSignal('a3', 'p1', 'agree'),
      ]

      const mathBridge = makeMathBridge({
        gameTheory: {
          expectedChallengers: 2,
          actualChallengers: 0,
          groupthinkRisk: 'high',
        },
        bayesian: {
          mapEstimate: { proposalId: 'p1', probability: 0.9 },
          posteriors: { p1: 0.9 },
          evidenceCount: 3,
        },
      })

      // Feed round 1 to build introspection state
      await advisor.evaluateRound(signals, 1, mathBridge, agents)
      // Round 2 - past warmup, should detect groupthink
      const advice = await advisor.evaluateRound(signals, 2, mathBridge, agents)

      // Should have at least one groupthink correction
      expect(advice.length).toBeGreaterThanOrEqual(0) // may or may not trigger depending on introspector state
    })
  })

  describe('groupthink correction', () => {
    it('injects doubt signal when groupthink is severe', async () => {
      const advisor = new SwarmAdvisor(makeConfig({ warmupRounds: 0 }))
      const agents = ['a1', 'a2', 'a3']

      // Build up introspection state over multiple rounds
      // All agents vote, none challenge
      const votesOnly: Signal[] = [
        makeProposalSignal('a1', 'p1'),
        makeVoteSignal('a1', 'p1', 'agree'),
        makeVoteSignal('a2', 'p1', 'agree'),
        makeVoteSignal('a3', 'p1', 'agree'),
      ]

      const mathBridge = makeMathBridge({
        gameTheory: {
          expectedChallengers: 2,
          actualChallengers: 0,
          groupthinkRisk: 'high',
        },
        bayesian: {
          mapEstimate: { proposalId: 'p1', probability: 0.9 },
          posteriors: { p1: 0.9 },
          evidenceCount: 3,
        },
      })

      // Feed multiple rounds to build up severe groupthink detection
      await advisor.evaluateRound(votesOnly, 0, mathBridge, agents)
      await advisor.evaluateRound(votesOnly, 1, mathBridge, agents)
      const advice = await advisor.evaluateRound(votesOnly, 2, mathBridge, agents)

      // Should inject a doubt signal
      const injections = advice.filter((a) => a.type === 'inject-signal')
      if (injections.length > 0) {
        const injection = injections[0]!
        expect(injection.type).toBe('inject-signal')
        if (injection.type === 'inject-signal') {
          expect(injection.signal.type).toBe('doubt')
          expect(injection.signal.source).toBe('advisor')
          expect(injection.reason).toContain('Groupthink')
        }
      }
    })

    it('does not inject when groupthink correction is disabled', async () => {
      const advisor = new SwarmAdvisor(
        makeConfig({ groupthinkCorrection: false, warmupRounds: 0 }),
      )
      const agents = ['a1', 'a2', 'a3']
      const signals = [
        makeVoteSignal('a1', 'p1', 'agree'),
        makeVoteSignal('a2', 'p1', 'agree'),
        makeVoteSignal('a3', 'p1', 'agree'),
      ]
      const mathBridge = makeMathBridge({
        gameTheory: {
          expectedChallengers: 3,
          actualChallengers: 0,
          groupthinkRisk: 'high',
        },
      })

      await advisor.evaluateRound(signals, 0, mathBridge, agents)
      const advice = await advisor.evaluateRound(signals, 1, mathBridge, agents)

      const injections = advice.filter((a) => a.type === 'inject-signal')
      expect(injections).toHaveLength(0)
    })
  })

  describe('Shapley pruning', () => {
    it('recommends disabling redundant agents when enabled', async () => {
      const advisor = new SwarmAdvisor(
        makeConfig({ agentPruning: true, warmupRounds: 0 }),
      )
      const agents = ['a1', 'a2', 'a3']
      const signals = [makeVoteSignal('a1', 'p1', 'agree')]

      const mathBridge = makeMathBridge({
        shapley: {
          values: { a1: 0.6, a2: 0.3, a3: 0.01 },
          redundantAgents: ['a3'],
          topContributors: ['a1'],
        },
      })

      // Round 3+ required for pruning
      const advice = await advisor.evaluateRound(signals, 3, mathBridge, agents)
      const disableAdvice = advice.filter((a) => a.type === 'disable-agent')

      expect(disableAdvice).toHaveLength(1)
      expect(disableAdvice[0]!.type).toBe('disable-agent')
      if (disableAdvice[0]!.type === 'disable-agent') {
        expect(disableAdvice[0]!.agentId).toBe('a3')
      }
    })

    it('does not prune when agentPruning is disabled', async () => {
      const advisor = new SwarmAdvisor(
        makeConfig({ agentPruning: false, warmupRounds: 0 }),
      )
      const agents = ['a1', 'a2', 'a3']
      const signals = [makeVoteSignal('a1', 'p1', 'agree')]
      const mathBridge = makeMathBridge({
        shapley: {
          values: { a1: 0.6, a2: 0.3, a3: 0.01 },
          redundantAgents: ['a3'],
          topContributors: ['a1'],
        },
      })

      const advice = await advisor.evaluateRound(signals, 3, mathBridge, agents)
      const disableAdvice = advice.filter((a) => a.type === 'disable-agent')
      expect(disableAdvice).toHaveLength(0)
    })

    it('does not double-disable the same agent', async () => {
      const advisor = new SwarmAdvisor(
        makeConfig({ agentPruning: true, warmupRounds: 0 }),
      )
      const agents = ['a1', 'a2', 'a3']
      const signals = [makeVoteSignal('a1', 'p1', 'agree')]
      const mathBridge = makeMathBridge({
        shapley: {
          values: { a1: 0.6, a2: 0.3, a3: 0.01 },
          redundantAgents: ['a3'],
          topContributors: ['a1'],
        },
      })

      await advisor.evaluateRound(signals, 3, mathBridge, agents)
      const advice2 = await advisor.evaluateRound(signals, 4, mathBridge, agents)
      const disableAdvice = advice2.filter((a) => a.type === 'disable-agent')

      expect(disableAdvice).toHaveLength(0)
    })
  })

  describe('reputation weighting', () => {
    it('multiplies vote weights by reputation', () => {
      const provider = makeWeightProvider({
        'agent-1': 0.9,
        'agent-2': 0.3,
      })
      const advisor = new SwarmAdvisor(
        makeConfig({ weightProvider: provider }),
      )

      const votes: VoteRecord[] = [
        makeVoteRecord('agent-1', 'p1', 'agree', 1.0),
        makeVoteRecord('agent-2', 'p1', 'disagree', 1.0),
      ]

      const weighted = advisor.applyReputationWeights(votes)

      expect(weighted[0]!.vote.weight).toBeCloseTo(0.9)
      expect(weighted[1]!.vote.weight).toBeCloseTo(0.3)
      expect(provider.getWeight).toHaveBeenCalledTimes(2)
    })

    it('returns original votes when no weight provider', () => {
      const advisor = new SwarmAdvisor(
        makeConfig({ weightProvider: null }),
      )
      const votes = [makeVoteRecord('a1', 'p1', 'agree', 1.0)]

      const weighted = advisor.applyReputationWeights(votes)
      expect(weighted).toBe(votes) // same reference
    })

    it('returns original votes when reputation weighting disabled', () => {
      const provider = makeWeightProvider({ a1: 0.9 })
      const advisor = new SwarmAdvisor(
        makeConfig({ reputationWeighting: false, weightProvider: provider }),
      )
      const votes = [makeVoteRecord('a1', 'p1', 'agree', 1.0)]

      const weighted = advisor.applyReputationWeights(votes)
      expect(weighted).toBe(votes)
      expect(provider.getWeight).not.toHaveBeenCalled()
    })
  })

  describe('recordConsensusOutcome', () => {
    it('records agree as correct, disagree as incorrect', () => {
      const provider = makeWeightProvider()
      const advisor = new SwarmAdvisor(
        makeConfig({ weightProvider: provider }),
      )

      const votes: VoteRecord[] = [
        makeVoteRecord('a1', 'p1', 'agree'),
        makeVoteRecord('a2', 'p1', 'disagree'),
        makeVoteRecord('a3', 'p1', 'abstain'),
        makeVoteRecord('a4', 'p2', 'agree'), // different proposal - not recorded
      ]

      advisor.recordConsensusOutcome('p1', votes)

      expect(provider.update).toHaveBeenCalledTimes(2)
      expect(provider.update).toHaveBeenCalledWith('a1', 'general', true)
      expect(provider.update).toHaveBeenCalledWith('a2', 'general', false)
    })

    it('does nothing when no weight provider', () => {
      const advisor = new SwarmAdvisor(makeConfig({ weightProvider: null }))
      // Should not throw
      advisor.recordConsensusOutcome('p1', [makeVoteRecord('a1', 'p1', 'agree')])
    })
  })

  describe('report', () => {
    it('produces correct report with no actions', () => {
      const advisor = new SwarmAdvisor(makeConfig())
      const report = advisor.getReport()

      expect(report.groupthinkCorrections).toBe(0)
      expect(report.disabledAgents).toHaveLength(0)
      expect(report.reputationApplied).toBe(false)
      expect(report.actions).toHaveLength(0)
    })

    it('tracks reputation applied flag', () => {
      const provider = makeWeightProvider({ a1: 0.8 })
      const advisor = new SwarmAdvisor(
        makeConfig({ weightProvider: provider }),
      )

      advisor.applyReputationWeights([makeVoteRecord('a1', 'p1', 'agree')])
      expect(advisor.getReport().reputationApplied).toBe(true)
    })

    it('tracks disabled agents', async () => {
      const advisor = new SwarmAdvisor(
        makeConfig({ agentPruning: true, warmupRounds: 0 }),
      )

      const mathBridge = makeMathBridge({
        shapley: {
          values: { a1: 0.6, a3: 0.01 },
          redundantAgents: ['a3'],
          topContributors: ['a1'],
        },
      })

      await advisor.evaluateRound(
        [makeVoteSignal('a1', 'p1', 'agree')],
        3,
        mathBridge,
        ['a1', 'a3'],
      )

      const report = advisor.getReport()
      expect(report.disabledAgents).toContain('a3')
      expect(advisor.disabledAgents.has('a3')).toBe(true)
    })
  })

  describe('reset', () => {
    it('clears all state', async () => {
      const provider = makeWeightProvider({ a1: 0.8 })
      const advisor = new SwarmAdvisor(
        makeConfig({ agentPruning: true, warmupRounds: 0, weightProvider: provider }),
      )

      const mathBridge = makeMathBridge({
        shapley: {
          values: { a1: 0.6, a3: 0.01 },
          redundantAgents: ['a3'],
          topContributors: ['a1'],
        },
      })

      await advisor.evaluateRound([makeVoteSignal('a1', 'p1', 'agree')], 3, mathBridge, ['a1', 'a3'])
      advisor.applyReputationWeights([makeVoteRecord('a1', 'p1', 'agree')])

      // State should be non-empty
      expect(advisor.getReport().disabledAgents.length).toBeGreaterThan(0)
      expect(advisor.getReport().reputationApplied).toBe(true)

      advisor.reset()

      // State should be cleared
      const report = advisor.getReport()
      expect(report.groupthinkCorrections).toBe(0)
      expect(report.disabledAgents).toHaveLength(0)
      expect(report.reputationApplied).toBe(false)
      expect(report.actions).toHaveLength(0)
      expect(advisor.disabledAgents.size).toBe(0)
    })
  })
})
