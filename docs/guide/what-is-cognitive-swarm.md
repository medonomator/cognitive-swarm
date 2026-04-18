# What is cognitive-swarm?

cognitive-swarm is a TypeScript library for building multi-agent systems where agents communicate through typed signals, form consensus using formal mathematical strategies, and exhibit emergent behavior -- not scripted pipelines.

## The Problem with Existing Frameworks

Most multi-agent frameworks are either role-based pipelines or chat loops:

```typescript
// CrewAI style - agents follow a script
crew.kickoff() // agent1 → agent2 → agent3 → done

// AutoGen style - agents message each other until timeout
chat.initiate_chat(max_turns=10) // hope they agree

// LangGraph style - you hardcode every transition
graph.add_edge('analyst', 'critic')
graph.add_edge('critic', 'synthesizer')
```

These approaches share fundamental problems:

1. **No formal convergence criterion.** When do you stop? After N turns? When the token limit hits? When the last agent speaks? There's no mathematical answer -- just arbitrary cutoffs.

2. **No conflict resolution.** When two agents disagree, who wins? The last one to speak? The one with the longest response? There's no structured debate, no voting, no evidence weighting.

3. **No learning.** Each run starts from zero. The framework doesn't know which agent strategies worked last time. There's no adaptation.

4. **Hidden control flow.** In pipelines, the order matters enormously -- swap two agents and you get a completely different result. This is fragile. In chat loops, there's no flow at all, just hope.

5. **No self-correction.** If all agents agree on something wrong, there's nothing that says "wait, this consensus is too easy -- maybe we have groupthink." No mathematical check against echo chambers.

## Why Signals Instead of Direct Communication

In most frameworks, agents talk directly to each other: `agent1.send(message, agent2)`. This creates tight coupling -- every agent needs to know who else exists and what they do.

Signals invert this. Agents don't know each other. They emit typed signals onto a shared bus, and receive signals they've subscribed to:

```
                   Signal Bus
           ┌──────────────────────┐
           │  discovery           │
           │  proposal            │
  emit →   │  doubt               │  → deliver
           │  challenge           │
           │  vote                │
           └──────────────────────┘
              ↕  ↕  ↕  ↕  ↕
            [A1][A2][A3][A4][A5]
```

**Why this matters:**

- **Decoupling.** Agent A doesn't know agent B exists. It emits a `proposal` signal. If agent B listens to `proposal`, it reacts. If you add agent C that also listens to `proposal`, no code changes.

- **Emergent specialization.** An agent configured with high caution and `canEmit: ['doubt', 'challenge']` naturally becomes a devil's advocate. Not because you scripted it -- because the bus delivers proposals to it and it reacts cautiously. This is emergence, not orchestration.

- **Observable control flow.** Every signal has an ID, type, source, confidence, timestamp, and optional causal level. The complete signal log is in `SwarmResult.signalLog`. You can replay, analyze, and debug the entire deliberation.

- **Formal conflict detection.** When two agents emit competing proposals, the bus detects the conflict automatically. This triggers the configured resolution: structured debate, majority vote, or escalation.

- **Composability.** Because agents interact through a shared bus, you can add/remove agents without changing any agent code. Evolution does this mid-solve -- spawning specialists and dissolving underperformers.

## The cognitive-swarm Approach

```
Signal Bus
   ↕  ↕  ↕  ↕  ↕
[A1][A2][A3][A4][A5]   ← each agent: full cognitive pipeline
                           perception → memory → reasoning → metacognition
         ↓
   Math Bridge             ← 28 modules run after every round
   entropy, surprise,         pure TypeScript, no LLM calls
   free energy, game theory,
   phase transitions, chaos
         ↓
  Consensus Engine         ← 5 strategies, formal threshold, dissent tracking
  confidence-weighted,        all votes preserved, losers recorded
  bayesian, entropy,
  hierarchical, voting
         ↓
    SwarmResult            ← answer + confidence + full reasoning record
    { answer, consensus,      including every signal, vote, and dissent
      mathAnalysis, cost }
```

### Math as Control, Not Decoration

The 28 mathematical modules aren't just observability metrics. They actively control the swarm:

