import { describe, it, expect } from 'vitest'
import { OpinionDynamics } from './opinion-dynamics.js'

describe('OpinionDynamics', () => {
  describe('basic state', () => {
    it('starts with no agents', () => {
      const hk = new OpinionDynamics()
      expect(hk.agentCount).toBe(0)
    })

    it('tracks agent opinions', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.5, 0.3)
      hk.setOpinion('a2', 0.8, 0.2)

      expect(hk.agentCount).toBe(2)
      const opinions = hk.getOpinions()
      expect(opinions.get('a1')).toBe(0.5)
      expect(opinions.get('a2')).toBe(0.8)
    })

    it('clamps opinions to [0, 1]', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', -0.5)
      hk.setOpinion('a2', 1.5)

      const opinions = hk.getOpinions()
      expect(opinions.get('a1')).toBe(0)
      expect(opinions.get('a2')).toBe(1)
    })

    it('reset clears all state', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.5)
      hk.reset()
      expect(hk.agentCount).toBe(0)
    })
  })

  describe('setFromConformity', () => {
    it('maps conformity to epsilon: high conformity = wide bounds', () => {
      const hk = new OpinionDynamics()
      // conformity=1 -> eps=0.6, conformity=0 -> eps=0.1
      hk.setFromConformity('conformist', 0.5, 1.0)
      hk.setFromConformity('independent', 0.5, 0.0)

      // Both have the same opinion, but different listening ranges
      expect(hk.agentCount).toBe(2)
    })
  })

  describe('step', () => {
    it('agents within epsilon converge toward each other', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.4, 0.3) // sees a2 (|0.4-0.5|=0.1 < 0.3)
      hk.setOpinion('a2', 0.5, 0.3) // sees a1

      hk.step()
      const opinions = hk.getOpinions()

      // Both should converge toward mean (0.45)
      expect(opinions.get('a1')).toBeCloseTo(0.45, 5)
      expect(opinions.get('a2')).toBeCloseTo(0.45, 5)
    })

    it('agents outside epsilon do not influence each other', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.1, 0.1) // ε=0.1
      hk.setOpinion('a2', 0.9, 0.1) // ε=0.1
      // |0.1-0.9|=0.8 > 0.1 -> not neighbors

      hk.step()
      const opinions = hk.getOpinions()

      // Should stay at their original opinions (only self in neighborhood)
      expect(opinions.get('a1')).toBeCloseTo(0.1, 5)
      expect(opinions.get('a2')).toBeCloseTo(0.9, 5)
    })

    it('records history', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.3, 0.5)
      hk.step()
      hk.step()

      const history = hk.getHistory()
      // Initial opinion + 2 steps = 3 entries
      expect(history.get('a1')!.length).toBe(3)
    })
  })

  describe('predict', () => {
    it('predicts consensus when all agents are close', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.48, 0.3)
      hk.setOpinion('a2', 0.50, 0.3)
      hk.setOpinion('a3', 0.52, 0.3)

      const report = hk.predict()

      expect(report.clusterCount).toBe(1)
      expect(report.fragmentationRisk).toBe('low')
      expect(report.polarizationIndex).toBeLessThan(0.1)
    })

    it('predicts fragmentation when agents are far apart with narrow epsilon', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.1, 0.05)
      hk.setOpinion('a2', 0.5, 0.05)
      hk.setOpinion('a3', 0.9, 0.05)

      const report = hk.predict()

      expect(report.clusterCount).toBe(3)
      expect(report.fragmentationRisk).toBe('high')
    })

    it('predicts two clusters (polarization)', () => {
      const hk = new OpinionDynamics()
      // Group 1: low opinions
      hk.setOpinion('a1', 0.1, 0.15)
      hk.setOpinion('a2', 0.15, 0.15)
      // Group 2: high opinions
      hk.setOpinion('a3', 0.85, 0.15)
      hk.setOpinion('a4', 0.9, 0.15)

      const report = hk.predict()

      expect(report.clusterCount).toBe(2)
      expect(report.fragmentationRisk).not.toBe('low')
    })

    it('is non-destructive (does not modify current state)', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.3, 0.2)
      hk.setOpinion('a2', 0.7, 0.2)

      const opinionsBefore = new Map(hk.getOpinions())
      hk.predict()
      const opinionsAfter = hk.getOpinions()

      expect(opinionsAfter.get('a1')).toBe(opinionsBefore.get('a1'))
      expect(opinionsAfter.get('a2')).toBe(opinionsBefore.get('a2'))
    })

    it('identifies bridging agents', () => {
      const hk = new OpinionDynamics()
      // Two groups with a bridge in the middle
      hk.setOpinion('a1', 0.2, 0.15)
      hk.setOpinion('a2', 0.25, 0.15)
      hk.setOpinion('bridge', 0.5, 0.4) // wide ε, can reach both groups
      hk.setOpinion('a3', 0.75, 0.15)
      hk.setOpinion('a4', 0.8, 0.15)

      const report = hk.predict()

      expect(report.bridgingAgents).toContain('bridge')
    })
  })

  describe('polarizationIndex', () => {
    it('returns 0 for identical opinions', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.5)
      hk.setOpinion('a2', 0.5)
      hk.setOpinion('a3', 0.5)

      expect(hk.polarizationIndex()).toBe(0)
    })

    it('returns high value for maximally spread opinions', () => {
      const hk = new OpinionDynamics()
      hk.setOpinion('a1', 0.0)
      hk.setOpinion('a2', 1.0)

      expect(hk.polarizationIndex()).toBe(1)
    })
  })
})
