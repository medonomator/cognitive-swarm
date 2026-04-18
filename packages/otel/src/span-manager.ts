import { context, trace, type Span, SpanStatusCode } from '@opentelemetry/api'
import type {
  AgentReaction,
  AgentErrorEvent,
  ConsensusResult,
  ConsensusFailedEvent,
  DebateResult,
  RoundStartEvent,
  RoundEndEvent,
  Signal,
  SignalDeliveryEvent,
  SynthesisCompleteEvent,
  SwarmAdvice,
  SwarmResult,
  ToolCalledEvent,
  ConflictPair,
  Proposal,
  VoteRecord,
} from '@cognitive-swarm/core'
import { getTracer } from './tracer.js'
import { ATTR } from './attributes.js'

/**
 * Maintains active span hierarchy and maps swarm events to OTel spans.
 *
 * Span tree:
 *   solve -> round:N -> agent:X / debate / advisor
 *                    -> tool:Y (child of agent)
 *   solve -> synthesize
 *
 * Every public method is wrapped in try-catch so tracing failures
 * never crash the swarm.
 */
export class SpanManager {
  private solveSpan: Span | undefined
  private readonly roundSpans = new Map<number, Span>()
  private readonly agentSpans = new Map<string, Span>()
  private debateSpan: Span | undefined
  private synthesisSpan: Span | undefined

