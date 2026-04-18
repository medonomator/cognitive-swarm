# Architecture

cognitive-swarm is a monorepo with 20 packages. This page covers the full component map, the solve loop in detail, how packages connect, memory layers, and streaming.

## Package Map

| Layer | Package | Role |
|-------|---------|------|
| **Core** | `@cognitive-swarm/core` | Types, interfaces, events, config. Zero runtime dependencies. |
| **Signals** | `@cognitive-swarm/signals` | `SignalBus` + `ConflictDetector`. The nervous system. |
| **Agent** | `@cognitive-swarm/agent` | `SwarmAgent` -- wraps cognitive-engine pipeline with signal reaction layer. |
| **Consensus** | `@cognitive-swarm/consensus` | `ConsensusEngine` + 5 built-in strategies. |
| **Math** | `@cognitive-swarm/math` | 28 mathematical analysis modules. Pure TypeScript, no LLM. |
| **Evolution** | `@cognitive-swarm/evolution` | `SwarmEvolver` -- gap detection, spawn proposals, evaluation. |
| **Orchestrator** | `@cognitive-swarm/orchestrator` | `SwarmOrchestrator` -- wires everything together, runs solve loop. |
| **Templates** | `@cognitive-swarm/templates` | Pre-built swarm configurations (research, decision, etc). |
| **OTel** | `@cognitive-swarm/otel` | OpenTelemetry instrumentation wrapper. |
| **Memory** | `@cognitive-swarm/memory-pool` | In-memory shared fact pool. |
| **Memory** | `@cognitive-swarm/memory-qdrant` | Qdrant-backed persistent vector memory. |
| **MCP** | `@cognitive-swarm/mcp` | Model Context Protocol tool integration. |
| **A2A** | `@cognitive-swarm/a2a` | Agent-to-Agent protocol support. |
| **Reputation** | `@cognitive-swarm/reputation` | Agent reliability scores and trust history. |
| **Introspection** | `@cognitive-swarm/introspection` | Self-reflection and meta-reasoning. |
| **Evaluation** | `@cognitive-swarm/evaluation` | Outcome tracking, calibration, benchmarks. |
| **Composer** | `@cognitive-swarm/composer` | Multi-swarm composition. |
| **Tools** | `@cognitive-swarm/tools-web-fetch` | Web fetch tool for MCP. |
| **Tools** | `@cognitive-swarm/tools-web-search` | Web search tool for MCP. |
| **Benchmarks** | `@cognitive-swarm/benchmarks` | Performance benchmarks. |

## Component Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Signal Bus                                   │
│   task:new, discovery, proposal, doubt, challenge, vote, conflict,   │
│   consensus:reached, escalate, memory:shared, tool:result            │
└───┬──────┬──────┬──────┬──────┬──────────────────────────────────────┘
    │      │      │      │      │
 ┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐    ┌────────────────────┐
 │Agent││Agent││Agent││Agent││Agent│◄───│ Thompson Sampling  │
 │  1  ││  2  ││  3  ││  4  ││  5  │    │ Bandit (per agent) │
 └──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘    └────────────────────┘
    │      │      │      │      │
    │   Each agent = full cognitive-engine pipeline:
    │   perception → memory → reasoning → metacognition
    │
    └──────┴──────┴──────┴──────┘
                    │
     ┌──────────────▼──────────────────┐
     │        Math Bridge (28 modules)  │
     │  entropy | bayesian | game-theory│
     │  free-energy | causal | surprise │
     │  fisher | markov | pso | shapley │
     │  topology | transport | chaos    │
     │  damping | svd | archetypes ...  │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │        Swarm Advisor             │
     │  groupthink | pruning | topology │
     │  reputation | meta-agent (LLM)   │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │       Consensus Engine           │
     │  confidence-weighted | bayesian  │
     │  entropy | hierarchical | voting │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │     Evolution Controller         │
     │  gap detection | spawn | dissolve│
     └──────────────┬──────────────────┘
                    │
              ┌─────▼─────┐
              │ Synthesizer│ → SwarmResult
              └───────────┘
