# Observability

cognitive-swarm has zero-overhead observability when no provider is configured, and full distributed tracing via OpenTelemetry when enabled. This page covers the OTel integration internals, all span types and attributes, Jaeger setup, streaming events, and the `SwarmResult` observability fields.

## Architecture

```
SwarmOrchestrator
    │
    │  events: TypedEventEmitter<SwarmEventMap>
    │   emits signal:emitted, round:start, consensus:reached, ...
    │
    ▼
instrumentSwarm(orchestrator)
    │
    │  Subscribes to ALL 20 event types
    │  Routes each event to SpanManager
    │
    ▼
SpanManager
    │
    │  Maintains span hierarchy:
    │    solve → round → agent / debate / advisor
    │
    ▼
OpenTelemetry API
    │  trace.startSpan(), span.end(), span.addEvent()
    │
    ▼
OTLP Exporter → Jaeger / Grafana Tempo / etc.
```

The key design: **tracing failures never crash the swarm**. Every method in `SpanManager` is wrapped in try-catch with empty catch blocks.

## Quick Setup

```bash
npm install @cognitive-swarm/otel @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-grpc
```

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { instrumentSwarm } from '@cognitive-swarm/otel'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'

// 1. Initialize OTel SDK (before anything else)
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4317',
  }),
})
sdk.start()

// 2. Create orchestrator
const swarm = new SwarmOrchestrator({ agents, ... })

// 3. Wrap with instrumentation
const instrumented = instrumentSwarm(swarm, {
  agentCount: agents.length,
  maxRounds: 10,
})

// 4. Use instrumented orchestrator (same API)
const result = await instrumented.solve('task')

// 5. Cleanup
instrumented.destroy()  // cleans up OTel subscriptions + orchestrator
// or: instrumented.dispose()  // OTel only, keeps orchestrator alive
```

## instrumentSwarm API

```typescript
interface InstrumentSwarmOptions {
  readonly agentCount?: number   // for span attributes
  readonly maxRounds?: number    // for span attributes
}

interface InstrumentedOrchestrator {
  solve(task: string): Promise<SwarmResult>
  solveWithStream(task: string): AsyncIterable<SwarmEvent>
  destroy(): void    // dispose OTel + destroy orchestrator
  dispose(): void    // dispose OTel only
}

function instrumentSwarm(
  orchestrator: InstrumentableOrchestrator,
  options?: InstrumentSwarmOptions,
): InstrumentedOrchestrator
```

The `instrumentSwarm` function subscribes to 20 event types on the orchestrator and creates spans/events via the `SpanManager`. It returns a proxy that wraps `solve()` and `solveWithStream()` with span lifecycle management.

## Span Hierarchy

```
cognitive-swarm.solve [task]
  │
  ├── cognitive-swarm.round [1]
  │    ├── signal:emitted (event)      [discovery from analyst]
  │    ├── signal:emitted (event)      [proposal from analyst]
  │    ├── cognitive-swarm.agent.on-signal [analyst]
  │    │    └── cognitive-swarm.tool.execute [web-search]  (if MCP tools)
  │    ├── cognitive-swarm.agent.on-signal [critic]
  │    ├── signal:delivered (event)    [to analyst]
  │    ├── consensus:reached (event)   [decided=false]
  │    └── advisor:action (event)      [inject-signal]
  │
  ├── cognitive-swarm.round [2]
  │    ├── cognitive-swarm.debate      [proposal-a vs proposal-b]
  │    │    ├── debate:round (event)   [posteriors={...}]
  │    │    └── debate:round (event)
  │    ├── topology:updated (event)    [pruned 1 edge]
  │    └── conflict:detected (event)
  │
  ├── cognitive-swarm.round [3]
  │    └── consensus:reached (event)   [decided=true, confidence=0.87]
  │
  └── cognitive-swarm.synthesize
