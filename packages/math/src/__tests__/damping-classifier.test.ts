import { describe, it, expect } from 'vitest'
import { DampingClassifier } from '../damping-classifier.js'

describe('DampingClassifier', () => {
  it('returns undetermined with fewer than 4 observations', () => {
    const c = new DampingClassifier()
    c.observe(1.0)
    c.observe(0.5)
    c.observe(0.2)

    const r = c.report()
    expect(r.regime).toBe('undetermined')
    expect(r.diagnostic).toContain('Insufficient data')
    expect(r.settlingRounds).toBeNull()
    expect(r.naturalFrequency).toBe(0)
  })

  it('classifies fast monotone convergence as overdamped', () => {
    const c = new DampingClassifier()
    // Sharp drop then plateau — equilibrium ≈ 0.1, all deviations positive → no crossings
    for (const v of [1.0, 0.2, 0.11, 0.1, 0.1]) c.observe(v)

    const r = c.report()
    expect(r.regime).toBe('overdamped')
    expect(r.dampingRatio).toBeGreaterThan(1.2)
    expect(r.oscillationCount).toBe(0)
    expect(r.diagnostic).toContain('very quickly')
  })

  it('classifies oscillating values as underdamped', () => {
    const c = new DampingClassifier()
    for (const v of [1.0, 0.3, 0.7, 0.2, 0.5, 0.15, 0.35]) c.observe(v)

    const r = c.report()
    expect(r.regime).toBe('underdamped')
    expect(r.dampingRatio).toBeLessThan(0.8)
    expect(r.oscillationCount).toBeGreaterThanOrEqual(2)
    expect(r.diagnostic).toContain('Oscillating')
  })

  it('classifies smooth convergence as critically-damped', () => {
    const c = new DampingClassifier()
    for (const v of [0.9, 0.6, 0.4, 0.33, 0.3, 0.29]) c.observe(v)

    const r = c.report()
    expect(r.regime).toBe('critically-damped')
    expect(r.dampingRatio).toBeGreaterThanOrEqual(0.8)
    expect(r.dampingRatio).toBeLessThanOrEqual(1.2)
    expect(r.diagnostic).toContain('Optimal convergence')
  })

  it('returns non-null settlingRounds when naturalFrequency > 0', () => {
    const c = new DampingClassifier()
    // Underdamped series has oscillations → non-zero frequency
    for (const v of [1.0, 0.3, 0.7, 0.2, 0.5, 0.15, 0.35]) c.observe(v)

    const r = c.report()
    expect(r.naturalFrequency).toBeGreaterThan(0)
    expect(r.settlingRounds).not.toBeNull()
    expect(r.settlingRounds).toBeGreaterThanOrEqual(1)
  })

  it('returns null settlingRounds when naturalFrequency is 0', () => {
    const c = new DampingClassifier()
    // Equilibrium = (1.0+1.0)/2 = 1.0; deviations = [4, 2, 1, 0, 0] — no crossings
    for (const v of [5.0, 3.0, 2.0, 1.0, 1.0]) c.observe(v)

    const r = c.report()
    expect(r.naturalFrequency).toBe(0)
    expect(r.settlingRounds).toBeNull()
  })

  it('reset() clears all state', () => {
    const c = new DampingClassifier()
    for (const v of [1.0, 0.5, 0.2, 0.1, 0.08]) c.observe(v)
    expect(c.roundCount).toBe(5)

    c.reset()

    expect(c.roundCount).toBe(0)
    const r = c.report()
    expect(r.regime).toBe('undetermined')
  })

  it('tracks roundCount correctly', () => {
    const c = new DampingClassifier()
    expect(c.roundCount).toBe(0)

    c.observe(0.5)
    expect(c.roundCount).toBe(1)

    c.observe(0.3)
    c.observe(0.1)
    expect(c.roundCount).toBe(3)
  })
})
