import type {
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Message,
} from '@a2a-js/sdk'
import type { SwarmEvent, SwarmResult } from '@cognitive-swarm/core'
import type { StreamVerbosity } from './types.js'

type A2AEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent | Message

/**
 * Maps a SwarmEvent to zero or more A2A events.
 *
 * Verbosity levels control which SwarmEvents produce A2A output:
 * - minimal: only solve:start -> Working, solve:complete -> artifact + Completed
 * - standard: + round progress, consensus, synthesis
 * - verbose: + every signal, agent reaction, math, advisor, debate
 */
export function mapSwarmEventToA2A(
  event: SwarmEvent,
  taskId: string,
  contextId: string,
  verbosity: StreamVerbosity,
): readonly A2AEvent[] {
  switch (event.type) {
    case 'solve:start':
      return [buildStatusUpdate(taskId, contextId, 'working', `Deliberation started: "${event.task.slice(0, 100)}"`)]

    case 'round:start':
      if (verbosity === 'minimal') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Round ${event.round} started`)]

    case 'round:end':
      if (verbosity === 'minimal') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Round ${event.round} complete - ${event.signalCount} signals`)]

    case 'agent:reacted':
      if (verbosity !== 'verbose') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Agent ${event.reaction.agentId} used strategy: ${event.reaction.strategyUsed}`)]

    case 'signal:emitted':
      if (verbosity !== 'verbose') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Signal: ${event.signal.type} from ${event.signal.source}`)]

    case 'consensus:check':
      if (verbosity === 'minimal') return []
      return [buildStatusUpdate(taskId, contextId, 'working',
        event.result.decided
          ? `Consensus reached (confidence: ${event.result.confidence.toFixed(2)})`
          : 'Consensus not yet reached')]

    case 'synthesis:start':
      if (verbosity === 'minimal') return []
      return [buildStatusUpdate(taskId, contextId, 'working', 'Synthesizing final answer...')]

    case 'synthesis:complete':
      if (verbosity === 'minimal') return []
      return [buildStatusUpdate(taskId, contextId, 'working', 'Synthesis complete')]

    case 'solve:complete':
      return buildSolveCompleteEvents(event.result, taskId, contextId)

    case 'math:round-analysis':
      if (verbosity !== 'verbose') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Math: entropy=${event.entropy.toFixed(3)}, info_gain=${event.informationGain.toFixed(3)}`)]

    case 'advisor:action':
      if (verbosity !== 'verbose') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Advisor: ${event.advice.type}`)]

    case 'debate:start':
    case 'debate:round':
    case 'debate:end':
      if (verbosity !== 'verbose') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Debate: ${event.type}`)]

    case 'topology:updated':
      if (verbosity !== 'verbose') return []
      return [buildStatusUpdate(taskId, contextId, 'working', `Topology updated: ${event.reason}`)]

    default:
      return []
  }
}

function buildStatusUpdate(
  taskId: string,
  contextId: string,
  state: 'working' | 'completed' | 'failed',
  messageText: string,
  final = false,
): TaskStatusUpdateEvent {
  return {
    kind: 'status-update',
    taskId,
    contextId,
    final,
    status: {
      state,
      message: {
        kind: 'message',
        messageId: `${taskId}-status-${Date.now()}`,
        role: 'agent',
        parts: [{ kind: 'text', text: messageText }],
      },
      timestamp: new Date().toISOString(),
    },
  }
}

function buildSolveCompleteEvents(
  result: SwarmResult,
  taskId: string,
  contextId: string,
): A2AEvent[] {
  // Artifact with the answer (text) + full result (structured data)
  const artifact: TaskArtifactUpdateEvent = {
    kind: 'artifact-update',
    taskId,
    contextId,
    lastChunk: true,
    artifact: {
      artifactId: `${taskId}-result`,
      parts: [
        { kind: 'text', text: result.answer },
        {
          kind: 'data',
          data: serializeSwarmResult(result),
        },
      ],
    },
  }

  // Final status: completed
  const status = buildStatusUpdate(
    taskId,
    contextId,
    'completed',
    `Deliberation complete - confidence: ${result.confidence.toFixed(2)}, rounds: ${result.timing.roundsUsed}`,
    true,
  )

  return [artifact, status]
}

/**
 * Serialize SwarmResult to a plain JSON-safe object.
 * Converts ReadonlyMap fields to plain objects.
 */
function serializeSwarmResult(result: SwarmResult): Record<string, unknown> {
  return {
    answer: result.answer,
    confidence: result.confidence,
    consensus: {
      decided: result.consensus.decided,
      decision: result.consensus.decision,
      confidence: result.consensus.confidence,
      reasoning: result.consensus.reasoning,
    },
    cost: result.cost,
    timing: result.timing,
    signalCount: result.signalLog.length,
    debateResults: result.debateResults.map((d) => ({
      resolved: d.resolved,
      winningProposalId: d.winningProposalId,
      confidence: d.confidence,
      roundsUsed: d.roundsUsed,
    })),
  }
}
