import { describe, it, expect } from 'vitest'
import { OptimalStopping } from './optimal-stopping.js'

describe('OptimalStopping', () => {
  describe('initial state', () => {
    it('does not stop without observations', () => {
      const stopper = new OptimalStopping(10)
      const decision = stopper.decide()

      expect(decision.shouldStop).toBe(false)
      expect(decision.reason).toBe('continue')
      expect(decision.roundsObserved).toBe(0)
    })

    it('computes exploration length as T/e', () => {
      const stopper = new OptimalStopping(10)
      // 10/e ~ 3.67 -> floor = 3
      expect(stopper.optimalExplorationLength()).toBe(3)
    })

    it('exploration length is at least 1', () => {
      const stopper = new OptimalStopping(1)
      expect(stopper.optimalExplorationLength()).toBeGreaterThanOrEqual(1)
    })
  })

  describe('CUSUM change detection', () => {
    it('detects when information gain drops significantly', () => {
      const stopper = new OptimalStopping(10, {
        targetGain: 0.1,
        threshold: 0.2,
      })

      // Round 1-2: good gain (above target)
      stopper.observeRound({ informationGain: 0.15, bestProposalQuality: 0.5, round: 1 })
      stopper.observeRound({ informationGain: 0.12, bestProposalQuality: 0.6, round: 2 })
      expect(stopper.decide().shouldStop).toBe(false)

      // Round 3-5: gain drops to zero -> CUSUM accumulates
      stopper.observeRound({ informationGain: 0.0, bestProposalQuality: 0.6, round: 3 })
      stopper.observeRound({ informationGain: 0.0, bestProposalQuality: 0.6, round: 4 })
      stopper.observeRound({ informationGain: 0.0, bestProposalQuality: 0.6, round: 5 })

      const decision = stopper.decide()
      expect(decision.shouldStop).toBe(true)
      expect(decision.reason).toBe('cusum-change-detected')
    })

    it('does not trigger on normal fluctuations', () => {
      const stopper = new OptimalStopping(10, {
        targetGain: 0.05,
        threshold: 0.5,
      })

      // Gains fluctuate around target - no alarm
      stopper.observeRound({ informationGain: 0.04, bestProposalQuality: 0.5, round: 1 })
      stopper.observeRound({ informationGain: 0.06, bestProposalQuality: 0.5, round: 2 })
      stopper.observeRound({ informationGain: 0.03, bestProposalQuality: 0.5, round: 3 })
      stopper.observeRound({ informationGain: 0.07, bestProposalQuality: 0.5, round: 4 })

      expect(stopper.decide().shouldStop).toBe(false)
    })

    it('CUSUM statistic resets toward 0 when gain is above target', () => {
      const stopper = new OptimalStopping(10, {
        targetGain: 0.05,
        threshold: 0.5,
      })

      // Some low gain -> CUSUM rises
      stopper.observeRound({ informationGain: 0.01, bestProposalQuality: 0.5, round: 1 })
      const afterLow = stopper.cusumValue()
      expect(afterLow).toBeGreaterThan(0)

      // High gain -> CUSUM drops (clamped at 0)
      stopper.observeRound({ informationGain: 0.2, bestProposalQuality: 0.5, round: 2 })
      const afterHigh = stopper.cusumValue()
      expect(afterHigh).toBeLessThan(afterLow)
    })
  })

  describe('Secretary Problem', () => {
    it('does not trigger during exploration phase', () => {
      const stopper = new OptimalStopping(10) // exploration = 3 rounds

      // Exploration: observe but don't stop even if quality improves
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.3, round: 1 })
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.5, round: 2 })
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.7, round: 3 })

      expect(stopper.decide().shouldStop).toBe(false)
      expect(stopper.isExplorationComplete()).toBe(false)
    })

    it('triggers when post-exploration proposal exceeds exploration best', () => {
      const stopper = new OptimalStopping(10, {
        targetGain: 0.0, // disable CUSUM
        threshold: 999,
      })

      // Exploration: best = 0.5
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.3, round: 1 })
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.5, round: 2 })
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.4, round: 3 })

      // Exploitation: proposal quality 0.6 > exploration best 0.5
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.6, round: 4 })

      const decision = stopper.decide()
      expect(decision.shouldStop).toBe(true)
      expect(decision.reason).toBe('secretary-threshold')
      expect(decision.bestSeenDuringExploration).toBe(0.5)
    })

    it('does not trigger if post-exploration proposals are worse', () => {
      const stopper = new OptimalStopping(10, {
        targetGain: 0.0,
        threshold: 999,
      })

      // Exploration: best = 0.8
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.8, round: 1 })
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.5, round: 2 })
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.3, round: 3 })

      // Exploitation: worse than exploration best
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.6, round: 4 })
      stopper.observeRound({ informationGain: 0.1, bestProposalQuality: 0.7, round: 5 })

      expect(stopper.decide().shouldStop).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      const stopper = new OptimalStopping(10)

      stopper.observeRound({ informationGain: 0.0, bestProposalQuality: 0.5, round: 1 })
      stopper.observeRound({ informationGain: 0.0, bestProposalQuality: 0.5, round: 2 })

      stopper.reset()

      expect(stopper.cusumValue()).toBe(0)
      expect(stopper.isChangeDetected()).toBe(false)
      expect(stopper.isExplorationComplete()).toBe(false)

      const decision = stopper.decide()
      expect(decision.roundsObserved).toBe(0)
      expect(decision.shouldStop).toBe(false)
    })
  })

  describe('CUSUM priority over Secretary', () => {
    it('CUSUM triggers even if Secretary would also trigger', () => {
      const stopper = new OptimalStopping(10, {
        targetGain: 0.1,
        threshold: 0.15,
      })

      // Exploration
      stopper.observeRound({ informationGain: 0.15, bestProposalQuality: 0.3, round: 1 })
      stopper.observeRound({ informationGain: 0.15, bestProposalQuality: 0.4, round: 2 })
      stopper.observeRound({ informationGain: 0.15, bestProposalQuality: 0.5, round: 3 })

      // Post-exploration: gain drops AND quality exceeds exploration best
      stopper.observeRound({ informationGain: 0.0, bestProposalQuality: 0.9, round: 4 })
      stopper.observeRound({ informationGain: 0.0, bestProposalQuality: 0.9, round: 5 })

      const decision = stopper.decide()
      expect(decision.shouldStop).toBe(true)
      // CUSUM has priority
      expect(decision.reason).toBe('cusum-change-detected')
    })
  })
})
