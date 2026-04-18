import type { ToolCall } from './types.js'

const TOOL_CALL_REGEX = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g

interface ParseResult {
  readonly toolCalls: readonly ToolCall[]
  readonly cleanText: string
}

/**
 * Parses `<tool_call>` JSON tags from LLM response text.
 * Returns extracted tool calls and the response text with tags stripped.
 */
export class ToolResponseParser {
  /**
   * Extract tool calls from response text.
   * Invalid JSON inside `<tool_call>` tags is silently skipped.
   */
  static extract(text: string): ParseResult {
    const toolCalls: ToolCall[] = []

    for (const match of text.matchAll(TOOL_CALL_REGEX)) {
      const json = match[1]
      if (!json) continue

      const parsed = tryParseToolCall(json)
      if (parsed) toolCalls.push(parsed)
    }

    const cleanText = text.replace(TOOL_CALL_REGEX, '').trim()
    return { toolCalls, cleanText }
  }
}

function tryParseToolCall(json: string): ToolCall | null {
  try {
    const raw: unknown = JSON.parse(json)
    if (!isRecord(raw)) return null

    const name = raw['name']
    if (typeof name !== 'string' || name.length === 0) return null

    const rawArgs = raw['arguments']
    const args = isRecord(rawArgs) ? rawArgs : {}

    return { toolName: name, arguments: args }
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
