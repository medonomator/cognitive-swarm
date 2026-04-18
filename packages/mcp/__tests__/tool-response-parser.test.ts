import { describe, it, expect } from 'vitest'
import { ToolResponseParser } from '../src/tool-response-parser.js'

describe('ToolResponseParser', () => {
  it('returns empty tool calls when no tags present', () => {
    const text = 'This is a normal response without any tool calls.'
    const result = ToolResponseParser.extract(text)

    expect(result.toolCalls).toHaveLength(0)
    expect(result.cleanText).toBe(text)
  })

  it('extracts a single tool call', () => {
    const text = `I need to search for this.
<tool_call>{"name": "search_web", "arguments": {"query": "TypeScript MCP"}}</tool_call>
Let me check.`

    const result = ToolResponseParser.extract(text)

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toEqual({
      toolName: 'search_web',
      arguments: { query: 'TypeScript MCP' },
    })
    expect(result.cleanText).toContain('I need to search for this.')
    expect(result.cleanText).toContain('Let me check.')
    expect(result.cleanText).not.toContain('<tool_call>')
  })

  it('extracts multiple tool calls', () => {
    const text = `Checking two things.
<tool_call>{"name": "search_web", "arguments": {"query": "foo"}}</tool_call>
<tool_call>{"name": "read_file", "arguments": {"path": "/tmp/data.json"}}</tool_call>`

    const result = ToolResponseParser.extract(text)

    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0]!.toolName).toBe('search_web')
    expect(result.toolCalls[1]!.toolName).toBe('read_file')
  })

  it('handles empty arguments', () => {
    const text = '<tool_call>{"name": "get_time"}</tool_call>'
    const result = ToolResponseParser.extract(text)

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toEqual({
      toolName: 'get_time',
      arguments: {},
    })
  })

  it('skips malformed JSON', () => {
    const text = `
<tool_call>{"name": "valid", "arguments": {}}</tool_call>
<tool_call>{not valid json}</tool_call>
<tool_call>{"name": "also_valid", "arguments": {"x": 1}}</tool_call>`

    const result = ToolResponseParser.extract(text)

    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0]!.toolName).toBe('valid')
    expect(result.toolCalls[1]!.toolName).toBe('also_valid')
  })

  it('skips entries with missing or empty name', () => {
    const text = `
<tool_call>{"arguments": {"x": 1}}</tool_call>
<tool_call>{"name": "", "arguments": {}}</tool_call>
<tool_call>{"name": "real_tool", "arguments": {}}</tool_call>`

    const result = ToolResponseParser.extract(text)

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]!.toolName).toBe('real_tool')
  })

  it('handles whitespace inside tags', () => {
    const text = `<tool_call>
  {
    "name": "search_web",
    "arguments": {"query": "test"}
  }
</tool_call>`

    const result = ToolResponseParser.extract(text)

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]!.toolName).toBe('search_web')
  })

  it('strips all tool call tags from clean text', () => {
    const text = `Before <tool_call>{"name": "a"}</tool_call> middle <tool_call>{"name": "b"}</tool_call> after`
    const result = ToolResponseParser.extract(text)

    expect(result.cleanText).toBe('Before  middle  after')
  })
})