```

## The Solve Loop (Detailed)

The orchestrator's `solve()` method runs a round-based loop. Here is the complete flow with every step:

```
solve(task: string): Promise<SwarmResult>
    │
    ├── 1. INITIALIZATION
    │    ├── Generate solveId (uid('solve'))
    │    ├── Reset: contributionTracker, mathBridge, advisor,
    │    │         evolution, predictionEngine, all token trackers
    │    ├── Load bandit scores (if persistent storage configured)
    │    │
    │    ├── Create task:new signal
    │    │   { type: 'task:new', source: 'orchestrator',
    │    │     payload: { task }, confidence: 1 }
    │    │
    │    ├── Publish to signal bus
    │    │
    │    └── Recall memories from vector memory (Qdrant)
    │         Search for top 5 relevant memories → memory:shared signals
    │
    ├── 2. ROUND LOOP (round 0..maxRounds-1)
    │    │
    │    ├── Guard checks (any → break):
    │    │    • No pending signals
    │    │    • totalSignals >= maxSignals (default: 200)
    │    │    • Timeout exceeded (default: 120s)
    │    │    • Token budget exhausted
    │    │
    │    ├── 2a. PREDICTIVE PROCESSING
    │    │    Generate predictions for each agent (before the round)
    │    │
    │    ├── 2b. AGENT REACTIONS (RoundRunner)
    │    │    For each active agent:
    │    │      ├── Filter pending signals by agent's listens[]
    │    │      ├── Apply topology filter (if advisor enabled)
    │    │      ├── Apply AgentSelector (if topK configured)
    │    │      ├── Agent processes signal:
    │    │      │   ├── Read signal bus for context
    │    │      │   ├── Run cognitive pipeline (perception → reasoning)
    │    │      │   ├── Select strategy via Thompson Sampling:
    │    │      │   │   analyze | propose | challenge | support | synthesize | defer
    │    │      │   └── Emit 0..N typed signals
    │    │      └── Track contribution (signals emitted, proposals made, etc.)
    │    │
    │    ├── 2c. PUBLISH NEW SIGNALS
    │    │    All agent reactions → publish to signal bus
    │    │
    │    ├── 2d. PREDICTION ERRORS
    │    │    Compute prediction errors (after the round)
    │    │
    │    ├── 2e. MATH BRIDGE
    │    │    processRound(newSignals, allProposals, allVotes)
    │    │    28 modules analyze the signal distribution
    │    │
    │    ├── 2f. ADVISOR (optional)
    │    │    evaluateRound(signals, round, mathBridge, agentIds)
    │    │    Possible actions:
    │    │      ├── inject-signal: groupthink correction (doubt signal)
    │    │      ├── update-topology: restrict who talks to whom
    │    │      └── disable-agent: Shapley-prune redundant agents
    │    │
    │    ├── 2g. EVOLUTION (if enabled)
    │    │    evaluateRound(round, mathAnalysis, contributions, agentIds)
    │    │    ├── Tick cooldowns
    │    │    ├── Detect gaps from math (groupthink, stagnation, etc.)
    │    │    ├── Process spawn proposals (if confirmed by 2+ rounds)
    │    │    ├── Evaluate spawned agents for dissolution
    │    │    └── NMI prune redundant evolved agents (max 1/round)
    │    │
    │    ├── 2h. MATH-DRIVEN CHALLENGE
    │    │    If phase detector detects 'ordered' phase (groupthink):
    │    │      inject challenge signal from 'orchestrator'
    │    │    If free energy recommends 'challenge':
    │    │      inject challenge signal
    │    │
    │    ├── 2i. MEMORY OPERATIONS
    │    │    ├── Store discoveries/proposals/challenges in vector memory
    │    │    └── Reinforce memories that received agree votes
    │    │
    │    ├── 2j. MATH STOPPING CHECK
    │    │    mathBridge.shouldStop()?
    │    │    ├── entropy < entropyThreshold (default: 0.3)
    │    │    ├── free energy converged (deltaF ≈ 0)
    │    │    ├── Fisher information stalled (learning stopped)
    │    │    ├── CUSUM change detected
    │    │    ├── Secretary threshold reached
    │    │    ├── Chaos critical (period-3 detected)
    │    │    └── Cycle detected (Markov)
    │    │
    │    ├── 2k. CONSENSUS CHECK
    │    │    Extract proposals + votes from signal history
    │    │    Apply attention weights (clamped [0.8, 1.2])
    │    │    Apply reputation weights
    │    │    canEvaluate? → evaluate()
    │    │    ├── decided: true → BREAK
    │    │    └── decided: false → try debate (if 2+ proposals)
    │    │        ├── Debate resolved? → re-evaluate → BREAK if decided
    │    │        └── Not resolved → continue
    │    │
    │    └── NEXT ROUND
    │
    ├── 3. POST-LOOP
    │    ├── Memory decay (if configured)
    │    ├── Final consensus attempt (if none reached in loop)
    │    ├── Synthesis (optional LLM call to produce coherent answer)
    │    ├── Bandit feedback recording
    │    │   reward = consensus.confidence * agent.avgConfidence + winnerBonus
    │    └── Calibration tracking
    │
    └── 4. RETURN SwarmResult
         { solveId, answer, confidence, consensus, signalLog,
           agentContributions, cost, timing, mathAnalysis,
           advisorReport, debateResults, evolutionReport }
