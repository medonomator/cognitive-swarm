# @cognitive-swarm/templates

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/templates)](https://www.npmjs.com/package/@cognitive-swarm/templates)

Pre-built swarm configurations for common tasks. Each template returns a `SwarmConfig` ready to pass to `SwarmOrchestrator`.

## Install

```bash
npm install @cognitive-swarm/templates
```

## Template Selection Guide

| Task Type | Template | Agents | Best For |
|-----------|----------|--------|----------|
| Open-ended research | `researchTemplate` | 5 | Exploring topics, synthesizing findings |
| Code review / audit | `codeReviewTemplate` | 5 | Security, performance, architecture analysis |
| Yes/no or A-vs-B decisions | `decisionTemplate` | 6 | Weighing trade-offs, risk analysis |
| Bug diagnosis | `debugTemplate` | 7 | Root cause analysis, hypothesis testing |

## Quick Start

```typescript
import { researchTemplate, codeReviewTemplate, decisionTemplate, debugTemplate } from '@cognitive-swarm/templates'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const config = researchTemplate({ engine })
const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve('What are the long-term implications of WebAssembly?')
```

## Available Templates

### `researchTemplate`

5 agents: Explorer Alpha (`creative`), Explorer Beta (`bold`), Fact Checker (`cautious`, 1.3x), Critic (`critical`), Synthesizer (`balanced`, 1.5x). Consensus: `confidence-weighted`, threshold 0.65.

### `codeReviewTemplate`

5 agents: Security (`critical`, 1.2x), Performance (`analytical`), Architecture (`analytical`), Edge-Case Hunter (`cautious`), Review Synthesizer (`balanced`, 1.5x). Consensus: `confidence-weighted`, threshold 0.6.

### `decisionTemplate`

6 agents: Pros (`supportive`), Cons (`critical`), Risk (`cautious`, 1.2x), Opportunity Spotter (`creative`), Devil's Advocate (`bold`), Judge (`balanced`, 2.0x). Consensus: `hierarchical`, threshold 0.7.

### `debugTemplate`

7 agents: Reproducer, Log Analyzer, 2 Hypothesis Generators, Verifier (`critical`, 1.3x), Fix Proposer, Fix Reviewer (`cautious`, 1.5x). Consensus: `confidence-weighted`, threshold 0.7, 8 max rounds.

## Personality Presets

```typescript
import { PERSONALITIES } from '@cognitive-swarm/templates'
```

| Preset | Curiosity | Caution | Conformity | Verbosity | Role |
|--------|-----------|---------|------------|-----------|------|
| `analytical` | 0.8 | 0.6 | 0.4 | 0.5 | Careful researcher |
| `creative` | 0.9 | 0.2 | 0.2 | 0.7 | Divergent thinker |
| `critical` | 0.6 | 0.9 | 0.3 | 0.6 | Skeptic |
| `supportive` | 0.4 | 0.3 | 0.8 | 0.4 | Consensus builder |
| `balanced` | 0.5 | 0.5 | 0.5 | 0.5 | Neutral observer |
| `bold` | 0.7 | 0.1 | 0.2 | 0.8 | Contrarian |
| `cautious` | 0.3 | 0.9 | 0.7 | 0.3 | Conservative validator |

## agentDef Helper

Build `SwarmAgentDef` objects with preset or custom personalities:

```typescript
import { agentDef } from '@cognitive-swarm/templates'

const def = agentDef({
  id: 'my-agent',
  name: 'My Agent',
  role: 'Analyze data patterns',
  personality: 'analytical',           // preset name or PersonalityVector
  listens: ['task:new', 'discovery'],
  canEmit: ['discovery', 'proposal'],
  weight: 1.2,
}, { engine })
```

## Customizing Templates

Templates return `SwarmConfig`, so you can spread and extend:

```typescript
const baseConfig = researchTemplate({ engine })

const swarm = new SwarmOrchestrator({
  ...baseConfig,
  agents: [
    ...baseConfig.agents,
    agentDef({
      id: 'domain-expert',
      name: 'Domain Expert',
      role: 'Provide domain-specific knowledge',
      personality: 'analytical',
      listens: ['task:new', 'proposal'],
      canEmit: ['discovery', 'vote'],
    }, { engine }),
  ],
  maxRounds: 15,
})
```

### Creating Custom Templates

```typescript
import type { SwarmConfig } from '@cognitive-swarm/core'
import { agentDef, type TemplateProviders } from '@cognitive-swarm/templates'

export function myTemplate(providers: TemplateProviders): SwarmConfig {
  return {
    agents: [
      agentDef({ id: 'analyst', name: 'Analyst', role: '...', personality: 'analytical', listens: ['task:new'], canEmit: ['discovery'] }, providers),
      agentDef({ id: 'critic', name: 'Critic', role: '...', personality: 'critical', listens: ['discovery'], canEmit: ['challenge', 'vote'] }, providers),
    ],
    consensus: { strategy: 'confidence-weighted', threshold: 0.7, minVoters: 2 },
    maxRounds: 6,
  }
}
```

## Performance Characteristics

| Template | Agents | Max Rounds | Typical Tokens | Typical Latency |
|----------|--------|------------|---------------|----------------|
| `researchTemplate` | 5 | 6 | 20k-40k | 15-30s |
| `codeReviewTemplate` | 5 | 5 | 15k-30k | 12-25s |
| `decisionTemplate` | 6 | 6 | 25k-45k | 18-35s |
| `debugTemplate` | 7 | 8 | 30k-60k | 20-45s |

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/templates) | [GitHub](https://github.com/medonomator/cognitive-swarm)
