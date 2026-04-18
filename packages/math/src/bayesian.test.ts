import { describe, it, expect } from 'vitest'
import {
  BeliefNetwork,
  voteToLikelihoodRatio,
} from './bayesian.js'

describe('BeliefNetwork', () => {
  it('initializes with uniform priors', () => {
    const net = new BeliefNetwork(['A', 'B', 'C'])

    expect(net.posterior('A')).toBeCloseTo(1 / 3, 5)
    expect(net.posterior('B')).toBeCloseTo(1 / 3, 5)
    expect(net.posterior('C')).toBeCloseTo(1 / 3, 5)
  })

  it('posteriors sum to 1', () => {
    const net = new BeliefNetwork(['A', 'B', 'C', 'D'])
    net.update({ hypothesisId: 'A', likelihoodRatio: 3.0, weight: 1.0 })
    net.update({ hypothesisId: 'B', likelihoodRatio: 0.5, weight: 1.0 })

    const state = net.getState()
    let sum = 0
    for (const p of state.posteriors.values()) sum += p
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('supporting evidence increases posterior', () => {
    const net = new BeliefNetwork(['A', 'B'])
    const before = net.posterior('A')

    net.update({ hypothesisId: 'A', likelihoodRatio: 5.0, weight: 1.0 })
    expect(net.posterior('A')).toBeGreaterThan(before)
  })

  it('opposing evidence decreases posterior', () => {
    const net = new BeliefNetwork(['A', 'B'])
    const before = net.posterior('A')

    net.update({ hypothesisId: 'A', likelihoodRatio: 0.2, weight: 1.0 })
    expect(net.posterior('A')).toBeLessThan(before)
  })

  it('strong evidence shifts beliefs dramatically', () => {
    const net = new BeliefNetwork(['A', 'B', 'C'])
    // Strong evidence for A
    net.update({ hypothesisId: 'A', likelihoodRatio: 100, weight: 1.0 })

    expect(net.posterior('A')).toBeGreaterThan(0.9)
  })

  it('weight amplifies evidence effect', () => {
    const net1 = new BeliefNetwork(['A', 'B'])
    net1.update({ hypothesisId: 'A', likelihoodRatio: 2.0, weight: 1.0 })

    const net2 = new BeliefNetwork(['A', 'B'])
    net2.update({ hypothesisId: 'A', likelihoodRatio: 2.0, weight: 3.0 })

    // Higher weight -> stronger shift
    expect(net2.posterior('A')).toBeGreaterThan(net1.posterior('A'))
  })

  it('multiple evidence updates accumulate', () => {
    const net = new BeliefNetwork(['A', 'B', 'C'])

    // Three pieces of evidence for A
    net.update({ hypothesisId: 'A', likelihoodRatio: 2.0, weight: 1.0 })
    net.update({ hypothesisId: 'A', likelihoodRatio: 2.0, weight: 1.0 })
    net.update({ hypothesisId: 'A', likelihoodRatio: 2.0, weight: 1.0 })

    expect(net.posterior('A')).toBeGreaterThan(0.7)
    expect(net.evidenceCount).toBe(3)
  })

  it('conflicting evidence balances out', () => {
    const net = new BeliefNetwork(['A', 'B'])

    net.update({ hypothesisId: 'A', likelihoodRatio: 3.0, weight: 1.0 })
    net.update({ hypothesisId: 'B', likelihoodRatio: 3.0, weight: 1.0 })

    // Should roughly return to uniform
    expect(net.posterior('A')).toBeCloseTo(0.5, 1)
    expect(net.posterior('B')).toBeCloseTo(0.5, 1)
  })

  it('mapEstimate returns hypothesis with highest posterior', () => {
    const net = new BeliefNetwork(['A', 'B', 'C'])
    net.update({ hypothesisId: 'B', likelihoodRatio: 10, weight: 1.0 })

    const map = net.mapEstimate()
    expect(map.hypothesisId).toBe('B')
    expect(map.probability).toBeGreaterThan(0.7)
  })

  it('updateBatch is equivalent to sequential updates', () => {
    const evidence = [
      { hypothesisId: 'A', likelihoodRatio: 2.0, weight: 1.0 },
      { hypothesisId: 'B', likelihoodRatio: 3.0, weight: 0.5 },
      { hypothesisId: 'A', likelihoodRatio: 1.5, weight: 0.8 },
    ]

    const sequential = new BeliefNetwork(['A', 'B', 'C'])
    for (const e of evidence) sequential.update(e)

    const batch = new BeliefNetwork(['A', 'B', 'C'])
    batch.updateBatch(evidence)

    expect(batch.posterior('A')).toBeCloseTo(sequential.posterior('A'), 5)
    expect(batch.posterior('B')).toBeCloseTo(sequential.posterior('B'), 5)
    expect(batch.posterior('C')).toBeCloseTo(sequential.posterior('C'), 5)
  })

  it('addHypothesis redistributes probability', () => {
    const net = new BeliefNetwork(['A', 'B'])
    net.addHypothesis('C', 0.2)

    const state = net.getState()
    let sum = 0
    for (const p of state.posteriors.values()) sum += p
    expect(sum).toBeCloseTo(1.0, 5)
    expect(net.hypothesisCount).toBe(3)
  })

  it('throws on empty hypothesis list', () => {
    expect(() => new BeliefNetwork([])).toThrow()
  })

  it('ignores unknown hypothesis in update', () => {
    const net = new BeliefNetwork(['A', 'B'])
    net.update({ hypothesisId: 'UNKNOWN', likelihoodRatio: 10, weight: 1 })

    // Should remain unchanged
    expect(net.posterior('A')).toBeCloseTo(0.5, 5)
    expect(net.posterior('B')).toBeCloseTo(0.5, 5)
  })

  it('returns 0 for unknown hypothesis posterior', () => {
    const net = new BeliefNetwork(['A', 'B'])
    expect(net.posterior('UNKNOWN')).toBe(0)
  })
})

describe('voteToLikelihoodRatio', () => {
  it('agree returns > 1', () => {
    expect(voteToLikelihoodRatio('agree', 1.0)).toBe(2.0)
    expect(voteToLikelihoodRatio('agree', 2.0)).toBe(3.0)
  })

  it('disagree returns < 1', () => {
    expect(voteToLikelihoodRatio('disagree', 1.0)).toBe(0.5)
    expect(voteToLikelihoodRatio('disagree', 2.0)).toBeCloseTo(1 / 3, 5)
  })

  it('abstain returns exactly 1', () => {
    expect(voteToLikelihoodRatio('abstain', 5.0)).toBe(1.0)
  })

  it('higher weight means stronger evidence', () => {
    const lr1 = voteToLikelihoodRatio('agree', 1.0)
    const lr2 = voteToLikelihoodRatio('agree', 3.0)
    expect(lr2).toBeGreaterThan(lr1)
  })
})