```

## Component Interaction Diagram

```
                           SwarmConfig
                               │
                     ┌─────────▼──────────┐
                     │  SwarmOrchestrator  │
                     │                    │
                     │  ┌───────────────┐ │      ┌─────────────────┐
                     │  │  RoundRunner  │ │      │  SwarmAgent[]   │
                     │  │  (parallel    │◄├─────►│  ┌───────────┐  │
                     │  │   agent exec) │ │      │  │ cognitive- │  │
                     │  └───────────────┘ │      │  │ engine     │  │
                     │                    │      │  │ pipeline   │  │
                     │  ┌───────────────┐ │      │  └───────────┘  │
                     │  │  SignalBus    │◄├─────►│  ┌───────────┐  │
                     │  │  (pub/sub)    │ │      │  │ Thompson   │  │
                     │  └───────────────┘ │      │  │ Bandit     │  │
                     │                    │      │  └───────────┘  │
                     │  ┌───────────────┐ │      └─────────────────┘
                     │  │ MathBridge    │ │
                     │  │ (28 modules)  │ │      ┌─────────────────┐
                     │  └───────────────┘ │      │ LLM Provider    │
                     │                    │      │ ┌─────────────┐ │
                     │  ┌───────────────┐ │      │ │ Resilient   │ │
                     │  │ConsensusEngine│ │      │ │ (retry +    │ │
                     │  │ (5 strategies)│ │      │ │ circuit     │ │
                     │  └───────────────┘ │      │ │ breaker)    │ │
                     │                    │      │ └──────┬──────┘ │
                     │  ┌───────────────┐ │      │ ┌──────▼──────┐ │
                     │  │ SwarmAdvisor  │ │      │ │ Token       │ │
                     │  │ (optional)    │ │      │ │ Tracker     │ │
                     │  └───────────────┘ │      │ └─────────────┘ │
                     │                    │      └─────────────────┘
                     │  ┌───────────────┐ │
                     │  │  Synthesizer  │ │      ┌─────────────────┐
                     │  │  (optional)   │ │      │  External       │
                     │  └───────────────┘ │      │  ┌───────────┐  │
                     │                    │      │  │ Qdrant    │  │
                     │  ┌───────────────┐ │      │  │ (vectors) │  │
                     │  │ DebateRunner  │ │      │  └───────────┘  │
                     │  │ (if debate)   │ │      │  ┌───────────┐  │
                     │  └───────────────┘ │      │  │ Checkpoint│  │
                     │                    │      │  │ Storage   │  │
                     │  ┌───────────────┐ │      │  └───────────┘  │
                     │  │ Evolution     │ │      │  ┌───────────┐  │
                     │  │ Controller    │ │      │  │ Bandit    │  │
                     │  │ (if enabled)  │ │      │  │ Storage   │  │
                     │  └───────────────┘ │      │  └───────────┘  │
                     │                    │      └─────────────────┘
                     │  ┌───────────────┐ │
                     │  │ AgentSelector │ │
                     │  │ (optional)    │ │
                     │  └───────────────┘ │
                     │                    │
                     │  ┌───────────────┐ │
                     │  │  Prediction   │ │
                     │  │  Engine       │ │
                     │  └───────────────┘ │
                     │                    │
                     │  ┌───────────────┐ │
                     │  │ Calibration   │ │
                     │  │ Tracker       │ │
                     │  └───────────────┘ │
                     │                    │
                     │  ┌───────────────┐ │
                     │  │  Global       │ │
                     │  │  Workspace    │ │
                     │  └───────────────┘ │
                     └────────────────────┘
