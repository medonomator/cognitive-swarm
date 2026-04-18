import type { ErrorHandler } from '@cognitive-engine/core'
import type { Signal, SignalType } from './signal.js'

/** Personality vector - affects how an agent reacts to signals. */
export interface PersonalityVector {
  readonly curiosity: number
  readonly caution: number
  readonly conformity: number
  readonly verbosity: number
}

/** Strategy IDs that an agent can select from via bandit. */
export type AgentStrategyId =
  | 'analyze'
  | 'propose'
  | 'challenge'
  | 'support'
  | 'synthesize'
  | 'defer'

/** Transport configuration for connecting to an MCP tool server. */
export type McpTransportConfig =
  | { readonly type: 'stdio'; readonly command: string; readonly args?: readonly string[] }
  | { readonly type: 'http'; readonly url: string; readonly headers?: Readonly<Record<string, string>> }

/** Configuration for a single MCP tool server. */
export interface McpServerConfig {
  readonly name: string
  readonly transport: McpTransportConfig
  readonly toolFilter?: readonly string[]
}

/** Agent-level tool configuration. */
export interface AgentToolConfig {
  readonly servers: readonly McpServerConfig[]
  readonly maxToolCalls?: number
  readonly toolTimeoutMs?: number
  readonly personalityGating?: boolean
}

/** Resolved tool config with defaults applied. */
export interface ResolvedAgentToolConfig {
  readonly servers: readonly McpServerConfig[]
  readonly maxToolCalls: number
  readonly toolTimeoutMs: number
  readonly personalityGating: boolean
}

/** Minimal tool description for prompt injection. */
export interface AgentTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}

/** Parsed tool call from LLM response. */
export interface AgentToolCall {
  readonly toolName: string
  readonly arguments: Readonly<Record<string, unknown>>
}

/** Result of a tool execution. */
export interface AgentToolResult {
  readonly toolName: string
  readonly result: unknown
  readonly isError: boolean
  readonly durationMs: number
}

/** Injects tool schemas into prompts. */
export interface ToolPromptInjector {
  inject(prompt: string, tools: readonly AgentTool[]): string
}

/** Parses tool calls from LLM text responses. */
export interface ToolCallParser {
  extract(text: string): { toolCalls: readonly AgentToolCall[]; cleanText: string }
}

/** Executes tool calls via MCP or other protocol. */
export interface ToolExecutor {
  executeAll(calls: readonly AgentToolCall[]): Promise<readonly AgentToolResult[]>
}

/** Full tool support bundle - injected into agents by the orchestrator. */
export interface AgentToolSupport {
  readonly tools: readonly AgentTool[]
  readonly executor: ToolExecutor
  readonly promptInjector: ToolPromptInjector
  readonly callParser: ToolCallParser
  readonly maxToolCalls: number
}

/** User-facing config to create a SwarmAgent. Optional fields have defaults. */
export interface SwarmAgentConfig {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly personality: PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly weight?: number
  readonly maxConcurrentSignals?: number
  readonly reactionDelayMs?: number
  readonly strategyActions?: readonly AgentStrategyId[]
  readonly tools?: AgentToolConfig
  readonly onError?: ErrorHandler
}

/** Resolved config - all fields required. Used internally by SwarmAgent. */
export interface ResolvedSwarmAgentConfig {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly personality: PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly weight: number
  readonly maxConcurrentSignals: number
  readonly reactionDelayMs: number
  readonly strategyActions: readonly AgentStrategyId[]
  readonly tools: ResolvedAgentToolConfig | null
  readonly onError: ErrorHandler
}

/** Result of an agent processing a signal. */
export interface AgentReaction {
  readonly agentId: string
  readonly inResponseTo: string
  readonly signals: readonly Signal[]
  readonly strategyUsed: AgentStrategyId
  readonly processingTimeMs: number
}

/** Contribution tracking for a single agent across a swarm run. */
export interface AgentContribution {
  readonly agentId: string
  readonly signalsEmitted: number
  readonly proposalsMade: number
  readonly challengesMade: number
  readonly votesCast: number
  readonly avgConfidence: number
}
