# @cognitive-swarm/templates

Prebuilt swarm templates -- code review, research, decision-making, and debugging.

## Installation

```bash
npm install @cognitive-swarm/templates
```

## Overview

Ready-to-use swarm configurations for common workflows. Each template factory returns a fully configured swarm definition with agents, personalities, and coordination rules. Use the `agentDef` helper and `PERSONALITIES` presets to build custom templates.

## Usage

```ts
import {
  codeReviewTemplate,
  researchTemplate,
  decisionTemplate,
  debugTemplate,
  agentDef,
  PERSONALITIES,
} from '@cognitive-swarm/templates';

// Create a code review swarm
const reviewSwarm = codeReviewTemplate({ provider, model });

// Create a research swarm
const researchSwarm = researchTemplate({ provider, model });

// Create a decision-making swarm
const decisionSwarm = decisionTemplate({ provider, model });

// Create a debugging swarm
const debugSwarm = debugTemplate({ provider, model });

// Build a custom agent definition
const custom = agentDef({
  name: 'Custom Agent',
  personality: PERSONALITIES.analytical,
  // ...
});
```

## Exports

| Export               | Kind     | Description                              |
| -------------------- | -------- | ---------------------------------------- |
| `codeReviewTemplate` | Function | Code review swarm factory                |
| `researchTemplate`   | Function | Research swarm factory                   |
| `decisionTemplate`   | Function | Decision-making swarm factory            |
| `debugTemplate`      | Function | Debugging swarm factory                  |
| `agentDef`           | Function | Helper to define a single agent          |
| `PERSONALITIES`      | Object   | Preset personality configurations        |
| `TemplateProviders`  | Type     | Provider config passed to templates      |
| `PersonalityPreset`  | Type     | Shape of a personality preset            |
| `AgentDefOptions`    | Type     | Options for `agentDef`                   |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
