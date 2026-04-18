# @cognitive-swarm/otel

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/otel)](https://www.npmjs.com/package/@cognitive-swarm/otel)

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
const instrumented = instrumentSwarm(swarm, {
  agentCount: config.agents.length,
  maxRounds: config.maxRounds,
})

const result = await instrumented.solve('task')
// All event types are now traced as spans
```

Returns an `InstrumentedOrchestrator`:

```typescript
interface InstrumentedOrchestrator {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  destroy(): void
  /** Remove OTel subscriptions without destroying the orchestrator. */
  dispose(): void
}
```

### InstrumentSwarmOptions

```typescript
interface InstrumentSwarmOptions {
  /** Number of agents in the swarm (recorded on the root span). */
  readonly agentCount?: number
  /** Max rounds configured (recorded on the root span). */
  readonly maxRounds?: number
}
```

## SpanManager

Lower-level access if you need to manage spans directly. The `SpanManager` maintains the active span hierarchy and maps swarm events to OTel spans. Every public method is wrapped in try-catch so tracing failures never crash the swarm.

```typescript
import { SpanManager } from '@cognitive-swarm/otel'

const manager = new SpanManager()
manager.startSolve('my task', 3, 5)
// ... events flow in ...
manager.endSolve(result)
manager.cleanup() // end any orphaned spans
```

Internal span tree:

```
solve -> round:N -> agent:X / debate / advisor
                 -> tool:Y (child of round)
solve -> synthesize
```

## Complete Setup: Jaeger + Grafana with Docker Compose

### docker-compose.yaml

```yaml
version: '3.8'
services:
  jaeger:
    image: jaegertracing/all-in-one:1.58
    ports:
      - '16686:16686'  # Jaeger UI
      - '4317:4317'    # OTLP gRPC
      - '4318:4318'    # OTLP HTTP
    environment:
      COLLECTOR_OTLP_ENABLED: 'true'

  grafana:
    image: grafana/grafana:11.0.0
    ports:
      - '3100:3000'
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: 'true'
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
    volumes:
      - grafana-data:/var/lib/grafana

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.100.0
    volumes:
      - ./otel-config.yaml:/etc/otelcol-contrib/config.yaml
    ports:
      - '4327:4317'   # OTLP gRPC (external)
      - '4328:4318'   # OTLP HTTP (external)

volumes:
  grafana-data:
```

### otel-config.yaml (for the collector)

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

exporters:
  jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
  logging:
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [jaeger, logging]
```

### Application setup

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { instrumentSwarm } from '@cognitive-swarm/otel'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'cognitive-swarm',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4317',
  }),
})

sdk.start()

// Instrument the swarm
const swarm = new SwarmOrchestrator(config)
const instrumented = instrumentSwarm(swarm, {
  agentCount: config.agents.length,
  maxRounds: config.maxRounds,
})

const result = await instrumented.solve('Analyze this architecture')

// Graceful shutdown - flush remaining spans
await sdk.shutdown()
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

## Integration with Cloud Providers

### Datadog

```bash
npm install @opentelemetry/exporter-trace-otlp-http
```

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'cognitive-swarm',
    'deployment.environment': 'production',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'https://trace.agent.datadoghq.com/api/v0.2/traces',
    headers: { 'DD-API-KEY': process.env.DD_API_KEY! },
  }),
})
```

### AWS X-Ray

```bash
npm install @opentelemetry/id-generator-aws-xray @opentelemetry/propagator-aws-xray
```

```typescript
import { AWSXRayIdGenerator } from '@opentelemetry/id-generator-aws-xray'
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'cognitive-swarm',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4317', // AWS OTel Collector sidecar
  }),
  idGenerator: new AWSXRayIdGenerator(),
  textMapPropagator: new AWSXRayPropagator(),
})
```

### New Relic

```typescript
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'https://otlp.nr-data.net:4317',
    headers: { 'api-key': process.env.NEW_RELIC_LICENSE_KEY! },
  }),
})
```

## Custom Span Attributes

All span attribute keys are exported as `ATTR` constants:

```typescript
import { ATTR } from '@cognitive-swarm/otel'
```

### Full Attribute Reference

| Category | Key | Type | Description |
|----------|-----|------|-------------|
| **Solve** | `swarm.task` | string | Task text (truncated to 256 chars) |
| | `swarm.agent_count` | number | Number of agents |
| | `swarm.max_rounds` | number | Max rounds configured |
| | `swarm.rounds_used` | number | Actual rounds used |
| | `swarm.total_signals` | number | Total signals in the log |
| | `swarm.consensus_reached` | boolean | Whether consensus was reached |
| | `swarm.confidence` | number | Final confidence (0-1) |
| | `swarm.tokens` | number | Total tokens used |
| | `swarm.cost_usd` | number | Estimated cost in USD |
| **Round** | `swarm.round.number` | number | Round ordinal |
| | `swarm.round.signal_count` | number | Signals emitted in this round |
| **Agent** | `swarm.agent.id` | string | Agent identifier |
| | `swarm.agent.name` | string | Agent display name |
| | `swarm.agent.strategy` | string | Strategy used for reaction |
| | `swarm.agent.processing_time_ms` | number | Processing time in ms |
| **Signal** | `swarm.signal.type` | string | Signal type (proposal, vote, etc.) |
| | `swarm.signal.id` | string | Signal unique ID |
| **Tool** | `swarm.tool.name` | string | Tool name |
| | `swarm.tool.is_error` | boolean | Whether tool call errored |
| | `swarm.tool.duration_ms` | number | Tool execution time in ms |
| **Debate** | `swarm.debate.resolved` | boolean | Whether debate reached resolution |
| | `swarm.debate.rounds` | number | Number of debate rounds |
| **Advisor** | `swarm.advisor.action_type` | string | Advisor action type |
| **Topology** | `swarm.topology.reason` | string | Why topology was updated |
| | `swarm.topology.neighbor_count` | number | Number of nodes in topology |

### Adding Custom Attributes to Spans

You can extend the instrumentation by subscribing to the orchestrator events alongside the built-in instrumentation:

```typescript
import { trace, context } from '@opentelemetry/api'
import { instrumentSwarm } from '@cognitive-swarm/otel'