```

### Span Types

| Span Name | Parent | Created When |
|-----------|--------|-------------|
| `cognitive-swarm.solve` | Root | `solve()` called |
| `cognitive-swarm.round` | solve | Each round starts |
| `cognitive-swarm.agent.on-signal` | round | Agent finishes processing |
| `cognitive-swarm.tool.execute` | round | MCP tool call completes |
| `cognitive-swarm.debate` | round | Structured debate begins |
| `cognitive-swarm.synthesize` | solve | Synthesis LLM call |

### Event Types (attached to spans)

| Event Name | Attached To | When |
|-----------|-------------|------|
| `signal:emitted` | Current round | Any signal published |
| `signal:expired` | Current round | Signal TTL expired |
| `signal:delivered` | Current round | Signal delivered to subscriber |
| `agent:error` | Current round | Agent processing error |
| `conflict:detected` | Current round | ConflictDetector found conflict |
| `proposal:submitted` | Current round | Proposal signal created |
| `vote:cast` | Current round | Vote signal created |
| `consensus:reached` | Current round | Consensus decided=true |
| `consensus:failed` | Current round | Consensus decided=false |
| `advisor:action` | Current round | Advisor intervened |
| `topology:updated` | Current round | Communication graph changed |
| `debate:round` | debate span | Debate round with posteriors |

## All Attribute Keys

The `ATTR` constant defines semantic conventions for cognitive-swarm:

```typescript
// packages/otel/src/attributes.ts

export const ATTR = {
  // Solve-level
  TASK: 'swarm.task',                        // string, truncated to 256 chars
  AGENT_COUNT: 'swarm.agent_count',          // number
  MAX_ROUNDS: 'swarm.max_rounds',            // number
  ROUNDS_USED: 'swarm.rounds_used',          // number
  TOTAL_SIGNALS: 'swarm.total_signals',      // number
  CONSENSUS_REACHED: 'swarm.consensus_reached', // boolean
  CONFIDENCE: 'swarm.confidence',            // number 0..1
  TOKENS: 'swarm.tokens',                    // number
  COST_USD: 'swarm.cost_usd',               // number

  // Round-level
  ROUND_NUMBER: 'swarm.round.number',        // number
  ROUND_SIGNAL_COUNT: 'swarm.round.signal_count', // number

  // Agent-level
  AGENT_ID: 'swarm.agent.id',               // string
  AGENT_NAME: 'swarm.agent.name',           // string
  AGENT_STRATEGY: 'swarm.agent.strategy',   // string
  PROCESSING_TIME_MS: 'swarm.agent.processing_time_ms', // number

  // Signal-level
  SIGNAL_TYPE: 'swarm.signal.type',          // string
  SIGNAL_ID: 'swarm.signal.id',             // string

  // Tool-level
  TOOL_NAME: 'swarm.tool.name',             // string
  TOOL_IS_ERROR: 'swarm.tool.is_error',     // boolean
  TOOL_DURATION_MS: 'swarm.tool.duration_ms', // number

  // Debate-level
  DEBATE_RESOLVED: 'swarm.debate.resolved', // boolean
  DEBATE_ROUNDS: 'swarm.debate.rounds',     // number

  // Advisor-level
  ADVISOR_ACTION: 'swarm.advisor.action_type', // string

  // Topology-level
  TOPOLOGY_REASON: 'swarm.topology.reason', // string
  TOPOLOGY_NEIGHBOR_COUNT: 'swarm.topology.neighbor_count', // number
} as const
```

### Attributes Per Span

| Span | Attributes Set |
|------|---------------|
| `solve` (start) | `TASK`, `AGENT_COUNT`, `MAX_ROUNDS` |
| `solve` (end) | `ROUNDS_USED`, `TOTAL_SIGNALS`, `CONSENSUS_REACHED`, `CONFIDENCE`, `TOKENS`, `COST_USD` |
| `round` (start) | `ROUND_NUMBER` |
| `round` (end) | `ROUND_SIGNAL_COUNT` |
| `agent.on-signal` | `AGENT_ID`, `AGENT_STRATEGY`, `PROCESSING_TIME_MS`, `SIGNAL_ID` |
| `tool.execute` | `TOOL_NAME`, `TOOL_IS_ERROR`, `TOOL_DURATION_MS`, `AGENT_ID` |
| `debate` (end) | `DEBATE_RESOLVED`, `DEBATE_ROUNDS`, `CONFIDENCE` |

## 20 Subscribed Events

The `instrumentSwarm` function subscribes to exactly these 20 event types:

```typescript
// packages/otel/src/instrument.ts

