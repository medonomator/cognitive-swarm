# What is cognitive-swarm?

cognitive-swarm is a TypeScript library for building multi-agent systems where agents communicate through typed signals, form consensus using formal mathematical strategies, and exhibit emergent behavior - not scripted pipelines.

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

These approaches share the same problems: no formal convergence criterion, no conflict resolution, no learning. The last agent wins, or you hit the token limit.

## The cognitive-swarm Approach

Agents don't follow a script. They **react to signals** on a shared bus:

```
Signal Bus
   ↕  ↕  ↕  ↕  ↕
[A1][A2][A3][A4][A5]   <- each agent listens to signals it cares about
         ↓
   Math Bridge          <- measures entropy, surprise, free energy after each round
         ↓
  Consensus Engine      <- 5 strategies, formal threshold, dissent tracking
         ↓
    SwarmResult         <- answer + confidence + full reasoning record
```

A devil's advocate doesn't exist because you created a "critic agent." It emerges because game theory makes challenging suspicious consensus **mathematically optimal**.

## Comparison

| | CrewAI | AutoGen | LangGraph | **cognitive-swarm** |
|---|---|---|---|---|
| **Paradigm** | Role-based crews | Chat loops | State graphs | Signal-based swarm |
| **Communication** | Sequential handoff | Direct messages | Edge transitions | Typed signals on shared bus |
| **Consensus** | Last agent wins | Discussion until timeout | Explicit routing | 5 strategies with confidence scoring |
| **Conflict resolution** | None | None | Manual branching | Structured debate + mathematical resolution |
| **Self-correction** | None | Human-in-the-loop | Conditional edges | Metacognition + devil's advocate (emergent) |
| **When to stop** | Fixed steps | Token limit | End node | Free energy + entropy - math decides |
| **Learning** | None | None | None | Thompson Sampling adapts strategy per context |
| **Math verification** | None | None | None | 19 modules: Bayesian, causal, game theory, ... |
| **Resilience** | None | Basic retry | None | Retry + circuit breaker + token budget + checkpoints |
| **Observability** | Logs | Logs | LangSmith | OpenTelemetry (20 span types) |
| **Interoperability** | Custom | Custom | Custom | A2A + MCP protocols |

## Key Design Decisions

- **Signal-based** - all communication is explicit typed signals, not function calls between agents. The bus is the nervous system.
- **Math as control** - 19 mathematical modules run after every round. Entropy decides convergence. Free energy decides direction. Game theory decides when to challenge.
- **Formal consensus** - 5 strategies with configurable thresholds, dissent preserved in the result. Not "last agent wins."
- **Provider agnostic** - any LLM via cognitive-engine's `LlmProvider` interface. Agents are full cognitive pipelines, not system prompts.
- **Tested** - strict TypeScript, no `any`, no type assertions. Zero-cast codebase.

## What cognitive-swarm is Built On

Each agent in the swarm has a full cognitive pipeline via [cognitive-engine](https://github.com/medonomator/cognitive-engine): perception, episodic memory, reasoning, emotions, and metacognition. Not just an LLM with a system prompt.

The swarm layer adds: signal bus, consensus engine, math bridge, advisor, debate runner, evolution controller, reputation tracking, and 7-layer memory architecture.
