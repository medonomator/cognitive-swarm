import type {
  AgentToolSupport,
  AgentToolCall,
  AgentToolResult,
  ResolvedAgentToolConfig,
} from '@cognitive-swarm/core'
import { McpToolRegistry } from './mcp-tool-registry.js'
import { McpToolExecutor } from './mcp-tool-executor.js'
import { ToolPromptBuilder } from './tool-prompt-builder.js'
import { ToolResponseParser } from './tool-response-parser.js'

/**
 * Create an AgentToolSupport bundle by connecting to MCP servers
 * and discovering their tools.
 *
 * Usage:
 * ```ts
 * const support = await createToolSupport(resolvedConfig)
 * agentDef.toolSupport = support
 * ```
 *
 * Call `support.registry.disconnect()` when done to clean up.
 */
export async function createToolSupport(
  config: ResolvedAgentToolConfig,
): Promise<AgentToolSupport & { readonly registry: McpToolRegistry }> {
  const registry = new McpToolRegistry()
  await registry.connect(config.servers)

  const executor = new McpToolExecutor(registry, config.toolTimeoutMs)
  const tools = registry.getTools()

  return {
    tools,
    executor: {
      async executeAll(calls: readonly AgentToolCall[]): Promise<readonly AgentToolResult[]> {
        return executor.executeAll(calls)
      },
    },
    promptInjector: {
      inject: ToolPromptBuilder.inject,
    },
    callParser: {
      extract: ToolResponseParser.extract,
    },
    maxToolCalls: config.maxToolCalls,
    registry,
  }
}
