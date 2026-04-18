# Observability

cognitive-swarm has zero-overhead observability when no provider is configured, and full distributed tracing via OpenTelemetry when enabled.

## OpenTelemetry Integration

```bash
npm install @cognitive-swarm/otel
```

```typescript
import { instrumentSwarm } from '@cognitive-swarm/otel'

const instrumented = instrumentSwarm(orchestrator)
const result = await instrumented.solve('task')
```

All 20 event types produce spans. The span hierarchy mirrors the solve structure:

```
solve [task]
  ├── round [1]
  │    ├── agent:reaction [analyst]
  │    ├── agent:reaction [critic]
  │    ├── signal:emitted [discovery]
  │    ├── signal:emitted [proposal]
  │    ├── consensus:check [confidence-weighted]
  │    └── math:analysis [entropy=0.82, gain=0.31]
  ├── round [2]
  │    ├── debate:start [proposal-a vs proposal-b]
  │    │    ├── debate:round [1] posteriors={...}
  │    │    └── debate:end [resolved=true]
  │    ├── advisor:action [inject-signal groupthink-correction]
  │    └── topology:updated [pruned 1 edge]
  └── synthesis:complete [answer]
```

## 20 Span Types

| Span | Payload |
|------|---------|
| `solve` | task, solveId |
| `round` | round number |
| `signal:emitted` | type, source, confidence |
| `agent:reacted` | agentId, strategyUsed, processingTimeMs |
| `consensus:check` | strategy, decided, confidence |
| `math:round-analysis` | entropy, normalizedEntropy, informationGain |
| `advisor:action` | advice type, reason |
| `debate:start` | proposalA, proposalB |
| `debate:round` | round, posteriors |
| `debate:end` | resolved, winningProposalId, confidence |
| `topology:updated` | neighbors map, reason |
| `evolution:spawned` | agentId, domain, reason |
| `evolution:dissolved` | agentId, reason |
| `synthesis:start` | - |
| `synthesis:complete` | answer length |
| `solve:complete` | tokens, estimatedUsd, roundsUsed, totalMs |
| `round:start` | round number |
| `round:end` | signalCount |
| `math:stopping` | reason |
| `checkpoint:saved` | checkpointId |

## Jaeger Setup

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
```

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4317',
  }),
})
sdk.start()

// Then instrument
const instrumented = instrumentSwarm(swarm)
const result = await instrumented.solve('task')
```

Open `http://localhost:16686` to explore traces.

## Streaming Events

Without OTel, use the built-in streaming for real-time visibility:

```typescript
for await (const event of swarm.solveWithStream('task')) {
  switch (event.type) {
    case 'round:start':
      console.log(`Round ${event.round} starting`)
      break
    case 'signal:emitted':
      console.log(`[${event.signal.source}] ${event.signal.type} (confidence: ${event.signal.confidence})`)
      break
    case 'math:round-analysis':
      console.log(`Entropy: ${event.normalizedEntropy.toFixed(3)}, Gain: ${event.informationGain.toFixed(3)}`)
      break
    case 'consensus:check':
      console.log(`Consensus: decided=${event.result.decided}, confidence=${event.result.confidence}`)
      break
    case 'solve:complete':
      console.log(`Done: ${event.result.timing.roundsUsed} rounds, $${event.result.cost.estimatedUsd.toFixed(4)}`)
      break
  }
}
```

## SwarmResult Observability Fields

The `SwarmResult` contains full observability data without any external tooling:

```typescript
const result = await swarm.solve('task')

// Full math analysis
result.mathAnalysis.entropy.history        // per-round entropy
result.mathAnalysis.freeEnergy?.history    // per-round F values
result.mathAnalysis.surprise?.history      // per-round surprise
result.mathAnalysis.stoppingReason         // why the swarm stopped

// Full voting record (dissent preserved)
result.consensus.votingRecord              // every vote with reasoning
result.consensus.dissent                   // agents that disagreed

// Per-agent contributions
for (const [agentId, contrib] of result.agentContributions) {
  console.log(agentId, contrib.signalsEmitted, contrib.avgConfidence)
}

// Advisor actions
result.advisorReport?.actions              // all interventions taken

// Cost and timing
result.cost.tokens                         // total tokens used
result.cost.estimatedUsd                   // estimated cost
result.timing.totalMs                      // wall clock time
result.timing.roundsUsed                   // rounds completed
```
