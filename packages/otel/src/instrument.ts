import type {
  SwarmEventMap,
  SwarmResult,
  SwarmEvent,
} from '@cognitive-swarm/core'
import { SpanManager } from './span-manager.js'

/**
 * Minimal interface for what we need from SwarmOrchestrator.
 * Avoids importing the concrete class - depends only on the shape.
 */
export interface InstrumentableOrchestrator {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  on<K extends keyof SwarmEventMap & string>(
    event: K,
    handler: (data: SwarmEventMap[K]) => void,
  ): () => void
  destroy(): void
}

export interface InstrumentSwarmOptions {
  /** Number of agents in the swarm (for span attributes). */
  readonly agentCount?: number
  /** Max rounds configured (for span attributes). */
  readonly maxRounds?: number
}

export interface InstrumentedOrchestrator {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  destroy(): void
  /** Remove OTel event subscriptions without destroying the orchestrator. */
  dispose(): void
}

/**
 * Wraps a SwarmOrchestrator with OpenTelemetry tracing.
 *
 * Subscribes to the orchestrator's events and creates spans automatically.
 * When no TracerProvider is registered, all operations are no-ops.
 *
 * Usage:
 * ```ts
 * const orchestrator = new SwarmOrchestrator(config)
 * const instrumented = instrumentSwarm(orchestrator, {
 *   agentCount: config.agents.length,
 *   maxRounds: config.maxRounds,
 * })
 * const result = await instrumented.solve('task')
 * ```
 */
export function instrumentSwarm(
  orchestrator: InstrumentableOrchestrator,
  options?: InstrumentSwarmOptions,
): InstrumentedOrchestrator {
  const manager = new SpanManager()
  const cleanups: Array<() => void> = []
  const agentCount = options?.agentCount ?? 0
  const maxRounds = options?.maxRounds ?? 0

  // Subscribe to all SwarmEventMap events
  cleanups.push(orchestrator.on('round:start', (d) => manager.onRoundStart(d)))
  cleanups.push(orchestrator.on('round:end', (d) => manager.onRoundEnd(d)))
  cleanups.push(orchestrator.on('signal:emitted', (s) => manager.onSignalEmitted(s)))
  cleanups.push(orchestrator.on('signal:expired', (s) => manager.onSignalExpired(s)))
  cleanups.push(orchestrator.on('signal:delivered', (e) => manager.onSignalDelivered(e)))
  cleanups.push(orchestrator.on('agent:reacted', (r) => manager.onAgentReacted(r)))
  cleanups.push(orchestrator.on('agent:error', (e) => manager.onAgentError(e)))
  cleanups.push(orchestrator.on('tool:called', (e) => manager.onToolCalled(e)))
  cleanups.push(orchestrator.on('conflict:detected', (c) => manager.onConflictDetected(c)))
  cleanups.push(orchestrator.on('proposal:submitted', (p) => manager.onProposalSubmitted(p)))
  cleanups.push(orchestrator.on('vote:cast', (v) => manager.onVoteCast(v)))
  cleanups.push(orchestrator.on('consensus:reached', (r) => manager.onConsensusReached(r)))
  cleanups.push(orchestrator.on('consensus:failed', (e) => manager.onConsensusFailed(e)))
  cleanups.push(orchestrator.on('advisor:action', (a) => manager.onAdvisorAction(a)))
  cleanups.push(orchestrator.on('debate:start', (d) => manager.onDebateStart(d)))
  cleanups.push(orchestrator.on('debate:round', (d) => manager.onDebateRound(d)))
  cleanups.push(orchestrator.on('debate:end', (r) => manager.onDebateEnd(r)))
  cleanups.push(orchestrator.on('topology:updated', (d) => manager.onTopologyUpdated(d)))
  cleanups.push(orchestrator.on('synthesis:start', () => manager.onSynthesisStart()))
  cleanups.push(orchestrator.on('synthesis:complete', (d) => manager.onSynthesisComplete(d)))

  function dispose(): void {
    for (const cleanup of cleanups) cleanup()
    cleanups.length = 0
    manager.cleanup()
  }

  return {
    async solve(task: string): Promise<SwarmResult> {
      manager.startSolve(task, agentCount, maxRounds)
      try {
        const result = await orchestrator.solve(task)
        manager.endSolve(result)
        return result
      } catch (error: unknown) {
        manager.cleanup()
        throw error
      }
    },

    async *solveWithStream(task: string): AsyncIterable<SwarmEvent> {
      manager.startSolve(task, agentCount, maxRounds)
      try {
        let lastResult: SwarmResult | undefined
        for await (const event of orchestrator.solveWithStream(task)) {
          if (event.type === 'solve:complete') {
            lastResult = event.result
          }
          yield event
        }
        if (lastResult) {
          manager.endSolve(lastResult)
        }
      } catch (error: unknown) {
        manager.cleanup()
        throw error
      }
    },

    destroy(): void {
      dispose()
      orchestrator.destroy()
    },

    dispose,
  }
}
