# @cognitive-swarm/introspection

Deadlock detection, groupthink detection, cost breakdown, and signal graph analysis. Observes swarm behavior and detects pathological patterns that degrade output quality.

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

## SignalEvent

The input event format. Every signal that flows through the swarm's `SignalBus` can be recorded as a `SignalEvent`.

```typescript
interface SignalEvent {
  readonly signalId: string        // unique identifier for this signal
  readonly type: SignalType        // 'proposal' | 'discovery' | 'challenge' | 'doubt' | 'vote' | etc.
  readonly source: string          // agent ID that emitted this signal
  readonly targets: readonly string[]  // agent IDs that received this signal
  readonly timestamp: number       // Date.now() when the signal was emitted
  readonly replyTo?: string        // signalId of the signal this is responding to (forms reply chains)
}
```

### Field Details

| Field | Purpose | Used By |
|-------|---------|---------|
| `signalId` | Unique ID, enables reply chain tracing | `detectDeadlock()` builds chains via `replyTo` |
| `type` | Classifies the signal's intent | `detectGroupThink()` counts votes vs challenges |
| `source` | Who emitted the signal | All methods -- builds per-agent metrics |
| `targets` | Who received the signal | `getSignalGraph()` builds edges, `getCostBreakdown()` counts received |
| `timestamp` | When it happened | Currently stored but not used for time-based analysis |
| `replyTo` | Links to parent signal | `detectDeadlock()` traces reply chains for cycles |

## Methods

### record() / recordBatch()

Feed signal events into the introspector:

```typescript
introspector.record(event: SignalEvent): void
introspector.recordBatch(events: readonly SignalEvent[]): void
```

**Integration pattern:** Hook into the SignalBus to automatically record all events:

```typescript
const introspector = new SwarmIntrospector()

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
```

### getSignalGraph()

Build a directed graph of signal flow between agents:

```typescript
const graph = introspector.getSignalGraph()
// graph.nodes: string[]       - all agent IDs
// graph.edges: SignalEdge[]   - from -> to with signal type and count
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

**Edge key format:** Each unique combination of `source -> target -> signalType` is a separate edge. If agent-1 sends 5 proposals to agent-2, that is one edge with `count: 5`.

**Visualization suggestions:**

The signal graph maps naturally to common graph visualization tools:

```typescript
// Export to DOT format (for Graphviz)
function toDot(graph: SignalGraph): string {
  const lines = ['digraph SwarmSignals {']
  for (const edge of graph.edges) {
    lines.push(`  "${edge.from}" -> "${edge.to}" [label="${edge.signalType} (${edge.count})"]`)
  }
  lines.push('}')
  return lines.join('\n')
}

