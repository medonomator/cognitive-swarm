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
const url = await server.start()
console.log(`A2A server running at ${url}`)
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

### Stream Verbosity Levels

| Level | Events Streamed | Use Case |
|-------|----------------|----------|
| `'minimal'` | Status transitions (`working` -> `completed`) + final artifact | Production clients that only need the result |
| `'standard'` | + round progress, consensus checks, synthesis | Development, dashboards, progress tracking |
| `'verbose'` | + every signal, agent reaction, math analysis, advisor actions, debate details | Debugging, observability, research |

### Detailed Event Mapping by Verbosity

| SwarmEvent | minimal | standard | verbose |
|------------|---------|----------|---------|
| `solve:start` | Working status | Working status | Working status |
| `round:start` | -- | "Round N started" | "Round N started" |
| `round:end` | -- | "Round N complete - M signals" | "Round N complete - M signals" |
| `agent:reacted` | -- | -- | "Agent X used strategy: Y" |
| `signal:emitted` | -- | -- | "Signal: type from source" |
| `consensus:check` | -- | "Consensus reached/not yet" | "Consensus reached/not yet" |
| `synthesis:start` | -- | "Synthesizing final answer..." | "Synthesizing final answer..." |
| `synthesis:complete` | -- | "Synthesis complete" | "Synthesis complete" |
| `math:round-analysis` | -- | -- | "Math: entropy=X, info_gain=Y" |
| `advisor:action` | -- | -- | "Advisor: type" |
| `debate:*` | -- | -- | "Debate: event-type" |
| `topology:updated` | -- | -- | "Topology updated: reason" |
| `solve:complete` | Artifact + Completed | Artifact + Completed | Artifact + Completed |

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | `{ status: 'ok', timestamp: ... }` |
| `/.well-known/agent-card.json` | GET | A2A Agent Card (capabilities, skills) |
| `/` | POST | JSON-RPC endpoint (`tasks/send`, `tasks/sendSubscribe`) |
| `/` | OPTIONS | CORS preflight (allows all origins) |

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

### Agent Card Customization

Add provider info and tags to your skills:

```typescript
const handler = createA2AHandler({
  name: 'Code Review Swarm',
  description: 'Multi-perspective automated code review',
  url: 'https://review.example.com',
  version: '2.1.0',
  provider: {
    organization: 'Acme Corp',
    url: 'https://acme.com',
  },
  skills: [
    {
      id: 'review-pr',
      name: 'Pull Request Review',
      description: 'Analyze code quality, security, and performance',
      tags: ['code-review', 'security', 'performance'],
      examples: [
        'Review this Python function for security issues',
        'Analyze the performance implications of this database query',
      ],
    },
    {
      id: 'architecture-review',
      name: 'Architecture Analysis',
      description: 'Multi-agent analysis of system architecture decisions',
      tags: ['architecture', 'design-patterns'],
      examples: [
        'Should we use event sourcing or CRUD for this domain?',
      ],
    },
  ],
  orchestratorFactory: { create: () => new SwarmOrchestrator(config) },
})
```

## Streaming SSE Format

When using `tasks/sendSubscribe`, the server responds with `text/event-stream`. Each SSE event is a JSON-RPC notification:

```
data: {"kind":"status-update","taskId":"task-123","contextId":"ctx-1","final":false,"status":{"state":"working","message":{"kind":"message","messageId":"task-123-init","role":"agent","parts":[{"kind":"text","text":"Swarm deliberation started..."}]},"timestamp":"2025-01-15T10:30:00.000Z"}}

data: {"kind":"status-update","taskId":"task-123","contextId":"ctx-1","final":false,"status":{"state":"working","message":{"kind":"message","messageId":"task-123-status-1736940600100","role":"agent","parts":[{"kind":"text","text":"Round 1 started"}]},"timestamp":"2025-01-15T10:30:00.100Z"}}

data: {"kind":"artifact-update","taskId":"task-123","contextId":"ctx-1","lastChunk":true,"artifact":{"artifactId":"task-123-result","parts":[{"kind":"text","text":"The analysis shows..."},{"kind":"data","data":{"answer":"...","confidence":0.85,"consensus":{"decided":true},"cost":{"tokens":3200},"timing":{"roundsUsed":2}}}]}}

data: {"kind":"status-update","taskId":"task-123","contextId":"ctx-1","final":true,"status":{"state":"completed","message":{"kind":"message","messageId":"task-123-status-1736940605000","role":"agent","parts":[{"kind":"text","text":"Deliberation complete - confidence: 0.85, rounds: 2"}]},"timestamp":"2025-01-15T10:30:05.000Z"}}

```

### SSE Event Types

| Event Kind | Description | When Sent |
|------------|-------------|-----------|
| `status-update` (`state: 'working'`) | Progress update | Throughout deliberation |
| `artifact-update` | Final result with answer + structured data | On solve completion |
| `status-update` (`state: 'completed'`, `final: true`) | Terminal event | After artifact |
| `status-update` (`state: 'failed'`, `final: true`) | Error occurred | On swarm error |

## Calling from Different Clients

### Python (httpx)

