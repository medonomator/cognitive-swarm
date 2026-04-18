import { describe, it, expect } from 'vitest'
import { MarkovChain } from './markov.js'

describe('MarkovChain', () => {
  it('starts with no states', () => {
    const mc = new MarkovChain()
    expect(mc.observedStates.size).toBe(0)
    expect(mc.transitionCount).toBe(0)
  })

  it('records transitions correctly', () => {
    const mc = new MarkovChain()
    mc.observe('A', 'B')
    mc.observe('A', 'B')
    mc.observe('A', 'C')

    expect(mc.transitionProbability('A', 'B')).toBeCloseTo(2 / 3, 5)
    expect(mc.transitionProbability('A', 'C')).toBeCloseTo(1 / 3, 5)
  })

  it('returns 0 for unobserved transitions', () => {
    const mc = new MarkovChain()
    mc.observe('A', 'B')

    expect(mc.transitionProbability('A', 'C')).toBe(0)
    expect(mc.transitionProbability('X', 'Y')).toBe(0)
  })

  it('observeSequence records consecutive transitions', () => {
    const mc = new MarkovChain()
    mc.observeSequence(['A', 'B', 'C', 'B', 'C'])

    expect(mc.transitionProbability('A', 'B')).toBe(1.0)
    expect(mc.transitionProbability('B', 'C')).toBe(1.0)
    expect(mc.transitionProbability('C', 'B')).toBe(1.0)
    expect(mc.transitionCount).toBe(4)
  })

  it('transitionRow returns full row', () => {
    const mc = new MarkovChain()
    mc.observe('A', 'B')
    mc.observe('A', 'B')
    mc.observe('A', 'C')

    const row = mc.transitionRow('A')
    expect(row.get('B')).toBeCloseTo(2 / 3, 5)
    expect(row.get('C')).toBeCloseTo(1 / 3, 5)
  })

  it('getTransitionMatrix builds correct matrix', () => {
    const mc = new MarkovChain()
    mc.observe('A', 'B')
    mc.observe('B', 'A')

    const { states, matrix } = mc.getTransitionMatrix()
    expect(states).toHaveLength(2)

    // Each state transitions to the other with probability 1
    const aIdx = states.indexOf('A')
    const bIdx = states.indexOf('B')
    expect(matrix[aIdx]![bIdx]).toBe(1.0)
    expect(matrix[bIdx]![aIdx]).toBe(1.0)
  })

  it('computeStationaryDistribution returns valid distribution', () => {
    const mc = new MarkovChain()
    // Simple symmetric chain: A ↔ B
    mc.observe('A', 'B')
    mc.observe('B', 'A')

    const dist = mc.computeStationaryDistribution()
    let sum = 0
    for (const p of dist.values()) sum += p

    expect(sum).toBeCloseTo(1.0, 5)
    // Symmetric chain -> uniform stationary distribution
    expect(dist.get('A')).toBeCloseTo(0.5, 2)
    expect(dist.get('B')).toBeCloseTo(0.5, 2)
  })

  it('stationary distribution reflects asymmetric transitions', () => {
    const mc = new MarkovChain()
    // A -> B with p=1, B -> A with p=0.5, B -> B with p=0.5
    mc.observe('A', 'B')
    mc.observe('B', 'A')
    mc.observe('B', 'B')

    const dist = mc.computeStationaryDistribution()
    // B should have more stationary mass (it has a self-loop)
    expect(dist.get('B')!).toBeGreaterThan(dist.get('A')!)
  })

  it('detectCycles finds mutual transitions', () => {
    const mc = new MarkovChain()
    // Create a strong A ↔ B cycle
    for (let i = 0; i < 10; i++) {
      mc.observe('A', 'B')
      mc.observe('B', 'A')
    }

    const report = mc.detectCycles(0.3)
    expect(report.detected).toBe(true)
    expect(report.states).toContain('A')
    expect(report.states).toContain('B')
    expect(report.cycleMass).toBeGreaterThan(0)
  })

  it('detectCycles reports no cycle for linear flow', () => {
    const mc = new MarkovChain()
    mc.observe('A', 'B')
    mc.observe('B', 'C')
    mc.observe('C', 'D')

    const report = mc.detectCycles()
    // Linear flow - no mutual transitions
    expect(report.states).toHaveLength(0)
  })

  it('predictConvergence estimates reaching target', () => {
    const mc = new MarkovChain()
    // Simple chain: A -> B -> C (absorbing)
    for (let i = 0; i < 20; i++) {
      mc.observe('A', 'B')
      mc.observe('B', 'C')
      mc.observe('C', 'C') // absorbing
    }

    const pred = mc.predictConvergence('C', 10, 500, 'A')
    expect(pred.probability).toBeGreaterThan(0.8)
    expect(pred.expectedSteps).toBeGreaterThan(0)
    expect(pred.expectedSteps).toBeLessThan(5)
  })

  it('predictConvergence returns low probability for unreachable state', () => {
    const mc = new MarkovChain()
    mc.observe('A', 'B')
    mc.observe('B', 'A')
    // C is never reached from A or B

    const pred = mc.predictConvergence('C', 10, 500, 'A')
    expect(pred.probability).toBe(0)
  })

  it('reset clears all data', () => {
    const mc = new MarkovChain()
    mc.observe('A', 'B')
    mc.observe('B', 'C')
    mc.reset()

    expect(mc.observedStates.size).toBe(0)
    expect(mc.transitionCount).toBe(0)
  })

  it('handles signal type sequences', () => {
    const mc = new MarkovChain()
    mc.observeSequence([
      'task:new',
      'discovery',
      'proposal',
      'vote',
      'consensus:reached',
    ])

    expect(mc.transitionProbability('task:new', 'discovery')).toBe(1.0)
    expect(mc.transitionProbability('vote', 'consensus:reached')).toBe(1.0)
    expect(mc.observedStates.size).toBe(5)
  })
})
