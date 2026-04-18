# @cognitive-swarm/templates

Pre-built swarm configurations for common tasks. Each template returns a `SwarmConfig` ready to pass to `SwarmOrchestrator`.

## Install

```bash
npm install @cognitive-swarm/templates
```

## Available Templates

### researchTemplate

5 specialized agents for research and analysis.

```typescript
import { researchTemplate } from '@cognitive-swarm/templates'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const config = researchTemplate({ engine })
const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve('What are the long-term implications of WebAssembly?')
```

**Agents:**
- **Explorer Alpha** (`creative`) -- divergent hypotheses and discoveries
- **Explorer Beta** (`bold`) -- alternative angles and edge cases
- **Fact Checker** (`cautious`) -- validates claims, requests evidence
- **Critic** (`critical`) -- challenges assumptions, identifies gaps
- **Synthesizer** (`supportive`) -- combines findings into coherent answer

### codeReviewTemplate

5 specialized code review agents.

```typescript
import { codeReviewTemplate } from '@cognitive-swarm/templates'

const config = codeReviewTemplate({ engine })
const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve(`Review this code:\n${codeString}`)
```

**Agents:**
- **Security** -- vulnerability analysis, injection risks
- **Performance** -- algorithmic complexity, bottlenecks
- **Architecture** -- design patterns, coupling, cohesion
- **Bugs** -- logic errors, edge cases, error handling
- **Tests** -- coverage gaps, test quality

### decisionTemplate

6 agents structured for decision-making with devil's advocate.

```typescript
import { decisionTemplate } from '@cognitive-swarm/templates'

const config = decisionTemplate({ engine })
const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve('Should we migrate from PostgreSQL to MongoDB?')
```

**Agents:**
- **Pros** -- benefits and opportunities
- **Cons** -- risks and downsides
- **Risk** -- probability-weighted risk analysis
- **Precedent** -- similar decisions and their outcomes
- **Devil's Advocate** -- challenges any emerging consensus
- **Judge** -- synthesizes and decides

### debugTemplate

7 agents collaboratively diagnose issues.

```typescript
import { debugTemplate } from '@cognitive-swarm/templates'

const config = debugTemplate({ engine })
const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve(`
  Error: Cannot read properties of undefined (reading 'map')
  Stack: at UserList.render (UserList.jsx:23)
  Context: Happens when loading with empty initial state
`)
```

**Agents:**
- **Reproducer** -- minimal reproduction steps
- **Tracer** -- follows execution path
- **Hypothesizer** -- proposes root causes
- **Eliminator** -- rules out false leads
- **Fixer** -- proposes concrete fixes
- **Tester** -- considers edge cases and regression tests
- **Reviewer** -- validates the fix proposal

## TemplateProviders

All templates accept the same base input:

```typescript
interface TemplateProviders {
  readonly engine: EngineConfig    // LLM + store for cognitive pipeline
}
```

## Personality Presets

Templates use the `PERSONALITIES` presets for agent personality vectors:

```typescript
import { PERSONALITIES } from '@cognitive-swarm/templates'
```

| Preset | Curiosity | Caution | Conformity | Verbosity |
|--------|-----------|---------|------------|-----------|
| `analytical` | 0.8 | 0.6 | 0.4 | 0.5 |
| `creative` | 0.9 | 0.2 | 0.2 | 0.7 |
| `critical` | 0.6 | 0.9 | 0.3 | 0.6 |
| `supportive` | 0.4 | 0.3 | 0.8 | 0.4 |
| `balanced` | 0.5 | 0.5 | 0.5 | 0.5 |
| `bold` | 0.7 | 0.1 | 0.2 | 0.8 |
| `cautious` | 0.3 | 0.9 | 0.7 | 0.3 |

## agentDef Helper

Build `SwarmAgentDef` objects with preset personalities:

```typescript
import { agentDef } from '@cognitive-swarm/templates'

const def = agentDef(
  {
    id: 'my-agent',
    name: 'My Agent',
    role: 'Analyze data patterns',
    personality: 'analytical',    // preset name or PersonalityVector
    listens: ['task:new', 'discovery'],
    canEmit: ['discovery', 'proposal'],
  },
  { engine },
)
```

## Customizing Templates

Templates return `SwarmConfig`, so you can spread and extend:

```typescript
import { researchTemplate } from '@cognitive-swarm/templates'

const baseConfig = researchTemplate({ engine })

const swarm = new SwarmOrchestrator({
  ...baseConfig,
  agents: [
    ...baseConfig.agents,
    agentDef(
      {
        id: 'domain-expert',
        name: 'Domain Expert',
        role: 'Provide deep domain-specific knowledge',
        personality: 'analytical',
        listens: ['task:new', 'proposal'],
        canEmit: ['discovery', 'vote'],
      },
      { engine },
    ),
  ],
  maxRounds: 15,
  tokenBudget: 50_000,
})
```
