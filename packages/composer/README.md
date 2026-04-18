# @cognitive-swarm/composer

Dynamic swarm composition -- select, reinforce, and prune agents at runtime.

## Installation

```bash
npm install @cognitive-swarm/composer
```

## Overview

The `DynamicComposer` selects which agents to include in a swarm based on the current task, reinforces high-performing agents, and prunes underperformers. It produces a `CompositionResult` with the selected agents and the reasoning behind each selection.

## Usage

```ts
import { DynamicComposer } from '@cognitive-swarm/composer';
import type { AgentCandidate, CompositionResult } from '@cognitive-swarm/composer';

const composer = new DynamicComposer({
  // optional config overrides
});

const candidates: AgentCandidate[] = [
  { agentId: 'analyst', taskTypes: ['summarization', 'research'] },
  { agentId: 'coder', taskTypes: ['implementation', 'debugging'] },
];

// Compose a swarm for a given task
const result: CompositionResult = composer.compose({
  taskType: 'research',
  candidates,
});

// result.selected — agents chosen for the swarm
// result.reasons  — why each agent was selected or excluded
```

## Exports

| Export               | Kind  | Description                            |
| -------------------- | ----- | -------------------------------------- |
| `DynamicComposer`    | Class | Runtime swarm composer                 |
| `AgentCandidate`     | Type  | Agent available for selection          |
| `CompositionResult`  | Type  | Output of a composition run            |
| `SelectionReason`    | Type  | Explanation for a selection decision   |
| `ComposerConfig`     | Type  | Configuration options                  |
| `AgentActivity`      | Type  | Tracked activity for an agent          |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
