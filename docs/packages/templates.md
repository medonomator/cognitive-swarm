# @cognitive-swarm/templates

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/templates)](https://www.npmjs.com/package/@cognitive-swarm/templates)

Pre-built swarm configurations for common tasks. Each template returns a `SwarmConfig` ready to pass to `SwarmOrchestrator`.

## Install

```bash
npm install @cognitive-swarm/templates
```

## Template Selection Guide

Choosing the right template depends on your task type. Here is a decision matrix:

| Task Type | Template | Agents | Best For |
|-----------|----------|--------|----------|
| Open-ended research | `researchTemplate` | 5 | Exploring topics, gathering evidence, synthesizing findings |
| Code review / audit | `codeReviewTemplate` | 5 | Security, performance, architecture, edge-case analysis |
| Yes/no or A-vs-B decisions | `decisionTemplate` | 6 | Weighing trade-offs, risk analysis, structured deliberation |
| Bug diagnosis | `debugTemplate` | 7 | Root cause analysis, hypothesis testing, fix validation |

**Rule of thumb:** if your task has a single correct answer, use `debugTemplate`. If it requires judgment, use `decisionTemplate`. If it is exploratory, use `researchTemplate`.

## Performance Characteristics

Each template has different cost and latency profiles based on agent count, max rounds, and consensus requirements.

| Template | Agents | Max Rounds | Min Voters | Consensus Strategy | Token Budget (typical) | Latency (typical) |
|----------|--------|------------|------------|-------------------|----------------------|-------------------|
| `researchTemplate` | 5 | 6 | 3 | confidence-weighted | 20k-40k | 15-30s |
| `codeReviewTemplate` | 5 | 5 | 3 | confidence-weighted | 15k-30k | 12-25s |
| `decisionTemplate` | 6 | 6 | 4 | hierarchical | 25k-45k | 18-35s |
| `debugTemplate` | 7 | 8 | 3 | confidence-weighted | 30k-60k | 20-45s |

Token usage scales with task complexity. Simple tasks often converge in 2-3 rounds; adversarial or ambiguous tasks may use all available rounds.

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
- **Fact Checker** (`cautious`, weight: 1.3) -- validates claims, requests evidence
- **Critic** (`critical`) -- challenges assumptions, identifies gaps
- **Synthesizer** (`balanced`, weight: 1.5) -- combines findings into coherent answer

**Configuration:**
- Consensus: `confidence-weighted`, threshold `0.65`, min voters `3`
- Math: entropy threshold `0.4`, min info gain `0.03`, redundancy threshold `0.6`

**Expected output quality:** Produces well-rounded analysis with multiple perspectives. The dual-explorer design ensures diverse hypotheses, while the fact-checker and critic prevent unsupported claims. Best for questions where breadth of analysis matters.

**Example output structure:**
```
Finding: WebAssembly enables near-native performance in browsers...
Evidence quality: HIGH (multiple independent sources confirm benchmarks)
Dissenting view: Security model concerns raised by Critic...
Confidence: 0.82
```

### codeReviewTemplate

5 specialized code review agents.

```typescript
import { codeReviewTemplate } from '@cognitive-swarm/templates'

const config = codeReviewTemplate({ engine })
const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve(`Review this code:\n${codeString}`)
```

**Agents:**
- **Security** (`critical`, weight: 1.2) -- vulnerability analysis, injection risks, OWASP Top 10
- **Performance** (`analytical`) -- algorithmic complexity, bottlenecks, memory leaks
- **Architecture** (`analytical`) -- design patterns, coupling, cohesion, SOLID
- **Edge-Case Hunter** (`cautious`) -- boundary conditions, error paths, race conditions
- **Review Synthesizer** (`balanced`, weight: 1.5) -- consolidates findings with severity ratings

**Configuration:**
- Consensus: `confidence-weighted`, threshold `0.6`, min voters `3`
- Math: entropy threshold `0.25`, min info gain `0.04`, redundancy threshold `0.8`
- Low entropy threshold means the swarm converges quickly once findings align

### decisionTemplate

6 agents structured for decision-making with devil's advocate.

```typescript
import { decisionTemplate } from '@cognitive-swarm/templates'

const config = decisionTemplate({ engine })
const swarm = new SwarmOrchestrator(config)
const result = await swarm.solve('Should we migrate from PostgreSQL to MongoDB?')
```

**Agents:**
- **Pros** (`supportive`) -- benefits and opportunities
- **Cons** (`critical`) -- risks and downsides
- **Risk** (`cautious`, weight: 1.2) -- probability-weighted risk analysis
- **Opportunity Spotter** (`creative`) -- hidden advantages and synergies
- **Devil's Advocate** (`bold`) -- challenges any emerging consensus
- **Judge** (`balanced`, weight: 2.0) -- synthesizes and decides

**Configuration:**
- Consensus: `hierarchical`, threshold `0.7`, min voters `4`
- Math: entropy threshold `0.2`, min info gain `0.05`, redundancy threshold `0.65`
- The Judge has 2x weight, reflecting its synthesizer role

**Why hierarchical consensus:** The `hierarchical` strategy gives more weight to the Judge's final assessment, preventing premature consensus from one-sided arguments. The Devil's Advocate ensures that even if 4 agents agree, someone is stress-testing the logic.

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
- **Reproducer** (`analytical`) -- minimal reproduction steps
- **Log Analyzer** (`analytical`) -- examines stack traces, logs, timing
- **Hypothesis Generator Alpha** (`creative`) -- common failure patterns
- **Hypothesis Generator Beta** (`bold`) -- less obvious causes: races, state corruption
- **Hypothesis Verifier** (`critical`, weight: 1.3) -- tests hypotheses against known facts
- **Fix Proposer** (`balanced`) -- proposes concrete, minimal fixes
- **Fix Reviewer** (`cautious`, weight: 1.5) -- validates fixes for correctness and side effects

**Configuration:**
- Consensus: `confidence-weighted`, threshold `0.7`, min voters `3`
- Math: entropy threshold `0.15`, min info gain `0.06`, redundancy threshold `0.75`
- Higher info gain requirement prevents premature convergence on wrong root cause
- 8 max rounds (most of any template) allows thorough hypothesis elimination

## TemplateProviders

All templates accept the same base input:

```typescript
interface TemplateProviders {
  readonly engine: EngineConfig    // LLM + store for cognitive pipeline
}
```

The `EngineConfig` comes from `@cognitive-engine/core` and includes the LLM provider configuration, memory store, and pipeline settings.

## Personality Presets

Templates use the `PERSONALITIES` presets for agent personality vectors. Each preset is a `PersonalityVector` with four dimensions:

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

### Preset Behavioral Descriptions

**`analytical`** -- The careful researcher. High curiosity drives exploration, moderate caution prevents reckless claims, low conformity means they form independent opinions. Good for: fact-checking, data analysis, systematic investigation.

**`creative`** -- The divergent thinker. Very high curiosity paired with very low caution means they generate many ideas without self-censoring. Low conformity ensures they do not just agree with others. Good for: brainstorming, hypothesis generation, finding novel angles.

**`critical`** -- The skeptic. Highest caution of any preset -- they question everything. Low conformity means they will challenge the majority. Moderate curiosity keeps them engaged but focused on weaknesses. Good for: code review, risk assessment, quality assurance.

**`supportive`** -- The consensus builder. High conformity means they gravitate toward agreement. Low verbosity keeps their contributions concise. Good for: synthesis, mediation, summarization.

**`balanced`** -- The neutral observer. All dimensions at 0.5 -- no strong tendencies in any direction. Good for: judges, tie-breakers, final synthesizers that need objectivity.

**`bold`** -- The contrarian. Very low caution means they take intellectual risks. Low conformity means they challenge consensus. High verbosity means they elaborate on their positions. Good for: devil's advocates, edge-case finders, stress-testing ideas.

**`cautious`** -- The conservative validator. Highest caution, high conformity -- they avoid unverified claims and tend toward established positions. Low verbosity keeps their output tightly focused. Good for: fact-checking, safety analysis, regression testing.

### Tips for Tuning Personality Vectors

When creating custom personality vectors, keep these interactions in mind:

```typescript
// The PersonalityFilter in @cognitive-swarm/agent uses these thresholds:
// - caution > 0.7  → skips signals with confidence < 0.4
// - conformity >= 0.8 → ignores challenge/doubt signals
// - curiosity <= 0.3 → ignores discovery signals

// Therefore avoid extreme values that create "deaf" agents:
const badConfig = {
  curiosity: 0.1,   // will ignore most discoveries
  caution: 0.95,    // will ignore most low-confidence signals
  conformity: 0.95, // will ignore all challenges
  verbosity: 0.1,   // agent's signals may be too terse
}

// Better: keep values away from filter boundaries
const goodConfig = {
  curiosity: 0.4,   // still engages with discoveries
  caution: 0.65,    // cautious but not dismissive
  conformity: 0.7,  // cooperative but listens to challenges
  verbosity: 0.4,   // concise but sufficient
}
```

**Verbosity** affects signal emission volume -- higher values mean the agent generates longer, more detailed responses. Values above 0.8 can lead to token-heavy rounds.

**Conformity vs Caution** often interact: high-conformity + high-caution creates an agent that mostly agrees and rarely investigates. This can be useful for a "rubber stamp" voter but is generally unproductive for analysis.

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

You can also pass a custom `PersonalityVector` directly:

```typescript
const def = agentDef(
  {
    id: 'custom-agent',
    name: 'Custom Agent',
    role: 'Specialized analysis',
    personality: {
      curiosity: 0.85,
      caution: 0.4,
      conformity: 0.3,
      verbosity: 0.6,
    },
    listens: ['task:new', 'discovery', 'challenge'],
    canEmit: ['discovery', 'proposal', 'vote'],
    weight: 1.2,
  },
  { engine },
)
```

The `weight` parameter (default: 1.0) affects how much this agent's vote counts in consensus. Higher weight = more influence on the final result.

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

### Overriding Consensus Settings

```typescript
const config = decisionTemplate({ engine })

// Switch from hierarchical to confidence-weighted consensus
const customized = {
  ...config,
  consensus: {
    strategy: 'confidence-weighted' as const,
    threshold: 0.8,        // require stronger agreement
    minVoters: 5,          // require more participants
  },
}
```

### Removing Agents from a Template

```typescript
const config = debugTemplate({ engine })

// Remove the second hypothesis generator for simpler debugging
const simplified = {
  ...config,
  agents: config.agents.filter(a => a.config.id !== 'hypothesis-b'),
}
```

### Combining Templates

You can merge agents from multiple templates for complex tasks:

```typescript
const research = researchTemplate({ engine })
const decision = decisionTemplate({ engine })

// Research agents explore, then decision agents evaluate
const combined = {
  agents: [
    ...research.agents,
    // Add the judge and devil's advocate from decision template
    ...decision.agents.filter(a =>
      ['judge', 'devils-advocate'].includes(a.config.id)
    ),
  ],
  consensus: decision.consensus,
  maxRounds: 10,
  math: research.math,
}
```

## Creating a Custom Template

Follow this pattern to create reusable templates for your domain:

```typescript
import type { SwarmConfig } from '@cognitive-swarm/core'
import { agentDef, type TemplateProviders } from '@cognitive-swarm/templates'

export function medicalTriageTemplate(providers: TemplateProviders): SwarmConfig {
  return {
    agents: [
      agentDef({
        id: 'symptom-analyzer',
        name: 'Symptom Analyzer',
        role: 'Parse symptoms, identify patterns, flag red flags',
        personality: 'analytical',
        listens: ['task:new'],
        canEmit: ['discovery'],
      }, providers),

      agentDef({
        id: 'differential-dx',
        name: 'Differential Diagnosis',
        role: 'Generate possible diagnoses ranked by likelihood',
        personality: 'creative',
        listens: ['discovery'],
        canEmit: ['proposal', 'discovery'],
      }, providers),

      agentDef({
        id: 'safety-checker',
        name: 'Safety Checker',
        role: 'Flag dangerous conditions that need immediate attention',
        personality: 'cautious',
        listens: ['discovery', 'proposal'],
        canEmit: ['challenge', 'doubt', 'vote'],
        weight: 2.0,   // safety agent gets highest weight
      }, providers),

      agentDef({
        id: 'evidence-reviewer',
        name: 'Evidence Reviewer',
        role: 'Cross-reference findings with clinical guidelines',
        personality: 'critical',
        listens: ['proposal', 'discovery'],
        canEmit: ['vote', 'challenge'],
        weight: 1.3,
      }, providers),
    ],
    consensus: {
      strategy: 'confidence-weighted',
      threshold: 0.75,   // high threshold for medical decisions
      minVoters: 3,
    },
    maxRounds: 6,
    math: {
      entropyThreshold: 0.15,
      minInformationGain: 0.05,
      redundancyThreshold: 0.7,
    },
  }
}
```

## Troubleshooting

### Swarm converges too quickly (shallow analysis)

- Increase `maxRounds` (default varies by template)
- Lower `math.redundancyThreshold` to allow more diverse signals
- Add agents with low conformity to challenge early consensus
- Increase `math.minInformationGain` to require more novel information per round

### Swarm never converges (too many rounds)

- Increase `consensus.threshold` slightly -- counterintuitively, this can help by allowing a smaller supermajority to conclude
- Increase `math.entropyThreshold` so the swarm stops when information gain flattens
- Add a synthesizer agent with high weight to pull toward consensus
- Reduce `maxRounds` to force early termination

### One agent dominates the discussion

- Lower that agent's `weight`
- Add more agents with different perspectives
- Set the dominant agent's `canEmit` to exclude `vote` so it influences but doesn't decide

### Agents agree too readily (groupthink)

- Add a `bold` personality agent that challenges consensus
- Lower conformity across agents
- Use `detectGroupThink()` from `@cognitive-swarm/introspection` to measure
- Include agents that listen to `challenge` and `doubt` signals

### Token budget exceeded

- Set `tokenBudget` on the SwarmConfig to cap total usage
- Reduce `maxRounds`
- Remove redundant agents (e.g., keep one explorer instead of two)
- Lower `verbosity` in personality vectors to reduce response length
