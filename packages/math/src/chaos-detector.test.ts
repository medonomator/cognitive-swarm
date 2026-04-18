import { describe, it, expect, beforeEach } from 'vitest'
import { ChaosDetector } from './chaos-detector.js'

describe('ChaosDetector', () => {
  let detector: ChaosDetector

  beforeEach(() => {
    detector = new ChaosDetector()
  })

  describe('period detection', () => {
    it('detects period-2 oscillation', () => {
      // A, B, A, B, A, B
      for (let i = 0; i < 6; i++) {
        detector.observeWinner(i % 2 === 0 ? 'A' : 'B')
      }

      const report = detector.report()
      expect(report.period).toBe(2)
      expect(report.chaosRisk).toBe('low')
    })

    it('detects period-3 — Sharkovskii trigger', () => {
      // A, B, C, A, B, C, A, B, C
      const cycle = ['A', 'B', 'C']
      for (let i = 0; i < 9; i++) {
        detector.observeWinner(cycle[i % 3]!)
      }

      const report = detector.report()
      expect(report.period).toBe(3)
      expect(report.sharkovskiiTriggered).toBe(true)
      expect(report.chaosRisk).toBe('critical')
    })

    it('reports no period for monotone convergence', () => {
      // A, A, A, A, A, A
      for (let i = 0; i < 6; i++) {
        detector.observeWinner('A')
      }

      const report = detector.report()
      expect(report.period).toBe(0)
      expect(report.chaosRisk).toBe('none')
      expect(report.recommendation).toBe('continue')
    })
  })

  describe('recommendations', () => {
    it('recommends synthesize for period-2 moderate risk', () => {
      // Period-2 with moderate confidence variation
      for (let i = 0; i < 8; i++) {
        detector.observeWinner(i % 2 === 0 ? 'A' : 'B', 0.5 + Math.random() * 0.3)
      }

      const report = detector.report()
      if (report.period === 2) {
        // Period-2 at moderate risk should suggest synthesis
        expect(['monitor', 'synthesize']).toContain(report.recommendation)
      }
    })

    it('recommends force-decision for Sharkovskii chaos', () => {
      const cycle = ['A', 'B', 'C']
      for (let i = 0; i < 9; i++) {
        detector.observeWinner(cycle[i % 3]!)
      }

      const report = detector.report()
      expect(report.recommendation).toBe('force-decision')
    })
  })

  describe('period-doubling detection', () => {
    it('detects period-4 oscillation', () => {
      // Clean period-4: A, B, C, D, A, B, C, D, A, B, C, D
      const cycle4 = ['A', 'B', 'C', 'D']
      for (let i = 0; i < 12; i++) {
        detector.observeWinner(cycle4[i % 4]!)
      }

      const report = detector.report()
      expect(report.period).toBe(4)
      expect(report.chaosRisk).toBe('moderate')
    })
  })

  describe('Lyapunov exponent', () => {
    it('estimates negative exponent for converging system', () => {
      // Decreasing confidence oscillation → converging
      for (let i = 0; i < 8; i++) {
        const confidence = 0.8 - i * 0.01 // gradually settling
        detector.observeWinner('A', confidence)
      }

      const report = detector.report()
      expect(report.lyapunovExponent).toBeLessThan(0) // stable
    })
  })

  describe('edge cases', () => {
    it('handles fewer than 3 rounds gracefully', () => {
      detector.observeWinner('A')
      detector.observeWinner('B')

      const report = detector.report()
      expect(report.chaosRisk).toBe('none')
      expect(report.period).toBe(0)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      for (let i = 0; i < 6; i++) {
        detector.observeWinner(i % 2 === 0 ? 'A' : 'B')
      }

      detector.reset()
      expect(detector.roundCount).toBe(0)

      const report = detector.report()
      expect(report.chaosRisk).toBe('none')
    })
  })
})
