# @cognitive-swarm/mcp

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/mcp)](https://www.npmjs.com/package/@cognitive-swarm/mcp)

Model Context Protocol integration. Give swarm agents access to external tools via MCP servers.

## Install

```bash
npm install @cognitive-swarm/mcp
```

## Quick Start

```typescript
import { createToolSupport } from '@cognitive-swarm/mcp'

// Connect to MCP servers and create tool support bundle
const support = await createToolSupport(resolvedToolConfig)

// Attach to an agent
const agentDef = {
  config: { id: 'researcher', /* ... */ },
  engine,
  toolSupport: support,
}

// Clean up when done
support.registry.disconnect()
```

## McpToolRegistry

Manages connections to one or more MCP servers:

```typescript
import { McpToolRegistry } from '@cognitive-swarm/mcp'

const registry = new McpToolRegistry()

await registry.connect([
  {
    name: 'github',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
  },
  {
    name: 'filesystem',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
    },
  },
])

// Get all available tools
const tools = registry.getTools()
```

## McpToolExecutor

Executes tool calls against connected MCP servers:

```typescript
import { McpToolExecutor } from '@cognitive-swarm/mcp'

const executor = new McpToolExecutor(registry, timeoutMs)

const results = await executor.executeAll([
  { toolName: 'github_search_repos', arguments: { query: 'cognitive-swarm' } },
  { toolName: 'github_get_file', arguments: { path: 'README.md' } },
])
```

## Transport Types

```typescript
type McpTransportConfig =
  | {
      type: 'stdio'
      command: string
      args?: readonly string[]
    }
  | {
      type: 'http'
      url: string
      headers?: Readonly<Record<string, string>>
    }
```

## ToolPromptBuilder

Generates tool descriptions for injection into agent prompts:

```typescript
import { ToolPromptBuilder } from '@cognitive-swarm/mcp'

const builder = new ToolPromptBuilder()
const prompt = builder.build(tools)
// Produces a formatted description of available tools for the LLM
```

## ToolResponseParser

Parses tool call requests from LLM responses:

```typescript
import { ToolResponseParser } from '@cognitive-swarm/mcp'

const parser = new ToolResponseParser()
const calls = parser.parse(llmResponse)
// Extracts structured tool call requests
```

## Integration with SwarmOrchestrator

Tool support is injected per-agent via `SwarmAgentDef.toolSupport`:

```typescript
import { McpToolRegistry, McpToolExecutor, ToolPromptBuilder, ToolResponseParser } from '@cognitive-swarm/mcp'

const registry = new McpToolRegistry()
await registry.connect([
  { name: 'github', transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } },
])

const tools = registry.getTools()
const executor = new McpToolExecutor(registry)

const swarm = new SwarmOrchestrator({
  agents: [
    {
      config: {
        id: 'researcher',
        name: 'Researcher',
        role: 'Research using available tools',
        personality: { curiosity: 0.9, caution: 0.3, conformity: 0.4, verbosity: 0.7 },
        listens: ['task:new', 'discovery'],
        canEmit: ['discovery', 'tool:result'],
      },
      engine,
      toolSupport: {
        tools,
        executor,
        promptInjector: new ToolPromptBuilder(),
        callParser: new ToolResponseParser(),
        maxToolCalls: 5,
      },
    },
  ],
})
```

## Tool Results as Signals

When an agent uses a tool, the result is emitted as a `tool:result` signal on the bus:

```typescript
interface ToolResultPayload {
  readonly toolName: string
  readonly result: string
  readonly isError: boolean
  readonly durationMs: number
  readonly triggeredBy: string   // agent ID
}
```

Other agents that listen to `tool:result` can incorporate these results into their own analysis.

## Per-Agent Tool Config

Configure tools per-agent in `SwarmAgentConfig`:

```typescript
{
  config: {
    id: 'researcher',
    tools: {
      servers: [
        {
          name: 'github',
          transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
          toolFilter: ['github_search_repos', 'github_get_file'],
        }
      ],
      maxToolCalls: 5,
      toolTimeoutMs: 10_000,
      personalityGating: true,
    },
    // ...
  }
}
```

## MCP Server Examples

Popular MCP servers compatible with cognitive-swarm:

```bash
# GitHub
npx -y @modelcontextprotocol/server-github

# Filesystem access
npx -y @modelcontextprotocol/server-filesystem /path/to/workspace

# Web search (Brave)
npx -y @modelcontextprotocol/server-brave-search

# PostgreSQL
npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb

# HTTP fetch
npx -y @modelcontextprotocol/server-fetch
```

## Exports

```typescript
export { McpToolRegistry } from '@cognitive-swarm/mcp'
export { McpToolExecutor } from '@cognitive-swarm/mcp'
export { ToolPromptBuilder } from '@cognitive-swarm/mcp'
export { ToolResponseParser } from '@cognitive-swarm/mcp'
export { createToolSupport } from '@cognitive-swarm/mcp'
export type { McpTool, ToolCall, ToolResult } from '@cognitive-swarm/mcp'
```
