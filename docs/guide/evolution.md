# Evolution

cognitive-swarm supports self-evolving swarms where agents detect expertise gaps and spawn new specialists mid-solve. Agents that don't contribute value are dissolved. No other multi-agent framework has this.

## How It Works

```
Day 1:  5 agents → basic analysis
Day 12: No challengers + high groupthink risk detected
        → gap:detected → confirmation round → spawns critical-challenger
Day 15: Stagnation: low info gain + high entropy
        → spawns lateral-thinker
Day 20: lateral-thinker has low value score after evaluation window
        → DISSOLVED (reason: value below threshold)
Day 25: critical-challenger caught 3 real issues → KEPT
Day 40: DNS issue → spawns bridge-connector → dissolved after cooldown
Month 3: Swarm grew from 5 → 7 agents, all self-created
```

The system has two layers: the `EvolutionController` (in the orchestrator) handles gap detection from math analysis and manages the lifecycle, while `SwarmEvolver` (in the evolution package) handles spawn proposals and evaluation scoring.

## Architecture

```
MathAnalysis (28 modules)
    │
    ▼
┌────────────────────────────┐
│   EvolutionController      │
│                            │
│   1. detectGaps()          │  ← reads math analysis
│      ├── groupthink?       │     game theory, replicator, influence,
│      ├── stagnation?       │     proposal energy, projection consensus
│      ├── isolated agents?  │
│      ├── silent agents?    │
│      └── rising dark horse?│
│                            │
│   2. processSpawns()       │  ← confirmed gaps → spawn proposals
│      ├── check gates       │     (maxEvolvedAgents, cooldown, etc.)
│      └── create proposal   │     from domain presets
│                            │
│   3. evaluateSpawned()     │  ← after evaluation window
│      └── dissolve if low   │     value score
│                            │
│   4. nmiPrune()            │  ← redundancy check
│      └── dissolve if NMI   │     > threshold (max 1/round)
│                            │
│   Output: EvolutionAction[]│
│     spawn | dissolve       │
└────────────────────────────┘
         │
         ▼
    SwarmOrchestrator.applyEvolutionActions()
         │
         ├── spawn: create new SwarmAgent with preset personality
         │          (uses first agent's engine config as template)
         │
         └── dissolve: add to evolvedDisabled set
                       (excluded from activeAgents)
```

## Configuration

```typescript
const swarm = new SwarmOrchestrator({
  agents,
  evolution: {
    enabled: true,              // default: false
    maxEvolvedAgents: 3,        // hard cap on spawned agents (default: 3)
    evaluationWindow: 5,        // rounds before evaluating (default: 5)
    minValueForKeep: 0.5,       // minimum value score to keep (default: 0.5)
    cooldownRounds: 3,          // rounds after dissolving before re-spawn (default: 3)
    nmiPruneThreshold: 0.8,     // dissolve if redundant (default: 0.8)
  },
})
```

### EvolutionConfig

```typescript
interface EvolutionConfig {
  /** Enable mid-solve evolution. Default: false */
  readonly enabled?: boolean
  /** Hard cap on evolved agents. Default: 3 */
  readonly maxEvolvedAgents?: number
  /** Rounds before evaluating spawned agents. Default: 5 */
  readonly evaluationWindow?: number
  /** Minimum value score to keep a spawned agent. Default: 0.5 */
  readonly minValueForKeep?: number
  /** Rounds after dissolving before same domain can spawn again. Default: 3 */
  readonly cooldownRounds?: number
  /** NMI above which evolved agents are considered redundant. Default: 0.8 */
  readonly nmiPruneThreshold?: number
}
```

## Gap Detection

The `EvolutionController.detectGaps()` method reads the math analysis and looks for 7 types of gaps:

### 1. No Challengers (Game Theory)

```typescript
if (math.gameTheory.actualChallengers === 0 &&
    math.gameTheory.groupthinkRisk === 'high') {
  reportGap('critical-challenger', 'No challengers, consensus unchecked', 0.9)
}
```

Highest urgency (0.9). Spawns a `critical-challenger` with low conformity (0.1) and high curiosity (0.8).

### 2. Underrepresented Strategy (Replicator Dynamics)

```typescript
for (const shift of math.replicatorDynamics.suggestedShifts) {
  if (shift.magnitude > 0.7 && shift.direction === 'increase') {
    reportGap(`${shift.strategy}-specialist`, 'Underrepresented strategy', 0.6)
  }
}
```

When a strategy is significantly underrepresented (magnitude > 0.7), spawns a specialist for that strategy.

### 3. Isolated Agents (Influence Graph)

```typescript
if (math.influence.isolatedAgents.length > 0) {
  reportGap('bridge-connector', 'Isolated agents need bridging', 0.5)
}
```

When agents are isolated in the influence graph, spawns a bridge-connector to connect clusters.

### 4. Stagnation (Entropy + Info Gain)

