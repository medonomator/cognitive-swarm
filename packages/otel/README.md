# @cognitive-swarm/otel

OpenTelemetry distributed tracing for cognitive-swarm.

## Installation

```bash
npm install @cognitive-swarm/otel
```

## Overview

Wraps a cognitive-swarm orchestrator with OpenTelemetry instrumentation. Every swarm run, agent turn, and signal exchange is captured as spans with semantic attributes. Works with any OTel-compatible backend (Jaeger, Grafana Tempo, Honeycomb, etc.).

## Usage

```ts
import { instrumentSwarm } from '@cognitive-swarm/otel';

// Wrap an existing orchestrator
const instrumented = instrumentSwarm(orchestrator, {
  serviceName: 'my-swarm',
});

// Run as usual -- spans are emitted automatically
const result = await instrumented.run({ task: 'Analyze this PR' });
```

### Advanced

```ts
import { SpanManager, getTracer, ATTR } from '@cognitive-swarm/otel';

// Access the tracer directly
const tracer = getTracer('my-component');

// Use SpanManager for manual span lifecycle
const spanManager = new SpanManager(tracer);
spanManager.start('custom-operation', { [ATTR.AGENT_ID]: 'analyst' });
// ... do work ...
spanManager.end();
```

## Exports

| Export                      | Kind     | Description                              |
| --------------------------- | -------- | ---------------------------------------- |
| `instrumentSwarm`           | Function | Instrument an orchestrator               |
| `SpanManager`               | Class    | Manual span lifecycle management         |
| `getTracer`                 | Function | Get an OTel tracer instance              |
| `ATTR`                      | Object   | Semantic attribute constants             |
| `InstrumentableOrchestrator`| Type     | Orchestrator shape accepted by wrapper   |
| `InstrumentedOrchestrator`  | Type     | Wrapped orchestrator with tracing        |
| `InstrumentSwarmOptions`    | Type     | Options for `instrumentSwarm`            |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
