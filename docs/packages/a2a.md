# @cognitive-swarm/a2a

A2A (Agent-to-Agent) protocol integration. Expose any cognitive-swarm as a standard A2A HTTP endpoint. Any framework (CrewAI, AutoGen, LangChain) can call it.

## Install

```bash
npm install @cognitive-swarm/a2a
```

## Quick Start

```typescript
import { createA2AHandler, createA2AServer } from '@cognitive-swarm/a2a'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const handler = createA2AHandler({
  name: 'Research Swarm',
  description: 'Multi-agent deliberation for complex analysis',
  url: 'http://localhost:4000',
  skills: [
    {
      id: 'analyze',
      name: 'Deep Analysis',
      description: 'Multi-agent analysis of complex topics',
    },
  ],
  orchestratorFactory: {
    create: () => new SwarmOrchestrator(swarmConfig),
  },
})

const server = createA2AServer(handler, { port: 4000 })
await server.start()
```

## A2ASwarmServerConfig

```typescript
interface A2ASwarmServerConfig {
  readonly orchestratorFactory: OrchestratorFactory
  readonly name: string
  readonly description: string
  readonly url: string
  readonly version?: string                // default: '1.0.0'
  readonly skills: readonly A2ASkillDef[]
  readonly provider?: {
    readonly organization: string
    readonly url: string
  }
  readonly streaming?: boolean             // default: true
  readonly streamVerbosity?: StreamVerbosity  // default: 'standard'
}

type StreamVerbosity = 'minimal' | 'standard' | 'verbose'
```

Stream verbosity levels:
- `'minimal'` -- only status transitions + final artifact
- `'standard'` -- includes round progress and consensus checks
- `'verbose'` -- includes every signal, math analysis, advisor actions

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | `{ status: 'ok', timestamp: ... }` |
| `/.well-known/agent-card.json` | GET | A2A Agent Card (capabilities, skills) |
| `/` | POST | JSON-RPC endpoint (`tasks/send`, `tasks/sendSubscribe`) |

## A2A Agent Card

Automatically generated from your handler config:

```json
{
  "name": "Research Swarm",
  "description": "Multi-agent deliberation for complex analysis",
  "url": "http://localhost:4000",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "analyze",
      "name": "Deep Analysis",
      "description": "Multi-agent analysis of complex topics"
    }
  ]
}
```

## Calling from Another Framework

Any framework that supports A2A can call your swarm:

```python
# Python example
import httpx

response = httpx.post('http://localhost:4000', json={
    'jsonrpc': '2.0',
    'method': 'tasks/send',
    'params': {
        'id': 'task-123',
        'message': {
            'role': 'user',
            'parts': [{'text': 'Analyze the tradeoffs of event sourcing'}]
        }
    },
    'id': '1'
})
```

## OrchestratorFactory

Creates a fresh `SwarmOrchestrator` per incoming task:

```typescript
interface OrchestratorFactory {
  create(): Orchestratable
}

interface Orchestratable {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  destroy(): void
}
```

Each task gets a clean swarm state. Persistent state (bandit learning, reputation) should be passed via shared `banditStorage` or `weightProvider` in the swarm config.

## A2AServer

```typescript
interface A2AServer {
  readonly server: Server          // Node.js HTTP server
  start(): Promise<string>         // returns base URL
  stop(): Promise<void>            // graceful shutdown
}
```

## Server Options

```typescript
interface A2AServerOptions {
  readonly port?: number          // default: 3000
  readonly hostname?: string      // default: '0.0.0.0'
}
```

## Server Features

- **1MB body limit** -- rejects requests over 1MB
- **Graceful shutdown** -- tracks active connections, force-closes after 5s timeout
- **SSE streaming** -- `tasks/sendSubscribe` returns Server-Sent Events
- **CORS** -- allows all origins by default
- **Health endpoint** -- always responds even during heavy load

## A2ASkillDef

```typescript
interface A2ASkillDef {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly tags?: readonly string[]
  readonly examples?: readonly string[]
}
```
