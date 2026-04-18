import { describe, it, expect, vi } from 'vitest'
import type { LlmProvider } from '@cognitive-engine/core'
import { SwarmEvolver } from './swarm-evolver.js'
import type { GapSignal } from './types.js'

function mockLlm(): LlmProvider {
  return {
    complete: vi.fn(async () => ({
      content: JSON.stringify({
        name: 'docker-specialist',
        description: 'Analyzes Docker configurations',
        curiosity: 0.8,
        caution: 0.4,
        conformity: 0.3,
        verbosity: 0.5,
      }),
      usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
      finishReason: 'stop' as const,
    })),
    completeJson: vi.fn(async () => ({
      content: '{}',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop' as const,
      parsed: {},
    })),
  }
}

function makeGap(id: string, domain: string, urgency = 0.8): GapSignal {
  return {
    id,
    detectedBy: 'agent-1',
    domain,
    reason: `Need expertise in ${domain}`,
    urgency,
    timestamp: Date.now(),
  }
}

describe('SwarmEvolver', () => {
  it('starts empty', () => {
    const evolver = new SwarmEvolver(mockLlm())
    expect(evolver.gapCount).toBe(0)
    expect(evolver.proposalCount).toBe(0)
  })

  it('reports gaps', () => {
    const evolver = new SwarmEvolver(mockLlm())
    evolver.reportGap(makeGap('g1', 'docker'))
    expect(evolver.gapCount).toBe(1)
    expect(evolver.getGap('g1')).toBeDefined()
  })

  it('counts detector as initial confirmation', () => {
    const evolver = new SwarmEvolver(mockLlm())
    evolver.reportGap(makeGap('g1', 'docker'))
    expect(evolver.getConfirmationCount('g1')).toBe(1)
  })

  it('confirms gaps from other agents', () => {
    const evolver = new SwarmEvolver(mockLlm())
    evolver.reportGap(makeGap('g1', 'docker'))
    evolver.confirmGap('g1', 'agent-2')
    evolver.confirmGap('g1', 'agent-3')
    expect(evolver.getConfirmationCount('g1')).toBe(3)
  })

  it('dismiss removes confirmation', () => {
    const evolver = new SwarmEvolver(mockLlm())
    evolver.reportGap(makeGap('g1', 'docker'))
    evolver.confirmGap('g1', 'agent-2')
    evolver.dismissGap('g1', 'agent-2')
    expect(evolver.getConfirmationCount('g1')).toBe(1)
  })

  it('proposeSpawn returns null if not enough confirmations', async () => {
    const evolver = new SwarmEvolver(mockLlm(), { minVotesForSpawn: 3 })
    evolver.reportGap(makeGap('g1', 'docker'))
    // Only 1 confirmation (detector)

    const proposal = await evolver.proposeSpawn('g1')
    expect(proposal).toBeNull()
  })

  it('proposeSpawn creates proposal with enough confirmations', async () => {
    const evolver = new SwarmEvolver(mockLlm(), { minVotesForSpawn: 2 })
    evolver.reportGap(makeGap('g1', 'docker'))
    evolver.confirmGap('g1', 'agent-2')

    const proposal = await evolver.proposeSpawn('g1')
    expect(proposal).not.toBeNull()
    expect(proposal!.role).toBe('docker-specialist')
    expect(proposal!.status).toBe('approved')
    expect(proposal!.proposedBy).toHaveLength(2)
    expect(evolver.proposalCount).toBe(1)
  })

  it('proposeSpawn marks low-urgency gaps as temporary', async () => {
    const evolver = new SwarmEvolver(mockLlm(), { minVotesForSpawn: 1 })
    evolver.reportGap(makeGap('g1', 'dns', 0.3)) // Low urgency

    const proposal = await evolver.proposeSpawn('g1')
    expect(proposal!.temporary).toBe(true)
  })

  it('proposeSpawn marks high-urgency gaps as permanent', async () => {
    const evolver = new SwarmEvolver(mockLlm(), { minVotesForSpawn: 1 })
    evolver.reportGap(makeGap('g1', 'docker', 0.8)) // High urgency

    const proposal = await evolver.proposeSpawn('g1')
    expect(proposal!.temporary).toBe(false)
  })

  it('proposeSpawn returns null for unknown gap', async () => {
    const evolver = new SwarmEvolver(mockLlm())
    expect(await evolver.proposeSpawn('nonexistent')).toBeNull()
  })

  it('proposeSpawn handles unparseable LLM response', async () => {
    const llm = mockLlm()
    vi.mocked(llm.complete).mockResolvedValueOnce({
      content: 'not json at all',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    const evolver = new SwarmEvolver(llm, { minVotesForSpawn: 1 })
    evolver.reportGap(makeGap('g1', 'networking'))

    const proposal = await evolver.proposeSpawn('g1')
    expect(proposal).not.toBeNull()
    expect(proposal!.role).toBe('networking-specialist') // Fallback
  })

  it('evaluate recommends keep for high-value agent', () => {
    const evolver = new SwarmEvolver(mockLlm())
    const result = evolver.evaluate('spawned-1', 15, 5, 5)
    expect(result.recommendation).toBe('keep')
    expect(result.valueScore).toBeGreaterThan(0.3)
  })

  it('evaluate recommends dissolve for low-value agent', () => {
    const evolver = new SwarmEvolver(mockLlm(), { minValueForKeep: 0.3 })
    const result = evolver.evaluate('spawned-1', 0, 0, 5)
    expect(result.recommendation).toBe('dissolve')
    expect(result.valueScore).toBe(0)
  })

  it('evaluate keeps agent during evaluation window', () => {
    const evolver = new SwarmEvolver(mockLlm(), { evaluationWindow: 5 })
    const result = evolver.evaluate('spawned-1', 0, 0, 2) // Only 2 rounds
    expect(result.recommendation).toBe('keep') // Too early to judge
  })

  it('suggestPrune identifies low-value agents', () => {
    const evolver = new SwarmEvolver(mockLlm(), { minValueForKeep: 0.3 })
    evolver.evaluate('good', 10, 5, 5)
    evolver.evaluate('bad', 0, 0, 5)

    const report = evolver.suggestPrune()
    expect(report.pruneCount).toBe(1)
    expect(report.candidates[0]!.agentId).toBe('bad')
  })

  it('suggestPrune considers redundancy scores', () => {
    const evolver = new SwarmEvolver(mockLlm())
    evolver.evaluate('a1', 10, 5, 5) // Good value

    const redundancy = new Map([['a1', 0.95]])
    const report = evolver.suggestPrune(redundancy)
    expect(report.pruneCount).toBe(1) // Still pruned due to high redundancy
  })

  it('reset clears all state', () => {
    const evolver = new SwarmEvolver(mockLlm())
    evolver.reportGap(makeGap('g1', 'docker'))
    evolver.reset()
    expect(evolver.gapCount).toBe(0)
    expect(evolver.proposalCount).toBe(0)
  })
})