cleanups.push(orchestrator.on('round:start',       d => manager.onRoundStart(d)))
cleanups.push(orchestrator.on('round:end',         d => manager.onRoundEnd(d)))
cleanups.push(orchestrator.on('signal:emitted',    s => manager.onSignalEmitted(s)))
cleanups.push(orchestrator.on('signal:expired',    s => manager.onSignalExpired(s)))
cleanups.push(orchestrator.on('signal:delivered',  e => manager.onSignalDelivered(e)))
cleanups.push(orchestrator.on('agent:reacted',     r => manager.onAgentReacted(r)))
cleanups.push(orchestrator.on('agent:error',       e => manager.onAgentError(e)))
cleanups.push(orchestrator.on('tool:called',       e => manager.onToolCalled(e)))
cleanups.push(orchestrator.on('conflict:detected', c => manager.onConflictDetected(c)))
cleanups.push(orchestrator.on('proposal:submitted',p => manager.onProposalSubmitted(p)))
cleanups.push(orchestrator.on('vote:cast',         v => manager.onVoteCast(v)))
cleanups.push(orchestrator.on('consensus:reached', r => manager.onConsensusReached(r)))
cleanups.push(orchestrator.on('consensus:failed',  e => manager.onConsensusFailed(e)))
cleanups.push(orchestrator.on('advisor:action',    a => manager.onAdvisorAction(a)))
cleanups.push(orchestrator.on('debate:start',      d => manager.onDebateStart(d)))
cleanups.push(orchestrator.on('debate:round',      d => manager.onDebateRound(d)))
cleanups.push(orchestrator.on('debate:end',        r => manager.onDebateEnd(r)))
cleanups.push(orchestrator.on('topology:updated',  d => manager.onTopologyUpdated(d)))
cleanups.push(orchestrator.on('synthesis:start',   () => manager.onSynthesisStart()))
cleanups.push(orchestrator.on('synthesis:complete', d => manager.onSynthesisComplete(d)))
```

All subscriptions return cleanup functions. Calling `dispose()` or `destroy()` runs all cleanups.

## Jaeger Setup

### Docker Compose

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

```bash
docker compose up -d jaeger
```

### Full Working Example

```typescript
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { instrumentSwarm } from '@cognitive-swarm/otel'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { OpenAiLlmProvider } from '@cognitive-engine/provider-openai'
import { MemoryStore } from '@cognitive-engine/store-memory'

// Initialize OTel FIRST
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4317',
  }),
})
sdk.start()

// Create swarm
const llm = new OpenAiLlmProvider({ model: 'gpt-4o-mini' })
const engine = { llm, embedding: null, store: new MemoryStore() }

const swarm = new SwarmOrchestrator({
  agents: [
    { config: { id: 'analyst', name: 'Analyst', role: '...',
        personality: { curiosity: 0.9, caution: 0.6, conformity: 0.3, verbosity: 0.7 },
        listens: ['task:new', 'proposal'], canEmit: ['discovery', 'proposal', 'vote'] },
      engine },
    { config: { id: 'critic', name: 'Critic', role: '...',
        personality: { curiosity: 0.7, caution: 0.9, conformity: 0.1, verbosity: 0.6 },
        listens: ['task:new', 'proposal'], canEmit: ['doubt', 'challenge', 'vote'] },
      engine },
  ],
  maxRounds: 5,
  consensus: { strategy: 'confidence-weighted', threshold: 0.7 },
})

// Instrument
const instrumented = instrumentSwarm(swarm, {
  agentCount: 2,
  maxRounds: 5,
})

// Solve
const result = await instrumented.solve('Should we use microservices?')
console.log(result.answer)

// Cleanup
instrumented.destroy()
await sdk.shutdown()
```

Open `http://localhost:16686` and search for service `cognitive-swarm` to explore traces.

## Streaming Events (Without OTel)

Without OTel, use the built-in streaming for real-time visibility:

