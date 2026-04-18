import { describe, it, expect } from 'vitest'
import { estimateCost, compare, aggregateReport, formatResult } from './harness.js'

describe('Benchmark Harness', () => {
  it('estimateCost returns reasonable values', () => {
    const cost = estimateCost(1_000_000)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(1) // gpt-4o-mini is cheap
  })

  it('estimateCost is zero for zero tokens', () => {
    expect(estimateCost(0)).toBe(0)
  })

  it('compare identifies swarm winner', () => {
    const swarm = { answer: '', score: 0.9, tokensUsed: 1000, durationMs: 5000, costUsd: 0.01 }
    const baseline = { answer: '', score: 0.6, tokensUsed: 500, durationMs: 2000, costUsd: 0.005 }

    const result = compare(swarm, baseline)
    expect(result.winner).toBe('swarm')
    expect(result.scoreDelta).toBeGreaterThan(0)
  })

  it('compare identifies baseline winner', () => {
    const swarm = { answer: '', score: 0.3, tokensUsed: 1000, durationMs: 5000, costUsd: 0.01 }
    const baseline = { answer: '', score: 0.8, tokensUsed: 500, durationMs: 2000, costUsd: 0.005 }

    const result = compare(swarm, baseline)
    expect(result.winner).toBe('baseline')
  })

  it('compare identifies tie', () => {
    const swarm = { answer: '', score: 0.7, tokensUsed: 1000, durationMs: 5000, costUsd: 0.01 }
    const baseline = { answer: '', score: 0.72, tokensUsed: 500, durationMs: 2000, costUsd: 0.005 }

    const result = compare(swarm, baseline)
    expect(result.winner).toBe('tie')
  })

  it('aggregateReport counts wins', () => {
    const results = [
      {
        name: 'test1', description: '', timestamp: 0,
        swarm: { answer: '', score: 0.9, tokensUsed: 0, durationMs: 0, costUsd: 0.01 },
        baseline: { answer: '', score: 0.5, tokensUsed: 0, durationMs: 0, costUsd: 0.005 },
        comparison: { scoreDelta: 0.4, costRatio: 2, speedRatio: 2, qualityPerDollar: 1, winner: 'swarm' as const },
        mathAnalysis: null,
      },
      {
        name: 'test2', description: '', timestamp: 0,
        swarm: { answer: '', score: 0.3, tokensUsed: 0, durationMs: 0, costUsd: 0.01 },
        baseline: { answer: '', score: 0.8, tokensUsed: 0, durationMs: 0, costUsd: 0.005 },
        comparison: { scoreDelta: -0.5, costRatio: 2, speedRatio: 2, qualityPerDollar: 1, winner: 'baseline' as const },
        mathAnalysis: null,
      },
    ]

    const report = aggregateReport(results)
    expect(report.swarmWins).toBe(1)
    expect(report.baselineWins).toBe(1)
    expect(report.ties).toBe(0)
  })

  it('formatResult produces readable output', () => {
    const result = {
      name: 'Test', description: 'A test', timestamp: 0,
      swarm: { answer: 'x', score: 0.8, tokensUsed: 1000, durationMs: 5000, costUsd: 0.01 },
      baseline: { answer: 'y', score: 0.6, tokensUsed: 500, durationMs: 2000, costUsd: 0.005 },
      comparison: { scoreDelta: 0.2, costRatio: 2, speedRatio: 2.5, qualityPerDollar: 1.5, winner: 'swarm' as const },
      mathAnalysis: null,
    }

    const output = formatResult(result)
    expect(output).toContain('Test')
    expect(output).toContain('SWARM')
    expect(output).toContain('0.80')
  })
})
