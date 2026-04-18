import { describe, it, expect } from 'vitest'
import { ToolPromptBuilder } from '../src/tool-prompt-builder.js'
import type { McpTool } from '../src/types.js'

describe('ToolPromptBuilder', () => {
  const tools: McpTool[] = [
    {
      name: 'search_web',
      description: 'Search the web for information',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
      serverName: 'web-tools',
    },
    {
      name: 'read_file',
      description: 'Read a file from the filesystem',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          encoding: { type: 'string' },
        },
        required: ['path'],
      },
      serverName: 'fs-tools',
    },
  ]

  it('returns original prompt when no tools provided', () => {
    const prompt = 'Analyze this data'
    const result = ToolPromptBuilder.inject(prompt, [])
    expect(result).toBe(prompt)
  })

  it('appends tool descriptions to the prompt', () => {
    const result = ToolPromptBuilder.inject('Analyze this', tools)

    expect(result).toContain('Analyze this')
    expect(result).toContain('search_web')
    expect(result).toContain('read_file')
    expect(result).toContain('Search the web for information')
    expect(result).toContain('<tool_call>')
  })

  it('formats parameters with types', () => {
    const result = ToolPromptBuilder.inject('Task', tools)

    expect(result).toContain('query: string')
    expect(result).toContain('path: string')
  })

  it('marks optional parameters', () => {
    const result = ToolPromptBuilder.inject('Task', tools)

    // encoding is not in required array, should have ?
    expect(result).toContain('encoding?: string')
  })

  it('handles tools with no parameters', () => {
    const noParamTool: McpTool = {
      name: 'get_time',
      description: 'Get current time',
      inputSchema: {},
      serverName: 'util-tools',
    }

    const result = ToolPromptBuilder.inject('Task', [noParamTool])
    expect(result).toContain('get_time()')
    expect(result).toContain('Get current time')
  })

  it('includes usage instructions', () => {
    const result = ToolPromptBuilder.inject('Task', tools)

    expect(result).toContain('You have access to the following tools')
    expect(result).toContain('<tool_call>')
    expect(result).toContain('If no tools are needed')
  })
})
