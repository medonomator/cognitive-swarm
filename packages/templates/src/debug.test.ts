import { describe, it, expect, vi } from 'vitest'
import type { EngineConfig } from '@cognitive-engine/core'
import type { TemplateProviders } from './shared.js'
import { debugTemplate } from './debug.js'

function createProviders(): TemplateProviders {
  return {
    engine: {
      llm: { complete: vi.fn(), completeJson: vi.fn() },
      embedding: { embed: vi.fn(), embedBatch: vi.fn() },
      store: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn(), has: vi.fn() },
    } as unknown as EngineConfig,
  }
}

describe('debugTemplate', () => {
  it('creates 7 agents', () => {
    const config = debugTemplate(createProviders())
    expect(config.agents).toHaveLength(7)
  })

  it('includes all expected agents', () => {
    const config = debugTemplate(createProviders())
    const ids = config.agents.map((a) => a.config.id)

    expect(ids).toContain('reproducer')
    expect(ids).toContain('log-analyzer')
    expect(ids).toContain('hypothesis-a')
    expect(ids).toContain('hypothesis-b')
    expect(ids).toContain('verifier')
    expect(ids).toContain('fixer')
    expect(ids).toContain('reviewer')
  })

  it('reproducer listens to task:new', () => {
    const config = debugTemplate(createProviders())
    const reproducer = config.agents.find((a) => a.config.id === 'reproducer')
    expect(reproducer?.config.listens).toContain('task:new')
  })

  it('hypothesis generators can emit proposals', () => {
    const config = debugTemplate(createProviders())
    const hypA = config.agents.find((a) => a.config.id === 'hypothesis-a')
    const hypB = config.agents.find((a) => a.config.id === 'hypothesis-b')
    expect(hypA?.config.canEmit).toContain('proposal')
    expect(hypB?.config.canEmit).toContain('proposal')
  })

  it('verifier can challenge hypotheses', () => {
    const config = debugTemplate(createProviders())
    const verifier = config.agents.find((a) => a.config.id === 'verifier')
    expect(verifier?.config.canEmit).toContain('challenge')
    expect(verifier?.config.canEmit).toContain('vote')
  })

  it('reviewer has elevated weight', () => {
    const config = debugTemplate(createProviders())
    const reviewer = config.agents.find((a) => a.config.id === 'reviewer')
    expect(reviewer?.config.weight).toBeGreaterThan(1)
  })

  it('sets maxRounds to 8', () => {
    const config = debugTemplate(createProviders())
    expect(config.maxRounds).toBe(8)
  })

  it('fixer listens to proposals and votes', () => {
    const config = debugTemplate(createProviders())
    const fixer = config.agents.find((a) => a.config.id === 'fixer')
    expect(fixer?.config.listens).toContain('proposal')
    expect(fixer?.config.listens).toContain('vote')
  })

  it('uses lowest entropy threshold for fast root-cause convergence', () => {
    const config = debugTemplate(createProviders())
    expect(config.math).toBeDefined()
    expect(config.math!.entropyThreshold).toBe(0.15)
    expect(config.math!.minInformationGain).toBe(0.06)
  })
})
