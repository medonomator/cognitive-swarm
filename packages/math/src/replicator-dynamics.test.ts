import { describe, it, expect } from 'vitest'
import { ReplicatorDynamics } from './replicator-dynamics.js'

const STRATEGIES = ['analyze', 'propose', 'challenge', 'support']

describe('ReplicatorDynamics', () => {
  describe('initial state', () => {
    it('starts with uniform distribution', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)
      const report = rd.analyze()

      for (const s of STRATEGIES) {
        expect(report.currentDistribution.get(s)).toBeCloseTo(0.25, 1)
      }
    })

    it('starts with 0 rounds', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)
      expect(rd.rounds).toBe(0)
    })
  })

  describe('observeRound', () => {
    it('updates frequencies and fitness', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      rd.observeRound(
        new Map([['analyze', 0.3], ['propose', 0.4], ['challenge', 0.2], ['support', 0.1]]),
        new Map([['analyze', 0.5], ['propose', 0.3], ['challenge', 0.9], ['support', 0.4]]),
      )

      expect(rd.rounds).toBe(1)
      const report = rd.analyze()
      expect(report.fitnessValues.get('challenge')).toBe(0.9)
    })
  })

  describe('step', () => {
    it('increases frequency of above-average fitness strategies', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      // challenge has highest fitness but lowest frequency
      rd.observeRound(
        new Map([['analyze', 0.3], ['propose', 0.4], ['challenge', 0.1], ['support', 0.2]]),
        new Map([['analyze', 0.4], ['propose', 0.3], ['challenge', 1.0], ['support', 0.3]]),
      )

      const before = rd.analyze().currentDistribution.get('challenge')!
      const next = rd.step()
      const after = next.get('challenge')!

      expect(after).toBeGreaterThan(before)
    })

    it('decreases frequency of below-average fitness strategies', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      rd.observeRound(
        new Map([['analyze', 0.25], ['propose', 0.25], ['challenge', 0.25], ['support', 0.25]]),
        new Map([['analyze', 0.8], ['propose', 0.1], ['challenge', 0.8], ['support', 0.8]]),
      )

      const next = rd.step()
      const proposeAfter = next.get('propose')!
      // propose has lowest fitness -> should decrease
      expect(proposeAfter).toBeLessThan(0.25)
    })
  })

  describe('findEquilibrium', () => {
    it('converges to stable distribution', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      rd.observeRound(
        new Map([['analyze', 0.25], ['propose', 0.25], ['challenge', 0.25], ['support', 0.25]]),
        new Map([['analyze', 0.5], ['propose', 0.5], ['challenge', 0.5], ['support', 0.5]]),
      )

      const eq = rd.findEquilibrium()
      // Equal fitness -> equilibrium should stay roughly uniform
      for (const s of STRATEGIES) {
        expect(eq.get(s)).toBeCloseTo(0.25, 1)
      }
    })

    it('shifts equilibrium toward higher fitness strategies', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      rd.observeRound(
        new Map([['analyze', 0.25], ['propose', 0.25], ['challenge', 0.25], ['support', 0.25]]),
        new Map([['analyze', 0.2], ['propose', 0.2], ['challenge', 0.8], ['support', 0.2]]),
      )

      const eq = rd.findEquilibrium()
      // challenge has 4x fitness -> should dominate at equilibrium
      expect(eq.get('challenge')!).toBeGreaterThan(0.5)
    })
  })

  describe('analyze', () => {
    it('returns complete report', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      rd.observeRound(
        new Map([['analyze', 0.3], ['propose', 0.3], ['challenge', 0.2], ['support', 0.2]]),
        new Map([['analyze', 0.5], ['propose', 0.4], ['challenge', 0.7], ['support', 0.3]]),
      )

      const report = rd.analyze()

      expect(report.currentDistribution.size).toBe(4)
      expect(report.fitnessValues.size).toBe(4)
      expect(report.equilibrium.size).toBe(4)
      expect(report.convergenceToESS).toBeGreaterThanOrEqual(0)
      expect(report.dominantStrategy).toBe('challenge')
      expect(report.averageFitness).toBeGreaterThan(0)
    })

    it('suggests strategy shifts', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      // Heavy imbalance: too many proposers, not enough challengers
      rd.observeRound(
        new Map([['analyze', 0.1], ['propose', 0.7], ['challenge', 0.1], ['support', 0.1]]),
        new Map([['analyze', 0.5], ['propose', 0.2], ['challenge', 0.9], ['support', 0.5]]),
      )

      const report = rd.analyze()

      // Should suggest increasing challenge (high fitness, low frequency)
      const challengeShift = report.suggestedShifts.find(
        (s) => s.strategy === 'challenge',
      )
      if (challengeShift) {
        expect(challengeShift.direction).toBe('increase')
      }
    })

    it('returns null dominant strategy with no data', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)
      const report = rd.analyze()
      expect(report.dominantStrategy).toBeNull()
    })
  })

  describe('reset', () => {
    it('restores uniform distribution', () => {
      const rd = new ReplicatorDynamics(STRATEGIES)

      rd.observeRound(
        new Map([['analyze', 0.5], ['propose', 0.3], ['challenge', 0.1], ['support', 0.1]]),
        new Map([['analyze', 1.0], ['propose', 0.1], ['challenge', 0.1], ['support', 0.1]]),
      )

      rd.reset()

      expect(rd.rounds).toBe(0)
      const report = rd.analyze()
      for (const s of STRATEGIES) {
        expect(report.currentDistribution.get(s)).toBeCloseTo(0.25, 1)
      }
    })
  })
})
