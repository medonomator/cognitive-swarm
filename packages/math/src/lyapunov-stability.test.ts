import { describe, it, expect, beforeEach } from 'vitest'
import { LyapunovStability } from './lyapunov-stability.js'

describe('LyapunovStability', () => {
  let lyapunov: LyapunovStability

  beforeEach(() => {
    lyapunov = new LyapunovStability()
  })

  describe('asymptotic stability', () => {
    it('detects asymptotically stable consensus', () => {
      // Agents converging toward consensus = 0.8
      lyapunov.observe(
        new Map([['a1', 0.9], ['a2', 0.6], ['a3', 0.8]]),
        0.8,
      )
      lyapunov.observe(
        new Map([['a1', 0.85], ['a2', 0.7], ['a3', 0.8]]),
        0.8,
      )
      lyapunov.observe(
        new Map([['a1', 0.82], ['a2', 0.76], ['a3', 0.8]]),
        0.8,
      )

      const report = lyapunov.report(0.8)
      expect(report.type).toBe('asymptotic')
      expect(report.stable).toBe(true)
      expect(report.lyapunovDot).toBeLessThan(0)
    })

    it('boosts confidence for stable consensus', () => {
      // Wide initial spread, rapid convergence → large negative V̇
      lyapunov.observe(
        new Map([['a1', 0.95], ['a2', 0.5], ['a3', 0.7]]),
        0.8,
      )
      lyapunov.observe(
        new Map([['a1', 0.85], ['a2', 0.7], ['a3', 0.78]]),
        0.8,
      )
      lyapunov.observe(
        new Map([['a1', 0.82], ['a2', 0.78], ['a3', 0.8]]),
        0.8,
      )

      const report = lyapunov.report(0.75)
      expect(report.type).toBe('asymptotic')
      expect(report.adjustedConfidence).toBeGreaterThan(0.75)
    })
  })

  describe('unstable consensus', () => {
    it('detects unstable (diverging) consensus', () => {
      // Agents moving AWAY from consensus
      lyapunov.observe(
        new Map([['a1', 0.55], ['a2', 0.45]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.65], ['a2', 0.35]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.8], ['a2', 0.2]]),
        0.5,
      )

      const report = lyapunov.report(0.7)
      expect(report.type).toBe('unstable')
      expect(report.stable).toBe(false)
      expect(report.lyapunovDot).toBeGreaterThan(0)
    })

    it('penalizes confidence for unstable consensus', () => {
      lyapunov.observe(
        new Map([['a1', 0.55], ['a2', 0.45]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.7], ['a2', 0.3]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.9], ['a2', 0.1]]),
        0.5,
      )

      const report = lyapunov.report(0.8)
      expect(report.adjustedConfidence).toBeLessThan(0.8)
    })
  })

  describe('marginal stability', () => {
    it('detects marginally stable consensus', () => {
      // Agents hovering near consensus without converging or diverging
      lyapunov.observe(
        new Map([['a1', 0.52], ['a2', 0.48]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.51], ['a2', 0.49]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.52], ['a2', 0.48]]),
        0.5,
      )

      const report = lyapunov.report(0.7)
      expect(report.type).toBe('marginal')
    })
  })

  describe('perturbation tolerance', () => {
    it('reports high tolerance for strongly stable consensus', () => {
      lyapunov.observe(
        new Map([['a1', 0.85], ['a2', 0.75]]),
        0.8,
      )
      lyapunov.observe(
        new Map([['a1', 0.82], ['a2', 0.78]]),
        0.8,
      )
      lyapunov.observe(
        new Map([['a1', 0.81], ['a2', 0.79]]),
        0.8,
      )

      const report = lyapunov.report(0.8)
      expect(report.perturbationTolerance).toBeGreaterThan(0)
    })

    it('reports zero tolerance for unstable consensus', () => {
      lyapunov.observe(
        new Map([['a1', 0.6], ['a2', 0.4]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.8], ['a2', 0.2]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.95], ['a2', 0.05]]),
        0.5,
      )

      const report = lyapunov.report(0.5)
      expect(report.perturbationTolerance).toBe(0)
    })
  })

  describe('Lyapunov function V', () => {
    it('decreases as agents converge', () => {
      lyapunov.observe(
        new Map([['a1', 1.0], ['a2', 0.0]]),
        0.5,
      )
      lyapunov.observe(
        new Map([['a1', 0.7], ['a2', 0.3]]),
        0.5,
      )

      const report = lyapunov.report()
      expect(report.history).toHaveLength(2)
      expect(report.history[1]!).toBeLessThan(report.history[0]!)
    })
  })

  describe('empty state', () => {
    it('returns default report with no observations', () => {
      const report = lyapunov.report(0.5)
      expect(report.lyapunovV).toBe(0)
      expect(report.type).toBe('marginal')
      expect(report.adjustedConfidence).toBe(0.5)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      lyapunov.observe(
        new Map([['a1', 0.9], ['a2', 0.6]]),
        0.8,
      )

      lyapunov.reset()
      expect(lyapunov.roundCount).toBe(0)
    })
  })
})
