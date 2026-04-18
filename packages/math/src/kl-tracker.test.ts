import { describe, it, expect, beforeEach } from 'vitest'
import { KLDivergenceTracker } from './kl-tracker.js'

describe('KLDivergenceTracker', () => {
  let tracker: KLDivergenceTracker

  beforeEach(() => {
    tracker = new KLDivergenceTracker()
  })

  describe('agent divergence from consensus', () => {
    it('computes KL divergence per agent', () => {
      tracker.setBeliefs('a1', new Map([['A', 0.7], ['B', 0.3]]))
      tracker.setBeliefs('a2', new Map([['A', 0.3], ['B', 0.7]]))
      tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
      tracker.endRound()

      const report = tracker.report()
      expect(report.agentDivergences).toHaveLength(2)

      const a1 = report.agentDivergences.find(d => d.agentId === 'a1')!
      const a2 = report.agentDivergences.find(d => d.agentId === 'a2')!

      // Both deviate equally from uniform consensus (symmetric scenario)
      expect(a1.klFromConsensus).toBeCloseTo(a2.klFromConsensus, 5)
      expect(a1.klFromConsensus).toBeGreaterThan(0)
    })

    it('identifies outliers above threshold', () => {
      const tracker = new KLDivergenceTracker(0.1) // low threshold

      tracker.setBeliefs('conformist', new Map([['A', 0.5], ['B', 0.5]]))
      tracker.setBeliefs('outlier', new Map([['A', 0.95], ['B', 0.05]]))
      tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
      tracker.endRound()

      const report = tracker.report()
      expect(report.outliers).toContain('outlier')
      expect(report.outliers).not.toContain('conformist')
    })

    it('reports zero divergence when agent matches consensus', () => {
      tracker.setBeliefs('a1', new Map([['A', 0.6], ['B', 0.4]]))
      tracker.setConsensus(new Map([['A', 0.6], ['B', 0.4]]))
      tracker.endRound()

      const report = tracker.report()
      expect(report.agentDivergences[0]!.klFromConsensus).toBeCloseTo(0)
    })
  })

  describe('pairwise JSD', () => {
    it('computes Jensen-Shannon divergence between agent pairs', () => {
      tracker.setBeliefs('a1', new Map([['A', 0.9], ['B', 0.1]]))
      tracker.setBeliefs('a2', new Map([['A', 0.1], ['B', 0.9]]))
      tracker.setBeliefs('a3', new Map([['A', 0.85], ['B', 0.15]]))
      tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
      tracker.endRound()

      const report = tracker.report()
      expect(report.pairwiseJSD).toHaveLength(3) // 3 pairs

      // a1 and a3 are similar → low JSD
      const a1a3 = report.pairwiseJSD.find(
        p => (p.agentA === 'a1' && p.agentB === 'a3') ||
             (p.agentA === 'a3' && p.agentB === 'a1'),
      )!
      // a1 and a2 are opposite → high JSD
      const a1a2 = report.pairwiseJSD.find(
        p => (p.agentA === 'a1' && p.agentB === 'a2') ||
             (p.agentA === 'a2' && p.agentB === 'a1'),
      )!

      expect(a1a3.jsd).toBeLessThan(a1a2.jsd)
    })
  })

  describe('consensus drift', () => {
    it('tracks drift between rounds', () => {
      tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
      tracker.endRound()

      tracker.setConsensus(new Map([['A', 0.3], ['B', 0.7]]))
      tracker.endRound()

      const report = tracker.report()
      expect(report.consensusDrift).toBeGreaterThan(0)
    })

    it('reports zero drift when consensus unchanged', () => {
      tracker.setConsensus(new Map([['A', 0.6], ['B', 0.4]]))
      tracker.endRound()
      tracker.setConsensus(new Map([['A', 0.6], ['B', 0.4]]))
      tracker.endRound()

      const report = tracker.report()
      expect(report.consensusDrift).toBeCloseTo(0)
    })

    it('detects diverging drift trend', () => {
      // Round 1: small shift
      tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
      tracker.endRound()
      tracker.setConsensus(new Map([['A', 0.48], ['B', 0.52]]))
      tracker.endRound()
      // Round 2: bigger shift
      tracker.setConsensus(new Map([['A', 0.4], ['B', 0.6]]))
      tracker.endRound()
      // Round 3: even bigger shift
      tracker.setConsensus(new Map([['A', 0.25], ['B', 0.75]]))
      tracker.endRound()

      const report = tracker.report()
      expect(report.driftTrend).toBeGreaterThan(0) // accelerating drift
    })
  })

  describe('empty state', () => {
    it('returns empty report with no data', () => {
      const report = tracker.report()
      expect(report.agentDivergences).toHaveLength(0)
      expect(report.meanDivergence).toBe(0)
      expect(report.outliers).toHaveLength(0)
      expect(report.pairwiseJSD).toHaveLength(0)
      expect(report.consensusDrift).toBe(0)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      tracker.setBeliefs('a1', new Map([['A', 0.7], ['B', 0.3]]))
      tracker.setConsensus(new Map([['A', 0.5], ['B', 0.5]]))
      tracker.endRound()

      tracker.reset()
      expect(tracker.agentCount).toBe(0)
      expect(tracker.roundCount).toBe(0)
    })
  })
})
