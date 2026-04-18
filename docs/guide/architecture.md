# Architecture

## Overview

cognitive-swarm has three layers: agents, infrastructure, and the solve loop.

```
┌─────────────────────────────────────────────────────────────┐
│                        Signal Bus                            │
│   discovery, proposal, doubt, challenge, vote, conflict,    │
│   consensus:reached, escalate, memory:shared, tool:result   │
└───┬──────┬──────┬──────┬──────┬──────────────────────────-─┘
    │      │      │      │      │
 ┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐
 │Agent││Agent││Agent││Agent││Agent│   <- cognitive-engine pipeline
 │  1  ││  2  ││  3  ││  4  ││  5  │      (perception, memory, reasoning)
 └──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘
    └──────┴──────┴──────┴──────┘
                    │
     ┌──────────────▼──────────────────┐
     │        Math Bridge (19 modules)  │
     │  entropy | bayesian | game-theory│
     │  free-energy | causal | surprise │
     │  fisher | markov | pso | ...     │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │       Consensus Engine           │
     │  confidence-weighted | bayesian  │
     │  entropy | hierarchical | voting │
     └──────────────┬──────────────────┘
                    │
              ┌─────▼─────┐
              │ Synthesis  │ → SwarmResult
              └───────────┘
```

## The Round-Based Loop

```
solve(task)
    │
    ├── [Pre-loop] Load checkpoint if resuming
    │
    └── Round 1..N
         │
         ├── Emit task:new signal (round 1) or continue from previous signals
         │
         ├── Agent Reactions
         │    └── Each agent that listens to emitted signal types:
         │         ├── Reads signal bus for context
         │         ├── Runs cognitive pipeline (perception → reasoning)
         │         ├── Selects strategy via Thompson Sampling bandit
         │         │    (analyze | propose | challenge | support | synthesize | defer)
         │         └── Emits 0..N typed signals
         │
         ├── Math Bridge
         │    ├── Entropy analysis → normalized uncertainty
         │    ├── Free Energy → is the swarm still learning?
         │    ├── Bayesian posteriors → per-proposal probability
         │    ├── Surprise → which signals were most informative?
         │    ├── Game Theory → groupthink risk
         │    ├── Fisher Information → learning efficiency
         │    └── 13 more modules...
         │
         ├── Advisor (optional)
         │    ├── Groupthink correction → inject doubt signal
         │    ├── Shapley pruning → disable redundant agents
         │    └── Topology update → restrict who talks to whom
         │
         ├── Consensus Check
         │    └── Does the configured strategy + threshold pass?
         │         └── YES → break, go to synthesis
         │
         ├── Math Stopping Check
         │    ├── entropy < threshold? → stop
         │    ├── free energy converged? → stop
         │    ├── learning stalled (Fisher)? → stop
         │    └── otherwise → next round
         │
         └── Save checkpoint if configured
    │
    └── Synthesis → SwarmResult
```

## Components

### SwarmOrchestrator

The main entry point. Wires all components together and runs the solve loop. Takes a `SwarmConfig` and exposes `solve()`, `solveWithStream()`, and `solveResumable()`.

### SignalBus

The nervous system. All agent communication happens through typed signals. The bus tracks signal history, detects conflicts between signals, and supports filtering by type, source, and confidence.

### SwarmAgent

Each agent is a full cognitive-engine pipeline (perception, memory, reasoning, metacognition) with a swarm-specific reaction layer on top. Agents select strategies via Thompson Sampling bandit - the bandit adapts based on which strategies produced signals that won consensus.

### Math Bridge

Runs 19 mathematical modules after each round. Produces `MathAnalysis` (included in `SwarmResult`) and `SwarmControlSignals` (fed back into the solve loop to control behavior).

### ConsensusEngine

Evaluates proposals and votes using one of 5 pluggable strategies. Tracks dissent. Supports structured debate for conflict resolution.

### SwarmAdvisor

Optional mid-solve intelligence layer. Detects groupthink via game theory, prunes redundant agents via Shapley values, and adapts the agent communication topology via influence graph analysis.

### Synthesizer

Optional final LLM call to produce a coherent answer from the consensus result. If disabled, the winning proposal's content is returned directly.

## Memory Architecture

```
Layer 1: Working Memory (per-round)      Signal bus - ephemeral, this round only
Layer 2: Agent Episodic Memory           Each agent's own reasoning history
Layer 3: Signal History                  Complete signal log across all rounds
Layer 4: Shared Memory Pool              In-memory facts shared between agents
Layer 5: Vector Memory (Qdrant)          Persistent semantic search across sessions
Layer 6: Bandit Memory                   Thompson Sampling - which strategy works where
Layer 7: Reputation Memory               Agent reliability scores, trust history
```

Layers 1-3 are ephemeral per solve. Layers 4-7 persist across sessions, enabling the swarm to get smarter over time.

## Streaming

Every significant event is streamed via `solveWithStream()`:

```typescript
for await (const event of swarm.solveWithStream('task')) {
  switch (event.type) {
    case 'solve:start':         // task begins
    case 'round:start':         // new round N
    case 'signal:emitted':      // an agent emitted a signal
    case 'agent:reacted':       // agent processed signals, emitted reactions
    case 'consensus:check':     // consensus evaluation result
    case 'math:round-analysis': // entropy, information gain
    case 'advisor:action':      // advisor intervened
    case 'debate:start':        // structured debate begins
    case 'debate:round':        // debate round with Bayesian posteriors
    case 'debate:end':          // debate result
    case 'topology:updated':    // agent graph restructured
    case 'evolution:spawned':   // new agent spawned
    case 'evolution:dissolved': // agent dissolved
    case 'synthesis:complete':  // final answer
    case 'solve:complete':      // full SwarmResult
  }
}
```
