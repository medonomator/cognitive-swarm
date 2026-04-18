# @cognitive-swarm/introspection

Swarm introspection -- debug, visualize, and detect issues in agent communication.

## Installation

```bash
npm install @cognitive-swarm/introspection
```

## Overview

Provides a `SwarmIntrospector` that captures signal flow between agents and analyzes it for problems: groupthink, deadlocks, cyclic dependencies, and runaway costs. Useful for debugging and monitoring swarm behavior in development and production.

## Usage

```ts
import { SwarmIntrospector } from '@cognitive-swarm/introspection';

const introspector = new SwarmIntrospector();

// Feed signal events as they occur
introspector.observe(signalEvent);

// Build a signal graph from observed events
const graph = introspector.getSignalGraph();

// Detect groupthink (agents echoing each other)
const groupthink: GroupThinkReport = introspector.detectGroupThink();

// Detect deadlocks (agents waiting on each other)
const deadlocks: DeadlockReport = introspector.detectDeadlocks();

// Get cost breakdown per agent
const costs: CostReport = introspector.getCostReport();
```

## Exports

| Export              | Kind  | Description                              |
| ------------------- | ----- | ---------------------------------------- |
| `SwarmIntrospector` | Class | Core introspection engine                |
| `SignalEvent`       | Type  | A single observed signal between agents  |
| `SignalGraph`       | Type  | Directed graph of signal flow            |
| `SignalEdge`        | Type  | Edge in the signal graph                 |
| `GroupThinkReport`  | Type  | Groupthink detection results             |
| `DeadlockReport`   | Type  | Deadlock detection results               |
| `SignalCycle`       | Type  | Detected cycle in signal flow            |
| `CostReport`       | Type  | Aggregated cost breakdown                |
| `AgentCostEntry`   | Type  | Cost entry for a single agent            |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
