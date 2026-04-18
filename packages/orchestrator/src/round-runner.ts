import type {
  Signal,
  AgentReaction,
  SwarmEventMap,
} from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import type { SwarmAgent } from '@cognitive-swarm/agent'
import type { ContributionTracker } from './contribution-tracker.js'
import type { AgentSelector } from './agent-selector.js'

/** Context needed to run a single round. */
export interface RoundContext {
  readonly agents: readonly SwarmAgent[]
  readonly pendingSignals: readonly Signal[]
  readonly contributionTracker: ContributionTracker
  readonly events: TypedEventEmitter<SwarmEventMap> | null
  /** Agent IDs disabled by the advisor (Shapley pruning). */
  readonly disabledAgents?: ReadonlySet<string>
  /** Agent communication topology. If absent, all-to-all (default). */
  readonly topology?: ReadonlyMap<string, ReadonlySet<string>>
  /** Optional selector for top-K agent activation. If absent, broadcast to all. */
  readonly agentSelector?: AgentSelector
}

/** Result of a single round. */
export interface RoundResult {
  readonly newSignals: readonly Signal[]
  readonly reactions: readonly AgentReaction[]
}

/**
 * Executes one round of the swarm loop.
 *
 * For each pending signal:
 *   1. Find all agents that should react
 *   2. Process all agents in parallel
 *   3. Collect output signals
 *
 * Agents react to signals concurrently within a round,
 * but signals are processed sequentially to maintain order.
 */
export class RoundRunner {
  async run(context: RoundContext): Promise<RoundResult> {
    const allNewSignals: Signal[] = []
    const allReactions: AgentReaction[] = []

    for (const signal of context.pendingSignals) {
      let reactingAgents: readonly SwarmAgent[]

      if (context.agentSelector) {
        // Selective activation: score-based top-K selection
        const topologyFiltered = context.agents.filter(a =>
          isTopologyAllowed(a.id, signal, context.topology),
        )
        reactingAgents = context.agentSelector.select(
          topologyFiltered,
          signal,
          context.contributionTracker,
          context.disabledAgents,
        )
      } else {
        // Broadcast: all eligible agents (original behavior)
        reactingAgents = context.agents.filter((a) =>
          !context.disabledAgents?.has(a.id) &&
          isTopologyAllowed(a.id, signal, context.topology) &&
          a.shouldReact(signal),
        )
      }

      if (reactingAgents.length === 0) continue

      const reactions = await Promise.all(
        reactingAgents.map((agent) => agent.onSignal(signal)),
      )

      for (const reaction of reactions) {
        allReactions.push(reaction)
        context.contributionTracker.recordReaction(reaction)
        context.events?.emit('agent:reacted', reaction)

        for (const outputSignal of reaction.signals) {
          allNewSignals.push(outputSignal)
        }
      }
    }

    return { newSignals: allNewSignals, reactions: allReactions }
  }
}

/** Sources that bypass topology - infrastructure signals must reach all agents. */
const PRIVILEGED_SOURCES = new Set([
  'orchestrator',
  'advisor',
  'debate-moderator',
  'memory',
])

/**
 * Check if topology allows an agent to receive a signal.
 * Returns true (allowed) when: no topology, privileged source, or source is a neighbor.
 */
function isTopologyAllowed(
  agentId: string,
  signal: Signal,
  topology?: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (!topology) return true
  if (PRIVILEGED_SOURCES.has(signal.source)) return true
  const neighbors = topology.get(agentId)
  if (!neighbors) return true
  return neighbors.has(signal.source)
}
