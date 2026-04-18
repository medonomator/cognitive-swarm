import { describe, it, expect, vi } from 'vitest'
import type { EngineConfig } from '@cognitive-engine/core'
import type { TemplateProviders } from './shared.js'
import { researchTemplate } from './research.js'

function createProviders(): TemplateProviders {
  return {
    engine: {
      llm: { complete: vi.fn(), completeJson: vi.fn() },
      embedding: { embed: vi.fn(), embedBatch: vi.fn() },
      store: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn(), has: vi.fn() },
    } as unknown as EngineConfig,
  }
}

describe('researchTemplate', () => {
  it('creates 5 agents', () => {
    const config = researchTemplate(createProviders())
    expect(config.agents).toHaveLength(5)
  })

  it('includes two explorers, fact-checker, critic, synthesizer', () => {
    const config = researchTemplate(createProviders())
    const ids = config.agents.map((a) => a.config.id)

    expect(ids).toContain('explorer-a')
    expect(ids).toContain('explorer-b')
    expect(ids).toContain('fact-checker')
    expect(ids).toContain('critic')
    expect(ids).toContain('synthesizer')
  })

  it('explorers can emit discoveries and proposals', () => {
    const config = researchTemplate(createProviders())
    const explorerA = config.agents.find((a) => a.config.id === 'explorer-a')
    expect(explorerA?.config.canEmit).toContain('discovery')
    expect(explorerA?.config.canEmit).toContain('proposal')
  })

  it('fact-checker has elevated weight', () => {
    const config = researchTemplate(createProviders())
    const fc = config.agents.find((a) => a.config.id === 'fact-checker')
    expect(fc?.config.weight).toBeGreaterThan(1)
  })

  it('critic can emit challenges', () => {
    const config = researchTemplate(createProviders())
    const critic = config.agents.find((a) => a.config.id === 'critic')
    expect(critic?.config.canEmit).toContain('challenge')
  })

  it('sets maxRounds to 6', () => {
    const config = researchTemplate(createProviders())
    expect(config.maxRounds).toBe(6)
  })

  it('uses higher entropy threshold for more exploration', () => {
    const config = researchTemplate(createProviders())
    expect(config.math).toBeDefined()
    expect(config.math!.entropyThreshold).toBe(0.4)
    expect(config.math!.redundancyThreshold).toBe(0.6)
  })
})
