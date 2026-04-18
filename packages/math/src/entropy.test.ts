import { describe, it, expect } from 'vitest'
import {
  EntropyTracker,
  shannonEntropy,
  klDivergence,
  jsDivergence,
} from './entropy.js'

describe('shannonEntropy', () => {
  it('returns 0 for single-element distribution', () => {
    expect(shannonEntropy(new Map([['A', 1.0]]))).toBe(0)
  })

  it('returns log₂(N) for uniform distribution', () => {
    const uniform = new Map([
      ['A', 0.25],
      ['B', 0.25],
      ['C', 0.25],
      ['D', 0.25],
    ])
    expect(shannonEntropy(uniform)).toBeCloseTo(2.0, 5) // log₂(4) = 2
  })

  it('returns 1 bit for fair coin', () => {
    const fair = new Map([['H', 0.5], ['T', 0.5]])
    expect(shannonEntropy(fair)).toBeCloseTo(1.0, 5)
  })

  it('lower entropy for skewed distribution', () => {
    const uniform = new Map([['A', 0.5], ['B', 0.5]])
    const skewed = new Map([['A', 0.9], ['B', 0.1]])

    expect(shannonEntropy(skewed)).toBeLessThan(shannonEntropy(uniform))
  })

  it('handles zero probabilities', () => {
    const dist = new Map([['A', 1.0], ['B', 0.0]])
    expect(shannonEntropy(dist)).toBeCloseTo(0, 5)
  })

  it('handles empty distribution', () => {
    expect(shannonEntropy(new Map())).toBe(0)
  })

  it('normalizes if probabilities do not sum to 1', () => {
    const unnorm = new Map([['A', 2], ['B', 2]])
    expect(shannonEntropy(unnorm)).toBeCloseTo(1.0, 5) // same as 0.5/0.5
  })
})

describe('klDivergence', () => {
  it('returns 0 for identical distributions', () => {
    const p = new Map([['A', 0.5], ['B', 0.5]])
    expect(klDivergence(p, p)).toBeCloseTo(0, 5)
  })

  it('returns positive for different distributions', () => {
    const p = new Map([['A', 0.9], ['B', 0.1]])
    const q = new Map([['A', 0.5], ['B', 0.5]])
    expect(klDivergence(p, q)).toBeGreaterThan(0)
  })

  it('is asymmetric', () => {
    const p = new Map([['A', 0.9], ['B', 0.1]])
    const q = new Map([['A', 0.5], ['B', 0.5]])
    expect(klDivergence(p, q)).not.toBeCloseTo(klDivergence(q, p), 3)
  })

  it('returns Infinity when Q has zero where P has mass', () => {
    const p = new Map([['A', 0.5], ['B', 0.5]])
    const q = new Map([['A', 1.0]]) // no B
    expect(klDivergence(p, q)).toBe(Infinity)
  })
})

describe('jsDivergence', () => {
  it('returns 0 for identical distributions', () => {
    const p = new Map([['A', 0.5], ['B', 0.5]])
    expect(jsDivergence(p, p)).toBeCloseTo(0, 5)
  })

  it('is symmetric', () => {
    const p = new Map([['A', 0.9], ['B', 0.1]])
    const q = new Map([['A', 0.5], ['B', 0.5]])
    expect(jsDivergence(p, q)).toBeCloseTo(jsDivergence(q, p), 5)
  })

  it('is bounded between 0 and 1', () => {
    const p = new Map([['A', 1.0], ['B', 0.0]])
    const q = new Map([['A', 0.0], ['B', 1.0]])
    const js = jsDivergence(p, q)
    expect(js).toBeGreaterThanOrEqual(0)
    expect(js).toBeLessThanOrEqual(1.0001) // small epsilon for float
  })

  it('is always finite (unlike KL)', () => {
    const p = new Map([['A', 0.5], ['B', 0.5]])
    const q = new Map([['A', 1.0]]) // no B
    expect(jsDivergence(p, q)).toBeLessThan(Infinity)
  })
})

