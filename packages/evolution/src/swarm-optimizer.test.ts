import { describe, it, expect } from 'vitest'
import { SwarmOptimizer } from './swarm-optimizer.js'
import type { AgentProfile, PairwiseSimilarity } from './swarm-optimizer.js'

function profile(
  id: string,
  overrides?: Partial<AgentProfile>,
): AgentProfile {
  return {
    id,
    role: `role-${id}`,
    personality: {
      curiosity: 0.5,
      caution: 0.5,
      conformity: 0.5,
      verbosity: 0.5,
    },
    accuracy: 0.7,
    contributions: 10,
    ...overrides,
  }
}

describe('SwarmOptimizer', () => {
  it('detects redundant agent pairs', () => {
    const optimizer = new SwarmOptimizer({ redundancyThreshold: 0.8 })

    const profiles = [profile('a1'), profile('a2'), profile('a3')]
    const similarities: PairwiseSimilarity[] = [
      { agentA: 'a1', agentB: 'a2', nmi: 0.95 }, // Redundant
      { agentA: 'a1', agentB: 'a3', nmi: 0.2 },
      { agentA: 'a2', agentB: 'a3', nmi: 0.3 },
    ]

    const merges = optimizer.detectRedundancy(similarities, profiles)
    expect(merges).toHaveLength(1)
    expect(merges[0]!.agentA).toBe('a1')
    expect(merges[0]!.agentB).toBe('a2')
    expect(merges[0]!.similarity).toBe(0.95)
  })

  it('no redundancy when all agents are different', () => {
    const optimizer = new SwarmOptimizer()
    const profiles = [profile('a1'), profile('a2')]
    const similarities: PairwiseSimilarity[] = [
      { agentA: 'a1', agentB: 'a2', nmi: 0.1 },
    ]

    const merges = optimizer.detectRedundancy(similarities, profiles)
    expect(merges).toHaveLength(0)
  })

  it('merged personality is contribution-weighted average', () => {
    const optimizer = new SwarmOptimizer({ redundancyThreshold: 0.5 })

    const profiles = [
      profile('a1', {
        contributions: 10,
        personality: { curiosity: 1, caution: 0, conformity: 0, verbosity: 0 },
      }),
      profile('a2', {
        contributions: 10,
        personality: { curiosity: 0, caution: 1, conformity: 0, verbosity: 0 },
      }),
    ]
    const similarities: PairwiseSimilarity[] = [
      { agentA: 'a1', agentB: 'a2', nmi: 0.9 },
    ]

    const merges = optimizer.detectRedundancy(similarities, profiles)
    expect(merges[0]!.mergedPersonality.curiosity).toBeCloseTo(0.5)
    expect(merges[0]!.mergedPersonality.caution).toBeCloseTo(0.5)
  })

  it('tunes cautious underperformer - lower caution, raise curiosity', () => {
    const optimizer = new SwarmOptimizer({ tuningThreshold: 0.2 })
    const profiles = [
      profile('a1', {
        accuracy: 0.3,
        contributions: 10,
        personality: { curiosity: 0.3, caution: 0.9, conformity: 0.5, verbosity: 0.5 },
      }),
    ]

    const tunings = optimizer.tunePersonalities(profiles)
    expect(tunings).toHaveLength(1)
    expect(tunings[0]!.suggested.caution).toBeLessThan(0.9)
    expect(tunings[0]!.suggested.curiosity).toBeGreaterThan(0.3)
  })

  it('tunes contrarian underperformer - raise conformity', () => {
    const optimizer = new SwarmOptimizer()
    const profiles = [
      profile('a1', {
        accuracy: 0.2,
        contributions: 10,
        personality: { curiosity: 0.5, caution: 0.5, conformity: 0.1, verbosity: 0.5 },
      }),
    ]

    const tunings = optimizer.tunePersonalities(profiles)
    expect(tunings).toHaveLength(1)
    expect(tunings[0]!.suggested.conformity).toBeGreaterThan(0.1)
  })

  it('no tuning for well-performing agents', () => {
    const optimizer = new SwarmOptimizer()
    const profiles = [profile('a1', { accuracy: 0.9, contributions: 20 })]

    const tunings = optimizer.tunePersonalities(profiles)
    expect(tunings).toHaveLength(0)
  })

  it('no tuning for agents with few contributions', () => {
    const optimizer = new SwarmOptimizer()
    const profiles = [
      profile('a1', {
        accuracy: 0.1,
        contributions: 2, // Too few
        personality: { curiosity: 0.1, caution: 0.9, conformity: 0.5, verbosity: 0.5 },
      }),
    ]

    const tunings = optimizer.tunePersonalities(profiles)
    expect(tunings).toHaveLength(0)
  })

  it('suggests reducing size when agents are redundant', () => {
    const optimizer = new SwarmOptimizer({ redundancyThreshold: 0.7 })
    const profiles = [
      profile('a1', { contributions: 10 }),
      profile('a2', { contributions: 8 }),
      profile('a3', { contributions: 5 }),
    ]
    const similarities: PairwiseSimilarity[] = [
      { agentA: 'a1', agentB: 'a2', nmi: 0.3 },
      { agentA: 'a1', agentB: 'a3', nmi: 0.9 }, // a3 is redundant with a1
      { agentA: 'a2', agentB: 'a3', nmi: 0.85 }, // a3 is redundant with a2
    ]

    const size = optimizer.suggestOptimalSize(profiles, similarities)
    expect(size).toBeLessThan(profiles.length)
  })

  it('keeps all agents when none are redundant', () => {
    const optimizer = new SwarmOptimizer({ redundancyThreshold: 0.8 })
    const profiles = [
      profile('a1', { contributions: 10 }),
      profile('a2', { contributions: 10 }),
    ]
    const similarities: PairwiseSimilarity[] = [
      { agentA: 'a1', agentB: 'a2', nmi: 0.1 },
    ]

    const size = optimizer.suggestOptimalSize(profiles, similarities)
    expect(size).toBe(2)
  })

  it('returns current size for small swarms', () => {
    const optimizer = new SwarmOptimizer()
    const profiles = [profile('a1')]

    const size = optimizer.suggestOptimalSize(profiles, [])
    expect(size).toBe(1)
  })
})
