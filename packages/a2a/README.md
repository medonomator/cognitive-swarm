# @cognitive-swarm/a2a

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/a2a)](https://www.npmjs.com/package/@cognitive-swarm/a2a)

A2A (Agent-to-Agent) protocol server. Expose any cognitive-swarm as a standard A2A HTTP endpoint. Any framework (CrewAI, AutoGen, LangChain) can call it.

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
    { id: 'analyze', name: 'Deep Analysis', description: 'Multi-agent analysis of complex topics' },
  ],
  orchestratorFactory: {
    create: () => new SwarmOrchestrator(swarmConfig),
  },
})

const server = createA2AServer(handler, { port: 4000 })
const url = await server.start()
// A2A endpoint: http://localhost:4000
// Agent card: http://localhost:4000/.well-known/agent-card.json
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/.well-known/agent-card.json` | GET | A2A Agent Card (capabilities, skills) |
| `/` | POST | JSON-RPC (`tasks/send`, `tasks/sendSubscribe`) |

## Stream Verbosity

```typescript
const handler = createA2AHandler({
  ...config,
  streaming: true,
  streamVerbosity: 'standard',  // 'minimal' | 'standard' | 'verbose'
})
```

| Level | Events Streamed |
|-------|----------------|
| `minimal` | Status transitions + final artifact |
| `standard` | + round progress, consensus, synthesis |
| `verbose` | + every signal, agent reaction, math, advisor, debate |

## Calling from Clients

### curl (synchronous)

```bash
curl -X POST http://localhost:4000 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tasks/send","params":{"id":"task-1","message":{"role":"user","parts":[{"text":"Analyze this"}]}},"id":"1"}'
```

### curl (streaming)

```bash
curl -N -X POST http://localhost:4000 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tasks/sendSubscribe","params":{"id":"task-2","message":{"role":"user","parts":[{"text":"Compare REST vs GraphQL"}]}},"id":"1"}'
```

### Python

```python
import httpx
response = httpx.post('http://localhost:4000', json={
    'jsonrpc': '2.0',
    'method': 'tasks/send',
    'params': {'id': 'task-1', 'message': {'role': 'user', 'parts': [{'text': 'Analyze this'}]}},
    'id': '1'
})
```

## Configuration

```typescript
interface A2ASwarmServerConfig {
  readonly orchestratorFactory: OrchestratorFactory
  readonly name: string
  readonly description: string
  readonly url: string
  readonly version?: string                // default: '1.0.0'
  readonly skills: readonly A2ASkillDef[]
  readonly streaming?: boolean             // default: true
  readonly streamVerbosity?: StreamVerbosity
  readonly provider?: { organization: string; url: string }
}

interface A2AServerOptions {
  readonly port?: number          // default: 3000
  readonly hostname?: string      // default: '0.0.0.0'
}
```

## OrchestratorFactory

Each task gets a fresh swarm. Share persistent state via config:

```typescript
const factory: OrchestratorFactory = {
  create() {
    return new SwarmOrchestrator({
      ...baseConfig,
      weightProvider: sharedWeights,  // reputation persists
      banditStorage: sharedBandit,    // strategy learning persists
    })
  },
}
```

## Server Features

- 1MB body limit (413 on exceed)
- Graceful shutdown (tracks active connections, 5s timeout)
- SSE streaming for `tasks/sendSubscribe`
- CORS (allows all origins by default)
- Health endpoint at `/health`
- Task cancellation support

## Combining with OTel

```typescript
import { instrumentSwarm } from '@cognitive-swarm/otel'

const factory: OrchestratorFactory = {
  create() {
    const swarm = new SwarmOrchestrator(config)
    return instrumentSwarm(swarm, { agentCount: config.agents.length })
  },
}
```

## Key Exports

| Export | Kind | Description |
|--------|------|-------------|
| `createA2AHandler` | Function | Create an A2A request handler |
| `createA2AServer` | Function | Start a standalone A2A server |
| `SwarmAgentExecutor` | Class | Executes swarm runs for A2A tasks |
| `buildAgentCard` | Function | Generate an A2A agent card |
| `mapSwarmEventToA2A` | Function | Map swarm signals to A2A events |

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/a2a) | [GitHub](https://github.com/medonomator/cognitive-swarm)
