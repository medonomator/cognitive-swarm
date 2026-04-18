import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OutcomeTracker } from '../src/outcome-tracker.js'
import type {
  OutcomeVerdict,
  SwarmResult,
  ConsensusResult,
  Signal,
  MathAnalysis,
} from '@cognitive-swarm/core'
import type { SolveOutcomeContext, RecordOptions } from '../src/types.js'

// ── Helpers ────────────────────────────────────────────────────

function makeConsensus(overrides?: Partial<ConsensusResult>): ConsensusResult {
  return {
    decided: true,
    confidence: 0.8,
    votingRecord: [],
    dissent: [],
    reasoning: 'Test consensus',
    resolvedConflicts: [],
    durationMs: 100,
    proposalId: 'prop-1',
    decision: 'The answer is 42',
    ...overrides,
  }
}

function makeResult(overrides?: Partial<SwarmResult>): SwarmResult {
  return {
    solveId: 'solve-1',
    answer: 'test answer',
    confidence: 0.8,
    consensus: makeConsensus(),
    signalLog: [],
    agentContributions: new Map(),
    cost: { tokens: 100, estimatedUsd: 0.001 },
    timing: { totalMs: 1000, roundsUsed: 3 },
    mathAnalysis: {} as MathAnalysis,
    advisorReport: null,
    debateResults: [],
    evolutionReport: null,
    ...overrides,
  }
}

function makeContext(overrides?: Partial<SolveOutcomeContext>): SolveOutcomeContext {
  return {
    solveId: 'solve-1',
    result: makeResult(),
    taskType: 'math',
    ...overrides,
  }
}

function makeProposalSignal(source: string, proposalId: string): Signal<'proposal'> {
  return {
    id: `sig-${proposalId}`,
    type: 'proposal',
    source,
    payload: { proposalId, content: 'Answer', reasoning: 'Because' },
    confidence: 0.9,
    timestamp: Date.now(),
  }
}

function makeVoteSignal(source: string, proposalId: string, stance: 'agree' | 'disagree'): Signal<'vote'> {
  return {
    id: `vote-${source}-${proposalId}`,
    type: 'vote',
    source,
    payload: { proposalId, stance, weight: 1.0, reasoning: 'I agree' },
    confidence: 0.8,
    timestamp: Date.now(),
  }
}

// ── Tests ──────────────────────────────────────────────────────