```

## Components in Detail

### SwarmOrchestrator

The main entry point. Created with `SwarmConfig`, exposes three solve methods:

```typescript
class SwarmOrchestrator {
  /** Solve a task. Returns the full SwarmResult. */
  async solve(task: string): Promise<SwarmResult>

  /** Solve with streaming events via async iterator. */
  async *solveWithStream(task: string): AsyncIterable<SwarmEvent>

  /** Solve with checkpoint/resume support. */
  async solveResumable(task: string, checkpointId?: string): Promise<SwarmResult>

  /** Register a callback for signal events. Returns cleanup function. */
  onSignal(callback: (signal: Signal) => void): () => void

  /** Register a typed event listener. Returns cleanup function. */
  on<K extends keyof SwarmEventMap & string>(
    event: K, handler: (data: SwarmEventMap[K]) => void
  ): () => void

  /** Clean up all resources (bus timers, event listeners). */
  destroy(): void
}
```

On construction, the orchestrator:
1. Resolves all config defaults
2. Creates the `SignalBus` (sweep disabled, TTL = timeout * 2)
3. Creates the `ConsensusEngine` with the configured strategy
4. For each agent definition, wraps the LLM provider in `ResilientLlmProvider` then `TokenTrackingLlmProvider`, creates a `CognitiveOrchestrator` and `ThompsonBandit`, and constructs a `SwarmAgent`
5. If `tokenBudget` is set, wires a shared counter across all token trackers
6. Creates optional components: Synthesizer, MathBridge, SwarmAdvisor, DebateRunner, AgentSelector, EvolutionController, CalibrationTracker, GlobalWorkspace, PredictionEngine

### SwarmAgent

Each agent is a full [cognitive-engine](https://github.com/medonomator/cognitive-engine) pipeline with a swarm-specific reaction layer. When a signal arrives:

1. The agent reads the signal bus for surrounding context
2. The cognitive pipeline runs: perception, memory recall, reasoning
3. Thompson Sampling selects a strategy: `analyze`, `propose`, `challenge`, `support`, `synthesize`, or `defer`
4. The agent emits 0..N signals constrained by its `canEmit` list
5. After consensus, bandit feedback is recorded per-reaction:
   - Reward = `consensus.confidence * agent.avgConfidence + winnerBonus`
   - Winner bonus = +0.2 if agent authored the winning proposal
   - Strategy + context vector stored for future selection

### MathBridge

Runs 28 mathematical modules after each round. Produces two outputs:

- **`MathAnalysis`** -- included in `SwarmResult.mathAnalysis` for observability
- **`SwarmControlSignals`** -- fed back into the solve loop:
  ```typescript
  interface SwarmControlSignals {
    shouldInjectChallenge: boolean
    challengeTarget?: string
    phase: 'ordered' | 'critical' | 'disordered'
    attentionWeights: Record<string, number>
    // ... more fields
  }
  ```

### RoundRunner

Executes agent reactions for a single round. Takes an array of agents and pending signals, runs each agent in parallel (all active agents process the same pending signals), collects reactions and new signals.

### ContributionTracker

Tracks per-agent statistics across the solve: signals emitted, proposals made, challenges made, average confidence. Used for evolution evaluation, Shapley values, and the `SwarmResult.agentContributions` map.

## Memory Architecture

```
Layer 1: Working Memory (per-round)
         Signal bus — ephemeral, this round's pending signals only

Layer 2: Agent Episodic Memory
         Each agent's own reasoning history (cognitive-engine)

Layer 3: Signal History
         Complete signal log across all rounds (bounded by maxHistorySize)

Layer 4: Shared Memory Pool
         In-memory facts shared between agents (memory-pool package)

Layer 5: Vector Memory (Qdrant)
         Persistent semantic search across sessions (memory-qdrant package)
         - Discoveries, proposals, challenges stored after each round
         - Recalled at solve start (top 5 by relevance)
         - Reinforced when agreement votes arrive

Layer 6: Bandit Memory
         Thompson Sampling parameters — which strategy works in which context
         Persistent across sessions via BanditStorage

Layer 7: Reputation Memory
         Agent reliability scores, trust history (reputation package)
