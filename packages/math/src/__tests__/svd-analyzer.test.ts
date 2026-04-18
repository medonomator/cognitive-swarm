import { describe, it, expect } from 'vitest'
import { SVDAnalyzer } from '../svd-analyzer.js'

describe('SVDAnalyzer', () => {
  // ── Insufficient data ───────────────────────────────────────────

  it('returns diagnostic with 0 agents and 0 proposals', () => {
    const svd = new SVDAnalyzer()
    const report = svd.report()
    expect(report.diagnostic).toContain('Need at least 2 agents and 2 proposals')
    expect(report.singularValues).toEqual([])
    expect(report.explainedVariance).toEqual([])
  })

  it('returns diagnostic with 1 agent', () => {
    const svd = new SVDAnalyzer()
    svd.recordVote('a1', 'p1', 0.5)
    svd.recordVote('a1', 'p2', -0.3)
    const report = svd.report()
    expect(report.diagnostic).toContain('Need at least 2 agents and 2 proposals')
    expect(report.agentCount).toBe(1)
    expect(report.proposalCount).toBe(2)
  })

  it('returns diagnostic with 1 proposal', () => {
    const svd = new SVDAnalyzer()
    svd.recordVote('a1', 'p1', 0.5)
    svd.recordVote('a2', 'p1', -0.3)
    const report = svd.report()
    expect(report.diagnostic).toContain('Need at least 2 agents and 2 proposals')
    expect(report.agentCount).toBe(2)
    expect(report.proposalCount).toBe(1)
  })

  // ── One-dimensional debate ──────────────────────────────────────

  it('detects 1D debate: two agents with opposing votes on two proposals', () => {
    const svd = new SVDAnalyzer()
    // a1 supports A, opposes B; a2 opposes A, supports B
    // Using asymmetric strengths to avoid degenerate power-iteration start
    svd.recordVote('a1', 'prop-A', 0.8)
    svd.recordVote('a1', 'prop-B', -0.3)
    svd.recordVote('a2', 'prop-A', -0.5)
    svd.recordVote('a2', 'prop-B', 0.9)

    const report = svd.report()
    expect(report.oneDimensional).toBe(true)
    expect(report.explainedVariance[0]).toBeGreaterThan(0.8)
    expect(report.agentCount).toBe(2)
    expect(report.proposalCount).toBe(2)
  })

  // ── Multi-dimensional debate ────────────────────────────────────

  it('detects multi-dimensional debate with independent voting patterns', () => {
    const svd = new SVDAnalyzer()
    // Three agents with mostly independent preferences across 3 proposals.
    // Small cross-votes avoid degenerate eigenvalue structure.
    svd.recordVote('a1', 'prop-A', 0.9)
    svd.recordVote('a1', 'prop-B', 0.1)
    svd.recordVote('a1', 'prop-C', 0.0)

    svd.recordVote('a2', 'prop-A', 0.1)
    svd.recordVote('a2', 'prop-B', 0.9)
    svd.recordVote('a2', 'prop-C', 0.1)

    svd.recordVote('a3', 'prop-A', 0.0)
    svd.recordVote('a3', 'prop-B', 0.1)
    svd.recordVote('a3', 'prop-C', 0.9)

    const report = svd.report()
    expect(report.effectiveRank).toBeGreaterThan(1)
    expect(report.oneDimensional).toBe(false)
  })

  // ── Explained variance properties ──────────────────────────────

  it('explained variance sums to ~1.0', () => {
    const svd = new SVDAnalyzer()
    svd.recordVote('a1', 'p1', 0.8)
    svd.recordVote('a1', 'p2', -0.3)
    svd.recordVote('a2', 'p1', -0.5)
    svd.recordVote('a2', 'p2', 0.9)
    svd.recordVote('a3', 'p1', 0.1)
    svd.recordVote('a3', 'p2', 0.4)

    const report = svd.report()
    const total = report.explainedVariance.reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(1.0, 5)
  })

  it('cumulative variance is non-decreasing', () => {
    const svd = new SVDAnalyzer()
    svd.recordVote('a1', 'p1', 0.8)
    svd.recordVote('a1', 'p2', -0.3)
    svd.recordVote('a1', 'p3', 0.5)
    svd.recordVote('a2', 'p1', -0.5)
    svd.recordVote('a2', 'p2', 0.9)
    svd.recordVote('a2', 'p3', -0.2)
    svd.recordVote('a3', 'p1', 0.1)
    svd.recordVote('a3', 'p2', 0.4)
    svd.recordVote('a3', 'p3', 0.7)

    const report = svd.report()
    for (let i = 1; i < report.cumulativeVariance.length; i++) {
      expect(report.cumulativeVariance[i]).toBeGreaterThanOrEqual(
        report.cumulativeVariance[i - 1]!,
      )
    }
  })

  // ── reset() ─────────────────────────────────────────────────────

  it('reset() clears all state', () => {
    const svd = new SVDAnalyzer()
    svd.recordVote('a1', 'p1', 0.5)
    svd.recordVote('a2', 'p2', -0.3)
    expect(svd.agentCount).toBe(2)
    expect(svd.proposalCount).toBe(2)

    svd.reset()

    expect(svd.agentCount).toBe(0)
    expect(svd.proposalCount).toBe(0)
    const report = svd.report()
    expect(report.diagnostic).toContain('Need at least 2 agents and 2 proposals')
  })
})