```python
import httpx

# Synchronous call
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
result = response.json()
print(result['result']['artifacts'][0]['parts'][0]['text'])
```

### Python (streaming with httpx-sse)

```python
import httpx
from httpx_sse import connect_sse
import json

with httpx.Client() as client:
    with connect_sse(client, 'POST', 'http://localhost:4000', json={
        'jsonrpc': '2.0',
        'method': 'tasks/sendSubscribe',
        'params': {
            'id': 'task-456',
            'message': {
                'role': 'user',
                'parts': [{'text': 'Compare microservices vs monolith'}]
            }
        },
        'id': '1'
    }) as sse:
        for event in sse.iter_sse():
            data = json.loads(event.data)
            if data.get('kind') == 'status-update':
                msg = data['status']['message']['parts'][0]['text']
                print(f"[{data['status']['state']}] {msg}")
            elif data.get('kind') == 'artifact-update':
                print(f"\nResult: {data['artifact']['parts'][0]['text']}")
```

### curl (synchronous)

```bash
curl -X POST http://localhost:4000 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tasks/send",
    "params": {
      "id": "task-789",
      "message": {
        "role": "user",
        "parts": [{"text": "Analyze event sourcing tradeoffs"}]
      }
    },
    "id": "1"
  }'
```

### curl (streaming)

```bash
curl -N -X POST http://localhost:4000 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tasks/sendSubscribe",
    "params": {
      "id": "task-stream",
      "message": {
        "role": "user",
        "parts": [{"text": "Compare REST vs GraphQL"}]
      }
    },
    "id": "1"
  }'
```

### JavaScript / TypeScript (fetch)

```typescript
// Synchronous
const response = await fetch('http://localhost:4000', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tasks/send',
    params: {
      id: 'task-js-1',
      message: {
        role: 'user',
        parts: [{ text: 'Analyze this architecture' }],
      },
    },
    id: '1',
  }),
})
const result = await response.json()
```

### JavaScript (streaming with EventSource-like parsing)

```typescript
const response = await fetch('http://localhost:4000', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tasks/sendSubscribe',
    params: {
      id: 'task-stream-1',
      message: { role: 'user', parts: [{ text: 'Analyze this' }] },
    },
    id: '1',
  }),
})

const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop()!

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6))
      console.log(event.kind, event.status?.state ?? '')
    }
  }
}
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

### Factory with Shared State

```typescript
const sharedWeights = new WeightProvider()
const sharedBandit = new BanditStorage()

const factory: OrchestratorFactory = {
  create() {
    return new SwarmOrchestrator({
      ...baseConfig,
      weightProvider: sharedWeights,  // reputation persists across tasks
      banditStorage: sharedBandit,    // strategy learning persists
    })
  },
}
```

## Error Handling

### Swarm Solve Errors

When the swarm's `solveWithStream` throws, the A2A server sends a `failed` status:

```json
{
  "kind": "status-update",
  "taskId": "task-123",
  "contextId": "ctx-1",
  "final": true,
  "status": {
    "state": "failed",
    "message": {
      "kind": "message",
      "messageId": "task-123-error",
      "role": "agent",
      "parts": [{ "kind": "text", "text": "Error message here" }]
    }
  }
}
```

### Task Cancellation

Active tasks can be cancelled. The `SwarmAgentExecutor` tracks active tasks and destroys the orchestrator on cancellation:

```typescript
// The executor internally handles:
async cancelTask(taskId: string): Promise<void> {
  const orchestrator = this.activeTasks.get(taskId)
  if (orchestrator) {
    orchestrator.destroy()  // stops all LLM calls, cleans up
    this.activeTasks.delete(taskId)
  }
}
```

### Request Body Too Large

The server enforces a 1MB body limit. Requests exceeding this receive:

```json
{ "error": "Request body too large" }
```

HTTP status: 413.

### JSON-RPC Errors

Internal server errors return standard JSON-RPC error format:

```json
{
  "jsonrpc": "2.0",
  "error": { "code": -32603, "message": "Internal error" },
  "id": null
}
```

## A2AServer

```typescript
interface A2AServer {
  readonly server: Server          // Node.js HTTP server
  start(): Promise<string>         // returns base URL
  stop(): Promise<void>            // graceful shutdown
}
```

### Graceful Shutdown

`stop()` performs graceful shutdown:
1. Stops accepting new connections
2. Waits for active connections to finish (up to 5 seconds)
3. Force-destroys remaining connections after timeout

```typescript
// Handle process signals
process.on('SIGTERM', async () => {
  console.log('Shutting down...')
  await server.stop()
  process.exit(0)
})
```

## Server Options

```typescript
interface A2AServerOptions {
  readonly port?: number          // default: 3000
  readonly hostname?: string      // default: '0.0.0.0'
}
```

## CORS Configuration

The server allows all origins by default (`Access-Control-Allow-Origin: *`). This is set on:
- Agent card responses (`GET /.well-known/agent-card.json`)
- JSON-RPC responses (`POST /`)
- SSE streaming responses
- CORS preflight responses (`OPTIONS /`)

For production, if you need to restrict origins, use a reverse proxy (nginx, Caddy) in front of the A2A server:

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;

        # Override CORS
        add_header Access-Control-Allow-Origin "https://app.example.com" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

## Server Features

- **1MB body limit** -- rejects requests over 1MB with 413 status
- **Graceful shutdown** -- tracks active connections, force-closes after 5s timeout
- **SSE streaming** -- `tasks/sendSubscribe` returns Server-Sent Events
- **CORS** -- allows all origins by default
- **Health endpoint** -- always responds even during heavy load
- **Connection tracking** -- active sockets tracked for clean shutdown

## Security Considerations

### Rate Limiting

The A2A server does not include built-in rate limiting. Use a reverse proxy or middleware:

```typescript
// Example: simple in-process rate limiter
const requestCounts = new Map<string, number>()

