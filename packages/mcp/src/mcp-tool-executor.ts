import type { McpToolRegistry } from './mcp-tool-registry.js'
import type { ToolCall, ToolResult } from './types.js'

/**
 * Executes tool calls by routing them to the appropriate MCP server.
 * Handles timeouts and error wrapping.
 */
export class McpToolExecutor {
  constructor(
    private readonly registry: McpToolRegistry,
    private readonly timeoutMs: number,
  ) {}

  /** Execute a single tool call. */
  async execute(call: ToolCall): Promise<ToolResult> {
    const startTime = Date.now()
    const client = this.registry.getClientForTool(call.toolName)

    if (!client) {
      return {
        toolName: call.toolName,
        result: `Unknown tool: ${call.toolName}`,
        isError: true,
        durationMs: Date.now() - startTime,
      }
    }

    try {
      const result = await withTimeout(
        client.callTool({
          name: call.toolName,
          arguments: { ...call.arguments },
        }),
        this.timeoutMs,
        call.toolName,
      )

      return {
        toolName: call.toolName,
        result: extractTextContent(result.content),
        isError: result.isError === true,
        durationMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        toolName: call.toolName,
        result: error instanceof Error ? error.message : String(error),
        isError: true,
        durationMs: Date.now() - startTime,
      }
    }
  }

  /** Execute multiple tool calls in parallel. */
  async executeAll(calls: readonly ToolCall[]): Promise<readonly ToolResult[]> {
    return Promise.all(calls.map((call) => this.execute(call)))
  }
}

/**
 * Extract text content from MCP tool result.
 * MCP returns `content` as an array of typed blocks.
 */
function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return JSON.stringify(content)

  const textParts: string[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block['type'] !== 'text') continue
    const text = block['text']
    if (typeof text === 'string') textParts.push(text)
  }

  return textParts.length > 0
    ? textParts.join('\n')
    : JSON.stringify(content)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Race a promise against a timeout, ensuring the timer is always cleaned up.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`Tool "${label}" timed out after ${ms}ms`)),
      ms,
    )
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timerId !== undefined) clearTimeout(timerId)
  })
}
