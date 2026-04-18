import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { McpServerConfig } from '@cognitive-swarm/core'

/** Track mock clients created during tests. */
const mockClients: MockClient[] = []

interface MockClient {
  connectCalled: boolean
  closeCalled: boolean
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
  close: ReturnType<typeof vi.fn>
}

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => {
    const client: MockClient = {
      connectCalled: false,
      closeCalled: false,
      tools: [],
      close: vi.fn().mockImplementation(async () => {
        client.closeCalled = true
      }),
    }
    Object.assign(client, {
      connect: vi.fn().mockImplementation(async () => {
        client.connectCalled = true
      }),
      listTools: vi.fn().mockImplementation(async () => ({
        tools: client.tools,
      })),
      callTool: vi.fn(),
    })
    mockClients.push(client)
    return client
  }),
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}))

import { McpToolRegistry } from '../src/mcp-tool-registry.js'

function makeConfig(
  name: string,
  opts?: { toolFilter?: string[] },
): McpServerConfig {
  return {
    name,
    transport: { type: 'stdio', command: 'echo' },
    toolFilter: opts?.toolFilter,
  }
}

describe('McpToolRegistry', () => {
  let registry: McpToolRegistry

  beforeEach(() => {
    mockClients.length = 0
    registry = new McpToolRegistry()
  })

  it('discovers tools from a server', async () => {
    const config = makeConfig('srv')

    // Pre-register tools before connect — the mock client will be created during connect
    // We need to set tools after Client is instantiated but before listTools is called.
    // Since connect() calls client.connect() then client.listTools() sequentially,
    // we patch the Client mock to pre-set tools.
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const OrigImpl = vi.mocked(Client).getMockImplementation()!
    vi.mocked(Client).mockImplementationOnce((...args) => {
      const client = OrigImpl(...args)
      ;(client as unknown as MockClient).tools = [
        { name: 'tool_a', description: 'A tool', inputSchema: { type: 'object' } },
        { name: 'tool_b', description: 'B tool' },
      ]
      return client
    })

    await registry.connect([config])

    const tools = registry.getTools()
    expect(tools).toHaveLength(2)
    expect(tools.map((t) => t.name)).toEqual(['tool_a', 'tool_b'])
    expect(tools[0]!.serverName).toBe('srv')
    expect(tools[0]!.description).toBe('A tool')
  })

  it('applies tool filter to whitelist specific tools', async () => {
    const config = makeConfig('srv', { toolFilter: ['allowed'] })

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const OrigImpl = vi.mocked(Client).getMockImplementation()!
    vi.mocked(Client).mockImplementationOnce((...args) => {
      const client = OrigImpl(...args)
      ;(client as unknown as MockClient).tools = [
        { name: 'allowed', description: 'yes' },
        { name: 'blocked', description: 'no' },
      ]
      return client
    })

    await registry.connect([config])

    const tools = registry.getTools()
    expect(tools).toHaveLength(1)
    expect(tools[0]!.name).toBe('allowed')
  })

  it('warns and skips duplicate tool names', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const OrigImpl = vi.mocked(Client).getMockImplementation()!

    // First server
    vi.mocked(Client).mockImplementationOnce((...args) => {
      const client = OrigImpl(...args)
      ;(client as unknown as MockClient).tools = [
        { name: 'dup_tool', description: 'from first' },
      ]
      return client
    })
    // Second server
    vi.mocked(Client).mockImplementationOnce((...args) => {
      const client = OrigImpl(...args)
      ;(client as unknown as MockClient).tools = [
        { name: 'dup_tool', description: 'from second' },
      ]
      return client
    })

    await registry.connect([makeConfig('first'), makeConfig('second')])

    expect(registry.getTools()).toHaveLength(1)
    expect(registry.getTools()[0]!.serverName).toBe('first')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dup_tool'),
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('second'),
    )

    warnSpy.mockRestore()
  })

  it('getToolByName returns the tool or undefined', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const OrigImpl = vi.mocked(Client).getMockImplementation()!
    vi.mocked(Client).mockImplementationOnce((...args) => {
      const client = OrigImpl(...args)
      ;(client as unknown as MockClient).tools = [{ name: 'my_tool', description: 'yes' }]
      return client
    })

    await registry.connect([makeConfig('srv')])

    expect(registry.getToolByName('my_tool')).toBeDefined()
    expect(registry.getToolByName('my_tool')!.name).toBe('my_tool')
    expect(registry.getToolByName('nonexistent')).toBeUndefined()
  })

  it('getTools with name filter returns subset', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const OrigImpl = vi.mocked(Client).getMockImplementation()!
    vi.mocked(Client).mockImplementationOnce((...args) => {
      const client = OrigImpl(...args)
      ;(client as unknown as MockClient).tools = [
        { name: 'a' },
        { name: 'b' },
        { name: 'c' },
      ]
      return client
    })

    await registry.connect([makeConfig('srv')])

    const filtered = registry.getTools(['a', 'c'])
    expect(filtered).toHaveLength(2)
    expect(filtered.map((t) => t.name)).toEqual(['a', 'c'])
  })

  it('disconnect clears all state and closes clients', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const OrigImpl = vi.mocked(Client).getMockImplementation()!
    vi.mocked(Client).mockImplementationOnce((...args) => {
      const client = OrigImpl(...args)
      ;(client as unknown as MockClient).tools = [{ name: 'tool' }]
      return client
    })

    await registry.connect([makeConfig('srv')])
    expect(registry.getTools()).toHaveLength(1)

    await registry.disconnect()

    expect(registry.getTools()).toHaveLength(0)
    expect(registry.getToolByName('tool')).toBeUndefined()
    expect(registry.getClientForTool('tool')).toBeUndefined()

    // Verify close was called on the mock client
    expect(mockClients[0]!.closeCalled).toBe(true)
  })
})