```typescript
if (math.informationGain.perRound < 0.01 &&
    math.entropy.normalized > 0.7) {
  reportGap('lateral-thinker', 'Swarm stagnating with mixed perspectives', 0.7)
}
```

Low information gain + high entropy = agents are talking but not converging. Spawns a lateral-thinker.

### 5. Silent Agents

```typescript
let silentCount = 0
for (const contrib of contributions.values()) {
  if (contrib.proposalsMade === 0 && contrib.signalsEmitted <= 1) {
    silentCount++
  }
}
if (silentCount >= 3) {
  reportGap('active-contributor', `${silentCount} nearly-silent agents`, 0.4)
}
```

Note: urgency 0.4 is below `MIN_URGENCY_FOR_SPAWN` (0.6), so this gap alone won't trigger a spawn. But if confirmed by other signals, it can compound.

### 6. Rising Dark Horse (Proposal Energy)

```typescript
if (math.proposalEnergy.risingFastest &&
    risingFastest !== math.bayesian.mapEstimate.proposalId &&
    risingFastest !== math.proposalEnergy.leader) {
  reportGap('lateral-thinker',
    `Proposal "${rising}" gaining momentum but not leading`, 0.6)
}
```

When a proposal is gaining momentum but isn't the MAP leader or energy leader, it might need advocacy.

### 7. Projection vs Bayesian Disagreement

```typescript
if (projectionLeader !== math.bayesian.mapEstimate.proposalId &&
    !math.projectionConsensus.tight) {
  reportGap('lateral-thinker',
    'Weight structure disagrees with likelihood', 0.7)
}
```

When weighted least-squares consensus points to a different winner than Bayesian MAP, the weight structure reveals a hidden preference.

## Domain Presets

Each domain has a preset personality and signal capabilities:

| Domain | Personality | canEmit |
|--------|-------------|---------|
| `critical-challenger` | curiosity: 0.8, caution: 0.3, conformity: **0.1** | challenge, doubt, discovery, vote |
| `lateral-thinker` | curiosity: **0.9**, caution: 0.4, conformity: 0.2 | discovery, proposal, challenge |
| `vote-specialist` | curiosity: 0.4, caution: 0.6, conformity: **0.8** | vote, discovery |
| `bridge-connector` | curiosity: 0.6, caution: 0.5, conformity: 0.5 | discovery, proposal, vote |
| `active-contributor` | curiosity: 0.7, caution: 0.4, conformity: 0.4 | discovery, proposal, challenge, vote |
| `discovery-specialist` | curiosity: **0.9**, caution: 0.3, conformity: 0.2 | discovery, proposal, challenge |

All evolved agents listen to: `['task:new', 'discovery', 'challenge']`.

If the domain doesn't match a preset, the default personality is used: `{ curiosity: 0.7, caution: 0.5, conformity: 0.3, verbosity: 0.5 }`.

## Spawn Guardrails

Multiple gates prevent frivolous spawning:

| Gate | Threshold | Description |
|------|-----------|-------------|
| `maxEvolvedAgents` | 3 (default) | Hard cap on total evolved agents |
| `MIN_URGENCY_FOR_SPAWN` | 0.6 | Gap urgency must exceed this |
| Confirmation count | 2 | Gap must be confirmed by 2+ rounds of detection |
| Domain cooldown | `cooldownRounds` | After dissolving, same domain can't re-spawn for N rounds |
| Domain uniqueness | -- | Can't spawn if domain already has an active agent |

```typescript
// processSpawns() gate checks:
if (this.spawnedAgentIds.size >= this.config.maxEvolvedAgents) break
if (entry.confirmations < 2) continue
if (this.spawnedDomains.has(domain)) continue
if (this.domainCooldowns.has(domain)) continue
```

## Value Score & Evaluation

After `evaluationWindow` rounds, each spawned agent is evaluated:

```typescript
// SwarmEvolver.evaluate()
const signalScore = Math.min(signalsSent / 10, 1)      // max at 10 signals
const proposalScore = Math.min(proposalsMade / 3, 1)    // max at 3 proposals
const valueScore = 0.4 * signalScore + 0.6 * proposalScore
```

The scoring weights proposals more heavily (60%) than general signals (40%). An agent that makes proposals is more valuable than one that only emits discoveries.

| Metric | Weight | Max |
|--------|--------|-----|
| Signals emitted | 0.4 | 10 signals = score 1.0 |
| Proposals made | 0.6 | 3 proposals = score 1.0 |

If `valueScore < minValueForKeep` (default: 0.5), the agent is dissolved. If the evaluation window hasn't passed yet, the agent gets the benefit of the doubt (`recommendation: 'keep'`).

## NMI-Based Pruning

Each round, the controller checks if any evolved agent has high redundancy with existing agents:

```typescript
// nmiPrune()
if (math.redundancy.averageNMI < config.nmiPruneThreshold) return []  // no pruning

const candidates = math.redundancy.redundantAgents
  .filter(id => this.spawnedAgentIds.has(id))  // only prune evolved agents

// Prune at most 1 per round
const agentId = candidates[0]!
dissolveAgent(agentId, round, `Redundant (NMI > ${threshold})`)
```

