/** Causal reasoning level (Pearl's Ladder of Causation). */
export type CausalLevel = 'correlation' | 'intervention' | 'counterfactual'

/** All signal types in the swarm. */
export type SignalType =
  | 'task:new'
  | 'discovery'
  | 'proposal'
  | 'doubt'
  | 'challenge'
  | 'vote'
  | 'conflict'
  | 'consensus:reached'
  | 'escalate'
  | 'memory:shared'
  | 'tool:result'

/** Maps each SignalType to its payload shape. */
export interface SignalPayloadMap {
  'task:new': TaskPayload
  discovery: DiscoveryPayload
  proposal: ProposalPayload
  doubt: DoubtPayload
  challenge: ChallengePayload
  vote: VotePayload
  conflict: ConflictPayload
  'consensus:reached': ConsensusReachedPayload
  escalate: EscalatePayload
  'memory:shared': SharedMemoryPayload
  'tool:result': ToolResultPayload
}

/** A signal flowing through the swarm's signal bus. */
export interface Signal<T extends SignalType = SignalType> {
  readonly id: string
  readonly type: T
  readonly source: string
  readonly payload: SignalPayloadMap[T]
  readonly confidence: number
  readonly timestamp: number
  readonly replyTo?: string
  readonly ttl?: number
  readonly metadata?: SignalMetadata
}

export interface SignalMetadata {
  readonly round?: number
  readonly priority?: number
  /** Pearl's Ladder: correlation (L1) < intervention (L2) < counterfactual (L3). */
  readonly causalLevel?: CausalLevel
}

export interface TaskPayload {
  readonly task: string
  readonly context?: string
}

export interface DiscoveryPayload {
  readonly finding: string
  readonly evidence?: string
  readonly relevance: number
}

export interface ProposalPayload {
  readonly proposalId: string
  readonly content: string
  readonly reasoning: string
}

export interface DoubtPayload {
  readonly targetSignalId: string
  readonly concern: string
  readonly severity: 'low' | 'medium' | 'high'
}

export interface ChallengePayload {
  readonly targetSignalId: string
  readonly counterArgument: string
  readonly alternativeProposal?: string
}

export interface VotePayload {
  readonly proposalId: string
  readonly stance: 'agree' | 'disagree' | 'abstain'
  readonly reasoning?: string
  readonly weight: number
}

export interface ConflictPayload {
  readonly signalA: string
  readonly signalB: string
  readonly description: string
}

export interface ConsensusReachedPayload {
  readonly proposalId: string
  readonly decision: string
  readonly confidence: number
}

export interface EscalatePayload {
  readonly reason: string
  readonly context: string
}

export interface SharedMemoryPayload {
  readonly content: string
  readonly category: string
  readonly importance: number
}

export interface ToolResultPayload {
  readonly toolName: string
  readonly result: string
  readonly isError: boolean
  readonly durationMs: number
  readonly triggeredBy: string
}

/** Filter for querying signal history. */
export interface SignalFilter {
  readonly type?: SignalType | readonly SignalType[]
  readonly source?: string
  readonly since?: number
  readonly until?: number
  readonly replyTo?: string
  readonly minConfidence?: number
}

/** A pair of conflicting signals detected by the bus. */
export interface ConflictPair {
  readonly signalA: Signal
  readonly signalB: Signal
  readonly detectedAt: number
}