```typescript
for await (const event of swarm.solveWithStream('task')) {
  switch (event.type) {
    case 'round:start':
      console.log(`\n--- Round ${event.round} ---`)
      break

    case 'signal:emitted':
      const sig = event.signal
      console.log(`  [${sig.source}] ${sig.type} (confidence: ${sig.confidence.toFixed(2)})`)
      break

    case 'agent:reacted':
      const r = event.reaction
      console.log(`  Agent ${r.agentId} used "${r.strategyUsed}" (${r.processingTimeMs}ms)`)
      break

    case 'math:round-analysis':
      console.log(`  Math: entropy=${event.normalizedEntropy.toFixed(3)}, ` +
                  `gain=${event.informationGain.toFixed(3)}`)
      break

    case 'consensus:check':
      const c = event.result
      console.log(`  Consensus: decided=${c.decided}, confidence=${c.confidence.toFixed(2)}`)
      break

    case 'advisor:action':
      console.log(`  Advisor: ${event.advice.type}`)
      break

    case 'debate:start':
      console.log(`  Debate: ${event.proposalA} vs ${event.proposalB}`)
      break

    case 'evolution:spawned':
      console.log(`  Spawned: ${event.domain} - ${event.reason}`)
      break

    case 'evolution:dissolved':
      console.log(`  Dissolved: ${event.agentId} - ${event.reason}`)
      break

    case 'solve:complete':
      const res = event.result
      console.log(`\nDone: ${res.timing.roundsUsed} rounds, ` +
                  `$${res.cost.estimatedUsd.toFixed(4)}, ` +
                  `confidence=${res.confidence.toFixed(2)}`)
      break
  }
}
```

## SwarmResult Observability Fields

The `SwarmResult` contains full observability data without any external tooling:

```typescript
const result = await swarm.solve('task')

// Math analysis (28 modules)
result.mathAnalysis.entropy.history            // per-round entropy values
result.mathAnalysis.entropy.normalized         // final normalized entropy
result.mathAnalysis.freeEnergy?.history        // per-round free energy
result.mathAnalysis.freeEnergy?.converged      // did F converge?
result.mathAnalysis.surprise?.history          // per-round surprise
result.mathAnalysis.surprise?.mostInformativeAgent
result.mathAnalysis.stoppingReason             // why the swarm stopped

// Consensus (full voting record, dissent preserved)
result.consensus.decided                       // boolean
result.consensus.confidence                    // 0..1
result.consensus.votingRecord                  // every vote with reasoning
result.consensus.dissent                       // reasoning from dissenters
result.consensus.reasoning                     // human-readable explanation

// Per-agent contributions
for (const [agentId, contrib] of result.agentContributions) {
  console.log(agentId,
    'signals:', contrib.signalsEmitted,
    'proposals:', contrib.proposalsMade,
    'avgConf:', contrib.avgConfidence.toFixed(2))
}

// Advisor actions
result.advisorReport?.actions                  // all interventions taken

// Debate results
for (const debate of result.debateResults) {
  console.log(`Debate: resolved=${debate.resolved}, ` +
              `rounds=${debate.roundsUsed}, ` +
              `winner=${debate.winningProposalId}`)
}

// Evolution
result.evolutionReport?.spawned                // agents spawned
result.evolutionReport?.dissolved              // agents dissolved
result.evolutionReport?.activeEvolvedCount     // still active

// Cost and timing
result.cost.tokens                             // total tokens used
result.cost.estimatedUsd                       // estimated cost ($0.000003/token)
result.timing.totalMs                          // wall clock time
result.timing.roundsUsed                       // rounds completed

// Full signal log
result.signalLog                               // every signal ever published
```

## SpanManager Internals

The `SpanManager` maintains active span references:

```typescript
class SpanManager {
  private solveSpan: Span | undefined           // root span
  private readonly roundSpans = new Map<number, Span>()  // round → span
  private readonly agentSpans = new Map<string, Span>()  // key → span (for tool children)
  private debateSpan: Span | undefined
  private synthesisSpan: Span | undefined

  // getCurrentRoundSpan() returns the span with the highest round number
  // This is the parent for events/child spans within a round
}
```

The `cleanup()` method ends all orphaned spans (e.g., if solve was interrupted). This is called automatically on errors in the instrumented `solve()` wrapper.
