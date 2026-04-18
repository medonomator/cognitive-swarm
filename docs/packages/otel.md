# @cognitive-swarm/otel

OpenTelemetry distributed tracing for cognitive-swarm. Zero overhead when no provider is configured.

## Install

```bash
npm install @cognitive-swarm/otel @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-grpc
```

## instrumentSwarm()

The main entry point. Wraps an orchestrator with full OTel instrumentation:

```typescript
import { instrumentSwarm } from '@cognitive-swarm/otel'

const swarm = new SwarmOrchestrator(config)
const instrumented = instrumentSwarm(swarm)

const result = await instrumented.solve('task')
// All event types are now traced as spans
```

Returns an `InstrumentedOrchestrator`:

```typescript
interface InstrumentedOrchestrator {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  destroy(): void
  dispose(): void  // remove OTel subscriptions without destroying orchestrator
}
```

## SpanManager

Lower-level access if you need to manage spans directly:

```typescript
import { SpanManager } from '@cognitive-swarm/otel'
```

## Setup with Jaeger

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'cognitive-swarm',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4317',
  }),
})

sdk.start()

// Then instrument and solve
const instrumented = instrumentSwarm(swarm)
const result = await instrumented.solve('Analyze this architecture')
```

## Setup with Zipkin

```typescript
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin'

const sdk = new NodeSDK({
  traceExporter: new ZipkinExporter({
    url: 'http://localhost:9411/api/v2/spans',
  }),
})
```

## Span Hierarchy

```
solve
  round [1]
    agent:reaction [analyst]
    agent:reaction [critic]
    signal:emitted [discovery, confidence=0.87]
    signal:emitted [proposal]
    consensus:check [decided=false, confidence=0.52]
    math:analysis [entropy=0.82, gain=0.31]
  round [2]
    debate:start [proposal-a vs proposal-b]
      debate:round [1]
      debate:round [2]
      debate:end [resolved=true, confidence=0.81]
    advisor:action [inject-signal: groupthink-correction]
    topology:updated [pruned 1 edge]
    consensus:check [decided=true, confidence=0.79]
  synthesis:complete
  solve:complete [tokens=3200, $0.0048, 2 rounds, 4200ms]
```

## Span Types

| Span | Key Attributes |
|------|----------------|
| `solve` | `task`, `solveId` |
| `round` | `round.number` |
| `signal:emitted` | `signal.type`, `signal.source`, `signal.confidence` |
| `agent:reacted` | `agent.id`, `strategy.used`, `processing.ms` |
| `consensus:check` | `consensus.strategy`, `consensus.decided`, `consensus.confidence` |
| `math:round-analysis` | `entropy`, `normalized.entropy`, `information.gain` |
| `math:stopping` | `stopping.reason` |
| `advisor:action` | `advice.type`, `advice.reason` |
| `debate:start` | `proposal.a`, `proposal.b` |
| `debate:round` | `debate.round` |
| `debate:end` | `debate.resolved`, `debate.winner`, `debate.confidence` |
| `topology:updated` | `topology.reason` |
| `evolution:spawned` | `agent.id`, `agent.domain`, `spawn.reason` |
| `evolution:dissolved` | `agent.id`, `dissolve.reason` |
| `synthesis:start` | - |
| `synthesis:complete` | `answer.length` |
| `solve:complete` | `tokens`, `estimated.usd`, `rounds.used`, `total.ms` |
| `round:start` | `round.number` |
| `round:end` | `signal.count` |
| `checkpoint:saved` | `checkpoint.id` |

## InstrumentableOrchestrator

The interface required for instrumentation (structural typing -- no import needed):

```typescript
interface InstrumentableOrchestrator {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  on<K extends keyof SwarmEventMap & string>(
    event: K,
    handler: (data: SwarmEventMap[K]) => void,
  ): () => void
  destroy(): void
}
```

## Zero Overhead

When no OTel provider is configured (no `NodeSDK` started), all span creation is no-ops. The instrumentation layer checks for active providers before creating spans.