// Export to Mermaid format (for Markdown rendering)
function toMermaid(graph: SignalGraph): string {
  const lines = ['graph LR']
  for (const edge of graph.edges) {
    lines.push(`  ${edge.from} -->|${edge.signalType} x${edge.count}| ${edge.to}`)
  }
  return lines.join('\n')
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

```typescript
interface GroupThinkReport {
  readonly detected: boolean
  readonly agreementRate: number
  readonly conformists: readonly string[]
  readonly challengers: readonly string[]
  readonly severity: 'none' | 'mild' | 'severe'
}
```

#### Detection Criteria

The algorithm classifies agents and computes an agreement rate:

1. **Conformists** -- agents that emitted at least one signal but never emitted a `challenge` or `doubt`
2. **Challengers** -- agents that emitted at least one `challenge` or `doubt`
3. **Agreement rate** = `votes / (votes + challenges + doubts)` -- what fraction of all opinion signals are votes (agreement) vs challenges/doubts (dissent)

| Agreement Rate | Conformists | Severity |
|---------------|-------------|----------|
| > 0.9 | 2+ | `severe` |
| > 0.7 | 1+ | `mild` |
| <= 0.7 | any | `none` |

#### Severity Levels and Remediation

**`none`** -- Healthy dissent levels. Agents are actively challenging each other. No action needed.

**`mild`** -- Some conformity detected. At least one agent is not contributing challenges.
- **Check:** Is the conformist agent's `canEmit` missing `challenge` and `doubt`? If so, the configuration prevents dissent.
- **Fix:** Add `challenge` to the conformist's `canEmit` or replace the agent with a `critical` personality.
- **Fix:** Lower conformity in the agent's personality vector below 0.8 (the `PersonalityFilter` threshold).

**`severe`** -- Multiple agents are rubber-stamping without critical examination. The swarm output is likely unreliable.
- **Fix:** Add a Devil's Advocate agent with `bold` personality.
- **Fix:** Increase the number of agents with low conformity.
- **Fix:** Consider if the task is too simple for a swarm (might be wasting resources).
- **Warning:** If the task involves safety-critical decisions, do not trust the result.

#### Real-World Example: Detecting and Fixing GroupThink

```typescript
const introspector = new SwarmIntrospector()
// ... after swarm.solve() completes and events are recorded ...

const report = introspector.detectGroupThink()
if (report.severity === 'severe') {
  console.warn(`GroupThink detected! Agreement rate: ${report.agreementRate}`)
  console.warn(`Conformists: ${report.conformists.join(', ')}`)

  // Retry with modified configuration
  const config = researchTemplate({ engine })
  const fixedConfig = {
    ...config,
    agents: [
      ...config.agents,
      agentDef({
        id: 'contrarian',
        name: 'Contrarian',
        role: 'Challenge every proposal. Find weaknesses even in strong arguments.',
        personality: 'bold',
        listens: ['proposal', 'vote', 'discovery'],
        canEmit: ['challenge', 'doubt', 'vote'],
      }, { engine }),
    ],
  }

  const retryResult = await new SwarmOrchestrator(fixedConfig).solve(task)
}
```

### detectDeadlock()

Detect agents stuck in signal reply loops (e.g., challenge ping-pong):

```typescript
const report = introspector.detectDeadlock()

for (const cycle of report.cycles) {
  console.log(`Cycle: ${cycle.agents.join(' -> ')}`)
  console.log(`Signal types: ${cycle.signalTypes.join(' -> ')}`)
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

#### How Cycle Detection Works

The algorithm traces `replyTo` chains backward through the signal history. When it finds the same agent appearing twice in a chain, it has found a cycle.

**Example -- challenge ping-pong:**

```
Signal s1: agent-A sends proposal to agent-B
Signal s2: agent-B challenges s1 (replyTo: s1)
Signal s3: agent-A challenges s2 (replyTo: s2)
Signal s4: agent-B challenges s3 (replyTo: s3)
```

This produces: `cycle.agents = ['agent-A', 'agent-B', 'agent-A']`, `cycle.length = 3`.

**Example -- three-way cycle:**

```
s1: agent-A proposes
s2: agent-B challenges s1
s3: agent-C challenges s2
s4: agent-A challenges s3   <- agent-A appears again = cycle
```

This produces: `cycle.agents = ['agent-A', 'agent-B', 'agent-C']`, `cycle.length = 3`.

**Remediation:**
- Set `maxRounds` to prevent infinite loops (all templates do this)
- Add a synthesizer agent that can break deadlocks by combining positions
- Use `reactionDelayMs` on aggressive agents to slow down escalation
- Restrict `challenge` from the `canEmit` of agents prone to ping-pong

### getCostBreakdown()

Signal send/receive breakdown per agent with amplification ratio:

```typescript
const report = introspector.getCostBreakdown()

for (const entry of report.agents) {
  console.log(`${entry.agentId}: sent=${entry.signalsSent}, received=${entry.signalsReceived}, amp=${entry.amplification.toFixed(2)}`)
}

console.log(`Most active: ${report.mostActive}`)
console.log(`Least active: ${report.leastActive}`)
```

```typescript
interface CostReport {
  readonly agents: readonly AgentCostEntry[]
  readonly totalSignals: number
  readonly mostActive: string | undefined    // highest signalsSent
  readonly leastActive: string | undefined   // lowest signalsSent
}

interface AgentCostEntry {
  readonly agentId: string
  readonly signalsSent: number
  readonly signalsReceived: number
  readonly amplification: number   // sent / received ratio
}
```

#### Interpreting the Amplification Ratio

The amplification ratio measures how much output an agent produces relative to input it receives: `amplification = signalsSent / signalsReceived`.

| Amplification | Meaning | Typical Agent Type |
|---------------|---------|-------------------|
| 0 | Receives but never sends | Passive listener (misconfigured) |
| 0.1 - 0.5 | Mostly absorbs, emits selectively | Synthesizer, judge |
| 0.5 - 1.0 | Balanced input/output | Most functional agents |
| 1.0 - 2.0 | Produces more than it consumes | Explorers, hypothesis generators |
| > 2.0 | High amplification -- may dominate discussion | Could indicate runaway agent |
| Infinity | Sends signals but receives none | First-mover (only listens to `task:new`) |

**Healthy swarm indicators:**
- Total amplification across all agents is roughly 1.0 (signals in = signals out)
- No single agent accounts for more than 40% of total signals
- `leastActive` agent still has `signalsSent > 0` (everyone participates)

**Warning signs:**
- One agent at Infinity amplification while others are at 0 -- broken routing
- `leastActive` agent has 0 signals sent -- may have too-restrictive `listens` or `canEmit`

## Integration with Monitoring/Alerting

```typescript
// Run introspection after each solve and log metrics
async function solveWithIntrospection(task: string) {
  const introspector = new SwarmIntrospector()

  // Hook into signal bus
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

  const result = await swarm.solve(task)

  // Check for pathological patterns
  const groupThink = introspector.detectGroupThink()
  const deadlock = introspector.detectDeadlock()
  const costs = introspector.getCostBreakdown()

  // Log metrics (e.g., to OpenTelemetry, Datadog, etc.)
  metrics.gauge('swarm.agreement_rate', groupThink.agreementRate)
  metrics.gauge('swarm.conformist_count', groupThink.conformists.length)
  metrics.gauge('swarm.total_signals', costs.totalSignals)
  metrics.gauge('swarm.deadlock_cycles', deadlock.cycles.length)

  if (groupThink.severity === 'severe') {
    alerts.warn('Severe groupthink detected', { task, agreementRate: groupThink.agreementRate })
  }
  if (deadlock.detected) {
    alerts.warn('Deadlock detected', { task, cycles: deadlock.cycles })
  }

  return result
}
```

## Building Custom Introspection Rules

The `SwarmIntrospector` provides raw data. Build domain-specific rules on top:

```typescript
function detectDominantAgent(introspector: SwarmIntrospector, threshold = 0.4): string | null {
  const costs = introspector.getCostBreakdown()
  if (costs.totalSignals === 0) return null

  for (const agent of costs.agents) {
    if (agent.signalsSent / costs.totalSignals > threshold) {
      return agent.agentId  // This agent is dominating
    }
  }
  return null
}

function detectSilentAgents(introspector: SwarmIntrospector): string[] {
  const costs = introspector.getCostBreakdown()
  return costs.agents
    .filter(a => a.signalsSent === 0)
    .map(a => a.agentId)
}

function getDissentRatio(introspector: SwarmIntrospector): number {
  const gt = introspector.detectGroupThink()
  return 1 - gt.agreementRate  // Higher = more dissent = healthier
}
```

## Metric Interpretation Guide

### What is "Healthy"?

| Metric | Healthy Range | Concerning | Action |
|--------|--------------|------------|--------|
| Agreement rate | 0.4 - 0.7 | > 0.85 (groupthink) or < 0.2 (chaos) | Adjust agent personalities |
| Conformist ratio | < 50% of agents | > 70% | Add critical/bold agents |
| Deadlock cycles | 0 | 1+ | Add synthesizer, cap rounds |
| Max agent signal share | < 35% | > 50% | Lower dominant agent's weight |
| Silent agents | 0 | 1+ | Check `listens`/`canEmit` config |
| Amplification variance | Low (< 1.0 std dev) | High (> 2.0 std dev) | Rebalance agent roles |

### Reading the Numbers Together

A swarm with agreement rate 0.85 and 0 deadlock cycles might look fine at first glance, but if there are 3 conformists out of 5 agents, the high agreement is masking a lack of critical thinking. Always look at multiple metrics together.

## Other Properties

```typescript
introspector.eventCount   // number of recorded events
introspector.reset()      // clear all recorded events
```

Use `reset()` between solve calls if reusing the same introspector instance. Otherwise signal data from previous tasks will pollute the analysis.
