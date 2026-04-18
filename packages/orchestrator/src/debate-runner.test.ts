import { describe, it, expect, vi } from 'vitest'
import type {
  Signal,
  MathAnalysis,
} from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import type { SwarmEventMap } from '@cognitive-swarm/core'
import type { SwarmAgent } from '@cognitive-swarm/agent'
import type { SignalBus } from '@cognitive-swarm/signals'
import { DebateRunner } from './debate-runner.js'
import type { DebateContext } from './debate-runner.js'
import type { MathBridge } from './math-bridge.js'
import type { ContributionTracker } from './contribution-tracker.js'

function makeProposalSignal(
  id: string,
  source: string,
  proposalId: string,
  content: string,
): Signal {
  return {
    id,
    type: 'proposal',
    source,
    payload: { proposalId, content, reasoning: 'test' },
    confidence: 0.8,
    timestamp: Date.now(),
  } as Signal
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
    getHistory: vi.fn((_filter?: { type?: string }) => {
      if (_filter?.type) {
        return history.filter((s) => s.type === _filter.type)
      }
      return history
    }),
  } as unknown as SignalBus
}

function makeMockContributionTracker(): ContributionTracker {
  return {
    recordReaction: vi.fn(),
  } as unknown as ContributionTracker
}

/**
 * Creates a MathBridge mock where analyze() returns different results on each call.
 * This lets us simulate Bayesian posterior updates across debate rounds.
 */