const instrumented = instrumentSwarm(swarm)

// Add custom business-level attributes
swarm.on('solve:complete', (event) => {
  const activeSpan = trace.getActiveSpan()
  if (activeSpan) {
    activeSpan.setAttribute('app.department', 'research')
    activeSpan.setAttribute('app.request_id', requestId)
    activeSpan.setAttribute('app.user_tier', 'premium')
  }
})
```

## Span Hierarchy

A visual representation of the full span tree for a typical solve:

```
solve                                    [task="Analyze...", agents=3, maxRounds=5]
  round [1]                              [round.number=1]
    agent:on-signal [analyst]            [agent.id, strategy, processing_time_ms]
    agent:on-signal [critic]             [agent.id, strategy, processing_time_ms]
    tool:execute [web-search]            [tool.name, duration_ms, is_error=false]
    (event) signal:emitted               [signal.id, signal.type=discovery]
    (event) signal:emitted               [signal.id, signal.type=proposal]
    (event) signal:delivered             [signal.id, agent.id]
    (event) consensus:failed             [failure_reason=no_majority]
  round [2]                              [round.number=2]
    debate                               [resolved=true, rounds=2, confidence=0.81]
      (event) debate:round               [round=1]
      (event) debate:round               [round=2]
    (event) advisor:action               [action_type=inject-signal]
    (event) topology:updated             [reason=pruned-edge]
    (event) consensus:reached            [decided=true, confidence=0.79]
  synthesize                             []
  (attributes on solve at end)           [rounds_used=2, tokens=3200, cost_usd=0.0048]
