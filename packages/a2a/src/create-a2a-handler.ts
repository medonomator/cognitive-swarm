import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server'
import type { TaskStore } from '@a2a-js/sdk/server'
import { SwarmAgentExecutor } from './swarm-agent-executor.js'
import { buildAgentCard } from './agent-card-builder.js'
import type { A2ASwarmServerConfig } from './types.js'

export interface CreateA2AHandlerOptions extends A2ASwarmServerConfig {
  /** Custom task store (default: InMemoryTaskStore). */
  readonly taskStore?: TaskStore
}

/**
 * Creates an A2A-compliant request handler for cognitive-swarm.
 *
 * The returned handler can be used with:
 * - `createA2AServer()` for a standalone Node.js server
 * - Express via `@a2a-js/sdk/server/express` integration
 * - Any custom HTTP framework
 */
export function createA2AHandler(
  config: CreateA2AHandlerOptions,
): DefaultRequestHandler {
  const agentCard = buildAgentCard(config)
  const taskStore = config.taskStore ?? new InMemoryTaskStore()
  const executor = new SwarmAgentExecutor(
    config.orchestratorFactory,
    config.streamVerbosity,
  )
  return new DefaultRequestHandler(agentCard, taskStore, executor)
}
