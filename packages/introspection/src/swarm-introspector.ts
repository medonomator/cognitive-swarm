import type {
  SignalEvent,
  SignalGraph,
  SignalEdge,
  GroupThinkReport,
  DeadlockReport,
  SignalCycle,
  CostReport,
  AgentCostEntry,
} from './types.js'

// Swarm introspector - detects groupthink, deadlocks, and cost imbalance.

/**
 * Observes swarm behavior and detects pathological patterns.
 *
 * Usage:
 * ```ts
 * const intro = new SwarmIntrospector()
 *
 * // Feed signal events (hook into SignalBus)
 * intro.record({
 *   signalId: 's1', type: 'proposal', source: 'agent-1',
 *   targets: ['agent-2', 'agent-3'], timestamp: Date.now(),
 * })
 *
 * // Analyze
 * const graph = intro.getSignalGraph()
 * const groupThink = intro.detectGroupThink()
 * const deadlock = intro.detectDeadlock()
 * const costs = intro.getCostBreakdown()
 * ```
 */
export class SwarmIntrospector {
  private readonly events: SignalEvent[] = []

  record(event: SignalEvent): void {
    this.events.push(event)
  }

  recordBatch(events: readonly SignalEvent[]): void {
    for (const e of events) this.events.push(e)
  }

  /**
   * Build a directed graph of signal flow between agents.
   */
  getSignalGraph(): SignalGraph {
    const nodes = new Set<string>()
    const edgeMap = new Map<string, SignalEdge & { count: number }>()

    for (const event of this.events) {
      nodes.add(event.source)
      for (const target of event.targets) {
        nodes.add(target)
        const key = `${event.source}→${target}→${event.type}`
        const existing = edgeMap.get(key)
        if (existing) {
          edgeMap.set(key, { ...existing, count: existing.count + 1 })
        } else {
          edgeMap.set(key, {
            from: event.source,
            to: target,
            signalType: event.type,
            count: 1,
          })
        }
      }
    }

    return {
      nodes: [...nodes],
      edges: [...edgeMap.values()],
      totalSignals: this.events.length,
    }
  }

  /**
   * Detect groupthink - when agents consistently agree
   * without challenges or doubts.
   *
   * Criteria:
   * - Agreement rate > 0.9 -> severe
   * - Agreement rate > 0.7 -> mild
   * - Agents that never emit 'challenge' or 'doubt' -> conformists
   */
  detectGroupThink(): GroupThinkReport {
    const voteEvents = this.events.filter((e) => e.type === 'vote')
    const challengeEvents = this.events.filter(
      (e) => e.type === 'challenge' || e.type === 'doubt',
    )

    // Track which agents challenged
    const challengerSet = new Set<string>()
    for (const e of challengeEvents) {
      challengerSet.add(e.source)
    }

    // All agents who emitted any signal
    const allAgents = new Set<string>()
    for (const e of this.events) {
      allAgents.add(e.source)
    }

    const conformists: string[] = []
    const challengers: string[] = []

    for (const agent of allAgents) {
      if (challengerSet.has(agent)) {
        challengers.push(agent)
      } else {
        conformists.push(agent)
      }
    }

    // Agreement rate: ratio of votes vs challenges
    const totalOpinions = voteEvents.length + challengeEvents.length
    const agreementRate =
      totalOpinions > 0 ? voteEvents.length / totalOpinions : 0

    let severity: 'none' | 'mild' | 'severe' = 'none'
    if (agreementRate > 0.9 && conformists.length > 1) {
      severity = 'severe'
    } else if (agreementRate > 0.7 && conformists.length > 0) {
      severity = 'mild'
    }

    return {
      detected: severity !== 'none',
      agreementRate,
      conformists,
      challengers,
      severity,
    }
  }

  /**
   * Detect deadlocks - agents stuck in signal reply loops.
   *
   * Looks for cycles in the replyTo chain:
   * A -> B -> A -> B (challenge ping-pong).
   */
  detectDeadlock(): DeadlockReport {
    // Build reply chains
    const byId = new Map<string, SignalEvent>()
    for (const e of this.events) {
      byId.set(e.signalId, e)
    }

    const cycles: SignalCycle[] = []
    const stuckAgents = new Set<string>()

    // For each event with a replyTo, trace the chain looking for cycles
    for (const event of this.events) {
      if (!event.replyTo) continue

      const visited = new Map<string, number>()
      const chain: SignalEvent[] = []

      let current: SignalEvent | undefined = event
      while (current) {
        if (visited.has(current.source)) {
          // Found a cycle
          const cycleStart = visited.get(current.source)!
          const cycleEvents = chain.slice(cycleStart)

          if (cycleEvents.length >= 2) {
            const cycle: SignalCycle = {
              agents: cycleEvents.map((e) => e.source),
              signalTypes: cycleEvents.map((e) => e.type),
              length: cycleEvents.length,
            }

            // Avoid duplicate cycles
            const key = cycle.agents.join(',')
            if (!cycles.some((c) => c.agents.join(',') === key)) {
              cycles.push(cycle)
              for (const agent of cycle.agents) {
                stuckAgents.add(agent)
              }
            }
          }
          break
        }

        visited.set(current.source, chain.length)
        chain.push(current)

        current = current.replyTo ? byId.get(current.replyTo) : undefined
      }
    }

    return {
      detected: cycles.length > 0,
      cycles,
      stuckAgents: [...stuckAgents],
    }
  }

  /**
   * Get cost breakdown per agent.
   *
   * Tracks signals sent vs received and computes
   * amplification ratio (how much each agent contributes
   * relative to what it consumes).
   */
  getCostBreakdown(): CostReport {
    const sent = new Map<string, number>()
    const received = new Map<string, number>()

    for (const event of this.events) {
      sent.set(event.source, (sent.get(event.source) ?? 0) + 1)
      for (const target of event.targets) {
        received.set(target, (received.get(target) ?? 0) + 1)
      }
    }

    const allAgents = new Set<string>([...sent.keys(), ...received.keys()])
    const agents: AgentCostEntry[] = []

    for (const agentId of allAgents) {
      const s = sent.get(agentId) ?? 0
      const r = received.get(agentId) ?? 0
      agents.push({
        agentId,
        signalsSent: s,
        signalsReceived: r,
        amplification: r > 0 ? s / r : s > 0 ? Infinity : 0,
      })
    }

    agents.sort((a, b) => b.signalsSent - a.signalsSent)

    return {
      agents,
      totalSignals: this.events.length,
      mostActive: agents[0]?.agentId,
      leastActive:
        agents.length > 0 ? agents[agents.length - 1]!.agentId : undefined,
    }
  }

  get eventCount(): number {
    return this.events.length
  }

  reset(): void {
    this.events.length = 0
  }
}
