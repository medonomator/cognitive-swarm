# @cognitive-swarm/introspection

Deadlock detection, groupthink detection, cost breakdown, and signal graph analysis.

## Install

```bash
npm install @cognitive-swarm/introspection
```

## SwarmIntrospector

```typescript
import { SwarmIntrospector } from '@cognitive-swarm/introspection'

const introspector = new SwarmIntrospector()

// Feed signal events (hook into SignalBus)
introspector.record({
  signalId: 's1',
  type: 'proposal',
  source: 'agent-1',
  targets: ['agent-2', 'agent-3'],
  timestamp: Date.now(),
})

// Analyze
const graph = introspector.getSignalGraph()
const groupThink = introspector.detectGroupThink()
const deadlock = introspector.detectDeadlock()
const costs = introspector.getCostBreakdown()
```

## Methods

### record() / recordBatch()

Feed signal events into the introspector:

```typescript
introspector.record(event: SignalEvent): void
introspector.recordBatch(events: readonly SignalEvent[]): void
```

### getSignalGraph()

Build a directed graph of signal flow between agents:

```typescript
const graph = introspector.getSignalGraph()
// graph.nodes: string[]       - all agent IDs
// graph.edges: SignalEdge[]   - from → to with signal type and count
// graph.totalSignals: number
```

```typescript
interface SignalGraph {
  readonly nodes: readonly string[]
  readonly edges: readonly SignalEdge[]
  readonly totalSignals: number
}

interface SignalEdge {
  readonly from: string
  readonly to: string
  readonly signalType: SignalType
  readonly count: number
}
```

### detectGroupThink()

Detect when agents consistently agree without challenges or doubts:

```typescript
const report = introspector.detectGroupThink()

if (report.detected) {
  console.log(`Severity: ${report.severity}`)           // 'mild' | 'severe'
  console.log(`Agreement rate: ${report.agreementRate}`) // 0..1
  console.log(`Conformists: ${report.conformists}`)      // agents that never challenged
  console.log(`Challengers: ${report.challengers}`)      // agents that challenged at least once
}
```

Criteria:
- Agreement rate > 0.9 and multiple conformists → `severe`
- Agreement rate > 0.7 and at least one conformist → `mild`

```typescript
interface GroupThinkReport {
  readonly detected: boolean
  readonly agreementRate: number
  readonly conformists: readonly string[]
  readonly challengers: readonly string[]
  readonly severity: 'none' | 'mild' | 'severe'
}
```

### detectDeadlock()

Detect agents stuck in signal reply loops (e.g., challenge ping-pong):

```typescript
const report = introspector.detectDeadlock()

for (const cycle of report.cycles) {
  console.log(`Cycle: ${cycle.agents.join(' → ')}`)
  console.log(`Signal types: ${cycle.signalTypes.join(' → ')}`)
  console.log(`Length: ${cycle.length}`)
}
```

```typescript
interface DeadlockReport {
  readonly detected: boolean
  readonly cycles: readonly SignalCycle[]
  readonly stuckAgents: readonly string[]
}

interface SignalCycle {
  readonly agents: readonly string[]
  readonly signalTypes: readonly SignalType[]
  readonly length: number
}
```

### getCostBreakdown()

Signal send/receive breakdown per agent with amplification ratio:

```typescript
const report = introspector.getCostBreakdown()

for (const entry of report.agents) {
  console.log(`${entry.agentId}: sent=${entry.signalsSent}, received=${entry.signalsReceived}, amp=${entry.amplification.toFixed(2)}`)
}
```

```typescript
interface CostReport {
  readonly agents: readonly AgentCostEntry[]
  readonly totalSignals: number
  readonly mostActive: string | undefined
  readonly leastActive: string | undefined
}

interface AgentCostEntry {
  readonly agentId: string
  readonly signalsSent: number
  readonly signalsReceived: number
  readonly amplification: number   // sent / received ratio
}
```

## SignalEvent

The input event format:

```typescript
interface SignalEvent {
  readonly signalId: string
  readonly type: SignalType
  readonly source: string
  readonly targets: readonly string[]
  readonly timestamp: number
  readonly replyTo?: string
}
```

## Other Properties

```typescript
introspector.eventCount   // number of recorded events
introspector.reset()      // clear all recorded events
```
