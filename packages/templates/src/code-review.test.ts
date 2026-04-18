import { describe, it, expect, vi } from 'vitest'
import type { EngineConfig } from '@cognitive-engine/core'
import type { TemplateProviders } from './shared.js'
import { codeReviewTemplate } from './code-review.js'

function createProviders(): TemplateProviders {
  return {
    engine: {
      llm: { complete: vi.fn(), completeJson: vi.fn() },
      embedding: { embed: vi.fn(), embedBatch: vi.fn() },
      store: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn(), has: vi.fn() },
    } as unknown as EngineConfig,
  }
}

describe('codeReviewTemplate', () => {
  it('creates 5 agents', () => {
    const config = codeReviewTemplate(createProviders())
    expect(config.agents).toHaveLength(5)
  })

  it('includes security, performance, architecture, edge-cases, synthesizer', () => {
    const config = codeReviewTemplate(createProviders())
    const ids = config.agents.map((a) => a.config.id)

    expect(ids).toContain('security')
    expect(ids).toContain('performance')
    expect(ids).toContain('architecture')
    expect(ids).toContain('edge-cases')
    expect(ids).toContain('synthesizer')
  })

  it('security agent has elevated weight', () => {
    const config = codeReviewTemplate(createProviders())
    const security = config.agents.find((a) => a.config.id === 'security')
    expect(security?.config.weight).toBeGreaterThan(1)
  })

  it('synthesizer listens to discoveries and challenges', () => {
    const config = codeReviewTemplate(createProviders())
    const synth = config.agents.find((a) => a.config.id === 'synthesizer')
    expect(synth?.config.listens).toContain('discovery')
    expect(synth?.config.listens).toContain('challenge')
  })

  it('all agents listen to task:new or discovery', () => {
    const config = codeReviewTemplate(createProviders())
    for (const agent of config.agents) {
      const listensToTaskOrDiscovery =
        agent.config.listens.includes('task:new') ||
        agent.config.listens.includes('discovery')
      expect(listensToTaskOrDiscovery).toBe(true)
    }
  })

  it('uses confidence-weighted consensus', () => {
    const config = codeReviewTemplate(createProviders())
    expect(config.consensus?.strategy).toBe('confidence-weighted')
  })

  it('requires at least 3 voters', () => {
    const config = codeReviewTemplate(createProviders())
    expect(config.consensus?.minVoters).toBe(3)
  })

  it('includes tuned math config', () => {
    const config = codeReviewTemplate(createProviders())
    expect(config.math).toBeDefined()
    expect(config.math!.entropyThreshold).toBe(0.25)
    expect(config.math!.minInformationGain).toBe(0.04)
    expect(config.math!.redundancyThreshold).toBe(0.8)
  })
})
