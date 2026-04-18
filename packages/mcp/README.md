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

// All-in-one setup -- returns registry, executor, prompt builder, and parser
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
    transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
  },
  {
    name: 'filesystem',
    transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'] },
  },
])

const tools = registry.getTools()
```

## McpToolExecutor

Execute tool calls against connected MCP servers:

```typescript
import { McpToolExecutor } from '@cognitive-swarm/mcp'

const executor = new McpToolExecutor(registry, timeoutMs)

const results = await executor.executeAll([
  { toolName: 'github_search_repos', arguments: { query: 'cognitive-swarm' } },
])
```

## Transport Types

```typescript
type McpTransportConfig =
  | { type: 'stdio'; command: string; args?: readonly string[] }
  | { type: 'http'; url: string; headers?: Readonly<Record<string, string>> }
```

## ToolPromptBuilder & ToolResponseParser

```typescript
import { ToolPromptBuilder, ToolResponseParser } from '@cognitive-swarm/mcp'

// Generate tool descriptions for agent system prompts
const builder = new ToolPromptBuilder()
const prompt = builder.build(tools)

// Parse tool call requests from LLM output
const parser = new ToolResponseParser()
const calls = parser.parse(llmResponse)
```

## Integration with SwarmOrchestrator

```typescript
const registry = new McpToolRegistry()
await registry.connect([
  { name: 'github', transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } },
])

const swarm = new SwarmOrchestrator({
  agents: [{
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
      tools: registry.getTools(),
      executor: new McpToolExecutor(registry),
      promptInjector: new ToolPromptBuilder(),
      callParser: new ToolResponseParser(),
      maxToolCalls: 5,
    },
  }],
})
```

## Tool Results as Signals

Tool results are emitted as `tool:result` signals on the bus, visible to all agents that listen to this signal type:

```typescript
interface ToolResultPayload {
  readonly toolName: string
  readonly result: string
  readonly isError: boolean
  readonly durationMs: number
  readonly triggeredBy: string   // agent ID
}
```

## Per-Agent Tool Config

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
        },
      ],
      maxToolCalls: 5,
      toolTimeoutMs: 10_000,
      personalityGating: true,
    },
  },
}
```

## Compatible MCP Servers

```bash
npx -y @modelcontextprotocol/server-github          # GitHub
npx -y @modelcontextprotocol/server-filesystem /path # Filesystem
npx -y @modelcontextprotocol/server-brave-search     # Web search
npx -y @modelcontextprotocol/server-postgres $DSN    # PostgreSQL
npx -y @modelcontextprotocol/server-fetch            # HTTP fetch
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/mcp) | [GitHub](https://github.com/medonomator/cognitive-swarm)
