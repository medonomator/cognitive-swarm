import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server'
import type { Orchestratable, OrchestratorFactory, StreamVerbosity } from './types.js'
import { mapSwarmEventToA2A } from './event-mapper.js'

/**
 * Implements A2A's AgentExecutor interface.
 * Creates a fresh SwarmOrchestrator per task, streams events through
 * the A2A event bus, and cleans up on completion or cancellation.
 */
export class SwarmAgentExecutor implements AgentExecutor {
  private readonly factory: OrchestratorFactory
  private readonly activeTasks = new Map<string, Orchestratable>()
  private readonly verbosity: StreamVerbosity

  constructor(factory: OrchestratorFactory, verbosity?: StreamVerbosity) {
    this.factory = factory
    this.verbosity = verbosity ?? 'standard'
  }

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const taskText = extractTaskText(requestContext)
    const taskId = requestContext.taskId
    const contextId = requestContext.contextId

    const orchestrator = this.factory.create()
    this.activeTasks.set(taskId, orchestrator)

    try {
      // Publish initial working status
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId,
        final: false,
        status: {
          state: 'working',
          message: {
            kind: 'message',
            messageId: `${taskId}-init`,
            role: 'agent',
            parts: [{ kind: 'text', text: 'Swarm deliberation started...' }],
          },
          timestamp: new Date().toISOString(),
        },
      })

      // Stream swarm events, mapping each to A2A events
      for await (const swarmEvent of orchestrator.solveWithStream(taskText)) {
        const a2aEvents = mapSwarmEventToA2A(
          swarmEvent,
          taskId,
          contextId,
          this.verbosity,
        )
        for (const event of a2aEvents) {
          eventBus.publish(event)
        }
      }
    } catch (error: unknown) {
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId,
        final: true,
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            messageId: `${taskId}-error`,
            role: 'agent',
            parts: [{
              kind: 'text',
              text: error instanceof Error ? error.message : 'Swarm solve failed',
            }],
          },
          timestamp: new Date().toISOString(),
        },
      })
    } finally {
      orchestrator.destroy()
      this.activeTasks.delete(taskId)
    }
  }

  async cancelTask(
    taskId: string,
    _eventBus: ExecutionEventBus,
  ): Promise<void> {
    const orchestrator = this.activeTasks.get(taskId)
    if (orchestrator) {
      orchestrator.destroy()
      this.activeTasks.delete(taskId)
    }
  }
}

/**
 * Extract task text from user message parts.
 * Concatenates all TextPart content.
 */
function extractTaskText(ctx: RequestContext): string {
  const parts = ctx.userMessage.parts
  const textParts = parts
    .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
    .map((p) => p.text)

  if (textParts.length === 0) {
    return 'No task text provided'
  }

  return textParts.join('\n')
}
