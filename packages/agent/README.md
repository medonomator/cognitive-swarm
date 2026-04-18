# @cognitive-swarm/agent

Swarm agent -- cognitive agent wrapper for swarm participation.

## Install

```bash
npm install @cognitive-swarm/agent
```

## Overview

Wraps an LLM-backed agent with personality traits, signal handling, and swarm protocol awareness. The `PersonalityFilter` shapes how the agent perceives and responds to signals based on its configured personality vector (curiosity, skepticism, creativity, rigor, cooperation).

## Usage

```typescript
import { SwarmAgent, PersonalityFilter } from '@cognitive-swarm/agent'
import type { SwarmAgentConfig } from '@cognitive-swarm/core'

const agent = new SwarmAgent({
  id: 'analyst',
  role: 'Data Analyst',
  strategy: 'balanced',
  personality: {
    curiosity: 0.8,
    skepticism: 0.6,
    creativity: 0.5,
    rigor: 0.9,
    cooperation: 0.7,
  },
  systemPrompt: 'You are a rigorous data analyst...',
  llmProvider: myLlmProvider,
})

// Agent reacts to signals from the bus
const reaction = await agent.react(incomingSignals)
// reaction contains new signals to emit (discoveries, proposals, votes, doubts)
```

### PersonalityFilter

Adjusts signal relevance and agent behavior based on the personality vector.

```typescript
const filter = new PersonalityFilter(personalityVector)
const filtered = filter.apply(signals)
```

## License

MIT

## Links

- [cognitive-swarm root](https://github.com/medonomator/cognitive-swarm)
