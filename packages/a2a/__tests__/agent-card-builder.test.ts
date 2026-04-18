import { describe, it, expect } from 'vitest'
import { buildAgentCard } from '../src/agent-card-builder.js'
import type { A2ASwarmServerConfig } from '../src/types.js'

function makeConfig(overrides?: Partial<A2ASwarmServerConfig>): A2ASwarmServerConfig {
  return {
    name: 'Test Swarm',
    description: 'A test swarm agent',
    url: 'http://localhost:4000',
    skills: [{
      id: 'analyze',
      name: 'Analysis',
      description: 'Analyze things',
    }],
    orchestratorFactory: { create: () => ({ solve: async () => ({}) as never, solveWithStream: async function* () {}, destroy: () => {} }) },
    ...overrides,
  }
}

describe('buildAgentCard', () => {
  it('builds card with required fields', () => {
    const card = buildAgentCard(makeConfig())

    expect(card.name).toBe('Test Swarm')
    expect(card.description).toBe('A test swarm agent')
    expect(card.url).toBe('http://localhost:4000')
    expect(card.version).toBe('1.0.0')
    expect(card.protocolVersion).toBe('0.2.2')
  })

  it('maps skills correctly', () => {
    const card = buildAgentCard(makeConfig({
      skills: [
        { id: 'research', name: 'Research', description: 'Deep research', tags: ['ai', 'research'], examples: ['What is X?'] },
        { id: 'plan', name: 'Planning', description: 'Strategic planning' },
      ],
    }))

    expect(card.skills).toHaveLength(2)
    expect(card.skills[0]!.id).toBe('research')
    expect(card.skills[0]!.tags).toEqual(['ai', 'research'])
    expect(card.skills[0]!.examples).toEqual(['What is X?'])
    expect(card.skills[1]!.id).toBe('plan')
    expect(card.skills[1]!.tags).toEqual([])
    expect(card.skills[1]!.examples).toEqual([])
  })

  it('sets capabilities with streaming default true', () => {
    const card = buildAgentCard(makeConfig())

    expect(card.capabilities.streaming).toBe(true)
    expect(card.capabilities.pushNotifications).toBe(false)
    expect(card.capabilities.stateTransitionHistory).toBe(true)
  })

  it('respects streaming override', () => {
    const card = buildAgentCard(makeConfig({ streaming: false }))
    expect(card.capabilities.streaming).toBe(false)
  })

  it('sets default input/output modes', () => {
    const card = buildAgentCard(makeConfig())

    expect(card.defaultInputModes).toEqual(['text/plain'])
    expect(card.defaultOutputModes).toEqual(['text/plain', 'application/json'])
  })

  it('includes provider when specified', () => {
    const card = buildAgentCard(makeConfig({
      provider: { organization: 'TestCorp', url: 'https://test.com' },
    }))

    expect(card.provider).toEqual({ organization: 'TestCorp', url: 'https://test.com' })
  })

  it('omits provider when not specified', () => {
    const card = buildAgentCard(makeConfig())
    expect(card.provider).toBeUndefined()
  })

  it('uses custom version', () => {
    const card = buildAgentCard(makeConfig({ version: '2.0.0' }))
    expect(card.version).toBe('2.0.0')
  })
})
