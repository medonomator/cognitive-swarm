# Meta-Cognitive Mechanisms for Exocortex

> Date: 2026-04-16
> Status: Proposal
> Context: Extending exocortex from observer/memory system to autonomous self-improving cognitive architecture

---

## Current State

- Cognitive swarm (6 agents) analyzes Claude Code conversations daily/weekly
- Knowledge graph (PostgreSQL) stores entities + relations with confidence decay
- Vector memory (Qdrant) stores insights + error fixes
- Hooks inject context in real-time (qdrant-recall, bash-error-learner)
- Swarm telemetry now saved: agentContributions, mathAnalysis, consensus, signalLog
- Claude CLI meta-analyzer runs weekly, sends swarm performance report to Telegram

---

## 1. Memory Consolidation

**Concept**: Brain reorganizes memories during sleep. Current system only decays + prunes, but doesn't consolidate.

**Mechanism**:
- Merge similar entities in graph ("NestJS ConfigService port bug" + "port as string" -> one entity)
- Extract meta-patterns from concrete instances (5 type bugs -> "type coercion errors at system boundaries")
- Build shortcut connections: if A->B->C->D is frequently traversed, create direct A->D link
- Periodic (weekly) consolidation pass

**Why it matters**: Without consolidation, the graph grows into noise. With it, experience becomes wisdom.

**Implementation**: Claude CLI reads graph, proposes merges/abstractions, applies them. Report to Telegram.

---

## 2. Confidence Calibration Loop

**Concept**: Swarm outputs confidence scores, but are they calibrated?

**Mechanism**:
- Save predictions/recommendations with confidence scores
- After N days, verify outcomes (grep logs, git history)
- Build calibration curve: "when swarm says 0.8, actually correct 60% of the time"
- Adjust consensus thresholds based on real accuracy

**Why it matters**: Without calibration, confidence is just a number. With it — reliable decision signal.

**Implementation**: Track predictions in graph with `prediction` entity type, periodic verification pass.

---

## 3. Drift Detector

**Concept**: User's work patterns change over time. System should adapt.

**Mechanism**:
- Track topic distribution over time (backend vs iOS vs infra)
- Detect shifts in error patterns (type errors -> async bugs)
- Detect new technologies entering the stack
- Auto-rebalance agent focus areas based on current work profile

**Why it matters**: Static agents analyzing shifting work = wasted computation + missed insights.

**Implementation**: Monthly analysis of topic distribution, dynamic agent persona adjustment.

---

## 4. Adversarial Self-Testing

**Concept**: Test the system's own blind spots.

**Mechanism**:
- Take past conversations where swarm gave recommendations
- Verify: were recommendations applied? Did they help?
- Generate synthetic edge cases: "what if user did X?"
- Find systematic blind spots

**Why it matters**: System that doesn't test itself degrades silently.

**Implementation**: Monthly audit pass, results feed into agent prompt evolution.

---

## 5. Predictive Pre-warming

**Concept**: Anticipate what user will work on next.

**Mechanism**:
- Detect patterns: "Monday = backend, Wednesday = iOS, Friday = devops"
- Detect sequences: "after auth bug always comes middleware refactor"
- Pre-load relevant context into hooks before user starts
- Morning briefing to Telegram: "Yesterday's unfinished TODOs, relevant graph context"

**Why it matters**: Real daily value. Proactive rather than reactive.

**Implementation**: Pattern extraction from daily logs, morning cron job with briefing.

---

## 6. Multi-Scale Temporal Analysis

**Concept**: Patterns live at different timescales.

**Scales**:
- Hourly: focus/distraction cycles, context switching
- Weekly: project rhythm, recurring meetings -> coding blocks
- Monthly: milestone pressure, architecture evolution
- Quarterly: skill growth, technology adoption curves

**Mechanism**: Different agents (or agent modes) for different timescales. Monthly agent sees 3-month procrastinated refactor and rising cost of delay.

**Implementation**: Separate monthly/quarterly observer runs with longer context windows and different agent personas.

---

## 7. Knowledge Graph Reasoning

**Concept**: Graph is currently a store. Add inference.

**Mechanism**:
- Transitive relations: A `depends_on` B, B `depends_on` C -> A transitively depends on C
- Impact prediction: "changing service X affects these components" (traversal)
- Gap detection: entities without relations = unexplored areas
- Inject into hooks: "you're touching file X, here's what depends on it in the graph"

**Implementation**: Recursive CTE queries, integration into qdrant-recall hook.

---

## Priority Order

1. **Memory Consolidation** — highest impact, graph will degrade without it
2. **Predictive Pre-warming** — highest daily value (morning briefing)
3. **Confidence Calibration** — makes all other mechanisms more reliable
4. **Knowledge Graph Reasoning** — leverages existing infrastructure
5. **Drift Detector** — improves efficiency over time
6. **Multi-Scale Temporal** — adds depth to analysis
7. **Adversarial Self-Testing** — quality assurance layer