```

Layers 1-3 are ephemeral per solve. Layers 4-7 persist across sessions, enabling the swarm to get smarter over time.

## Streaming Events

`solveWithStream()` yields `SwarmEvent` objects as they occur. The full discriminated union:

```typescript
type SwarmEvent =
  | { type: 'solve:start'; task: string }
  | { type: 'round:start'; round: number }
  | { type: 'signal:emitted'; signal: Signal }
  | { type: 'agent:reacted'; reaction: AgentReaction }
  | { type: 'consensus:check'; result: ConsensusResult }
  | { type: 'round:end'; round: number; signalCount: number }
  | { type: 'synthesis:start' }
  | { type: 'synthesis:complete'; answer: string }
  | { type: 'math:round-analysis'; round: number;
      entropy: number; normalizedEntropy: number; informationGain: number }
  | { type: 'advisor:action'; advice: SwarmAdvice }
  | { type: 'debate:start'; proposalA: string; proposalB: string }
  | { type: 'debate:round'; round: number;
      posteriors: Record<string, number> }
  | { type: 'debate:end'; result: DebateResult }
  | { type: 'topology:updated';
      neighbors: ReadonlyMap<string, ReadonlySet<string>>; reason: string }
  | { type: 'evolution:spawned'; agentId: string; domain: string; reason: string }
  | { type: 'evolution:dissolved'; agentId: string; reason: string }
  | { type: 'solve:complete'; result: SwarmResult }
```

### Usage:

```typescript
for await (const event of swarm.solveWithStream('task')) {
  switch (event.type) {
    case 'solve:start':
      console.log(`Starting: ${event.task}`)
      break
    case 'round:start':
      console.log(`--- Round ${event.round} ---`)
      break
    case 'signal:emitted':
      console.log(`[${event.signal.source}] ${event.signal.type}`)
      break
    case 'math:round-analysis':
      console.log(`Entropy: ${event.normalizedEntropy.toFixed(3)}`)
      break
    case 'consensus:check':
      console.log(`Consensus: ${event.result.decided ? 'REACHED' : 'pending'}`)
      break
    case 'evolution:spawned':
      console.log(`Spawned: ${event.domain} - ${event.reason}`)
      break
    case 'solve:complete':
      console.log(`Done in ${event.result.timing.roundsUsed} rounds`)
      break
  }
}
```

## SwarmResult

The final output of every solve:

```typescript
interface SwarmResult {
  readonly solveId: string
  readonly answer: string                                    // synthesized or raw
  readonly confidence: number                                // 0..1
  readonly consensus: ConsensusResult                        // full voting record + dissent
  readonly signalLog: readonly Signal[]                     // complete signal history
  readonly agentContributions: ReadonlyMap<string, AgentContribution>
  readonly cost: { tokens: number; estimatedUsd: number }
  readonly timing: { totalMs: number; roundsUsed: number }
  readonly mathAnalysis: MathAnalysis                        // all 28 module results
  readonly advisorReport: AdvisorReport | null
  readonly debateResults: readonly DebateResult[]
  readonly evolutionReport: EvolutionReport | null
}
```

## Defaults

| Config | Default | Constant |
|--------|---------|----------|
| `maxRounds` | 10 | `DEFAULT_MAX_ROUNDS` |
| `maxSignals` | 200 | `DEFAULT_MAX_SIGNALS` |
| `timeout` | 120,000ms | `DEFAULT_TIMEOUT_MS` |
| `tokenBudget` | unlimited | `null` |
| `retry.maxRetries` | 3 | |
| `retry.baseDelayMs` | 1,000ms | |
| `retry.maxDelayMs` | 10,000ms | |
| `retry.circuitBreakerThreshold` | 5 | |
| `consensus.strategy` | `'confidence-weighted'` | |
| `consensus.threshold` | 0.7 | |
| `consensus.minVoters` | 2 | |
| `consensus.maxDebateRounds` | 3 | |
| `consensus.conflictResolution` | `'debate'` | |
| `math.entropyThreshold` | 0.3 | |
| `math.minInformationGain` | 0.05 | |
| `math.redundancyThreshold` | 0.7 | |
| `evolution.enabled` | false | |
| `evolution.maxEvolvedAgents` | 3 | |
| `evolution.evaluationWindow` | 5 | |
| `evolution.minValueForKeep` | 0.5 | |
| `evolution.cooldownRounds` | 3 | |
| `evolution.nmiPruneThreshold` | 0.8 | |
| Cost per token | $0.000003 | `COST_PER_TOKEN_USD` |
