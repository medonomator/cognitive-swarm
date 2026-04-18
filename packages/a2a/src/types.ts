import type { SwarmResult, SwarmEvent } from '@cognitive-swarm/core'

/**
 * Minimal orchestrator interface for A2A integration.
 * Structural typing - no need to import the concrete class.
 * Same pattern as otel's InstrumentableOrchestrator.
 */
export interface Orchestratable {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  destroy(): void
}

/** Factory that creates a fresh orchestrator per incoming A2A task. */
export interface OrchestratorFactory {
  create(): Orchestratable
}

/** Skill definition for the A2A agent card. */
export interface A2ASkillDef {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly tags?: readonly string[]
  readonly examples?: readonly string[]
}

/** Configuration for the A2A swarm server. */
export interface A2ASwarmServerConfig {
  /** Factory to create orchestrator instances per task. */
  readonly orchestratorFactory: OrchestratorFactory

  /** Agent name shown in the agent card. */
  readonly name: string

  /** Agent description. */
  readonly description: string

  /** Base URL the agent is accessible at. */
  readonly url: string

  /** Agent version string (default: '1.0.0'). */
  readonly version?: string

  /** Skills the agent advertises. */
  readonly skills: readonly A2ASkillDef[]

  /** Provider organization info. */
  readonly provider?: {
    readonly organization: string
    readonly url: string
  }

  /** Whether to enable SSE streaming (default: true). */
  readonly streaming?: boolean

  /**
   * Verbosity of streaming events.
   * - 'minimal': only status transitions + final artifact
   * - 'standard': includes round progress and consensus checks (default)
   * - 'verbose': includes every signal, math analysis, advisor actions
   */
  readonly streamVerbosity?: 'minimal' | 'standard' | 'verbose'
}

/** Options for the standalone HTTP server helper. */
export interface A2AServerOptions {
  /** Port to listen on (default: 3000). */
  readonly port?: number

  /** Hostname to bind to (default: '0.0.0.0'). */
  readonly hostname?: string
}

export type StreamVerbosity = 'minimal' | 'standard' | 'verbose'
