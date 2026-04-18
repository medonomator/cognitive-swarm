import { describe, it, expect } from 'vitest'
import { ArchetypeDetector } from '../system-archetypes.js'
import type { ArchetypeMetrics } from '../system-archetypes.js'

function makeMetrics(overrides: Partial<ArchetypeMetrics> = {}): ArchetypeMetrics {
  return {
    infoGainTrend: 0.1,
    signalVolume: 10,
    prevSignalVolume: 10,
    evolvedAgentCount: 0,
    totalSpawns: 0,
    totalDissolves: 0,
    averageNMI: 0.3,
    shapleyConcentration: 1.0,
    persistentGap: false,
    ...overrides,
  }
}

describe('ArchetypeDetector', () => {
  it('returns empty report with fewer than 2 observations', () => {
    const detector = new ArchetypeDetector()
    const report = detector.report()

    expect(report.detected).toEqual([])
    expect(report.hasArchetypes).toBe(false)
    expect(report.primary).toBeNull()

    detector.observe(makeMetrics())
    const report2 = detector.report()

    expect(report2.detected).toEqual([])
    expect(report2.hasArchetypes).toBe(false)
    expect(report2.primary).toBeNull()
  })

  describe('Limits to Growth', () => {
    it('detects when infoGainTrend < 0 and signalVolume increasing', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics({ infoGainTrend: -0.05, signalVolume: 10 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.08, signalVolume: 15 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.12, signalVolume: 20 }))

      const report = detector.report()

      expect(report.hasArchetypes).toBe(true)
      const ltg = report.detected.find(d => d.name === 'limits-to-growth')
      expect(ltg).toBeDefined()
      expect(ltg!.confidence).toBeGreaterThanOrEqual(0.3)
      expect(ltg!.leverageLevel).toBe(4)
    })

    it('does not detect when infoGainTrend is positive', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics({ infoGainTrend: 0.05, signalVolume: 10 }))
      detector.observe(makeMetrics({ infoGainTrend: 0.08, signalVolume: 15 }))
      detector.observe(makeMetrics({ infoGainTrend: 0.12, signalVolume: 20 }))

      const report = detector.report()
      const ltg = report.detected.find(d => d.name === 'limits-to-growth')
      expect(ltg).toBeUndefined()
    })

    it('does not detect when signalVolume is not increasing', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics({ infoGainTrend: -0.05, signalVolume: 20 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.08, signalVolume: 15 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.12, signalVolume: 10 }))

      const report = detector.report()
      const ltg = report.detected.find(d => d.name === 'limits-to-growth')
      expect(ltg).toBeUndefined()
    })
  })

  describe('Shifting the Burden', () => {
    it('detects when totalSpawns >= 2, persistentGap, and dissolves happened', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics())
      detector.observe(makeMetrics({
        totalSpawns: 3,
        totalDissolves: 2,
        persistentGap: true,
      }))

      const report = detector.report()

      expect(report.hasArchetypes).toBe(true)
      const stb = report.detected.find(d => d.name === 'shifting-the-burden')
      expect(stb).toBeDefined()
      expect(stb!.confidence).toBeGreaterThanOrEqual(0.4)
      expect(stb!.leverageLevel).toBe(3)
    })

    it('does not detect when persistentGap is false', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics())
      detector.observe(makeMetrics({
        totalSpawns: 3,
        totalDissolves: 2,
        persistentGap: false,
      }))

      const report = detector.report()
      const stb = report.detected.find(d => d.name === 'shifting-the-burden')
      expect(stb).toBeUndefined()
    })

    it('does not detect when totalSpawns < 2', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics())
      detector.observe(makeMetrics({
        totalSpawns: 1,
        totalDissolves: 0,
        persistentGap: true,
      }))

      const report = detector.report()
      const stb = report.detected.find(d => d.name === 'shifting-the-burden')
      expect(stb).toBeUndefined()
    })
  })

  describe('Tragedy of the Commons', () => {
    it('detects when averageNMI > 0.6 and shapleyConcentration > 2.0', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics())
      detector.observe(makeMetrics({
        averageNMI: 0.75,
        shapleyConcentration: 2.5,
      }))

      const report = detector.report()

      expect(report.hasArchetypes).toBe(true)
      const toc = report.detected.find(d => d.name === 'tragedy-of-the-commons')
      expect(toc).toBeDefined()
      expect(toc!.confidence).toBe(1.0)
      expect(toc!.leverageLevel).toBe(5)
    })

    it('detects with only high NMI (partial confidence)', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics())
      detector.observe(makeMetrics({
        averageNMI: 0.75,
        shapleyConcentration: 1.5,
      }))

      const report = detector.report()
      const toc = report.detected.find(d => d.name === 'tragedy-of-the-commons')
      expect(toc).toBeDefined()
      expect(toc!.confidence).toBe(0.4)
    })

    it('detects with only high shapleyConcentration (partial confidence)', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics())
      detector.observe(makeMetrics({
        averageNMI: 0.3,
        shapleyConcentration: 2.5,
      }))

      const report = detector.report()
      const toc = report.detected.find(d => d.name === 'tragedy-of-the-commons')
      expect(toc).toBeDefined()
      expect(toc!.confidence).toBe(0.4)
    })

    it('does not detect when both NMI and concentration are low', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics())
      detector.observe(makeMetrics({
        averageNMI: 0.3,
        shapleyConcentration: 1.5,
      }))

      const report = detector.report()
      const toc = report.detected.find(d => d.name === 'tragedy-of-the-commons')
      expect(toc).toBeUndefined()
    })
  })

  describe('multiple archetypes', () => {
    it('detects multiple archetypes simultaneously', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics({ infoGainTrend: -0.05, signalVolume: 10 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.08, signalVolume: 15 }))
      detector.observe(makeMetrics({
        infoGainTrend: -0.12,
        signalVolume: 20,
        totalSpawns: 3,
        totalDissolves: 2,
        persistentGap: true,
        averageNMI: 0.75,
        shapleyConcentration: 2.5,
      }))

      const report = detector.report()

      expect(report.hasArchetypes).toBe(true)
      expect(report.detected.length).toBe(3)

      const names = report.detected.map(d => d.name)
      expect(names).toContain('limits-to-growth')
      expect(names).toContain('shifting-the-burden')
      expect(names).toContain('tragedy-of-the-commons')
    })

    it('primary is the archetype with highest confidence', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics({ infoGainTrend: -0.05, signalVolume: 10 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.08, signalVolume: 15 }))
      detector.observe(makeMetrics({
        infoGainTrend: -0.12,
        signalVolume: 20,
        averageNMI: 0.75,
        shapleyConcentration: 2.5,
      }))

      const report = detector.report()

      expect(report.primary).not.toBeNull()
      const maxConfidence = Math.max(...report.detected.map(d => d.confidence))
      expect(report.primary!.confidence).toBe(maxConfidence)
    })
  })

  describe('reset', () => {
    it('clears all observations', () => {
      const detector = new ArchetypeDetector()

      detector.observe(makeMetrics({ infoGainTrend: -0.05, signalVolume: 10 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.08, signalVolume: 15 }))
      detector.observe(makeMetrics({ infoGainTrend: -0.12, signalVolume: 20 }))

      expect(detector.observationCount).toBe(3)

      detector.reset()

      expect(detector.observationCount).toBe(0)
      const report = detector.report()
      expect(report.detected).toEqual([])
      expect(report.hasArchetypes).toBe(false)
      expect(report.primary).toBeNull()
    })
  })
})