Key constraints:
- Only **evolved** agents can be pruned by NMI (original agents are never dissolved)
- Maximum 1 agent pruned per round (prevents cascade)
- Dissolved agent's domain enters cooldown

## Dissolution & Cooldown

When an agent is dissolved:

1. Its domain enters a cooldown period (`cooldownRounds`, default: 3)
2. It's added to the `evolvedDisabled` set
3. It's excluded from `activeAgents` in subsequent rounds
4. The cooldown ticks down each round; when it reaches 0, the domain can spawn again

```typescript
private dissolveAgent(agentId: string, round: number, reason: string): void {
  // Find domain for cooldown
  for (const [domain, id] of this.spawnedDomains) {
    if (id === agentId) {
      this.domainCooldowns.set(domain, this.config.cooldownRounds)
      this.spawnedDomains.delete(domain)
      break
    }
  }
  this.spawnedAgentIds.delete(agentId)
  this.spawnRounds.delete(agentId)
  this.dissolveLog.push({ agentId, round, reason })
}
```

## SwarmEvolver (Direct Usage)

The `SwarmEvolver` from `@cognitive-swarm/evolution` can be used independently:

```typescript
import { SwarmEvolver } from '@cognitive-swarm/evolution'

const evolver = new SwarmEvolver(llm, {
  minVotesForSpawn: 2,       // confirmations needed (default: 2)
  approvalThreshold: 0.6,    // not used in auto-approve mode
  minValueForKeep: 0.3,      // lower than orchestrator default
  evaluationWindow: 3,       // rounds before evaluation
})

// Report a gap
evolver.reportGap({
  id: 'g1',
  detectedBy: 'agent-1',
  domain: 'reverse-engineering',
  reason: 'Found obfuscated code',
  urgency: 0.8,
  timestamp: Date.now(),
})

// Another agent confirms
evolver.confirmGap('g1', 'agent-2')

// Propose spawn (uses LLM to generate role)
const proposal = await evolver.proposeSpawn('g1', ['analyst', 'critic'])
if (proposal) {
  console.log(proposal.role)            // e.g., "code-analyst"
  console.log(proposal.roleDescription) // "Specialist in reverse-engineering: ..."
  console.log(proposal.personality)     // { curiosity: 0.7, caution: 0.5, ... }
}

// Evaluate after N rounds
const eval = evolver.evaluate('agent-7', 5, 2, 8)  // signals, proposals, rounds
// { valueScore: 0.6, recommendation: 'keep', reason: '...' }

// Suggest pruning
const prune = evolver.suggestPrune(redundancyScores)
// { candidates: [...], pruneCount: 1 }
```

When used directly (not through the orchestrator), `SwarmEvolver` uses LLM calls to generate role descriptions and personalities for new agents. The orchestrator's `EvolutionController` bypasses LLM generation and uses domain presets instead for deterministic spawning.

## EvolutionReport

The `SwarmResult.evolutionReport` contains the full record:

```typescript
interface EvolutionReport {
  readonly spawned: readonly EvolutionSpawnEntry[]
  readonly dissolved: readonly EvolutionDissolveEntry[]
  readonly activeEvolvedCount: number
}

interface EvolutionSpawnEntry {
  readonly agentId: string
  readonly domain: string
  readonly round: number
  readonly reason: string
}

interface EvolutionDissolveEntry {
  readonly agentId: string
  readonly round: number
  readonly reason: string
}
```

## Streaming Evolution Events

```typescript
for await (const event of swarm.solveWithStream('diagnose this system')) {
  if (event.type === 'evolution:spawned') {
    console.log(`Spawned: ${event.agentId} [${event.domain}] - ${event.reason}`)
  }
  if (event.type === 'evolution:dissolved') {
    console.log(`Dissolved: ${event.agentId} - ${event.reason}`)
  }
}
```

## Types

```typescript
// packages/evolution/src/types.ts

interface GapSignal {
  readonly id: string
  readonly detectedBy: string
  readonly domain: string
  readonly reason: string
  readonly suggestedRole?: string
  readonly urgency: number       // 0..1
  readonly timestamp: number
}

interface SpawnProposal {
  readonly id: string
  readonly gapId: string
  readonly role: string
  readonly roleDescription: string
  readonly personality: PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly temporary: boolean     // true if urgency < 0.5
  readonly proposedBy: readonly string[]
  readonly votes: readonly VoteRecord[]
  readonly status: 'pending' | 'approved' | 'rejected'
}

interface EvaluationResult {
  readonly agentId: string
  readonly valueScore: number     // 0..1
  readonly roundsActive: number
  readonly recommendation: 'keep' | 'dissolve'
  readonly reason: string
}

interface PruneCandidate {
  readonly agentId: string
  readonly reason: string
  readonly redundancyScore: number  // 0..1
}
```
