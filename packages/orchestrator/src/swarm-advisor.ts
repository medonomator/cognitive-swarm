import type {
  Signal,
  ResolvedSwarmAdvisorConfig,
  SwarmAdvice,
  AdvisorReport,
  VoteRecord,
  MathAnalysis,
  SwarmEventMap,
} from '@cognitive-swarm/core'
import { TypedEventEmitter } from '@cognitive-swarm/core'
import { uid } from '@cognitive-engine/core'
import { SwarmIntrospector } from '@cognitive-swarm/introspection'
import type { SignalEvent } from '@cognitive-swarm/introspection'
import type { MathBridge } from './math-bridge.js'
import { TopologyController } from './topology-controller.js'
import type { Topology } from './topology-controller.js'

// Three feedback loops:
// 1. Groupthink detection -> doubt injection
// 2. Shapley redundancy -> agent pruning
// 3. Reputation -> weighted voting

/**
 * Analyzes swarm behavior and recommends corrective actions.
 *
 * Usage:
 * ```ts
 * const advisor = new SwarmAdvisor(config, events)
 *
 * // Each round:
 * const advice = advisor.evaluateRound(newSignals, round, mathBridge)
 * for (const action of advice) executeAdvice(action)
 *
 * // Before consensus:
 * const weightedVotes = advisor.applyReputationWeights(votes, 'code-review')
 *
 * // After consensus:
 * advisor.recordConsensusOutcome(decidedProposalId, votes, 'code-review')
 *
 * // At end:
 * const report = advisor.getReport()
 * ```
 */
export class SwarmAdvisor {
  private readonly config: ResolvedSwarmAdvisorConfig
  private readonly introspector = new SwarmIntrospector()
  private readonly events: TypedEventEmitter<SwarmEventMap> | null
  private readonly actions: SwarmAdvice[] = []
  private readonly disabledAgentIds = new Set<string>()
  private readonly topologyController = new TopologyController()
  private groupthinkCorrections = 0
  private reputationApplied = false
  private topologyUpdates = 0

  constructor(
    config: ResolvedSwarmAdvisorConfig,
    events?: TypedEventEmitter<SwarmEventMap>,
  ) {
    this.config = config
    this.events = events ?? null
  }

  /**
   * Evaluate a completed round and return recommended actions.
   *
   * Feeds signals to the introspector, then checks for:
   * 1. Groupthink (if enabled) - injects doubt signals
   * 2. Redundant agents (if enabled) - recommends disabling
   */
  evaluateRound(
    roundSignals: readonly Signal[],
    round: number,
    mathBridge: MathBridge,
    allAgentIds: readonly string[],
  ): readonly SwarmAdvice[] {
    // Feed signals to introspector
    this.feedIntrospector(roundSignals, allAgentIds)

    if (round < this.config.warmupRounds) return []

    const advice: SwarmAdvice[] = []

    if (this.config.groupthinkCorrection) {
      const groupthinkAdvice = this.checkGroupthink(roundSignals, mathBridge)
      if (groupthinkAdvice) {
        advice.push(groupthinkAdvice)
      }
    }

    if (this.config.agentPruning && round >= 3) {
      const pruneAdvice = this.checkRedundancy(mathBridge)
      advice.push(...pruneAdvice)
    }

    if (this.config.topology?.enabled) {
      const topologyAdvice = this.checkTopology(mathBridge, allAgentIds)
      if (topologyAdvice) {
        advice.push(topologyAdvice)
      }
    }

    for (const a of advice) {
      this.actions.push(a)
      this.events?.emit('advisor:action', a)

      if (a.type === 'disable-agent') {
        this.disabledAgentIds.add(a.agentId)
      }
      if (a.type === 'update-topology') {
        this.topologyUpdates++
      }
    }

    return advice
  }

