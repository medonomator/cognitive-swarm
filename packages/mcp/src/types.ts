/** Discovered tool from an MCP server. */
export interface McpTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly serverName: string
}

/** A tool call parsed from LLM response text. */
export interface ToolCall {
  readonly toolName: string
  readonly arguments: Readonly<Record<string, unknown>>
}

/** Result of executing a tool call. */
export interface ToolResult {
  readonly toolName: string
  readonly result: unknown
  readonly isError: boolean
  readonly durationMs: number
}