  startSolve(task: string, agentCount: number, maxRounds: number): void {
    try {
      const tracer = getTracer()
      this.solveSpan = tracer.startSpan('cognitive-swarm.solve', {
        attributes: {
          [ATTR.TASK]: task.slice(0, 256),
          [ATTR.AGENT_COUNT]: agentCount,
          [ATTR.MAX_ROUNDS]: maxRounds,
        },
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  endSolve(result: SwarmResult): void {
    try {
      if (!this.solveSpan) return

      this.solveSpan.setAttributes({
        [ATTR.ROUNDS_USED]: result.timing.roundsUsed,
        [ATTR.TOTAL_SIGNALS]: result.signalLog.length,
        [ATTR.CONSENSUS_REACHED]: result.consensus.decided,
        [ATTR.CONFIDENCE]: result.confidence,
        [ATTR.TOKENS]: result.cost.tokens,
        [ATTR.COST_USD]: result.cost.estimatedUsd,
      })

      if (result.consensus.decided) {
        this.solveSpan.setStatus({ code: SpanStatusCode.OK })
      }

      this.solveSpan.end()
      this.solveSpan = undefined
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onRoundStart(data: RoundStartEvent): void {
    try {
      const parent = this.solveSpan
      if (!parent) return

      const tracer = getTracer()
      const ctx = trace.setSpan(context.active(), parent)
      const span = tracer.startSpan(
        'cognitive-swarm.round',
        { attributes: { [ATTR.ROUND_NUMBER]: data.round } },
        ctx,
      )
      this.roundSpans.set(data.round, span)
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onRoundEnd(data: RoundEndEvent): void {
    try {
      const span = this.roundSpans.get(data.round)
      if (!span) return

      span.setAttribute(ATTR.ROUND_SIGNAL_COUNT, data.signalCount)
      span.end()
      this.roundSpans.delete(data.round)
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onSignalEmitted(signal: Signal): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('signal:emitted', {
        [ATTR.SIGNAL_ID]: signal.id,
        [ATTR.SIGNAL_TYPE]: signal.type,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onSignalExpired(signal: Signal): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('signal:expired', {
        [ATTR.SIGNAL_ID]: signal.id,
        [ATTR.SIGNAL_TYPE]: signal.type,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onSignalDelivered(event: SignalDeliveryEvent): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('signal:delivered', {
        [ATTR.SIGNAL_ID]: event.signal.id,
        [ATTR.AGENT_ID]: event.targetAgentId,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onAgentReacted(reaction: AgentReaction): void {
    try {
      // Find the current round span as parent
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      const tracer = getTracer()
      const startTime = Date.now() - reaction.processingTimeMs
      const ctx = trace.setSpan(context.active(), roundSpan)

      const span = tracer.startSpan(
        'cognitive-swarm.agent.on-signal',
        {
          startTime,
          attributes: {
            [ATTR.AGENT_ID]: reaction.agentId,
            [ATTR.AGENT_STRATEGY]: reaction.strategyUsed,
            [ATTR.PROCESSING_TIME_MS]: reaction.processingTimeMs,
            [ATTR.SIGNAL_ID]: reaction.inResponseTo,
          },
        },
        ctx,
      )

      // Store for potential child tool spans
      const key = `${reaction.agentId}:${reaction.inResponseTo}`
      this.agentSpans.set(key, span)

      // End immediately - agent processing is already complete by the time we get the event
      span.end()
      this.agentSpans.delete(key)
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onAgentError(event: AgentErrorEvent): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('agent:error', {
        [ATTR.AGENT_ID]: event.agentId,
        [ATTR.SIGNAL_ID]: event.signalId,
        'swarm.agent.error_context': event.context,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onToolCalled(event: ToolCalledEvent): void {
    try {
      // Tool spans are children of the current round span
      // (agent span is already ended by the time tool:called fires)
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      const tracer = getTracer()
      const startTime = Date.now() - event.durationMs
      const ctx = trace.setSpan(context.active(), roundSpan)

      const span = tracer.startSpan(
        'cognitive-swarm.tool.execute',
        {
          startTime,
          attributes: {
            [ATTR.TOOL_NAME]: event.toolName,
            [ATTR.TOOL_IS_ERROR]: event.isError,
            [ATTR.TOOL_DURATION_MS]: event.durationMs,
            [ATTR.AGENT_ID]: event.agentId,
          },
        },
        ctx,
      )

      if (event.isError) {
        span.setStatus({ code: SpanStatusCode.ERROR })
      }

      span.end()
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onConflictDetected(conflict: ConflictPair): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('conflict:detected', {
        [ATTR.SIGNAL_ID]: conflict.signalA.id,
        'swarm.conflict.signal_b_id': conflict.signalB.id,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onProposalSubmitted(proposal: Proposal): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('proposal:submitted', {
        'swarm.proposal.id': proposal.id,
        [ATTR.AGENT_ID]: proposal.sourceAgentId,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onVoteCast(vote: VoteRecord): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('vote:cast', {
        'swarm.vote.proposal_id': vote.proposalId,
        [ATTR.AGENT_ID]: vote.agentId,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onDebateStart(_data: { proposalA: string; proposalB: string }): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      const tracer = getTracer()
      const ctx = trace.setSpan(context.active(), roundSpan)
      this.debateSpan = tracer.startSpan('cognitive-swarm.debate', {}, ctx)
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onDebateRound(data: { round: number; posteriors: Readonly<Record<string, number>> }): void {
    try {
      if (!this.debateSpan) return

      this.debateSpan.addEvent('debate:round', {
        [ATTR.ROUND_NUMBER]: data.round,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onDebateEnd(result: DebateResult): void {
    try {
      if (!this.debateSpan) return

      this.debateSpan.setAttributes({
        [ATTR.DEBATE_RESOLVED]: result.resolved,
        [ATTR.DEBATE_ROUNDS]: result.roundsUsed,
        [ATTR.CONFIDENCE]: result.confidence,
      })
      this.debateSpan.end()
      this.debateSpan = undefined
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onConsensusReached(result: ConsensusResult): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('consensus:reached', {
        [ATTR.CONSENSUS_REACHED]: result.decided,
        [ATTR.CONFIDENCE]: result.confidence,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onConsensusFailed(event: ConsensusFailedEvent): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('consensus:failed', {
        'swarm.consensus.failure_reason': event.reason,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onAdvisorAction(advice: SwarmAdvice): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('advisor:action', {
        [ATTR.ADVISOR_ACTION]: advice.type,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onTopologyUpdated(data: { neighbors: ReadonlyMap<string, ReadonlySet<string>>; reason: string }): void {
    try {
      const roundSpan = this.getCurrentRoundSpan()
      if (!roundSpan) return

      roundSpan.addEvent('topology:updated', {
        [ATTR.TOPOLOGY_REASON]: data.reason,
        [ATTR.TOPOLOGY_NEIGHBOR_COUNT]: data.neighbors.size,
      })
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onSynthesisStart(): void {
    try {
      const parent = this.solveSpan
      if (!parent) return

      const tracer = getTracer()
      const ctx = trace.setSpan(context.active(), parent)
      this.synthesisSpan = tracer.startSpan('cognitive-swarm.synthesize', {}, ctx)
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  onSynthesisComplete(_data: SynthesisCompleteEvent): void {
    try {
      if (!this.synthesisSpan) return

      this.synthesisSpan.setStatus({ code: SpanStatusCode.OK })
      this.synthesisSpan.end()
      this.synthesisSpan = undefined
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  /** Clean up any orphaned spans (e.g., if solve was interrupted). */
  cleanup(): void {
    try {
      this.synthesisSpan?.end()
      this.debateSpan?.end()
      for (const span of this.agentSpans.values()) span.end()
      for (const span of this.roundSpans.values()) span.end()
      this.solveSpan?.end()

      this.synthesisSpan = undefined
      this.debateSpan = undefined
      this.agentSpans.clear()
      this.roundSpans.clear()
      this.solveSpan = undefined
    } catch {
      /* tracing must never crash the swarm */
    }
  }

  private getCurrentRoundSpan(): Span | undefined {
    // Return the span with the highest round number (current round)
    let maxRound = -1
    let current: Span | undefined
    for (const [round, span] of this.roundSpans) {
      if (round > maxRound) {
        maxRound = round
        current = span
      }
    }
    return current
  }
}
