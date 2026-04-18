import type { Signal, SignalType } from '@cognitive-swarm/core'

/**
 * Lightweight Theory of Mind — tracks what other agents believe.
 *
 * Built incrementally from received signals. Each agent maintains a
 * BeliefModel that records other agents' stances, strategies, and
 * concerns. This enables agents to anticipate objections and address
 * other agents' positions directly rather than talking past each other.
 *
 * Theoretical basis: Lesson 10 (Multi-Agent ToM), levels 0-1.
 * We implement L1 ToM: "Agent A believes X" — not recursive.
 */

/** What we know about another agent's mental state. */
export interface AgentBeliefState {
  /** How this agent voted on proposals: proposalId → stance. */
  readonly stances: ReadonlyMap<string, 'agree' | 'disagree' | 'abstain'>
  /** Signal types this agent most frequently emits. */
  readonly dominantOutputTypes: readonly SignalType[]
  /** Recent concerns raised in challenges/doubts (last 5). */
  readonly recentConcerns: readonly string[]
  /** Running average confidence of this agent's signals. */
  readonly avgConfidence: number
  /** Total signals observed from this agent. */
  readonly signalCount: number
}

/** Mutable internal state for tracking. */
interface MutableBeliefState {
  stances: Map<string, 'agree' | 'disagree' | 'abstain'>
  outputTypeCounts: Map<SignalType, number>
  recentConcerns: string[]
  confidenceSum: number
  signalCount: number
}

const MAX_CONCERNS = 5
const MAX_AGENTS_TRACKED = 20

export class BeliefModel {
  private readonly beliefs = new Map<string, MutableBeliefState>()

  /**
   * Update beliefs based on an observed signal from another agent.
   * Called for every signal the agent receives.
   */
  updateFromSignal(signal: Signal): void {
    const sourceId = signal.source
    if (!sourceId) return

    let state = this.beliefs.get(sourceId)
    if (!state) {
      // Evict oldest if at capacity
      if (this.beliefs.size >= MAX_AGENTS_TRACKED) {
        const oldest = this.beliefs.keys().next().value
        if (oldest) this.beliefs.delete(oldest)
      }
      state = {
        stances: new Map(),
        outputTypeCounts: new Map(),
        recentConcerns: [],
        confidenceSum: 0,
        signalCount: 0,
      }
      this.beliefs.set(sourceId, state)
    }

    state.signalCount++
    state.confidenceSum += signal.confidence

    // Track output type distribution
    const typeCount = state.outputTypeCounts.get(signal.type) ?? 0
    state.outputTypeCounts.set(signal.type, typeCount + 1)

    // Extract stance from votes
    if (signal.type === 'vote' && isVotePayload(signal.payload)) {
      state.stances.set(signal.payload.proposalId, signal.payload.stance)
    }

    // Extract concerns from challenges and doubts
    if (signal.type === 'challenge' && isChallengePayload(signal.payload)) {
      state.recentConcerns.push(signal.payload.counterArgument.slice(0, 150))
      if (state.recentConcerns.length > MAX_CONCERNS) {
        state.recentConcerns.shift()
      }
    }
    if (signal.type === 'doubt' && isDoubtPayload(signal.payload)) {
      state.recentConcerns.push(signal.payload.concern.slice(0, 150))
      if (state.recentConcerns.length > MAX_CONCERNS) {
        state.recentConcerns.shift()
      }
    }
  }

  /** Get a readonly snapshot of beliefs about a specific agent. */
  getBeliefState(agentId: string): AgentBeliefState | null {
    const state = this.beliefs.get(agentId)
    if (!state) return null

    // Compute dominant output types
    const sorted = [...state.outputTypeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
    const dominantOutputTypes = sorted.slice(0, 3).map(([type]) => type)

    return {
      stances: state.stances,
      dominantOutputTypes,
      recentConcerns: [...state.recentConcerns],
      avgConfidence: state.signalCount > 0 ? state.confidenceSum / state.signalCount : 0.5,
      signalCount: state.signalCount,
    }
  }

  /**
   * Generate a prompt section describing other agents' likely positions.
   * Returns empty string if insufficient data.
   */
  generateTheoryOfMindContext(): string {
    if (this.beliefs.size === 0) return ''

    const lines: string[] = []
    for (const [agentId, state] of this.beliefs) {
      if (state.signalCount < 2) continue

      const parts: string[] = [`[${agentId}]`]

      // Summarize stances
      const agrees = [...state.stances.values()].filter(s => s === 'agree').length
      const disagrees = [...state.stances.values()].filter(s => s === 'disagree').length
      if (agrees + disagrees > 0) {
        parts.push(`voted: ${agrees} agree, ${disagrees} disagree`)
      }

      // Dominant behavior
      const sorted = [...state.outputTypeCounts.entries()].sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) {
        parts.push(`mainly: ${sorted[0]![0]}`)
      }

      // Most recent concern
      if (state.recentConcerns.length > 0) {
        const latest = state.recentConcerns[state.recentConcerns.length - 1]!
        parts.push(`concern: "${latest}"`)
      }

      // Confidence
      const avg = state.signalCount > 0 ? state.confidenceSum / state.signalCount : 0.5
      parts.push(`avg confidence: ${avg.toFixed(2)}`)

      lines.push(parts.join(' | '))
    }

    if (lines.length === 0) return ''

    return `\n\nOTHER AGENTS' POSITIONS (anticipate their objections, address directly):\n${lines.join('\n')}\n`
  }
}

// ── Type guards ──

function isVotePayload(p: unknown): p is { proposalId: string; stance: 'agree' | 'disagree' | 'abstain' } {
  return typeof p === 'object' && p !== null && 'proposalId' in p && 'stance' in p
}

function isChallengePayload(p: unknown): p is { counterArgument: string } {
  return typeof p === 'object' && p !== null && 'counterArgument' in p
}

function isDoubtPayload(p: unknown): p is { concern: string } {
  return typeof p === 'object' && p !== null && 'concern' in p
}
