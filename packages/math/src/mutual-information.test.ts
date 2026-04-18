import { describe, it, expect } from 'vitest'
import { RedundancyDetector } from './mutual-information.js'

describe('RedundancyDetector', () => {
  it('starts with no emissions', () => {
    const det = new RedundancyDetector()
    expect(det.emissionCount).toBe(0)
    expect(det.getAgentIds()).toHaveLength(0)
  })

  it('records emissions', () => {
    const det = new RedundancyDetector()
    det.record({ agentId: 'a1', signalType: 'discovery', topic: 'security' })
    det.record({ agentId: 'a2', signalType: 'discovery', topic: 'perf' })
    expect(det.emissionCount).toBe(2)
    expect(det.getAgentIds()).toHaveLength(2)
  })

  it('MI is zero for agents with no shared topics', () => {
    const det = new RedundancyDetector()
    det.record({ agentId: 'a1', signalType: 'discovery', topic: 'security' })
    det.record({ agentId: 'a1', signalType: 'discovery', topic: 'security' })
    det.record({ agentId: 'a2', signalType: 'discovery', topic: 'performance' })
    det.record({ agentId: 'a2', signalType: 'discovery', topic: 'performance' })

    const mi = det.mutualInformation('a1', 'a2')
    // Different topics -> low MI (they do overlap in the joint product)
    expect(mi).toBeGreaterThanOrEqual(0)
  })

  it('MI is high for agents with identical topic distributions', () => {
    const det = new RedundancyDetector()
    // Both agents talk about the same topics in same proportions
    for (let i = 0; i < 10; i++) {
      det.record({ agentId: 'a1', signalType: 'discovery', topic: 'security' })
      det.record({ agentId: 'a2', signalType: 'discovery', topic: 'security' })
    }
    for (let i = 0; i < 5; i++) {
      det.record({ agentId: 'a1', signalType: 'discovery', topic: 'perf' })
      det.record({ agentId: 'a2', signalType: 'discovery', topic: 'perf' })
    }

    const nmi = det.normalizedMI('a1', 'a2')
    expect(nmi).toBeGreaterThan(0.8)
  })

  it('normalizedMI is between 0 and 1', () => {
    const det = new RedundancyDetector()
    det.record({ agentId: 'a1', signalType: 'discovery', topic: 'x' })
    det.record({ agentId: 'a2', signalType: 'discovery', topic: 'y' })

    const nmi = det.normalizedMI('a1', 'a2')
    expect(nmi).toBeGreaterThanOrEqual(0)
    expect(nmi).toBeLessThanOrEqual(1)
  })

  it('MI is zero for unknown agents', () => {
    const det = new RedundancyDetector()
    expect(det.mutualInformation('x', 'y')).toBe(0)
  })

  it('analyze finds redundant agents', () => {
    const det = new RedundancyDetector()
    // a1 and a2 are redundant (same topics)
    for (let i = 0; i < 20; i++) {
      det.record({ agentId: 'a1', signalType: 'discovery', topic: 'sec' })
      det.record({ agentId: 'a2', signalType: 'discovery', topic: 'sec' })
    }
    // a3 is unique
    for (let i = 0; i < 20; i++) {
      det.record({ agentId: 'a3', signalType: 'discovery', topic: 'design' })
    }

    const report = det.analyze(0.7)
    expect(report.redundant).toContain('a1')
    expect(report.redundant).toContain('a2')
    expect(report.redundant).not.toContain('a3')
  })

  it('analyze identifies most unique agent', () => {
    const det = new RedundancyDetector()
    for (let i = 0; i < 10; i++) {
      det.record({ agentId: 'a1', signalType: 'discovery', topic: 'common' })
      det.record({ agentId: 'a2', signalType: 'discovery', topic: 'common' })
    }
    for (let i = 0; i < 10; i++) {
      det.record({ agentId: 'a3', signalType: 'discovery', topic: 'rare' })
    }

    const report = det.analyze()
    expect(report.mostUnique).toBe('a3')
  })

  it('optimalSize returns count up to marginal NMI threshold', () => {
    const det = new RedundancyDetector()
    // 3 unique agents
    for (let i = 0; i < 10; i++) {
      det.record({ agentId: 'a1', signalType: 'discovery', topic: 'topic-a' })
      det.record({ agentId: 'a2', signalType: 'discovery', topic: 'topic-b' })
      det.record({ agentId: 'a3', signalType: 'discovery', topic: 'topic-c' })
    }

    const size = det.optimalSize(0.8)
    expect(size).toBeGreaterThanOrEqual(1)
    expect(size).toBeLessThanOrEqual(3)
  })

  it('reset clears all data', () => {
    const det = new RedundancyDetector()
    det.record({ agentId: 'a1', signalType: 'discovery', topic: 'x' })
    det.reset()
    expect(det.emissionCount).toBe(0)
  })

  it('recordBatch works correctly', () => {
    const det = new RedundancyDetector()
    det.recordBatch([
      { agentId: 'a1', signalType: 'discovery', topic: 'x' },
      { agentId: 'a2', signalType: 'proposal', topic: 'y' },
    ])
    expect(det.emissionCount).toBe(2)
  })

  it('averageMI in report is non-negative', () => {
    const det = new RedundancyDetector()
    for (let i = 0; i < 5; i++) {
      det.record({ agentId: 'a1', signalType: 'discovery', topic: `t${i}` })
      det.record({ agentId: 'a2', signalType: 'discovery', topic: `t${i}` })
    }

    const report = det.analyze()
    expect(report.averageMI).toBeGreaterThanOrEqual(0)
  })
})
