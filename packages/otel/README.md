# @cognitive-swarm/otel

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/otel)](https://www.npmjs.com/package/@cognitive-swarm/otel)

OpenTelemetry distributed tracing for cognitive-swarm. Zero overhead when no provider is configured.

## Install

```bash
npm install @cognitive-swarm/otel @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-grpc
```

## Quick Start

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { instrumentSwarm } from '@cognitive-swarm/otel'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

// Start OTel SDK first
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: 'http://localhost:4317' }),
})
sdk.start()

// Instrument the swarm
const swarm = new SwarmOrchestrator(config)
const instrumented = instrumentSwarm(swarm, {
  agentCount: config.agents.length,
  maxRounds: config.maxRounds,
})

const result = await instrumented.solve('Analyze this architecture')
await sdk.shutdown()  // flush remaining spans
```

## `instrumentSwarm(orchestrator, options?)`

Wraps an orchestrator with full OTel instrumentation. Returns an `InstrumentedOrchestrator`:

```typescript
interface InstrumentedOrchestrator {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  destroy(): void
  dispose(): void   // remove OTel subscriptions without destroying orchestrator
}
```

## Span Hierarchy

```
solve                                    [task, agents, maxRounds]
  round [1]                              [round.number]
    agent:on-signal [analyst]            [agent.id, strategy, processing_time_ms]
    tool:execute [web-search]            [tool.name, duration_ms, is_error]
    (event) signal:emitted               [signal.id, signal.type]
    (event) consensus:failed
  round [2]
    debate                               [resolved, rounds, confidence]
    (event) consensus:reached
  synthesize
```

## Span Attributes

All attribute keys are exported as `ATTR` constants:

```typescript
import { ATTR } from '@cognitive-swarm/otel'
```

| Category | Key | Type | Description |
|----------|-----|------|-------------|
| Solve | `swarm.task` | string | Task text (truncated to 256 chars) |
| | `swarm.rounds_used` | number | Actual rounds used |
| | `swarm.consensus_reached` | boolean | Whether consensus was reached |
| | `swarm.tokens` | number | Total tokens used |
| | `swarm.cost_usd` | number | Estimated cost |
| Round | `swarm.round.number` | number | Round ordinal |
| Agent | `swarm.agent.id` | string | Agent identifier |
| | `swarm.agent.strategy` | string | Strategy used |
| Tool | `swarm.tool.name` | string | Tool name |
| | `swarm.tool.is_error` | boolean | Whether tool errored |

## SpanManager

Lower-level span lifecycle management:

```typescript
import { SpanManager, getTracer } from '@cognitive-swarm/otel'

const manager = new SpanManager()
manager.startSolve('my task', 3, 5)
// ... events flow ...
manager.endSolve(result)
manager.cleanup()  // end orphaned spans
```

All methods are wrapped in try-catch -- tracing failures never crash the swarm.

## Performance

| Scenario | Overhead |
|----------|----------|
| No `NodeSDK` started | ~0 (no-op tracer) |
| Batch exporter (prod) | <1% |
| Jaeger exporter | 1-3% |
| Console exporter | 5-8% |

## Cloud Provider Setup

```typescript
// Datadog
new OTLPTraceExporter({
  url: 'https://trace.agent.datadoghq.com/api/v0.2/traces',
  headers: { 'DD-API-KEY': process.env.DD_API_KEY! },
})

// New Relic
new OTLPTraceExporter({
  url: 'https://otlp.nr-data.net:4317',
  headers: { 'api-key': process.env.NEW_RELIC_LICENSE_KEY! },
})
```

## Jaeger Dashboard Queries

```
service=cognitive-swarm operation=cognitive-swarm.solve minDuration=10s
service=cognitive-swarm tags={"swarm.consensus_reached":"false"}
service=cognitive-swarm tags={"swarm.tool.is_error":"true"}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/otel) | [GitHub](https://github.com/medonomator/cognitive-swarm)
