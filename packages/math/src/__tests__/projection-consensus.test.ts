import { describe, it, expect } from 'vitest'
import { ProjectionConsensus } from '../projection-consensus.js'

describe('ProjectionConsensus', () => {
  // ── 1. Empty consensus ──────────────────────────────────────────────
  it('returns empty map, zero residuals, tight = true when no agents', () => {
    const proj = new ProjectionConsensus()
    const result = proj.compute()

    expect(result.consensus.size).toBe(0)
    expect(result.totalResidual).toBe(0)
    expect(result.meanResidual).toBe(0)
    expect(result.agentResiduals.size).toBe(0)
    expect(result.tight).toBe(true)
  })

  // ── 2. Single agent ─────────────────────────────────────────────────
  it('consensus equals the single agent beliefs exactly', () => {
    const proj = new ProjectionConsensus()
    proj.setBeliefs('a1', new Map([['A', 0.7], ['B', 0.3]]))

    const result = proj.compute()

    expect(result.consensus.get('A')).toBeCloseTo(0.7)
    expect(result.consensus.get('B')).toBeCloseTo(0.3)
    expect(result.totalResidual).toBeCloseTo(0)
    expect(result.agentResiduals.get('a1')).toBeCloseTo(0)
  })

  // ── 3. Equal-weight agents ──────────────────────────────────────────
  it('consensus is simple average when weights are equal', () => {
    const proj = new ProjectionConsensus()
    proj.setBeliefs('a1', new Map([['A', 0.8], ['B', 0.2]]), 1.0)
    proj.setBeliefs('a2', new Map([['A', 0.4], ['B', 0.6]]), 1.0)

    const result = proj.compute()

    // Raw average: A = 0.6, B = 0.4 — already sums to 1, so normalization is no-op
    expect(result.consensus.get('A')).toBeCloseTo(0.6)
    expect(result.consensus.get('B')).toBeCloseTo(0.4)
  })

  // ── 4. Weighted agents ──────────────────────────────────────────────
  it('higher-weight agent pulls consensus toward their beliefs', () => {
    const proj = new ProjectionConsensus()
    proj.setBeliefs('heavy', new Map([['X', 0.9], ['Y', 0.1]]), 3.0)
    proj.setBeliefs('light', new Map([['X', 0.3], ['Y', 0.7]]), 1.0)

    const result = proj.compute()

    // Weighted avg before normalization: X = (2.7+0.3)/4 = 0.75, Y = (0.3+0.7)/4 = 0.25
    // Sum = 1.0, so normalization keeps it the same
    expect(result.consensus.get('X')).toBeCloseTo(0.75)
    expect(result.consensus.get('Y')).toBeCloseTo(0.25)

    // Consensus should be closer to the heavy agent
    const distToHeavy = Math.abs(result.consensus.get('X')! - 0.9)
    const distToLight = Math.abs(result.consensus.get('X')! - 0.3)
    expect(distToHeavy).toBeLessThan(distToLight)
  })

  // ── 5. Per-agent residuals ──────────────────────────────────────────
  it('agents further from consensus have higher residuals', () => {
    const proj = new ProjectionConsensus()
    // Two agents agree, one disagrees strongly
    proj.setBeliefs('agree1', new Map([['A', 0.8], ['B', 0.2]]), 1.0)
    proj.setBeliefs('agree2', new Map([['A', 0.7], ['B', 0.3]]), 1.0)
    proj.setBeliefs('outlier', new Map([['A', 0.1], ['B', 0.9]]), 1.0)

    const result = proj.compute()

    const rAgree1 = result.agentResiduals.get('agree1')!
    const rAgree2 = result.agentResiduals.get('agree2')!
    const rOutlier = result.agentResiduals.get('outlier')!

    expect(rOutlier).toBeGreaterThan(rAgree1)
    expect(rOutlier).toBeGreaterThan(rAgree2)
  })

  // ── 6. Tight threshold ──────────────────────────────────────────────
  describe('tight threshold', () => {
    it('identical beliefs → tight = true', () => {
      const proj = new ProjectionConsensus()
      const belief = new Map([['A', 0.6], ['B', 0.4]])
      proj.setBeliefs('a1', belief, 1.0)
      proj.setBeliefs('a2', belief, 1.0)

      const result = proj.compute()
      expect(result.tight).toBe(true)
      expect(result.meanResidual).toBeCloseTo(0)
    })

    it('divergent beliefs → tight = false', () => {
      const proj = new ProjectionConsensus()
      proj.setBeliefs('a1', new Map([['A', 1.0], ['B', 0.0]]), 1.0)
      proj.setBeliefs('a2', new Map([['A', 0.0], ['B', 1.0]]), 1.0)

      // Default threshold = 0.05; maximally divergent beliefs should exceed it
      const result = proj.compute()
      expect(result.tight).toBe(false)
      expect(result.meanResidual).toBeGreaterThan(0.05)
    })

    it('respects custom tightThreshold', () => {
      const proj = new ProjectionConsensus()
      proj.setBeliefs('a1', new Map([['A', 0.6], ['B', 0.4]]), 1.0)
      proj.setBeliefs('a2', new Map([['A', 0.5], ['B', 0.5]]), 1.0)

      // Very loose threshold — should be tight
      expect(proj.compute(10).tight).toBe(true)
      // Very strict threshold — should not be tight
      expect(proj.compute(0.0000001).tight).toBe(false)
    })
  })

  // ── 7. Consensus sums to 1 ─────────────────────────────────────────
  it('consensus values sum to 1 (probability distribution)', () => {
    const proj = new ProjectionConsensus()
    proj.setBeliefs('a1', new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]), 2.0)
    proj.setBeliefs('a2', new Map([['A', 0.1], ['B', 0.6], ['C', 0.3]]), 1.0)

    const result = proj.compute()
    let sum = 0
    for (const v of result.consensus.values()) sum += v

    expect(sum).toBeCloseTo(1.0)
  })

  // ── 8. reset() clears state ─────────────────────────────────────────
  it('reset() clears all agents and returns empty consensus', () => {
    const proj = new ProjectionConsensus()
    proj.setBeliefs('a1', new Map([['A', 0.5], ['B', 0.5]]))
    expect(proj.agentCount).toBe(1)

    proj.reset()
    expect(proj.agentCount).toBe(0)

    const result = proj.compute()
    expect(result.consensus.size).toBe(0)
    expect(result.totalResidual).toBe(0)
    expect(result.tight).toBe(true)
  })

  // ── Edge: agent with missing keys treated as 0 ──────────────────────
  it('handles agents with different key sets (missing keys = 0)', () => {
    const proj = new ProjectionConsensus()
    proj.setBeliefs('a1', new Map([['A', 1.0]]), 1.0)
    proj.setBeliefs('a2', new Map([['B', 1.0]]), 1.0)

    const result = proj.compute()

    // Both keys present in consensus
    expect(result.consensus.has('A')).toBe(true)
    expect(result.consensus.has('B')).toBe(true)
    // Equal weight → equal split
    expect(result.consensus.get('A')).toBeCloseTo(0.5)
    expect(result.consensus.get('B')).toBeCloseTo(0.5)
  })
})
