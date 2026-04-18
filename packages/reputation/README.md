# @cognitive-swarm/reputation

Reputation system -- track agent reliability per task type.

## Installation

```bash
npm install @cognitive-swarm/reputation
```

## Overview

Provides a `ReputationTracker` that records agent performance over time and produces reputation scores per agent and task type. Use it to rank agents, detect declining reliability, and make informed routing decisions.

## Usage

```ts
import { ReputationTracker } from '@cognitive-swarm/reputation';
import type { ReputationConfig, AgentRanking } from '@cognitive-swarm/reputation';

const tracker = new ReputationTracker({
  // optional config overrides
});

// Record a performance observation
tracker.record({
  agentId: 'analyst-01',
  taskType: 'summarization',
  success: true,
  latencyMs: 1200,
});

// Get reputation score for an agent
const score = tracker.getScore('analyst-01', 'summarization');

// Rank all agents for a given task type
const rankings: AgentRanking[] = tracker.rank('summarization');
```

## Exports

| Export              | Kind  | Description                          |
| ------------------- | ----- | ------------------------------------ |
| `ReputationTracker` | Class | Core tracker -- record and query     |
| `ReputationConfig`  | Type  | Configuration options                |
| `ReputationScore`   | Type  | Computed score for an agent/task     |
| `AgentReputation`   | Type  | Full reputation profile for an agent |
| `AgentRanking`      | Type  | Ranked agent entry                   |
| `PerformanceRecord` | Type  | Single performance observation       |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
