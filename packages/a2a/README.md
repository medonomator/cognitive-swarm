# @cognitive-swarm/a2a

A2A (Agent-to-Agent) protocol server for cognitive-swarm.

## Installation

```bash
npm install @cognitive-swarm/a2a
```

## Overview

Exposes a cognitive-swarm orchestrator as an A2A-compatible server, allowing external agents and clients to interact with it over the standard Agent-to-Agent protocol. Handles agent card generation, task streaming, and event mapping between swarm signals and A2A events.

## Usage

```ts
import { createA2AServer, buildAgentCard } from '@cognitive-swarm/a2a';

const server = createA2AServer({
  orchestratorFactory: (task) => createMyOrchestrator(task),
  skills: [
    { id: 'code-review', name: 'Code Review', description: 'Review PRs' },
  ],
  port: 3000,
});

await server.start();
// A2A endpoint available at http://localhost:3000
// Agent card at http://localhost:3000/.well-known/agent.json
```

### Custom handler (e.g., for Express or other frameworks)

```ts
import { createA2AHandler, SwarmAgentExecutor } from '@cognitive-swarm/a2a';

const handler = createA2AHandler({
  executor: new SwarmAgentExecutor({ /* ... */ }),
  skills: [{ id: 'debug', name: 'Debug', description: 'Debug issues' }],
});

// Mount handler in your HTTP framework
app.post('/a2a', handler);
```

## Exports

| Export                | Kind     | Description                                |
| --------------------- | -------- | ------------------------------------------ |
| `createA2AServer`     | Function | Start a standalone A2A server              |
| `createA2AHandler`    | Function | Create an A2A request handler              |
| `SwarmAgentExecutor`  | Class    | Executes swarm runs for A2A tasks          |
| `buildAgentCard`      | Function | Generate an A2A agent card                 |
| `mapSwarmEventToA2A`  | Function | Map swarm signals to A2A events            |
| `A2ASwarmServerConfig`| Type     | Full server configuration                  |
| `A2AServerOptions`    | Type     | Server startup options                     |
| `A2ASkillDef`         | Type     | Skill definition for the agent card        |
| `Orchestratable`      | Type     | Orchestrator interface for A2A             |
| `OrchestratorFactory` | Type     | Factory function producing orchestrators   |
| `StreamVerbosity`     | Type     | Controls streaming detail level            |
| `A2AServer`           | Type     | Server instance returned by factory        |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
