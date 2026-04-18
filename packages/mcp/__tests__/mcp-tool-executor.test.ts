import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpToolExecutor } from '../src/mcp-tool-executor.js'
import type { McpToolRegistry } from '../src/mcp-tool-registry.js'
import type { ToolCall } from '../src/types.js'

/** Minimal mock of an MCP Client returned by the registry. */
function createMockClient(overrides?: {
  callTool?: (params: { name: string; arguments: Record<string, unknown> }) => Promise<{
    content: unknown
    isError?: boolean
  }>
}) {
  return {
    callTool: overrides?.callTool ?? vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    }),
  }
}

function createMockRegistry(
  clients: Record<string, ReturnType<typeof createMockClient>> = {},
): McpToolRegistry {
  return {
    getClientForTool: vi.fn((name: string) => clients[name]),
  } as unknown as McpToolRegistry
}

describe('McpToolExecutor', () => {
  const DEFAULT_TIMEOUT = 5_000

  it('returns error for unknown tool', async () => {
    const registry = createMockRegistry()
    const executor = new McpToolExecutor(registry, DEFAULT_TIMEOUT)

    const result = await executor.execute({ toolName: 'no_such_tool', arguments: {} })

    expect(result.toolName).toBe('no_such_tool')
    expect(result.isError).toBe(true)
    expect(result.result).toContain('Unknown tool')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('executes a single tool successfully', async () => {
    const client = createMockClient()
    const registry = createMockRegistry({ search: client })
    const executor = new McpToolExecutor(registry, DEFAULT_TIMEOUT)

    const call: ToolCall = { toolName: 'search', arguments: { query: 'hello' } }
    const result = await executor.execute(call)

    expect(result.toolName).toBe('search')
    expect(result.result).toBe('ok')
    expect(result.isError).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'search',
      arguments: { query: 'hello' },
    })
  })

  it('returns isError when MCP server signals an error result', async () => {
    const client = createMockClient({
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'rate limit exceeded' }],
        isError: true,
      }),
    })
    const registry = createMockRegistry({ bad_tool: client })
    const executor = new McpToolExecutor(registry, DEFAULT_TIMEOUT)

    const result = await executor.execute({ toolName: 'bad_tool', arguments: {} })

    expect(result.isError).toBe(true)
    expect(result.result).toBe('rate limit exceeded')
  })

  it('handles callTool rejection', async () => {
    const client = createMockClient({
      callTool: vi.fn().mockRejectedValue(new Error('connection lost')),
    })
    const registry = createMockRegistry({ flaky: client })
    const executor = new McpToolExecutor(registry, DEFAULT_TIMEOUT)

    const result = await executor.execute({ toolName: 'flaky', arguments: {} })

    expect(result.isError).toBe(true)
    expect(result.result).toBe('connection lost')
  })

  it('times out slow tools', async () => {
    const client = createMockClient({
      callTool: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          content: [{ type: 'text', text: 'too late' }],
        }), 500)),
      ),
    })
    const registry = createMockRegistry({ slow: client })
    const executor = new McpToolExecutor(registry, 50) // 50ms timeout

    const result = await executor.execute({ toolName: 'slow', arguments: {} })

    expect(result.isError).toBe(true)
    expect(result.result).toContain('timed out')
  })

  describe('executeAll', () => {
    it('executes multiple calls in parallel', async () => {
      const callOrder: string[] = []
      const client = createMockClient({
        callTool: vi.fn().mockImplementation(
          (params: { name: string }) => {
            callOrder.push(params.name)
            return Promise.resolve({
              content: [{ type: 'text', text: `result-${params.name}` }],
              isError: false,
            })
          },
        ),
      })
      const registry = createMockRegistry({ a: client, b: client, c: client })
      const executor = new McpToolExecutor(registry, DEFAULT_TIMEOUT)

      const calls: ToolCall[] = [
        { toolName: 'a', arguments: {} },
        { toolName: 'b', arguments: {} },
        { toolName: 'c', arguments: {} },
      ]

      const results = await executor.executeAll(calls)

      expect(results).toHaveLength(3)
      expect(results[0]!.result).toBe('result-a')
      expect(results[1]!.result).toBe('result-b')
      expect(results[2]!.result).toBe('result-c')
    })

    it('returns results for all calls even when some fail', async () => {
      const okClient = createMockClient()
      const registry = createMockRegistry({ ok_tool: okClient })
      const executor = new McpToolExecutor(registry, DEFAULT_TIMEOUT)

      const calls: ToolCall[] = [
        { toolName: 'ok_tool', arguments: {} },
        { toolName: 'missing', arguments: {} },
      ]

      const results = await executor.executeAll(calls)

      expect(results).toHaveLength(2)
      expect(results[0]!.isError).toBe(false)
      expect(results[1]!.isError).toBe(true)
      expect(results[1]!.result).toContain('Unknown tool')
    })

    it('returns empty array for empty input', async () => {
      const registry = createMockRegistry()
      const executor = new McpToolExecutor(registry, DEFAULT_TIMEOUT)

      const results = await executor.executeAll([])
      expect(results).toEqual([])
    })
  })
})
