import type { AgentTool } from '@cognitive-swarm/core'

/**
 * Builds tool-aware prompts by appending available tool schemas.
 * LLMs read these schemas and respond with `<tool_call>` tags
 * when they want to invoke a tool.
 */
export class ToolPromptBuilder {
  /**
   * Append tool schemas and usage instructions to a prompt.
   * Returns the original prompt unchanged if no tools are provided.
   */
  static inject(prompt: string, tools: readonly AgentTool[]): string {
    if (tools.length === 0) return prompt

    const toolDescriptions = tools
      .map((t) => formatToolDescription(t))
      .join('\n')

    return `${prompt}

---
You have access to the following tools. To use a tool, include a <tool_call> tag in your response:
<tool_call>{"name": "tool_name", "arguments": {"key": "value"}}</tool_call>

Available tools:
${toolDescriptions}

You may call multiple tools. After receiving results, continue your analysis.
If no tools are needed, respond normally without <tool_call> tags.`
  }
}

function formatToolDescription(tool: AgentTool): string {
  const params = formatParameters(tool.inputSchema)
  return `- ${tool.name}(${params}): ${tool.description}`
}

function formatParameters(schema: Readonly<Record<string, unknown>>): string {
  const properties = schema['properties']
  if (!isRecord(properties)) return ''

  const requiredRaw = schema['required']
  const required = isStringArray(requiredRaw) ? requiredRaw : []

  return Object.entries(properties)
    .map(([name, prop]) => {
      const propType = isRecord(prop) && typeof prop['type'] === 'string'
        ? prop['type']
        : 'unknown'
      const optional = required.includes(name) ? '' : '?'
      return `${name}${optional}: ${propType}`
    })
    .join(', ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}
