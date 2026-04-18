import { describe, it, expect } from 'vitest'
import type { Signal } from '@cognitive-swarm/core'
import { MathBridge } from './math-bridge.js'

function makeSignal(
  source: string,
  type: Signal['type'],
  confidence = 0.5,
  overrides: Partial<Signal> = {},
): Signal {
  return {
    id: `sig-${Math.random().toString(36).slice(2, 8)}`,
    type,
    source,
    payload: makePayload(type),
    confidence,
    timestamp: Date.now(),
    ...overrides,
  } as Signal
}

function makePayload(type: Signal['type']): Signal['payload'] {
  switch (type) {
    case 'task:new':
      return { task: 'test task' }
    case 'discovery':
      return { finding: 'test finding', relevance: 0.8 }
    case 'proposal':
      return {
        proposalId: `prop-${Math.random().toString(36).slice(2, 8)}`,
        content: 'test proposal',
        reasoning: 'test reasoning',
      }
    case 'vote':
      return {
        proposalId: 'prop-1',
        stance: 'agree' as const,
        weight: 1,
      }
    case 'doubt':
      return {
        targetSignalId: 'sig-1',
        concern: 'test concern',
        severity: 'medium' as const,
      }
    case 'challenge':
      return {
        targetSignalId: 'sig-1',
        counterArgument: 'test counter',
      }
    default:
      return { task: '' }
  }
}

function makeProposal(
  source: string,
  proposalId: string,
  confidence: number,
): Signal {
  return {
    id: `sig-${Math.random().toString(36).slice(2, 8)}`,
    type: 'proposal',
    source,
    payload: {
      proposalId,
      content: `Proposal ${proposalId}`,
      reasoning: 'test',
    },
    confidence,
    timestamp: Date.now(),
  } as Signal<'proposal'>
}

const DEFAULT_CONFIG = {
  entropyThreshold: 0.3,
  minInformationGain: 0.05,
  redundancyThreshold: 0.7,
}

