# Benchmark Analysis — 2026-04-14

## Summary

5 benchmarks run against real OpenAI API (gpt-4o-mini) + Qdrant memory.
14 packages, 520 unit tests, 10 math modules, all integrated.

## Results

| Benchmark | Swarm Score | Baseline Score | Winner | Cost Ratio |
|-----------|------------|----------------|--------|------------|
| Code Review (5 bugs) | 1.00 | 1.00 | TIE | 131x |
| Research (insights) | 0.50 | 1.00 | BASELINE | 44x |
| Adversarial (falsehood) | 1.00 | 1.00 | TIE | 31x |
| Architecture (12 domains) | 0.42 | 1.00 | BASELINE | 355x |
| Trade-off (10 dimensions) | 0.77 | 1.00 | BASELINE | 137x |

## Memory Persistence Works

- Run 1: 7 discoveries stored in Qdrant (4 code-review + 1 research + 2 adversarial)
- Run 2: agents recalled prior knowledge, adversarial cost dropped 4x ($0.0179 → $0.0047)
- Architecture: 8 discoveries persisted for future runs

## Math Module Insights (what the 10 modules revealed)

### Bayesian Inference
- Evidence updates went from 0 → 4 after vote payload fix
- MAP estimate correctly identifies leading proposal
- Still limited: many votes target discovery signals, not proposals

### Shapley Values (most actionable)
- Architecture: `security-arch=0.195` top contributor, `compliance=0.098` least useful
- Trade-off: `advocate-serverless=0.308` dominated, `compliance-risk=0.077` redundant
- Actionable: can auto-remove redundant agents, reweight useful ones

### Game Theory
- `groupthink=low` in complex tasks (6/7 agents challenged in architecture)
- `groupthink=high` in simple tasks — correct detection
- Adversarial: 0 challengers despite expecting 4 → correctly flags consensus without debate

### Replicator Dynamics
- Trade-off: suggests more discoveries, fewer challenges — agents over-challenged
- Architecture: `challenge:increase(0.81)` — system correctly identified need for more challenges
- Self-correcting dynamic confirmed working

### Markov Chains
- Normal `proposal↔vote↔discovery` cycles correctly not treated as pathological
- `information-gain-exhausted` stopping works (triggers after 3 rounds of stagnation)

### Optimal Stopping
- Secretary Problem correctly identifies exploration phase completion
- CUSUM stable (no false change detection)
- Secretary too aggressive with maxRounds=3 (exploration=1 round) — needs tuning

### Influence Graph
- Architecture: Fiedler=0.235, not fragile — healthy influence distribution
- Only activates when enough vote→proposal edges exist

### Opinion Dynamics
- All benchmarks show 1 cluster, polarization=0 — agents converge quickly
- No fragmentation detected (good for consensus, bad for diversity)

## Root Cause: Why Baseline Wins

### 1. Synthesizer Bottleneck (PRIMARY)
Single gpt-4o-mini with maxTokens=4000 outputs comprehensive answer in one call.
Swarm agents each produce maxTokens=500 fragments. Synthesizer must compile 42 signals
into one coherent answer but is also limited to 4000 tokens. Information loss is massive.

### 2. Agent Output Too Fragmented
Each agent emits 1 signal per reaction. Complex analysis gets split across
discovery, proposal, and challenge signals. The synthesizer sees signal payloads
but loses the reasoning chain.

### 3. Cost Structure
gpt-4o-mini is so cheap that 5-7 agents × 3 rounds × embeddings = 100-350x cost.
The swarm overhead only pays off if quality exceeds what a single call achieves.

### 4. Tasks Still Solvable by Single Model
Even the "complex" tasks (12-domain architecture) are within gpt-4o-mini's training distribution.
True swarm advantage requires tasks where:
- Context exceeds single model's window
- Domain expertise genuinely conflicts (not just different angles)
- Iterative refinement matters (the task changes based on discoveries)

## What Works Well

1. **Math analysis is informative** — Shapley, game theory, replicator all give actionable insights
2. **Memory persistence works** — Qdrant recall reduces cost on repeat tasks
3. **Groupthink detection works** — correctly identifies when agents agree too easily
4. **Stopping criteria work** — entropy convergence and info gain exhaustion trigger appropriately
5. **Challenge/debate dynamic works** — agents genuinely challenge each other (6/7 in architecture)

## Next Steps to Improve Swarm vs Baseline

### Short-term (agent behavior)
- [ ] Multi-signal output: agents emit discovery + vote + challenge per reaction, not just 1
- [ ] Chain synthesizer: multiple synthesis calls to handle large signal sets
- [ ] Increase agent maxTokens to 1500+ for complex tasks
- [ ] Feed ALL discoveries to synthesizer, not just consensus winners

### Medium-term (architecture)
- [ ] Use Shapley values to dynamically prune redundant agents mid-solve
- [ ] Use replicator dynamics to rebalance strategy frequencies between rounds
- [ ] Agent-to-agent direct communication (not just broadcast)
- [ ] Hierarchical synthesis: sub-group synthesis → final synthesis

### Long-term (task selection)
- [ ] Multi-document code review (context exceeds single model)
- [ ] Adversarial red-team scenarios (genuine deception)
- [ ] Live system debugging with real logs (iterative refinement)
- [ ] Cross-language translation quality (genuine domain conflict)

## Architecture Stats

- 14 packages, 520 tests
- 10 math modules (entropy, Bayesian, Markov, game theory, opinion dynamics, replicator, influence graph, optimal stopping, Shapley, mutual information)
- Qdrant persistent memory with decay/reinforcement
- Full benchmark harness with math analysis reporting