describe('OutcomeTracker', () => {
  let tracker: OutcomeTracker

  beforeEach(() => {
    tracker = new OutcomeTracker()
  })

  describe('record', () => {
    it('stores outcomes', async () => {
      await tracker.record(makeContext(), 'correct')
      await tracker.record(makeContext({ solveId: 'solve-2' }), 'incorrect')

      const report = tracker.getReport()
      expect(report.totalOutcomes).toBe(2)
    })
  })

  describe('getReport', () => {
    it('returns empty report when no outcomes', () => {
      const report = tracker.getReport()
      expect(report.totalOutcomes).toBe(0)
      expect(report.accuracy).toBe(0)
      expect(report.calibration).toHaveLength(0)
      expect(report.calibrationError).toBe(0)
    })

    it('computes accuracy correctly', async () => {
      await tracker.record(makeContext(), 'correct')
      await tracker.record(makeContext(), 'correct')
      await tracker.record(makeContext(), 'incorrect')

      const report = tracker.getReport()
      expect(report.accuracy).toBeCloseTo(2 / 3)
    })

    it('computes partial rate', async () => {
      await tracker.record(makeContext(), 'correct')
      await tracker.record(makeContext(), 'partial')
      await tracker.record(makeContext(), 'partial')
      await tracker.record(makeContext(), 'incorrect')

      const report = tracker.getReport()
      expect(report.partialRate).toBeCloseTo(0.5)
    })

    it('groups by task type', async () => {
      await tracker.record(makeContext({ taskType: 'math' }), 'correct')
      await tracker.record(makeContext({ taskType: 'math' }), 'incorrect')
      await tracker.record(makeContext({ taskType: 'logic' }), 'correct')

      const report = tracker.getReport()
      expect(report.outcomesByTaskType['math']).toEqual({ correct: 1, partial: 0, incorrect: 1 })
      expect(report.outcomesByTaskType['logic']).toEqual({ correct: 1, partial: 0, incorrect: 0 })
    })
  })

  describe('calibration', () => {
    it('creates calibration buckets', async () => {
      // Confidence 0.8 → bucket 0.7-0.8
      await tracker.record(
        makeContext({ result: makeResult({ confidence: 0.8 }) }),
        'correct',
      )
      await tracker.record(
        makeContext({ result: makeResult({ confidence: 0.85 }) }),
        'correct',
      )
      // Confidence 0.3 → bucket 0.3-0.4
      await tracker.record(
        makeContext({ result: makeResult({ confidence: 0.35 }) }),
        'incorrect',
      )

      const report = tracker.getReport()
      expect(report.calibration.length).toBeGreaterThan(0)

      // Find the high-confidence bucket
      const highBucket = report.calibration.find(p => p.bucket >= 0.7 && p.bucket < 0.9)
      expect(highBucket).toBeDefined()
      expect(highBucket!.actualAccuracy).toBe(1.0) // both correct
    })

    it('computes calibration error', async () => {
      // Perfect calibration: 80% confidence, all correct
      for (let i = 0; i < 5; i++) {
        await tracker.record(
          makeContext({ result: makeResult({ confidence: 0.85 }) }),
          'correct',
        )
      }

      const report = tracker.getReport()
      // Calibration error should be small (predicted ~0.85, actual ~1.0)
      expect(report.calibrationError).toBeLessThan(0.3)
    })
  })

  describe('reputation feedback', () => {
    it('updates weight provider for winning proposal author', async () => {
      const weightProvider = {
        update: vi.fn(),
      }

      const signalLog: Signal[] = [
        makeProposalSignal('agent-1', 'prop-1'),
        makeVoteSignal('agent-2', 'prop-1', 'agree'),
      ]

      const context = makeContext({
        result: makeResult({
          signalLog,
          consensus: makeConsensus({ proposalId: 'prop-1' }),
        }),
      })

      await tracker.record(context, 'correct', { weightProvider })

      // Should update agent-1 (author) as correct
      expect(weightProvider.update).toHaveBeenCalledWith('agent-1', 'math', true)
      // Should update agent-2 (agreeing voter) as correct
      expect(weightProvider.update).toHaveBeenCalledWith('agent-2', 'math', true)
    })

    it('updates disagreeing voters inversely', async () => {
      const weightProvider = {
        update: vi.fn(),
      }

      const signalLog: Signal[] = [
        makeProposalSignal('agent-1', 'prop-1'),
        makeVoteSignal('agent-3', 'prop-1', 'disagree'),
      ]

      const context = makeContext({
        result: makeResult({
          signalLog,
          consensus: makeConsensus({ proposalId: 'prop-1' }),
        }),
      })

      await tracker.record(context, 'correct', { weightProvider })

      // agent-3 disagreed with a correct answer → update as wrong
      expect(weightProvider.update).toHaveBeenCalledWith('agent-3', 'math', false)
    })
  })

  describe('getReward', () => {
    it('returns configured rewards', () => {
      const tracker = new OutcomeTracker({
        correctReward: 1.0,
        partialReward: 0.3,
        incorrectReward: -0.1,
      })

      expect(tracker.getReward('correct')).toBe(1.0)
      expect(tracker.getReward('partial')).toBe(0.3)
      expect(tracker.getReward('incorrect')).toBe(-0.1)
    })

    it('uses defaults', () => {
      expect(tracker.getReward('correct')).toBe(1.0)
      expect(tracker.getReward('partial')).toBe(0.5)
      expect(tracker.getReward('incorrect')).toBe(0.0)
    })
  })

  describe('reset', () => {
    it('clears all outcomes', async () => {
      await tracker.record(makeContext(), 'correct')
      await tracker.record(makeContext(), 'incorrect')

      tracker.reset()
      const report = tracker.getReport()
      expect(report.totalOutcomes).toBe(0)
    })
  })
})
