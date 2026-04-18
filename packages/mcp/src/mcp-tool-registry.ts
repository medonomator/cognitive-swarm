import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig } from '@cognitive-swarm/core'
import type { McpTool } from './types.js'

/**
 * Connects to MCP servers and discovers their available tools.
 * Maintains a pool of active clients for tool execution.
 *
 * If a server fails to connect, previously connected servers are
 * cleaned up and the error is propagated.
 */
export class McpToolRegistry {
  private readonly clients = new Map<string, Client>()
  private readonly toolMap = new Map<string, McpTool>()
  private readonly toolToServer = new Map<string, string>()

  /**
   * Connect to MCP servers and discover their tools.
   * Applies per-server tool filters to whitelist specific tools.
   * Rolls back all connections if any server fails.
   */
  async connect(servers: readonly McpServerConfig[]): Promise<void> {
    for (const server of servers) {
      try {
        await this.connectServer(server)
      } catch (error) {
        // Rollback: disconnect everything that was connected
        await this.disconnect()
        throw error
      }
    }
  }

  /** Get all discovered tools, optionally filtered by name. */
  getTools(filter?: readonly string[]): readonly McpTool[] {
    const all = [...this.toolMap.values()]
    if (!filter) return all
    return all.filter((t) => filter.includes(t.name))
  }

  /** Look up a single tool by name. */
  getToolByName(name: string): McpTool | undefined {
    return this.toolMap.get(name)
  }

  /** Get the MCP Client for a given tool name (for execution). */
  getClientForTool(toolName: string): Client | undefined {
    const serverName = this.toolToServer.get(toolName)
    if (!serverName) return undefined
    return this.clients.get(serverName)
  }

  /** Disconnect all MCP clients and clear tool maps. */
  async disconnect(): Promise<void> {
    const closePromises = [...this.clients.values()].map((c) => c.close())
    await Promise.allSettled(closePromises)
    this.clients.clear()
    this.toolMap.clear()
    this.toolToServer.clear()
  }

  private async connectServer(server: McpServerConfig): Promise<void> {
    const client = new Client(
      { name: 'cognitive-swarm', version: '0.1.0' },
      { capabilities: {} },
    )

    const transport = createTransport(server)
    await client.connect(transport)
    this.clients.set(server.name, client)

    const { tools } = await client.listTools()
    for (const tool of tools) {
      if (server.toolFilter && !server.toolFilter.includes(tool.name)) {
        continue
      }

      // Skip duplicate tool names from different servers
      if (this.toolMap.has(tool.name)) {
        const existing = this.toolMap.get(tool.name)!
        console.warn(
          `Tool "${tool.name}" from server "${server.name}" skipped — already registered by "${existing.serverName}"`,
        )
        continue
      }

      const inputSchema = isRecord(tool.inputSchema) ? tool.inputSchema : {}

      const mcpTool: McpTool = {
        name: tool.name,
        description: tool.description ?? '',
        inputSchema,
        serverName: server.name,
      }
      this.toolMap.set(tool.name, mcpTool)
      this.toolToServer.set(tool.name, server.name)
    }
  }
}

function createTransport(server: McpServerConfig) {
  switch (server.transport.type) {
    case 'stdio':
      return new StdioClientTransport({
        command: server.transport.command,
        args: server.transport.args ? [...server.transport.args] : undefined,
      })
    case 'http':
      return new StreamableHTTPClientTransport(
        new URL(server.transport.url),
        server.transport.headers
          ? { requestInit: { headers: { ...server.transport.headers } } }
          : undefined,
      )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