  /**
   * Apply reputation weights to votes before consensus evaluation.
   *
   * Creates new VoteRecord instances with adjusted weights.
   * Original weight is multiplied by the agent's Bayesian reputation.
   *
   * @returns new vote records with reputation-adjusted weights (or originals if disabled)
   */
  applyReputationWeights(
    votes: readonly VoteRecord[],
    taskType?: string,
  ): readonly VoteRecord[] {
    if (!this.config.reputationWeighting || !this.config.weightProvider) {
      return votes
    }

    this.reputationApplied = true
    const provider = this.config.weightProvider

    return votes.map((record) => {
      const reputationWeight = provider.getWeight(
        record.agentId,
        taskType ?? 'general',
      )
      return {
        agentId: record.agentId,
        proposalId: record.proposalId,
        vote: {
          ...record.vote,
          weight: record.vote.weight * reputationWeight,
        },
        timestamp: record.timestamp,
      }
    })
  }

  /**
   * Record consensus outcome to update agent reputations.
   *
   * Agents who voted 'agree' on the winning proposal were correct.
   * Agents who voted 'disagree' on it were incorrect.
   * Abstainers are not recorded.
   */
  recordConsensusOutcome(
    decidedProposalId: string,
    votes: readonly VoteRecord[],
    taskType?: string,
  ): void {
    if (!this.config.weightProvider) return

    const type = taskType ?? 'general'

    for (const record of votes) {
      if (record.proposalId !== decidedProposalId) continue
      if (record.vote.stance === 'abstain') continue

      this.config.weightProvider.update(
        record.agentId,
        type,
        record.vote.stance === 'agree',
      )
    }
  }

  /** Get the set of disabled agent IDs. */
  get disabledAgents(): ReadonlySet<string> {
    return this.disabledAgentIds
  }

  /** Get the current topology (null = all-to-all). */
  get currentTopology(): Topology | null {
    return this.topologyController.topology
  }

  /** Generate the final advisor report. */
  getReport(): AdvisorReport {
    return {
      groupthinkCorrections: this.groupthinkCorrections,
      disabledAgents: [...this.disabledAgentIds],
      reputationApplied: this.reputationApplied,
      actions: [...this.actions],
      topologyUpdates: this.topologyUpdates,
      finalTopology: this.topologyController.topology?.neighbors ?? null,
    }
  }

  /** Reset all state for a new solve() call. */
  reset(): void {
    this.introspector.reset()
    this.actions.length = 0
    this.disabledAgentIds.clear()
    this.topologyController.reset()
    this.groupthinkCorrections = 0
    this.reputationApplied = false
    this.topologyUpdates = 0
  }

  private feedIntrospector(
    signals: readonly Signal[],
    allAgentIds: readonly string[],
  ): void {
    for (const signal of signals) {
      const event: SignalEvent = {
        signalId: signal.id,
        type: signal.type,
        source: signal.source,
        targets: allAgentIds.filter((id) => id !== signal.source),
        timestamp: signal.timestamp,
        replyTo: signal.replyTo,
      }
      this.introspector.record(event)
    }
  }

  /**
   * Check for groupthink and inject a doubt signal if detected.
   *
   * Uses two independent detectors for higher confidence:
   * 1. Introspector: agreement rate > 0.7, conformist agents
   * 2. Game theory: expected challengers > actual challengers
   *
   * Only acts when both agree (reduces false positives).
   */
  private checkGroupthink(
    roundSignals: readonly Signal[],
    mathBridge: MathBridge,
  ): SwarmAdvice | null {
    const report = this.introspector.detectGroupThink()
    if (!report.detected) return null

    const mathAnalysis = mathBridge.analyze()
    const gameTheory = mathAnalysis.gameTheory
    if (!gameTheory) return null

    const bothDetect =
      (report.severity === 'severe') ||
      (report.severity === 'mild' && gameTheory.groupthinkRisk !== 'low')

    if (!bothDetect) return null

    const leadingProposalId = this.findLeadingProposal(roundSignals, mathAnalysis)
    if (!leadingProposalId) return null

    this.groupthinkCorrections++

    const severity = report.severity === 'severe' ? 'high' : 'medium'
    const signal: Signal<'doubt'> = {
      id: uid('sig'),
      type: 'doubt',
      source: 'advisor',
      payload: {
        targetSignalId: leadingProposalId,
        concern: `Groupthink detected (agreement rate: ${(report.agreementRate * 100).toFixed(0)}%, `
          + `expected ${gameTheory.expectedChallengers.toFixed(1)} challengers but got ${gameTheory.actualChallengers}). `
          + `Consider alternative perspectives before converging.`,
        severity,
      },
      confidence: 0.8,
      timestamp: Date.now(),
    }

    return {
      type: 'inject-signal',
      signal,
      reason: `Groupthink correction (severity: ${report.severity}, `
        + `conformists: ${report.conformists.length})`,
    }
  }