```

### Understanding Spans vs Events

- **Spans** have duration (start and end time): `solve`, `round`, `agent:on-signal`, `tool:execute`, `debate`, `synthesize`
- **Events** are point-in-time markers attached to a parent span: `signal:emitted`, `signal:delivered`, `consensus:reached`, `advisor:action`, etc.

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

## Span Interpretation Guide

### What Each Span Tells You

**`cognitive-swarm.solve`** -- the root span for the entire deliberation. Look here for:
- Total duration (was the swarm fast enough?)
- `swarm.tokens` and `swarm.cost_usd` (cost monitoring)
- `swarm.consensus_reached` (did the swarm converge?)
- `swarm.rounds_used` vs `swarm.max_rounds` (did it hit the limit?)

**`cognitive-swarm.round`** -- one deliberation cycle. Compare round durations to find:
- Which round took longest (slow agent? complex debate?)
- `signal_count` per round (decreasing = convergence, increasing = divergence)

**`cognitive-swarm.agent.on-signal`** -- individual agent processing. Key diagnostics:
- `processing_time_ms` identifies slow agents (LLM latency, complex tools)
- `strategy` shows which reasoning pattern was used
- Compare across agents to find bottlenecks

**`cognitive-swarm.tool.execute`** -- external tool calls (web search, code execution). Check:
- `duration_ms` for network latency issues
- `is_error` to track tool reliability
- Frequency: too many tool calls may indicate poorly scoped agents

**`cognitive-swarm.debate`** -- structured conflict resolution. Indicates:
- `rounds` used vs `maxDebateRounds` (did debate converge or get cut off?)
- `confidence` of the resolution (low = fragile consensus)

**`cognitive-swarm.synthesize`** -- final answer generation. Long synthesis spans may indicate:
- Complex answer aggregation
- Large context window being processed

### Dashboard Query Examples (Jaeger UI)

**Find all slow solves:**
```
service=cognitive-swarm operation=cognitive-swarm.solve minDuration=10s
```

**Find failed consensus:**
```
service=cognitive-swarm operation=cognitive-swarm.solve tags={"swarm.consensus_reached":"false"}
```

**Find expensive solves:**
```
service=cognitive-swarm operation=cognitive-swarm.solve tags={"swarm.cost_usd":">0.10"}
```

**Find tool errors:**
```
service=cognitive-swarm operation=cognitive-swarm.tool.execute tags={"swarm.tool.is_error":"true"}
```

## Performance Impact

The instrumentation is designed for minimal overhead:

| Scenario | Overhead |
|----------|----------|
| No `NodeSDK` started (no provider) | ~0 (no-op tracer) |
| Provider active, Jaeger exporter | 1-3% of solve time |
| Provider active, console exporter | 5-8% (I/O bound) |
| Provider active, batch exporter (recommended for prod) | <1% |

### Why Zero Overhead Without a Provider

The `getTracer()` function calls `trace.getTracer()` from `@opentelemetry/api`. When no `TracerProvider` is registered, the API returns a built-in no-op tracer. All `startSpan()` calls return no-op spans where `setAttribute()`, `addEvent()`, and `end()` are empty functions. This is the OTel API's design -- zero allocation, zero overhead.

Additionally, every method in `SpanManager` is wrapped in try-catch, so even if something unexpected happens in the tracing layer, it never crashes the swarm.

## Custom Exporters

```typescript
import { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'

class SwarmMetricsExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const span of spans) {
      if (span.name === 'cognitive-swarm.solve') {
        const tokens = span.attributes['swarm.tokens'] as number
        const cost = span.attributes['swarm.cost_usd'] as number
        const rounds = span.attributes['swarm.rounds_used'] as number

        // Push to your metrics system
        metrics.recordSolve({ tokens, cost, rounds, durationMs: span.duration[1] / 1e6 })
      }
    }
    resultCallback({ code: ExportResultCode.SUCCESS })
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

// Use with NodeSDK
const sdk = new NodeSDK({
  traceExporter: new SwarmMetricsExporter(),
})
```

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

## Troubleshooting

### No Spans Appearing in Jaeger

1. **Check the SDK is started before instrumentation:**
   ```typescript
   // WRONG - SDK not started yet
   const instrumented = instrumentSwarm(swarm)
   sdk.start()

   // CORRECT
   sdk.start()
   const instrumented = instrumentSwarm(swarm)
   ```

2. **Verify the exporter URL:** The OTLP gRPC default is `http://localhost:4317`. If Jaeger runs on a different host or in Docker, adjust accordingly. From inside Docker, use the service name (e.g., `http://jaeger:4317`).

3. **Flush before exit:** Spans are batched. If the process exits immediately after `solve()`, spans may be lost:
   ```typescript
   const result = await instrumented.solve('task')
   await sdk.shutdown() // flushes remaining spans
   ```

4. **Check Jaeger is accepting OTLP:** Jaeger all-in-one needs `COLLECTOR_OTLP_ENABLED=true`. Without it, port 4317 is not opened.

### Missing Events on Spans

Events (like `signal:emitted`, `consensus:reached`) appear in Jaeger under the "Logs" section of a span. If you see spans but no events:

- Verify the orchestrator emits events. The instrumentation subscribes to `SwarmEventMap` events via `orchestrator.on()`. If your custom orchestrator does not emit these events, no events will be recorded.
- Check the Jaeger UI: expand a round span and look in the "Logs" tab, not "Tags".

### High Cardinality Warning

If you have many agents (50+) or long-running swarms (100+ rounds), you may see a large number of spans per trace. Mitigations:

- Use a `BatchSpanProcessor` with `maxQueueSize` and `maxExportBatchSize` limits.
- Consider sampling:
  ```typescript
  import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base'

  const sdk = new NodeSDK({
    sampler: new TraceIdRatioBasedSampler(0.1), // sample 10% of traces
    traceExporter: exporter,
  })
  ```
- For development, the `ParentBasedSampler` (default) works well. For production with high throughput, always use ratio-based or custom sampling.

### Orphaned Spans

If a solve is interrupted (timeout, crash), the `SpanManager.cleanup()` method ends all open spans. This is called automatically by `instrumentedOrchestrator.destroy()`. If you use `dispose()` instead, it removes event subscriptions and calls `cleanup()` but leaves the orchestrator alive.

## Zero Overhead

When no OTel provider is configured (no `NodeSDK` started), all span creation is no-ops. The instrumentation layer checks for active providers before creating spans. No spans are allocated, no events are buffered, no timers are set.
