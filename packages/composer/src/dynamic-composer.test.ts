import { describe, it, expect, vi } from 'vitest'
import type { LlmProvider } from '@cognitive-engine/core'
import type { SwarmAgentDef } from '@cognitive-swarm/core'
import { DynamicComposer } from './dynamic-composer.js'
import type { AgentCandidate } from './types.js'

function mockLlm(keywords = 'security, authentication, review'): LlmProvider {
  return {
    complete: vi.fn(async () => ({
      content: keywords,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop' as const,
    })),
    completeJson: vi.fn(async () => ({
      content: keywords,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop' as const,
      parsed: {},
    })),
  }
}

function makeDef(id: string, role: string, weight = 1): SwarmAgentDef {
  return {
    config: {
      id,
      name: id,
      role,
      personality: { curiosity: 0.5, caution: 0.5, conformity: 0.5, verbosity: 0.5 },
      listens: ['task:new'],
      canEmit: ['proposal'],
      weight,
    },
    engine: {
      llm: mockLlm(),
      embedding: {
        embed: vi.fn(async () => [0, 0, 0]),
        embedBatch: vi.fn(async () => []),
        dimensions: 3,
      },
      store: {
        save: vi.fn(),
        search: vi.fn(async () => []),
        delete: vi.fn(),
      },
    },
  }
}

function makeCandidate(
  id: string,
  role: string,
  tags: string[],
  reputation?: number,
): AgentCandidate {
  return {
    def: makeDef(id, role),
    tags,
    reputationWeight: reputation,
  }
}

describe('DynamicComposer', () => {
  it('returns empty for no candidates', async () => {
    const composer = new DynamicComposer(mockLlm())
    const result = await composer.compose('test task', [])
    expect(result.selected).toHaveLength(0)
  })

  it('selects agents matching task keywords', async () => {
    const composer = new DynamicComposer(mockLlm('security, auth'))
    const candidates = [
      makeCandidate('sec', 'security-reviewer', ['security', 'vulnerability']),
      makeCandidate('perf', 'perf-reviewer', ['performance', 'optimization']),
    ]

    const result = await composer.compose('Review auth for security', candidates)
    expect(result.selected.length).toBeGreaterThan(0)

    // Security agent should be selected (tag match)
    const selectedIds = result.selected.map((s) => s.config.id)
    expect(selectedIds).toContain('sec')
  })

  it('respects maxAgents', async () => {
    const composer = new DynamicComposer(mockLlm(), { maxAgents: 2 })
    const candidates = [
      makeCandidate('a1', 'r1', ['security']),
      makeCandidate('a2', 'r2', ['auth']),
      makeCandidate('a3', 'r3', ['review']),
    ]

    const result = await composer.compose('task', candidates)
    expect(result.selected.length).toBeLessThanOrEqual(2)
  })

  it('ensures minAgents', async () => {
    const composer = new DynamicComposer(mockLlm('unrelated'), { minAgents: 2 })
    const candidates = [
      makeCandidate('a1', 'r1', ['x']),
      makeCandidate('a2', 'r2', ['y']),
    ]

    const result = await composer.compose('task', candidates)
    expect(result.selected.length).toBeGreaterThanOrEqual(2)
  })

  it('avoids duplicate roles', async () => {
    const composer = new DynamicComposer(mockLlm('security'), {
      minAgents: 1,
      maxAgents: 5,
    })
    const candidates = [
      makeCandidate('a1', 'reviewer', ['security']),
      makeCandidate('a2', 'reviewer', ['security']), // Same role
      makeCandidate('a3', 'analyst', ['auth']),
    ]

    const result = await composer.compose('task', candidates)
    const roles = result.selected.map((s) => s.config.role)
    const uniqueRoles = new Set(roles)
    // Should prefer diverse roles
    expect(uniqueRoles.size).toBe(roles.length)
  })

  it('reasoning explains selection', async () => {
    const composer = new DynamicComposer(mockLlm('security'))
    const candidates = [makeCandidate('a1', 'reviewer', ['security'])]

    const result = await composer.compose('task', candidates)
    expect(result.reasoning.length).toBeGreaterThan(0)
    expect(result.reasoning[0]!.action).toBe('selected')
    expect(result.reasoning[0]!.agentId).toBe('a1')
  })

  it('totalWeight sums selected agent weights', async () => {
    const composer = new DynamicComposer(mockLlm('security'))
    const candidates = [
      { def: makeDef('a1', 'r1', 1.5), tags: ['security'] },
      { def: makeDef('a2', 'r2', 2.0), tags: ['auth'] },
    ]

    const result = await composer.compose('task', candidates)
    expect(result.totalWeight).toBeGreaterThan(0)
  })

  it('suggestReinforcement picks complementary agent', async () => {
    const composer = new DynamicComposer(mockLlm('security, design'))
    const current = [makeDef('sec', 'security-reviewer')]
    const candidates = [
      makeCandidate('sec', 'security-reviewer', ['security']),
      makeCandidate('arch', 'architect', ['design', 'architecture']),
    ]

    const suggestion = await composer.suggestReinforcement(
      'Review security and architecture',
      current,
      candidates,
    )

    expect(suggestion).not.toBeNull()
    expect(suggestion!.config.id).toBe('arch')
  })

  it('suggestReinforcement returns null when no candidates', async () => {
    const composer = new DynamicComposer(mockLlm())
    const current = [makeDef('a1', 'r1')]

    const suggestion = await composer.suggestReinforcement('task', current, [
      makeCandidate('a1', 'r1', ['x']), // Already in swarm
    ])

    expect(suggestion).toBeNull()
  })

  it('suggestPrune identifies low-contribution agents', () => {
    const composer = new DynamicComposer(mockLlm())
    const activities = [
      { agentId: 'active', signalsSent: 10, proposalsMade: 5, challengesMade: 2, avgConfidence: 0.8 },
      { agentId: 'idle', signalsSent: 0, proposalsMade: 0, challengesMade: 0, avgConfidence: 0 },
      { agentId: 'moderate', signalsSent: 3, proposalsMade: 1, challengesMade: 0, avgConfidence: 0.5 },
    ]

    const toPrune = composer.suggestPrune(activities, 0.2)
    expect(toPrune).toContain('idle')
    expect(toPrune).not.toContain('active')
  })

  it('suggestPrune preserves minAgents', () => {
    const composer = new DynamicComposer(mockLlm(), { minAgents: 2 })
    const activities = [
      { agentId: 'a1', signalsSent: 0, proposalsMade: 0, challengesMade: 0, avgConfidence: 0 },
      { agentId: 'a2', signalsSent: 0, proposalsMade: 0, challengesMade: 0, avgConfidence: 0 },
    ]

    // Even though both are idle, can't prune below minAgents
    const toPrune = composer.suggestPrune(activities, 0.5)
    expect(toPrune).toHaveLength(0)
  })

  it('suggestPrune returns empty when all contribute', () => {
    const composer = new DynamicComposer(mockLlm())
    const activities = [
      { agentId: 'a1', signalsSent: 10, proposalsMade: 5, challengesMade: 1, avgConfidence: 0.8 },
      { agentId: 'a2', signalsSent: 8, proposalsMade: 4, challengesMade: 2, avgConfidence: 0.7 },
    ]

    const toPrune = composer.suggestPrune(activities, 0.2)
    expect(toPrune).toHaveLength(0)
  })
})
