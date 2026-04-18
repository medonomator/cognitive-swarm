# @cognitive-swarm/mcp

MCP (Model Context Protocol) integration for cognitive-swarm agents.

## Installation

```bash
npm install @cognitive-swarm/mcp
```

## Overview

Bridges cognitive-swarm agents with MCP tool servers. The package handles tool discovery, prompt injection, response parsing, and execution. Use `createToolSupport` for a quick all-in-one setup, or compose the lower-level classes for fine-grained control.

## Usage

```ts
import { createToolSupport } from '@cognitive-swarm/mcp';

// Quick setup -- returns registry, executor, prompt builder, and parser
const tools = await createToolSupport({
  servers: [{ name: 'fs', command: 'mcp-fs' }],
});

// Inject available tools into an agent's system prompt
const prompt = tools.promptBuilder.build(tools.registry.listTools());

// Parse tool calls from agent output
const calls = tools.responseParser.parse(agentOutput);

// Execute a tool call
const result = await tools.executor.execute(calls[0]);
```

### Lower-level API

```ts
import {
  McpToolRegistry,
  McpToolExecutor,
  ToolPromptBuilder,
  ToolResponseParser,
} from '@cognitive-swarm/mcp';

const registry = new McpToolRegistry();
const executor = new McpToolExecutor(registry);
const promptBuilder = new ToolPromptBuilder();
const parser = new ToolResponseParser();
```

## Exports

| Export               | Kind     | Description                              |
| -------------------- | -------- | ---------------------------------------- |
| `createToolSupport`  | Function | All-in-one setup helper                  |
| `McpToolRegistry`    | Class    | Discovers and stores available tools     |
| `McpToolExecutor`    | Class    | Executes tool calls against MCP servers  |
| `ToolPromptBuilder`  | Class    | Builds system prompt sections for tools  |
| `ToolResponseParser` | Class    | Parses tool calls from agent output      |
| `McpTool`            | Type     | Tool definition                          |
| `ToolCall`           | Type     | Parsed tool invocation                   |
| `ToolResult`         | Type     | Result from tool execution               |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