function makeMathBridge(analysisSequence: Partial<MathAnalysis>[]): MathBridge {
  const defaultAnalysis: MathAnalysis = {
    entropy: { final: 0.5, normalized: 0.5, history: [0.5] },
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

  let callIndex = 0
  return {
    analyze: vi.fn(() => {
      const override = analysisSequence[Math.min(callIndex++, analysisSequence.length - 1)] ?? {}
      return { ...defaultAnalysis, ...override }
    }),
    processRound: vi.fn(),
  } as unknown as MathBridge
}

function makeDebateContext(
  overrides: Partial<DebateContext> = {},
): DebateContext {
  return {
    proposalA: makeProposalSignal('sig-a', 'agent-1', 'p1', 'Use approach A'),
    proposalB: makeProposalSignal('sig-b', 'agent-2', 'p2', 'Use approach B'),
    agents: [makeMockAgent('agent-1'), makeMockAgent('agent-2')],
    signalBus: makeMockSignalBus(),
    mathBridge: makeMathBridge([{}]),
    contributionTracker: makeMockContributionTracker(),
    events: null,
    maxRounds: 3,
    convergenceThreshold: 0.8,
    ...overrides,
  }
}

describe('DebateRunner', () => {
  describe('challenge signal creation', () => {
    it('creates challenge signals targeting both proposals each round', async () => {
      const signalBus = makeMockSignalBus()
      const context = makeDebateContext({
        signalBus,
        maxRounds: 1,
      })

      const runner = new DebateRunner()
      await runner.runDebate(context)

      // Should have published 2 challenge signals (one per proposal)
      const publishCalls = (signalBus.publish as ReturnType<typeof vi.fn>).mock.calls
      const challengeSignals = publishCalls
        .map((call) => call[0] as Signal)
        .filter((s) => s.type === 'challenge')

      expect(challengeSignals).toHaveLength(2)
      expect(challengeSignals[0]!.source).toBe('debate-moderator')
      expect(challengeSignals[1]!.source).toBe('debate-moderator')

      // One targets proposal A, one targets proposal B
      const targets = challengeSignals.map((s) => {
        const payload = s.payload as { targetSignalId: string }
        return payload.targetSignalId
      })
      expect(targets).toContain('sig-a')
      expect(targets).toContain('sig-b')
    })

    it('includes proposal content in challenge text', async () => {
      const signalBus = makeMockSignalBus()
      const context = makeDebateContext({ signalBus, maxRounds: 1 })

      const runner = new DebateRunner()
      await runner.runDebate(context)

      const publishCalls = (signalBus.publish as ReturnType<typeof vi.fn>).mock.calls
      const challengeSignals = publishCalls
        .map((call) => call[0] as Signal)
        .filter((s) => s.type === 'challenge')

      const payloadA = challengeSignals.find((s) => {
        const p = s.payload as { targetSignalId: string }
        return p.targetSignalId === 'sig-a'
      })
      expect((payloadA!.payload as { counterArgument: string }).counterArgument).toContain('Use approach A')
    })
  })

  describe('convergence', () => {
    it('stops early when one proposal exceeds convergence threshold', async () => {
      // Round 1: no convergence; Round 2: p1 at 0.85 posterior
      const mathBridge = makeMathBridge([
        {
          bayesian: {
            mapEstimate: null,
            posteriors: { p1: 0.6, p2: 0.4 },
            evidenceCount: 2,
          },
        },
        {
          bayesian: {
            mapEstimate: { proposalId: 'p1', probability: 0.85 },
            posteriors: { p1: 0.85, p2: 0.15 },
            evidenceCount: 5,
          },
        },
      ])

      const context = makeDebateContext({
        mathBridge,
        maxRounds: 5,
        convergenceThreshold: 0.8,
      })

      const runner = new DebateRunner()
      const result = await runner.runDebate(context)

      expect(result.resolved).toBe(true)
      expect(result.winningProposalId).toBe('p1')
      expect(result.confidence).toBe(0.85)
      expect(result.roundsUsed).toBe(2) // stopped at round 2, not 5
    })

    it('uses MAP estimate for convergence check', async () => {
      const mathBridge = makeMathBridge([
        {
          bayesian: {
            mapEstimate: { proposalId: 'p2', probability: 0.9 },
            posteriors: { p1: 0.1, p2: 0.9 },
            evidenceCount: 10,
          },
        },
      ])

      const context = makeDebateContext({
        mathBridge,
        maxRounds: 3,
        convergenceThreshold: 0.8,
      })

      const runner = new DebateRunner()
      const result = await runner.runDebate(context)

      expect(result.resolved).toBe(true)
      expect(result.winningProposalId).toBe('p2')
      expect(result.roundsUsed).toBe(1)
    })
  })

  describe('max rounds', () => {
    it('respects maxRounds limit', async () => {
      // Never converge
      const mathBridge = makeMathBridge([
        {
          bayesian: {
            mapEstimate: null,
            posteriors: { p1: 0.5, p2: 0.5 },
            evidenceCount: 1,
          },
        },
      ])

      const context = makeDebateContext({
        mathBridge,
        maxRounds: 2,
      })

      const runner = new DebateRunner()
      const result = await runner.runDebate(context)

      expect(result.resolved).toBe(false)
      expect(result.winningProposalId).toBeNull()
      expect(result.roundsUsed).toBe(2)
      expect(result.confidence).toBe(0)
    })
  })

  describe('unresolved debate', () => {
    it('returns unresolved when posteriors stay below threshold', async () => {
      const mathBridge = makeMathBridge([
        {
          bayesian: {
            mapEstimate: { proposalId: 'p1', probability: 0.55 },
            posteriors: { p1: 0.55, p2: 0.45 },
            evidenceCount: 3,
          },
        },
        {
          bayesian: {
            mapEstimate: { proposalId: 'p1', probability: 0.6 },
            posteriors: { p1: 0.6, p2: 0.4 },
            evidenceCount: 6,
          },
        },
        {
          bayesian: {
            mapEstimate: { proposalId: 'p1', probability: 0.65 },
            posteriors: { p1: 0.65, p2: 0.35 },
            evidenceCount: 9,
          },
        },
      ])

      const context = makeDebateContext({
        mathBridge,
        maxRounds: 3,
        convergenceThreshold: 0.8,
      })

      const runner = new DebateRunner()
      const result = await runner.runDebate(context)

      expect(result.resolved).toBe(false)
      expect(result.winningProposalId).toBeNull()
      expect(result.roundsUsed).toBe(3)
    })
  })

  describe('math bridge integration', () => {
    it('calls processRound for each debate round', async () => {
      const mathBridge = makeMathBridge([{}])
      const context = makeDebateContext({
        mathBridge,
        maxRounds: 3,
      })

      const runner = new DebateRunner()
      await runner.runDebate(context)

      expect(mathBridge.processRound).toHaveBeenCalledTimes(3)
    })
  })

  describe('signal collection', () => {
    it('returns all debate signals in result', async () => {
      const mathBridge = makeMathBridge([{}])
      const context = makeDebateContext({
        mathBridge,
        maxRounds: 2,
      })

      const runner = new DebateRunner()
      const result = await runner.runDebate(context)

      // Each round produces 2 challenge signals (from moderator)
      // Agents respond with empty signals in our mock
      expect(result.signals.length).toBe(4) // 2 rounds * 2 challenges
      expect(result.signals.every((s) => s.type === 'challenge')).toBe(true)
    })
  })

  describe('events', () => {
    it('emits debate:start, debate:round, and debate:end events', async () => {
      const events = new TypedEventEmitter<SwarmEventMap>()
      const startSpy = vi.fn()
      const roundSpy = vi.fn()
      const endSpy = vi.fn()

      events.on('debate:start', startSpy)
      events.on('debate:round', roundSpy)
      events.on('debate:end', endSpy)

      const mathBridge = makeMathBridge([
        {
          bayesian: {
            mapEstimate: { proposalId: 'p1', probability: 0.9 },
            posteriors: { p1: 0.9, p2: 0.1 },
            evidenceCount: 5,
          },
        },
      ])

      const context = makeDebateContext({
        mathBridge,
        events,
        maxRounds: 3,
      })

      const runner = new DebateRunner()
      await runner.runDebate(context)

      expect(startSpy).toHaveBeenCalledTimes(1)
      expect(startSpy).toHaveBeenCalledWith({
        proposalA: 'p1',
        proposalB: 'p2',
      })

      expect(roundSpy).toHaveBeenCalledTimes(1) // converged in round 1
      expect(roundSpy).toHaveBeenCalledWith(
        expect.objectContaining({ round: 1 }),
      )

      expect(endSpy).toHaveBeenCalledTimes(1)
      expect(endSpy).toHaveBeenCalledWith(
        expect.objectContaining({ resolved: true, winningProposalId: 'p1' }),
      )
    })
  })

  describe('disabled agents', () => {
    it('passes disabled agents to round runner', async () => {
      const disabledAgents = new Set(['agent-2'])
      const agent1 = makeMockAgent('agent-1')
      const agent2 = makeMockAgent('agent-2')

      const context = makeDebateContext({
        agents: [agent1, agent2],
        disabledAgents,
        maxRounds: 1,
      })

      const runner = new DebateRunner()
      await runner.runDebate(context)

      // agent-2 is disabled, so only agent-1 should react
      // (RoundRunner filters by disabledAgents + shouldReact)
      // We can't directly verify RoundRunner's internal filtering from here,
      // but we verify the context is passed through correctly
      expect(agent1.shouldReact).toHaveBeenCalled()
    })
  })
})
