# Genetic Algorithms for Swarm Self-Optimization

> Date: 2026-04-16
> Status: Proposal
> Context: Applying GA from CS to evolve swarm agents, configs, and team composition

---

## Core Idea

Use genetic algorithms to evolve the swarm itself — prompts, parameters, team composition — driven by real telemetry fitness metrics. Each daily observer run = one evaluation. Monthly cycles = meaningful evolution.

---

## GA Component Requirements

- **Genome**: encodable, mutable representation of what we're optimizing
- **Fitness function**: measurable quality metric from telemetry
- **Population**: multiple variants (small: 3-5, cost-constrained)
- **Selection**: keep the best performers
- **Crossover**: combine traits from two high-performing variants
- **Mutation**: random parameter variations

---

## 1. Agent Prompt Evolution (highest impact)

### Genome (structured, NOT freetext)

```typescript
interface AgentGenome {
  role: string                          // "pattern-detector"
  focus: string[]                       // ["recurring-bugs", "tech-debt", "workflow"]
  depth: "deep" | "broad"              // analysis strategy
  challengeThreshold: number            // 0.0-1.0, when to challenge other agents
  signalStyle: "verbose" | "concise"   // communication style
  instructions: string[]               // ordered list of behavioral instructions
  temperature: number                  // LLM temperature
}
```

### Fitness Metrics

- **Utilization rate**: % of agent's signals that made it into final report
- **Proposal acceptance**: % of proposals accepted by consensus
- **Confidence calibration**: avgConfidence vs actual usefulness
- **Cost per useful insight**: tokens spent / insights contributed
- **Uniqueness**: low NMI with other agents (from mathAnalysis.redundancy)

### Operators

- **Crossover**: swap `focus` arrays and `instructions` subsets between top-2 variants
- **Mutation**: randomly change one parameter (flip depth, adjust threshold +/-0.1, add/remove one instruction)
- **Selection**: tournament selection, keep top 2 of 3

### Cycle

- 1 evaluation per day (daily observer run)
- 5 evaluations per week
- Select + crossover + mutate on weekends
- ~4 generations per month
- Convergence expected in 2-3 months

---

## 2. Swarm Config Hyperparameters (easiest to implement)

### Genome

```typescript
interface ConfigGenome {
  maxRounds: number             // 2..5
  maxSignals: number            // 20..80
  consensusThreshold: number    // 0.2..0.8
  entropyThreshold: number      // 0.1..0.5
  redundancyThreshold: number   // 0.3..0.8
  minInformationGain: number    // 0.01..0.1
}
```

### Fitness

```
fitness = quality / cost
quality = entities_extracted + useful_insights + contradictions_found
cost = USD spent
```

### Cycle

- Population size: 5
- 1 evaluation per day with different config
- Weekly selection + evolution
- 2 weeks to find optimum (config space is small)

---

## 3. Team Composition Evolution (most interesting)

### Genome

```typescript
type TeamGenome = AgentRole[]
// Examples:
// ["pattern-detector", "decision-tracker", "mistake-analyzer"]           // team of 3
// ["pattern-detector", "devil-advocate", "synthesizer", "explorer"]     // team of 4
// ["generalist", "generalist", "critic"]                                // different approach
```

### Agent Role Pool

Current 6 + potential new roles:
- `pattern-detector` (current)
- `decision-tracker` (current)
- `knowledge-extractor` (current)
- `mistake-analyzer` (current)
- `productivity-analyst` (current)
- `report-compiler` (current)
- `devil-advocate` (new: challenges everything)
- `context-linker` (new: finds cross-domain connections)
- `risk-assessor` (new: evaluates risks of decisions)
- `generalist` (new: broad coverage)

### Fitness

- Report quality (assessed by Claude CLI meta-analyzer)
- Coverage: are all important topics addressed?
- Cost efficiency: quality per dollar
- Redundancy penalty: high NMI between agents = bad

### Potential Discoveries

- 4 agents > 6 agents (less noise, cheaper)
- Devil's advocate agent is more valuable than productivity-analyst
- 2 generalists + 1 critic > 6 specialists
- Optimal team size for this workload

---

## Implementation: Island Model Schedule

```
Monday-Friday: 5 days = 5 evaluations
  - Population of 3 config variants
  - Each day runs one variant
  - Costs same as current daily observe (~$0.14/run)

Saturday: Selection + crossover + mutation -> new generation
Sunday: Meta-analysis of entire week (swarm-analyze.ts)
```

### Monthly Budget

- 5 evaluations/week x 4 weeks = 20 evaluations/month
- ~$0.14/evaluation = $2.80/month (vs current $1.80/month)
- +$1.00/month for evolution — acceptable for data-driven optimization

### Storage

```
runner/evolution/
  current-generation.json    // active population
  history/
    gen-001.json             // fitness + genomes
    gen-002.json
  best-config.json           // current champion
```

---

## What NOT To Do

- **Evolve freetext prompts**: search space too large, won't converge
- **Real-time evolution**: no need, daily cycle is sufficient
- **Large populations** (>5): too expensive per generation
- **Evolve everything at once**: one variable at a time, otherwise can't attribute fitness changes

---

## Recommended Start Order

1. **Config hyperparameters** — simplest genome, clear fitness, 2-week convergence
2. **Team composition** — most interesting discoveries, 1-month convergence
3. **Agent prompt evolution** — highest impact but needs structured genome design first

---

## Expected Outcomes (3 months)

After ~12 generations:
- Optimal agent count discovered (data-driven, not guesswork)
- Optimal hyperparameters locked in (rounds, thresholds, signal caps)
- Possible discovery of new agent roles not initially conceived
- Weekly Telegram reports: "Generation 7: fitness +12% vs baseline, removed productivity-analyst, added context-linker"
- Cost-per-insight trending down
- Quality-per-run trending up
