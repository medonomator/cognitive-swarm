import { describe, it, expect, vi } from 'vitest'
import type { EngineConfig } from '@cognitive-engine/core'
import { PERSONALITIES, agentDef } from './shared.js'
import type { TemplateProviders } from './shared.js'

function createProviders(): TemplateProviders {
  return {
    engine: {
      llm: { complete: vi.fn(), completeJson: vi.fn() },
      embedding: { embed: vi.fn(), embedBatch: vi.fn() },
      store: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn(), has: vi.fn() },
    } as unknown as EngineConfig,
  }
}

describe('PERSONALITIES', () => {
  it('has all expected presets', () => {
    expect(PERSONALITIES.analytical).toBeDefined()
    expect(PERSONALITIES.creative).toBeDefined()
    expect(PERSONALITIES.critical).toBeDefined()
    expect(PERSONALITIES.supportive).toBeDefined()
    expect(PERSONALITIES.balanced).toBeDefined()
    expect(PERSONALITIES.bold).toBeDefined()
    expect(PERSONALITIES.cautious).toBeDefined()
  })

  it('all presets have valid personality vectors', () => {
    for (const [, vec] of Object.entries(PERSONALITIES)) {
      expect(vec.curiosity).toBeGreaterThanOrEqual(0)
      expect(vec.curiosity).toBeLessThanOrEqual(1)
      expect(vec.caution).toBeGreaterThanOrEqual(0)
      expect(vec.caution).toBeLessThanOrEqual(1)
      expect(vec.conformity).toBeGreaterThanOrEqual(0)
      expect(vec.conformity).toBeLessThanOrEqual(1)
      expect(vec.verbosity).toBeGreaterThanOrEqual(0)
      expect(vec.verbosity).toBeLessThanOrEqual(1)
    }
  })

  it('critical has high caution', () => {
    expect(PERSONALITIES.critical.caution).toBeGreaterThanOrEqual(0.8)
  })

  it('creative has high curiosity and low conformity', () => {
    expect(PERSONALITIES.creative.curiosity).toBeGreaterThanOrEqual(0.8)
    expect(PERSONALITIES.creative.conformity).toBeLessThanOrEqual(0.3)
  })
})

describe('agentDef()', () => {
  it('creates a SwarmAgentDef with preset personality', () => {
    const providers = createProviders()
    const def = agentDef(
      {
        id: 'test',
        name: 'Test Agent',
        role: 'Testing',
        personality: 'analytical',
        listens: ['task:new'],
        canEmit: ['discovery'],
      },
      providers,
    )

    expect(def.config.id).toBe('test')
    expect(def.config.name).toBe('Test Agent')
    expect(def.config.role).toBe('Testing')
    expect(def.config.personality).toEqual(PERSONALITIES.analytical)
    expect(def.config.listens).toEqual(['task:new'])
    expect(def.config.canEmit).toEqual(['discovery'])
    expect(def.engine).toBe(providers.engine)
  })

  it('creates a SwarmAgentDef with custom personality', () => {
    const custom = { curiosity: 0.1, caution: 0.2, conformity: 0.3, verbosity: 0.4 }
    const def = agentDef(
      {
        id: 'custom',
        name: 'Custom',
        role: 'Custom role',
        personality: custom,
        listens: ['proposal'],
        canEmit: ['vote'],
      },
      createProviders(),
    )

    expect(def.config.personality).toEqual(custom)
  })

  it('passes optional weight', () => {
    const def = agentDef(
      {
        id: 'w',
        name: 'Weighted',
        role: 'role',
        personality: 'balanced',
        listens: ['task:new'],
        canEmit: ['discovery'],
        weight: 2.5,
      },
      createProviders(),
    )

    expect(def.config.weight).toBe(2.5)
  })

  it('uses the same engine config for all agents', () => {
    const providers = createProviders()
    const def1 = agentDef(
      { id: 'a', name: 'A', role: 'r', personality: 'analytical', listens: ['task:new'], canEmit: ['discovery'] },
      providers,
    )
    const def2 = agentDef(
      { id: 'b', name: 'B', role: 'r', personality: 'creative', listens: ['task:new'], canEmit: ['proposal'] },
      providers,
    )

    expect(def1.engine).toBe(def2.engine)
  })
})
