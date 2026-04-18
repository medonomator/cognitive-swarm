# @cognitive-swarm/introspection

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/introspection)](https://www.npmjs.com/package/@cognitive-swarm/introspection)

Deadlock detection, groupthink detection, cost breakdown, and signal graph analysis. Observes swarm behavior and detects pathological patterns.

## Install

```bash
npm install @cognitive-swarm/introspection
```

## Quick Start

```typescript
import { SwarmIntrospector } from '@cognitive-swarm/introspection'

const introspector = new SwarmIntrospector()

// Feed signal events (hook into SignalBus)
signalBus.on('signal', (signal, targets) => {
  introspector.record({
    signalId: signal.id,
    type: signal.type,
    source: signal.source,
    targets,
    timestamp: signal.timestamp,
    replyTo: signal.replyTo,
  })
})

// After solve, analyze
const graph = introspector.getSignalGraph()
const groupThink = introspector.detectGroupThink()
const deadlock = introspector.detectDeadlock()
const costs = introspector.getCostBreakdown()
```

## Methods

### `record(event)` / `recordBatch(events)`

Feed `SignalEvent` objects into the introspector for analysis.

```typescript
interface SignalEvent {
  readonly signalId: string
  readonly type: SignalType
  readonly source: string
  readonly targets: readonly string[]
  readonly timestamp: number
  readonly replyTo?: string        // forms reply chains for deadlock detection
}
```

### `getSignalGraph(): SignalGraph`

Build a directed graph of signal flow between agents. Each unique `source -> target -> signalType` combination is an edge with a count.

```typescript
const graph = introspector.getSignalGraph()
// graph.nodes: string[]       -- all agent IDs
// graph.edges: SignalEdge[]   -- from, to, signalType, count
// graph.totalSignals: number
```

### `detectGroupThink(): GroupThinkReport`

Detect when agents consistently agree without challenges or doubts.

```typescript
const report = introspector.detectGroupThink()
if (report.detected) {
  console.log(`Severity: ${report.severity}`)           // 'mild' | 'severe'
  console.log(`Agreement rate: ${report.agreementRate}`) // 0..1
  console.log(`Conformists: ${report.conformists}`)      // never challenged
  console.log(`Challengers: ${report.challengers}`)      // challenged at least once
}
```

| Agreement Rate | Conformists | Severity |
|---------------|-------------|----------|
| > 0.9 | 2+ | `severe` |
| > 0.7 | 1+ | `mild` |
| <= 0.7 | any | `none` |

### `detectDeadlock(): DeadlockReport`

Detect agents stuck in signal reply loops (e.g., challenge ping-pong). Traces `replyTo` chains -- when the same agent appears twice, a cycle is found.

```typescript
const report = introspector.detectDeadlock()
for (const cycle of report.cycles) {
  console.log(`Cycle: ${cycle.agents.join(' -> ')}`)
  console.log(`Signal types: ${cycle.signalTypes.join(' -> ')}`)
}
```

### `getCostBreakdown(): CostReport`

Signal send/receive breakdown per agent with amplification ratio (`sent / received`).

```typescript
const report = introspector.getCostBreakdown()
for (const entry of report.agents) {
  console.log(`${entry.agentId}: sent=${entry.signalsSent}, received=${entry.signalsReceived}, amp=${entry.amplification.toFixed(2)}`)
}
```

| Amplification | Meaning |
|---------------|---------|
| 0 | Passive listener (misconfigured) |
| 0.5 - 1.0 | Balanced (most functional agents) |
| > 2.0 | May dominate discussion |
| Infinity | First-mover (only listens to `task:new`) |

## Health Metrics

| Metric | Healthy Range | Concerning |
|--------|--------------|------------|
| Agreement rate | 0.4 - 0.7 | > 0.85 (groupthink) or < 0.2 (chaos) |
| Conformist ratio | < 50% | > 70% |
| Deadlock cycles | 0 | 1+ |
| Max agent signal share | < 35% | > 50% |
| Silent agents | 0 | 1+ |

## Custom Rules

Build domain-specific detection on top of the raw data:

```typescript
function detectDominantAgent(introspector: SwarmIntrospector, threshold = 0.4): string | null {
  const costs = introspector.getCostBreakdown()
  for (const agent of costs.agents) {
    if (agent.signalsSent / costs.totalSignals > threshold) return agent.agentId
  }
  return null
}

function detectSilentAgents(introspector: SwarmIntrospector): string[] {
  return introspector.getCostBreakdown().agents
    .filter(a => a.signalsSent === 0)
    .map(a => a.agentId)
}
```

## Other Properties

```typescript
introspector.eventCount   // number of recorded events
introspector.reset()      // clear all recorded events (call between solves)
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/introspection) | [GitHub](https://github.com/medonomator/cognitive-swarm)