setInterval(() => requestCounts.clear(), 60_000) // reset every minute

function checkRateLimit(ip: string): boolean {
  const count = (requestCounts.get(ip) ?? 0) + 1
  requestCounts.set(ip, count)
  return count <= 30 // 30 requests per minute
}
```

### Input Validation

The `SwarmAgentExecutor` extracts task text from user message parts, concatenating all `TextPart` content. Non-text parts are ignored. If no text parts are found, the task text defaults to `'No task text provided'`.

Validate task length before it reaches the LLM:

```typescript
const factory: OrchestratorFactory = {
  create() {
    return new SwarmOrchestrator({
      ...config,
      // maxTokens per agent limits LLM cost
      agents: config.agents.map(a => ({ ...a, maxTokens: 4096 })),
    })
  },
}
```

## Load Balancing and Scaling

### Horizontal Scaling

Each A2A server instance is stateless (using `InMemoryTaskStore`). For production scaling:

```typescript
import { createA2AHandler } from '@cognitive-swarm/a2a'

// Use a shared task store for multi-instance setups
const handler = createA2AHandler({
  ...config,
  taskStore: new RedisTaskStore(redisClient), // custom implementation
})
```

### Multi-Swarm Routing

Expose multiple swarm configurations as different skills:

```typescript
const handler = createA2AHandler({
  name: 'Multi-Domain Swarm',
  description: 'Specialized analysis across multiple domains',
  url: 'http://localhost:4000',
  skills: [
    { id: 'code-review', name: 'Code Review', description: 'Multi-agent code analysis' },
    { id: 'architecture', name: 'Architecture', description: 'System design analysis' },
    { id: 'security', name: 'Security Audit', description: 'Security vulnerability analysis' },
  ],
  orchestratorFactory: {
    create() {
      // The factory can inspect the task to select a config,
      // or use a single versatile swarm config
      return new SwarmOrchestrator(defaultConfig)
    },
  },
})
```

For true per-skill routing, implement task inspection in the factory:

```typescript
const factory: OrchestratorFactory = {
  create() {
    // Factory doesn't receive task text directly.
    // For skill-based routing, use different A2A servers
    // or a proxy that routes based on the skill ID.
    return new SwarmOrchestrator(defaultConfig)
  },
}
```

## Monitoring and Health Checks

### Health Endpoint

```bash
curl http://localhost:4000/health
# {"status":"ok","timestamp":1736940600000}
```

Use this for load balancer health checks and uptime monitoring.

### Combining with OTel

```typescript
import { instrumentSwarm } from '@cognitive-swarm/otel'

const factory: OrchestratorFactory = {
  create() {
    const swarm = new SwarmOrchestrator(config)
    return instrumentSwarm(swarm, {
      agentCount: config.agents.length,
      maxRounds: config.maxRounds,
    })
  },
}

// Every A2A task now produces OTel traces
const handler = createA2AHandler({
  ...config,
  orchestratorFactory: factory,
})
```

## Production Deployment Example

### Dockerfile

```dockerfile
FROM node:22-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "dist/server.js"]
```

### server.ts

```typescript
import { createA2AHandler, createA2AServer } from '@cognitive-swarm/a2a'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { instrumentSwarm } from '@cognitive-swarm/otel'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'

// Start OTel
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_URL ?? 'http://localhost:4317',
  }),
})
sdk.start()

const port = Number(process.env.PORT ?? 4000)

const handler = createA2AHandler({
  name: 'Production Swarm',
  description: 'Multi-agent analysis service',
  url: `http://localhost:${port}`,
  version: '1.0.0',
  provider: {
    organization: 'Your Org',
    url: 'https://example.com',
  },
  skills: [
    {
      id: 'analyze',
      name: 'Analysis',
      description: 'Deep multi-agent analysis',
      tags: ['analysis', 'research'],
    },
  ],
  streaming: true,
  streamVerbosity: 'standard',
  orchestratorFactory: {
    create() {
      const swarm = new SwarmOrchestrator(swarmConfig)
      return instrumentSwarm(swarm)
    },
  },
})

const server = createA2AServer(handler, { port })
const url = await server.start()
console.log(`A2A server running at ${url}`)

// Graceful shutdown
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down...`)
    await server.stop()
    await sdk.shutdown()
    process.exit(0)
  })
}
```

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