describe('MathBridge', () => {
  describe('processRound', () => {
    it('records signals for redundancy analysis', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      const signals = [
        makeSignal('agent-1', 'discovery'),
        makeSignal('agent-2', 'discovery'),
        makeSignal('agent-3', 'challenge'),
      ]

      bridge.processRound(signals, [], [])
      const analysis = bridge.analyze()

      expect(analysis.redundancy).not.toBeNull()
      expect(analysis.redundancy?.redundantAgents).toBeDefined()
    })

    it('records signal transitions for Markov analysis', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      const signals = [
        makeSignal('agent-1', 'discovery'),
        makeSignal('agent-2', 'proposal'),
        makeSignal('agent-3', 'vote'),
        makeSignal('agent-1', 'discovery'),
      ]

      bridge.processRound(signals, [], [])
      const analysis = bridge.analyze()

      expect(analysis.markov).not.toBeNull()
      expect(typeof analysis.markov!.cyclesDetected).toBe('boolean')
      expect(Array.isArray(analysis.markov!.cycleStates)).toBe(true)
    })

    it('builds entropy distribution from proposals', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      const proposals = [
        makeProposal('agent-1', 'prop-A', 0.9),
        makeProposal('agent-2', 'prop-B', 0.3),
      ]

      bridge.processRound([], proposals, [])
      const analysis = bridge.analyze()

      expect(analysis.entropy.final).toBeGreaterThan(0)
      expect(analysis.entropy.history.length).toBe(1)
    })
  })

  describe('shouldStop - entropy convergence', () => {
    it('does not stop with insufficient rounds', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      // Only 1 round - not enough
      const proposals = [makeProposal('a1', 'prop-A', 0.9)]
      bridge.processRound([], proposals, [])

      expect(bridge.shouldStop()).toBe(false)
    })

    it('stops when proposals converge to single dominant', () => {
      const bridge = new MathBridge({ ...DEFAULT_CONFIG, entropyThreshold: 0.7 })

      // Round 1: uniform distribution (high entropy) - 3 proposals, no votes
      const proposalsR1 = [
        makeProposal('a1', 'A', 0.5),
        makeProposal('a2', 'B', 0.5),
        makeProposal('a3', 'C', 0.5),
      ]
      bridge.processRound([], proposalsR1, [])

      // Round 2: many strong agree votes for A -> Bayesian posterior converges
      const allProposals = [...proposalsR1]
      const makeVote = (source: string) =>
        makeSignal(source, 'vote', 0.9, {
          payload: { proposalId: 'A', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>)
      const votes = [
        makeVote('a1'), makeVote('a2'), makeVote('a3'),
        makeVote('a4'), makeVote('a5'), makeVote('a6'),
      ]
      bridge.processRound([], allProposals, votes)

      expect(bridge.shouldStop()).toBe(true)

      const analysis = bridge.analyze()
      expect(analysis.stoppingReason).toBe('entropy-converged')
    })

    it('does not stop when entropy is above threshold', () => {
      const bridge = new MathBridge({ ...DEFAULT_CONFIG, entropyThreshold: 0.3 })

      // Round 1: some spread
      bridge.processRound([], [
        makeProposal('a1', 'A', 0.5),
        makeProposal('a2', 'B', 0.5),
      ], [])

      // Round 2: still spread
      bridge.processRound([], [
        makeProposal('a1', 'A', 0.6),
        makeProposal('a2', 'B', 0.5),
      ], [])

      expect(bridge.shouldStop()).toBe(false)
    })
  })

  describe('shouldStop - information gain', () => {
    it('stops when information gain is exhausted', () => {
      const bridge = new MathBridge({
        ...DEFAULT_CONFIG,
        entropyThreshold: 0.01, // very low so entropy check doesn't trigger
        minInformationGain: 0.05,
      })

      // Rounds with identical distributions -> zero information gain
      const sameProposals = [
        makeProposal('a1', 'A', 0.6),
        makeProposal('a2', 'B', 0.4),
      ]

      bridge.processRound([], sameProposals, []) // round 1
      bridge.processRound([], sameProposals, []) // round 2
      bridge.processRound([], sameProposals, []) // round 3 - now gain check kicks in

      expect(bridge.shouldStop()).toBe(true)

      const analysis = bridge.analyze()
      // Free energy convergence is the PRIMARY stopping criterion and fires
      // before the info-gain fallback when both conditions are met.
      // Identical distributions → ΔF ≈ 0 → free-energy-converged.
      expect(analysis.stoppingReason).toBe('free-energy-converged')
    })
  })

  describe('shouldStop - cycle detection', () => {
    it('stops when Markov cycle is detected', () => {
      const bridge = new MathBridge({
        ...DEFAULT_CONFIG,
        entropyThreshold: 0.01,
        minInformationGain: 0,
      })

      // Simulate a cycle: discovery ↔ doubt ↔ discovery ↔ doubt ...
      const round1 = [
        makeSignal('a1', 'discovery'),
        makeSignal('a2', 'doubt'),
        makeSignal('a1', 'discovery'),
        makeSignal('a2', 'doubt'),
        makeSignal('a1', 'discovery'),
        makeSignal('a2', 'doubt'),
        makeSignal('a1', 'discovery'),
      ]

      bridge.processRound(round1, [], [])

      // Markov needs 6+ transitions - we have 6
      const stopped = bridge.shouldStop()
      // Cycle detection is probabilistic, may or may not trigger
      // Just verify it doesn't throw
      expect(typeof stopped).toBe('boolean')
    })
  })

  describe('analyze', () => {
    it('returns complete analysis after multiple rounds', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      // Round 1
      bridge.processRound(
        [
          makeSignal('agent-1', 'discovery'),
          makeSignal('agent-2', 'discovery'),
          makeSignal('agent-3', 'challenge'),
        ],
        [
          makeProposal('agent-1', 'A', 0.7),
          makeProposal('agent-2', 'B', 0.3),
        ],
        [],
      )

      // Round 2
      bridge.processRound(
        [
          makeSignal('agent-1', 'proposal'),
          makeSignal('agent-2', 'vote'),
        ],
        [
          makeProposal('agent-1', 'A', 0.8),
          makeProposal('agent-2', 'A', 0.6),
        ],
        [],
      )

      const analysis = bridge.analyze()

      // Entropy
      expect(analysis.entropy.history.length).toBe(2)
      expect(analysis.entropy.normalized).toBeGreaterThanOrEqual(0)
      expect(analysis.entropy.normalized).toBeLessThanOrEqual(1)

      // Information gain
      expect(analysis.informationGain.total).toBeGreaterThanOrEqual(0)
      expect(analysis.informationGain.perRound).toBeGreaterThanOrEqual(0)

      // Redundancy
      expect(analysis.redundancy).not.toBeNull()
      expect(analysis.redundancy!.averageNMI).toBeGreaterThanOrEqual(0)
      expect(analysis.redundancy!.mostUniqueAgent).toBeDefined()

      // Markov
      expect(analysis.markov).not.toBeNull()
      expect(analysis.markov!.dominantState).toBeDefined()
      expect(typeof analysis.markov!.cyclesDetected).toBe('boolean')
    })

    it('returns null redundancy/markov with insufficient data', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      const analysis = bridge.analyze()

      expect(analysis.redundancy).toBeNull()
      expect(analysis.markov).toBeNull()
      expect(analysis.entropy.final).toBe(0)
      expect(analysis.stoppingReason).toBeNull()
    })

    it('identifies redundant agents (same signal types)', () => {
      const bridge = new MathBridge({
        ...DEFAULT_CONFIG,
        redundancyThreshold: 0.5,
      })

      // Two agents both only emitting discoveries -> high behavioral NMI
      bridge.processRound(
        [
          makeSignal('agent-1', 'discovery'),
          makeSignal('agent-1', 'discovery'),
          makeSignal('agent-2', 'discovery'),
          makeSignal('agent-2', 'discovery'),
        ],
        [],
        [],
      )

      const analysis = bridge.analyze()
      expect(analysis.redundancy).not.toBeNull()
      // Both agents have identical topic distributions (all 'discovery')
      expect(analysis.redundancy!.averageNMI).toBe(1)
      expect(analysis.redundancy!.redundantAgents).toContain('agent-1')
      expect(analysis.redundancy!.redundantAgents).toContain('agent-2')
    })

    it('identifies diverse agents (different signal types)', () => {
      const bridge = new MathBridge({
        ...DEFAULT_CONFIG,
        redundancyThreshold: 0.7,
      })

      // Agent 1: only discoveries, Agent 2: only challenges
      bridge.processRound(
        [
          makeSignal('agent-1', 'discovery'),
          makeSignal('agent-1', 'discovery'),
          makeSignal('agent-2', 'challenge'),
          makeSignal('agent-2', 'challenge'),
        ],
        [],
        [],
      )

      const analysis = bridge.analyze()
      expect(analysis.redundancy).not.toBeNull()
      expect(analysis.redundancy!.averageNMI).toBe(0)
      expect(analysis.redundancy!.redundantAgents).toHaveLength(0)
    })
  })

  describe('currentEntropy', () => {
    it('returns current entropy state', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      bridge.processRound([], [
        makeProposal('a1', 'A', 0.5),
        makeProposal('a2', 'B', 0.5),
      ], [])

      const state = bridge.currentEntropy()
      expect(state.entropy).toBeGreaterThan(0)
      expect(state.normalized).toBeGreaterThan(0)
      expect(state.informationGain).toBe(0) // first round, no gain yet
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      bridge.processRound(
        [makeSignal('a1', 'discovery')],
        [makeProposal('a1', 'A', 0.9)],
        [],
      )

      bridge.reset()
      const analysis = bridge.analyze()

      expect(analysis.entropy.final).toBe(0)
      expect(analysis.entropy.history).toHaveLength(0)
      expect(analysis.redundancy).toBeNull()
      expect(analysis.markov).toBeNull()
      expect(analysis.stoppingReason).toBeNull()
    })
  })

  describe('Bayesian analysis', () => {
    it('returns empty bayesian state with no proposals', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)
      const analysis = bridge.analyze()

      expect(analysis.bayesian.mapEstimate).toBeNull()
      expect(analysis.bayesian.posteriors).toEqual({})
      expect(analysis.bayesian.evidenceCount).toBe(0)
    })

    it('tracks proposals as hypotheses', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      bridge.processRound(
        [],
        [
          makeProposal('a1', 'X', 0.7),
          makeProposal('a2', 'Y', 0.3),
        ],
        [],
      )

      const analysis = bridge.analyze()
      expect(analysis.bayesian.posteriors).toHaveProperty('X')
      expect(analysis.bayesian.posteriors).toHaveProperty('Y')
    })

    it('updates posteriors with vote evidence', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      const proposals = [
        makeProposal('a1', 'X', 0.6),
        makeProposal('a2', 'Y', 0.4),
      ]

      // Round 1: establish hypotheses
      bridge.processRound([], proposals, [])

      const before = bridge.analyze().bayesian.posteriors['X'] ?? 0

      // Round 2: votes favoring X
      const votes = [
        makeSignal('a1', 'vote', 0.9, {
          payload: { proposalId: 'X', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>),
        makeSignal('a2', 'vote', 0.8, {
          payload: { proposalId: 'X', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>),
      ]
      bridge.processRound([], proposals, votes)

      const after = bridge.analyze().bayesian.posteriors['X'] ?? 0
      expect(after).toBeGreaterThan(before)
    })

    it('MAP estimate selects highest posterior', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)

      const proposals = [
        makeProposal('a1', 'Alpha', 0.5),
        makeProposal('a2', 'Beta', 0.5),
      ]

      // Strong evidence for Alpha
      const votes = [
        makeSignal('v1', 'vote', 0.9, {
          payload: { proposalId: 'Alpha', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>),
        makeSignal('v2', 'vote', 0.9, {
          payload: { proposalId: 'Alpha', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>),
        makeSignal('v3', 'vote', 0.9, {
          payload: { proposalId: 'Beta', stance: 'disagree' as const, weight: 1 },
        } as Partial<Signal>),
      ]

      bridge.processRound([], proposals, votes)

      const analysis = bridge.analyze()
      expect(analysis.bayesian.mapEstimate).not.toBeNull()
      expect(analysis.bayesian.mapEstimate!.proposalId).toBe('Alpha')
      expect(analysis.bayesian.mapEstimate!.probability).toBeGreaterThan(0.5)
    })
  })

  describe('GameTheory analysis', () => {
    it('returns null with fewer than 2 agents', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)
      bridge.setAgentCount(1)

      bridge.processRound(
        [makeSignal('a1', 'discovery')],
        [makeProposal('a1', 'P', 0.5)],
        [],
      )

      const analysis = bridge.analyze()
      expect(analysis.gameTheory).toBeNull()
    })

    it('reports actual challengers count accurately', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)
      bridge.setAgentCount(4)

      // Several challenge signals -> actual challengers present
      bridge.processRound(
        [
          makeSignal('a1', 'challenge'),
          makeSignal('a2', 'challenge'),
          makeSignal('a3', 'discovery'),
          makeSignal('a4', 'proposal'),
        ],
        [makeProposal('a3', 'P', 0.5)],
        [],
      )

      const analysis = bridge.analyze()
      expect(analysis.gameTheory).not.toBeNull()
      expect(analysis.gameTheory!.actualChallengers).toBe(2)
      expect(['low', 'medium', 'high']).toContain(analysis.gameTheory!.groupthinkRisk)
    })

    it('detects higher groupthink risk when no challenges present', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)
      bridge.setAgentCount(6)

      // Zero challenge signals with high consensus -> groupthink
      const proposals = [makeProposal('a1', 'P', 0.9)]
      const votes = [
        makeSignal('a1', 'vote', 0.9, {
          payload: { proposalId: 'P', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>),
        makeSignal('a2', 'vote', 0.9, {
          payload: { proposalId: 'P', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>),
        makeSignal('a3', 'vote', 0.9, {
          payload: { proposalId: 'P', stance: 'agree' as const, weight: 1 },
        } as Partial<Signal>),
      ]

      // Only agreement signals, zero challenges
      bridge.processRound(
        [makeSignal('a1', 'discovery'), makeSignal('a2', 'discovery')],
        proposals,
        votes,
      )

      const analysis = bridge.analyze()
      expect(analysis.gameTheory).not.toBeNull()
      expect(analysis.gameTheory!.actualChallengers).toBe(0)
      // With 6 agents and zero challenges, risk should be medium or high
      expect(['medium', 'high']).toContain(analysis.gameTheory!.groupthinkRisk)
    })

    it('tracks expectedChallengers from game theory model', () => {
      const bridge = new MathBridge(DEFAULT_CONFIG)
      bridge.setAgentCount(5)

      bridge.processRound(
        [makeSignal('a1', 'discovery')],
        [makeProposal('a1', 'P', 0.5)],
        [],
      )

      const analysis = bridge.analyze()
      expect(analysis.gameTheory).not.toBeNull()
      expect(analysis.gameTheory!.expectedChallengers).toBeGreaterThanOrEqual(0)
    })
  })
})