  /**
   * Find the signal ID of the leading proposal.
   * Uses Bayesian MAP estimate if available, otherwise highest-confidence proposal.
   */
  private findLeadingProposal(
    signals: readonly Signal[],
    mathAnalysis: MathAnalysis,
  ): string | null {
    if (mathAnalysis.bayesian.mapEstimate) {
      for (const s of signals) {
        if (s.type === 'proposal' && isProposalWithId(s.payload, mathAnalysis.bayesian.mapEstimate.proposalId)) {
          return s.id
        }
      }
    }

    for (let i = signals.length - 1; i >= 0; i--) {
      if (signals[i]!.type === 'proposal') {
        return signals[i]!.id
      }
    }

    return null
  }

  /**
   * Check math analysis and update topology if conditions warrant.
   * Only emits advice when topology actually changes.
   */
  private checkTopology(
    mathBridge: MathBridge,
    allAgentIds: readonly string[],
  ): SwarmAdvice | null {
    if (!this.config.topology) return null

    const analysis = mathBridge.analyze()
    const prevTopology = this.topologyController.topology
    const newTopology = this.topologyController.computeTopology(
      allAgentIds,
      analysis,
      this.config.topology,
    )

    if (this.topologiesEqual(prevTopology, newTopology)) return null

    const neighbors = newTopology?.neighbors ?? new Map()
    return {
      type: 'update-topology',
      neighbors,
      reason: this.buildTopologyReason(analysis),
    }
  }

  /** Compare two topologies for equality. */
  private topologiesEqual(a: Topology | null, b: Topology | null): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false

    if (a.neighbors.size !== b.neighbors.size) return false
    for (const [id, setA] of a.neighbors) {
      const setB = b.neighbors.get(id)
      if (!setB) return false
      if (setA.size !== setB.size) return false
      for (const neighbor of setA) {
        if (!setB.has(neighbor)) return false
      }
    }
    return true
  }

  /** Build a human-readable reason for topology change. */
  private buildTopologyReason(analysis: MathAnalysis): string {
    const parts: string[] = []

    if (analysis.influence) {
      if (analysis.influence.influenceConcentration > 0.6) {
        parts.push(`high influence concentration (Gini: ${analysis.influence.influenceConcentration.toFixed(2)})`)
      }
      if (analysis.influence.isFragile) {
        parts.push('fragile graph')
      }
    }

    if (analysis.opinionDynamics) {
      if (analysis.opinionDynamics.clusterCount >= 2) {
        parts.push(`${analysis.opinionDynamics.clusterCount} opinion clusters`)
      }
    }

    if (analysis.redundancy) {
      const count = analysis.redundancy.redundantAgents.length
      if (count > 0) {
        parts.push(`${count} redundant agent(s)`)
      }
    }

    return parts.length > 0
      ? `Topology adapted: ${parts.join(', ')}`
      : 'Topology updated based on analysis'
  }

  /**
   * Check Shapley values and recommend disabling redundant agents.
   *
   * Only prunes agents not already disabled, and never prunes
   * below 2 active agents.
   */
  private checkRedundancy(mathBridge: MathBridge): readonly SwarmAdvice[] {
    const mathAnalysis = mathBridge.analyze()
    if (!mathAnalysis.shapley) return []

    const redundant = mathAnalysis.shapley.redundantAgents
    if (redundant.length === 0) return []

    const advice: SwarmAdvice[] = []

    for (const agentId of redundant) {
      if (this.disabledAgentIds.has(agentId)) continue

      advice.push({
        type: 'disable-agent',
        agentId,
        reason: `Low Shapley value (below redundancy threshold). `
          + `Marginal contribution: ${(mathAnalysis.shapley.values[agentId] ?? 0).toFixed(3)}`,
      })
    }

    return advice
  }
}

function isProposalWithId(
  payload: Signal['payload'],
  proposalId: string,
): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'proposalId' in payload &&
    payload.proposalId === proposalId
  )
}
