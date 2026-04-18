import { describe, it, expect } from 'vitest'
import { ReputationTracker } from './reputation-tracker.js'

describe('ReputationTracker', () => {
  it('starts with no records', () => {
    const tracker = new ReputationTracker()
    expect(tracker.recordCount).toBe(0)
    expect(tracker.getAllAgentIds()).toHaveLength(0)
  })

  it('records performance updates', () => {
    const tracker = new ReputationTracker()
    tracker.update('a1', 'code-review', true)
    tracker.update('a2', 'code-review', false)
    expect(tracker.recordCount).toBe(2)
    expect(tracker.getAllAgentIds()).toHaveLength(2)
  })

  it('weight uses Bayesian prior (Beta distribution)', () => {
    const tracker = new ReputationTracker({
      priorSuccesses: 1,
      priorFailures: 1,
    })

    // No data -> prior mean = 1 / (1+1) = 0.5
    expect(tracker.getWeight('unknown', 'any')).toBeCloseTo(0.5)

    // 1 success -> (1+1) / (1+1+1) = 2/3 ~ 0.667
    tracker.update('a1', 'review', true)
    expect(tracker.getWeight('a1', 'review')).toBeCloseTo(2 / 3, 2)
  })

  it('weight converges to raw accuracy with many samples', () => {
    const tracker = new ReputationTracker()

    // 80 successes, 20 failures -> raw accuracy = 0.8
    for (let i = 0; i < 80; i++) tracker.update('a1', 'task', true)
    for (let i = 0; i < 20; i++) tracker.update('a1', 'task', false)

    // With prior (1,1), weight = 81/102 ~ 0.794 - very close to 0.8
    expect(tracker.getWeight('a1', 'task')).toBeCloseTo(0.8, 1)
  })

  it('good agent has higher weight than bad agent', () => {
    const tracker = new ReputationTracker()

    for (let i = 0; i < 10; i++) tracker.update('good', 'task', true)
    for (let i = 0; i < 10; i++) tracker.update('bad', 'task', false)

    expect(tracker.getWeight('good', 'task')).toBeGreaterThan(
      tracker.getWeight('bad', 'task'),
    )
  })

  it('getScore returns detailed breakdown', () => {
    const tracker = new ReputationTracker()
    tracker.update('a1', 'review', true)
    tracker.update('a1', 'review', true)
    tracker.update('a1', 'review', false)

    const score = tracker.getScore('a1', 'review')
    expect(score.successes).toBe(2)
    expect(score.failures).toBe(1)
    expect(score.total).toBe(3)
    expect(score.accuracy).toBeCloseTo(2 / 3, 5)
    expect(score.weight).toBeGreaterThan(0)
  })

  it('getProfile identifies strengths and weaknesses', () => {
    const tracker = new ReputationTracker({
      strengthThreshold: 0.7,
      weaknessThreshold: 0.4,
    })

    // Strong at reviews (90% accuracy)
    for (let i = 0; i < 9; i++) tracker.update('a1', 'review', true)
    tracker.update('a1', 'review', false)

    // Weak at debugging (20% accuracy)
    for (let i = 0; i < 2; i++) tracker.update('a1', 'debug', true)
    for (let i = 0; i < 8; i++) tracker.update('a1', 'debug', false)

    const profile = tracker.getProfile('a1')
    expect(profile.strengths).toContain('review')
    expect(profile.weaknesses).toContain('debug')
    expect(profile.strengths).not.toContain('debug')
    expect(profile.weaknesses).not.toContain('review')
  })

  it('profile requires minimum samples for strength/weakness', () => {
    const tracker = new ReputationTracker()

    // Only 2 samples - not enough to classify
    tracker.update('a1', 'task', true)
    tracker.update('a1', 'task', true)

    const profile = tracker.getProfile('a1')
    expect(profile.strengths).toHaveLength(0)
    expect(profile.weaknesses).toHaveLength(0)
  })

  it('profile overall aggregates across task types', () => {
    const tracker = new ReputationTracker()
    tracker.update('a1', 'review', true)
    tracker.update('a1', 'debug', false)

    const profile = tracker.getProfile('a1')
    expect(profile.overall.total).toBe(2)
    expect(profile.overall.successes).toBe(1)
  })

  it('rankAgents sorts by weight', () => {
    const tracker = new ReputationTracker()

    for (let i = 0; i < 10; i++) tracker.update('best', 'task', true)
    for (let i = 0; i < 5; i++) {
      tracker.update('mid', 'task', true)
      tracker.update('mid', 'task', false)
    }
    for (let i = 0; i < 10; i++) tracker.update('worst', 'task', false)

    const ranking = tracker.rankAgents('task')
    expect(ranking[0]!.agentId).toBe('best')
    expect(ranking[ranking.length - 1]!.agentId).toBe('worst')
  })

  it('rankAgents works without task type filter', () => {
    const tracker = new ReputationTracker()
    tracker.update('a1', 'review', true)
    tracker.update('a2', 'debug', false)

    const ranking = tracker.rankAgents()
    expect(ranking).toHaveLength(2)
  })

  it('trend is zero with insufficient data', () => {
    const tracker = new ReputationTracker({ trendWindow: 10 })
    tracker.update('a1', 'task', true)

    const score = tracker.getScore('a1', 'task')
    expect(score.trend).toBe(0)
  })

  it('trend detects improvement', () => {
    const tracker = new ReputationTracker({ trendWindow: 5 })

    // Start bad
    for (let i = 0; i < 10; i++) tracker.update('a1', 'task', false)
    // Improve recently
    for (let i = 0; i < 5; i++) tracker.update('a1', 'task', true)

    const score = tracker.getScore('a1', 'task')
    expect(score.trend).toBeGreaterThan(0)
  })

  it('trend detects decline', () => {
    const tracker = new ReputationTracker({ trendWindow: 5 })

    // Start good
    for (let i = 0; i < 10; i++) tracker.update('a1', 'task', true)
    // Decline recently
    for (let i = 0; i < 5; i++) tracker.update('a1', 'task', false)

    const score = tracker.getScore('a1', 'task')
    expect(score.trend).toBeLessThan(0)
  })

  it('updateBatch records multiple entries', () => {
    const tracker = new ReputationTracker()
    tracker.updateBatch([
      { agentId: 'a1', taskType: 't', wasCorrect: true, timestamp: 1 },
      { agentId: 'a2', taskType: 't', wasCorrect: false, timestamp: 2 },
    ])
    expect(tracker.recordCount).toBe(2)
  })

  it('reset clears all data', () => {
    const tracker = new ReputationTracker()
    tracker.update('a1', 'task', true)
    tracker.reset()
    expect(tracker.recordCount).toBe(0)
    expect(tracker.getAllAgentIds()).toHaveLength(0)
  })

  it('per-task-type weights are independent', () => {
    const tracker = new ReputationTracker()

    for (let i = 0; i < 10; i++) tracker.update('a1', 'review', true)
    for (let i = 0; i < 10; i++) tracker.update('a1', 'debug', false)

    expect(tracker.getWeight('a1', 'review')).toBeGreaterThan(0.7)
    expect(tracker.getWeight('a1', 'debug')).toBeLessThan(0.3)
  })
})
