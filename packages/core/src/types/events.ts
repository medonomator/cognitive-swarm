import type { Signal, ConflictPair } from './signal.js'
import type { AgentReaction } from './agent.js'
import type { ConsensusResult, Proposal, VoteRecord } from './consensus.js'
import type { SwarmAdvice, DebateResult } from './orchestrator.js'

/** Type-safe event map for the swarm. */
export interface SwarmEventMap {
  'signal:emitted': Signal
  'signal:expired': Signal
  'signal:delivered': SignalDeliveryEvent
  'agent:reacted': AgentReaction
  'agent:error': AgentErrorEvent
  'conflict:detected': ConflictPair
  'proposal:submitted': Proposal
  'vote:cast': VoteRecord
  'consensus:reached': ConsensusResult
  'consensus:failed': ConsensusFailedEvent
  'advisor:action': SwarmAdvice
  'debate:start': { proposalA: string; proposalB: string }
  'debate:round': { round: number; posteriors: Readonly<Record<string, number>> }
  'debate:end': DebateResult
  'round:start': RoundStartEvent
  'round:end': RoundEndEvent
  'synthesis:start': Record<string, never>
  'synthesis:complete': SynthesisCompleteEvent
  'topology:updated': { neighbors: ReadonlyMap<string, ReadonlySet<string>>; reason: string }
  'tool:called': ToolCalledEvent
}

export interface RoundStartEvent {
  readonly round: number
}

export interface RoundEndEvent {
  readonly round: number
  readonly signalCount: number
}

export interface SynthesisCompleteEvent {
  readonly answer: string
}

export interface ToolCalledEvent {
  readonly agentId: string
  readonly toolName: string
  readonly durationMs: number
  readonly isError: boolean
}

export interface SignalDeliveryEvent {
  readonly signal: Signal
  readonly targetAgentId: string
}

export interface AgentErrorEvent {
  readonly agentId: string
  readonly signalId: string
  readonly error: unknown
  readonly context: string
}

export interface ConsensusFailedEvent {
  readonly reason: 'timeout' | 'insufficient_voters' | 'no_majority'
  readonly proposals: readonly Proposal[]
  readonly votes: readonly VoteRecord[]
}