describe('EntropyTracker', () => {
  it('starts with zero entropy', () => {
    const tracker = new EntropyTracker()
    expect(tracker.entropy).toBe(0)
  })

  it('tracks entropy after setDistribution', () => {
    const tracker = new EntropyTracker()
    tracker.setDistribution(
      new Map([['A', 0.25], ['B', 0.25], ['C', 0.25], ['D', 0.25]]),
    )
    expect(tracker.entropy).toBeCloseTo(2.0, 5)
  })

  it('shouldContinue returns true when entropy above threshold', () => {
    const tracker = new EntropyTracker()
    tracker.setDistribution(new Map([['A', 0.5], ['B', 0.5]]))
    expect(tracker.shouldContinue(0.5)).toBe(true)
    expect(tracker.shouldContinue(1.5)).toBe(false)
  })

  it('shouldContinueNormalized works with any hypothesis count', () => {
    const tracker = new EntropyTracker()
    // Uniform over 8 options -> normalized = 1.0
    const dist = new Map<string, number>()
    for (let i = 0; i < 8; i++) dist.set(`H${i}`, 1 / 8)
    tracker.setDistribution(dist)

    expect(tracker.shouldContinueNormalized(0.9)).toBe(true)
    expect(tracker.shouldContinueNormalized(1.1)).toBe(false)
  })

  it('tracks information gain between rounds', () => {
    const tracker = new EntropyTracker()
    tracker.setDistribution(
      new Map([['A', 0.25], ['B', 0.25], ['C', 0.25], ['D', 0.25]]),
    )
    tracker.setDistribution(
      new Map([['A', 0.7], ['B', 0.1], ['C', 0.1], ['D', 0.1]]),
    )

    const gain = tracker.informationGain()
    expect(gain.gain).toBeGreaterThan(0)
    expect(gain.before).toBeCloseTo(2.0, 1)
    expect(gain.after).toBeLessThan(gain.before)
    expect(gain.relativeGain).toBeGreaterThan(0)
    expect(gain.relativeGain).toBeLessThanOrEqual(1)
  })

  it('analyze returns full entropy info', () => {
    const tracker = new EntropyTracker()
    tracker.setDistribution(new Map([['A', 0.5], ['B', 0.5]]))

    const result = tracker.analyze()
    expect(result.entropy).toBeCloseTo(1.0, 5)
    expect(result.maxEntropy).toBeCloseTo(1.0, 5) // log₂(2)
    expect(result.normalized).toBeCloseTo(1.0, 5)
    expect(result.hypothesisCount).toBe(2)
  })

  it('predictRoundsToConverge estimates remaining rounds', () => {
    const tracker = new EntropyTracker()

    // Simulate entropy decreasing 0.5 bits per round
    tracker.setDistribution(new Map([['A', 0.25], ['B', 0.25], ['C', 0.25], ['D', 0.25]]))
    // H = 2.0
    tracker.setDistribution(new Map([['A', 0.5], ['B', 0.2], ['C', 0.2], ['D', 0.1]]))
    // H ≈ 1.8

    const rounds = tracker.predictRoundsToConverge(0.5)
    expect(rounds).toBeGreaterThan(0)
    expect(rounds).toBeLessThan(100)
  })

  it('averageGainPerRound computes correctly', () => {
    const tracker = new EntropyTracker()
    tracker.setDistribution(new Map([['A', 0.25], ['B', 0.25], ['C', 0.25], ['D', 0.25]]))
    tracker.setDistribution(new Map([['A', 0.7], ['B', 0.1], ['C', 0.1], ['D', 0.1]]))

    const avg = tracker.averageGainPerRound()
    expect(avg).toBeGreaterThan(0)
  })

  it('reset clears all state', () => {
    const tracker = new EntropyTracker()
    tracker.setDistribution(new Map([['A', 0.5], ['B', 0.5]]))
    tracker.reset()

    expect(tracker.roundCount).toBe(0)
    expect(tracker.entropy).toBe(0)
    expect(tracker.getHistory()).toHaveLength(0)
  })
})