- **Entropy** decides convergence. When normalized Shannon entropy drops below threshold, agents have agreed -- the swarm stops.
- **Free energy** decides direction. When variational free energy is decreasing, the swarm is still learning. When it converges, it's time to commit.
- **Game theory** decides when to challenge. Nash equilibrium analysis detects when too few agents are challenging -- groupthink risk. The system injects doubt signals to restore criticality.
- **Phase transitions** detect tipping points. When the swarm enters an "ordered phase" (everyone agrees too strongly), a challenge signal is injected to push back toward the critical phase where collective intelligence is maximized.
- **Chaos detection** prevents runaway oscillation. Period-3 detection (Sharkovskii's theorem) identifies when the swarm has entered chaotic dynamics and should stop.

### Emergent Devil's Advocate

A devil's advocate doesn't exist because you created a "critic agent." It emerges because:

1. Game theory makes challenging suspicious consensus **mathematically optimal** (Nash equilibrium)
2. Thompson Sampling bandits learn that `challenge` strategies get rewarded when they break false consensus
3. The personality vector (high caution, low conformity) predisposes the agent to emit `doubt` and `challenge` signals
4. The phase transition detector injects challenges when the swarm is too ordered

No one scripted "challenge proposals." The math makes it the rational strategy.

### Formal Consensus, Not "Last Agent Wins"

Five strategies with configurable thresholds:

| Strategy | How It Decides | Best For |
|----------|---------------|----------|
| **confidence-weighted** | `agreeWeight / totalWeight > threshold` | General use |
| **bayesian** | Posterior probability via Bayes' theorem | Calibrated confidence |
| **entropy** | `1 - H/H_max > threshold` | Exploratory tasks |
| **hierarchical** | Top voter overrides | Domain experts |
| **voting** | Simple majority | Democratic |

All strategies preserve dissent -- the losing side's reasoning is always in the result.

## Comparison

| | CrewAI | AutoGen | LangGraph | **cognitive-swarm** |
|---|---|---|---|---|
| **Paradigm** | Role-based crews | Chat loops | State graphs | Signal-based swarm |
| **Communication** | Sequential handoff | Direct messages | Edge transitions | Typed signals on shared bus |
| **Consensus** | Last agent wins | Discussion until timeout | Explicit routing | 5 strategies with confidence scoring |
| **Conflict resolution** | None | None | Manual branching | Structured debate + mathematical resolution |
| **Self-correction** | None | Human-in-the-loop | Conditional edges | Metacognition + emergent devil's advocate |
| **When to stop** | Fixed steps | Token limit | End node | Free energy + entropy -- math decides |
| **Learning** | None | None | None | Thompson Sampling adapts strategy per context |
| **Math verification** | None | None | None | 28 modules: Bayesian, causal, game theory, ... |
| **Self-evolution** | None | None | None | Mid-solve agent spawning + dissolution |
| **Resilience** | None | Basic retry | None | Retry + circuit breaker + token budget + checkpoints |
| **Observability** | Logs | Logs | LangSmith | OpenTelemetry (20 span types) |
| **Interoperability** | Custom | Custom | Custom | A2A + MCP protocols |

## Key Design Decisions

### Signal-based communication
All communication is explicit typed signals, not function calls between agents. The bus is the nervous system. This means:
- Adding an agent = zero code changes to existing agents
- Every interaction is logged with type, source, confidence, causal level
- Conflict detection is automatic (two proposals from different sources)
- Evolution can spawn/dissolve agents mid-solve

### Math as control plane
28 mathematical modules run after every round. They're not post-hoc analytics -- they're the control plane:
- Entropy decides "have we converged?"
- Free energy decides "are we still learning?"
- Game theory decides "should someone disagree?"
- Phase transitions decide "are we in groupthink?"
- Chaos detection decides "should we stop before things get worse?"

### Formal consensus with preserved dissent
5 strategies with configurable thresholds. The losing side is never discarded -- `ConsensusResult.dissent` contains the counter-arguments, and `votingRecord` preserves every vote.

### Provider agnostic
Any LLM via cognitive-engine's `LlmProvider` interface. Agents are full cognitive pipelines (perception, memory, reasoning, metacognition, emotions), not system prompts.

### Zero-cast codebase
Strict TypeScript, no `any`, no type assertions. The `Signal` generic `Signal<T>` locks each signal's payload to the correct shape at compile time.

## What cognitive-swarm is Built On

Each agent in the swarm has a full cognitive pipeline via [cognitive-engine](https://github.com/medonomator/cognitive-engine): perception, episodic memory, reasoning, emotions, and metacognition. Not just an LLM with a system prompt.

The swarm layer adds:
- **Signal bus** -- typed pub/sub with conflict detection and TTL
- **Consensus engine** -- 5 strategies, structured debate, dissent tracking
- **Math bridge** -- 28 modules controlling convergence and behavior
- **Swarm advisor** -- groupthink correction, Shapley pruning, topology adaptation
- **Debate runner** -- adversarial rounds with Bayesian convergence tracking
- **Evolution controller** -- gap detection, specialist spawning, dissolution
- **Reputation system** -- agent reliability scores and trust history
- **7-layer memory** -- from working memory to persistent vector memory
- **Predictive processing** -- prediction generation and error computation
- **Calibration tracking** -- predicted confidence vs actual accuracy
- **Global workspace** -- shared attention and broadcasting
