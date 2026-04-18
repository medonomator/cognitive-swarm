import type { SignalType } from '@cognitive-swarm/core'

/** An edge in the signal flow graph. */
export interface SignalEdge {
  readonly from: string
  readonly to: string
  readonly signalType: SignalType
  readonly count: number
}

/** Directed graph of signal flow between agents. */
export interface SignalGraph {
  readonly nodes: readonly string[]
  readonly edges: readonly SignalEdge[]
  readonly totalSignals: number
}

/** Groupthink detection report. */
export interface GroupThinkReport {
  /** Whether groupthink was detected. */
  readonly detected: boolean
  /** Agreement rate across all votes (0 = total disagreement, 1 = unanimous). */
  readonly agreementRate: number
  /** Agents that never challenged or doubted. */
  readonly conformists: readonly string[]
  /** Agents that challenged at least once. */
  readonly challengers: readonly string[]
  /** Severity: none, mild, severe. */
  readonly severity: 'none' | 'mild' | 'severe'
}

/** Deadlock detection report. */
export interface DeadlockReport {
  /** Whether a potential deadlock was detected. */
  readonly detected: boolean
  /** Signal type cycles (e.g., challenge -> challenge -> challenge). */
  readonly cycles: readonly SignalCycle[]
  /** Agents involved in cycles. */
  readonly stuckAgents: readonly string[]
}

/** A cycle of signal types indicating a loop. */
export interface SignalCycle {
  readonly agents: readonly string[]
  readonly signalTypes: readonly SignalType[]
  readonly length: number
}

/** Cost breakdown per agent. */
export interface AgentCostEntry {
  readonly agentId: string
  readonly signalsSent: number
  readonly signalsReceived: number
  /** Ratio of output signals to input signals. */
  readonly amplification: number
}

/** Overall cost report for the swarm. */
export interface CostReport {
  readonly agents: readonly AgentCostEntry[]
  readonly totalSignals: number
  /** Agent with highest amplification ratio. */
  readonly mostActive: string | undefined
  /** Agent with lowest amplification ratio. */
  readonly leastActive: string | undefined
}

/** A recorded signal event for analysis. */
export interface SignalEvent {
  readonly signalId: string
  readonly type: SignalType
  readonly source: string
  readonly targets: readonly string[]
  readonly timestamp: number
  readonly replyTo?: string
}
