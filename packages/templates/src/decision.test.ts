import { describe, it, expect, vi } from 'vitest'
import type { EngineConfig } from '@cognitive-engine/core'
import type { TemplateProviders } from './shared.js'
import { decisionTemplate } from './decision.js'

function createProviders(): TemplateProviders {
  return {
    engine: {
      llm: { complete: vi.fn(), completeJson: vi.fn() },
      embedding: { embed: vi.fn(), embedBatch: vi.fn() },
      store: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn(), has: vi.fn() },
    } as unknown as EngineConfig,
  }
}

describe('decisionTemplate', () => {
  it('creates 6 agents', () => {
    const config = decisionTemplate(createProviders())
    expect(config.agents).toHaveLength(6)
  })

  it('includes pros, cons, risks, opportunities, devils-advocate, judge', () => {
    const config = decisionTemplate(createProviders())
    const ids = config.agents.map((a) => a.config.id)

    expect(ids).toContain('pros')
    expect(ids).toContain('cons')
    expect(ids).toContain('risks')
    expect(ids).toContain('opportunities')
    expect(ids).toContain('devils-advocate')
    expect(ids).toContain('judge')
  })

  it('judge has highest weight', () => {
    const config = decisionTemplate(createProviders())
    const judge = config.agents.find((a) => a.config.id === 'judge')
    const maxWeight = Math.max(
      ...config.agents.map((a) => a.config.weight ?? 1),
    )
    expect(judge?.config.weight).toBe(maxWeight)
  })

  it('uses hierarchical consensus strategy', () => {
    const config = decisionTemplate(createProviders())
    expect(config.consensus?.strategy).toBe('hierarchical')
  })

  it('requires at least 4 voters', () => {
    const config = decisionTemplate(createProviders())
    expect(config.consensus?.minVoters).toBe(4)
  })

  it('devils-advocate can emit challenges', () => {
    const config = decisionTemplate(createProviders())
    const devil = config.agents.find(
      (a) => a.config.id === 'devils-advocate',
    )
    expect(devil?.config.canEmit).toContain('challenge')
    expect(devil?.config.canEmit).toContain('doubt')
  })

  it('cons advocate listens to proposals', () => {
    const config = decisionTemplate(createProviders())
    const cons = config.agents.find((a) => a.config.id === 'cons')
    expect(cons?.config.listens).toContain('proposal')
  })

  it('uses strict entropy threshold for decisive convergence', () => {
    const config = decisionTemplate(createProviders())
    expect(config.math).toBeDefined()
    expect(config.math!.entropyThreshold).toBe(0.2)
    expect(config.math!.minInformationGain).toBe(0.05)
  })
})
