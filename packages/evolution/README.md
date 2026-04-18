# @cognitive-swarm/evolution

Self-evolving swarm -- agents create agents, optimize composition over time.

## Installation

```bash
npm install @cognitive-swarm/evolution
```

## Overview

Provides two complementary systems. `SwarmEvolver` detects capability gaps, proposes new agents, evaluates them, and prunes underperformers. `SwarmOptimizer` analyzes agent similarity, suggests merges, and tunes personalities. Together they enable a swarm that improves itself across runs.

## Usage

```ts
import { SwarmEvolver, SwarmOptimizer } from '@cognitive-swarm/evolution';

// --- Evolver: gap detection and agent spawning ---
const evolver = new SwarmEvolver({ /* config */ });

const gaps = evolver.detectGaps(signals);
const proposals = evolver.proposeAgents(gaps);
const evaluation = evolver.evaluate(proposal);
const pruneReport = evolver.prune(performanceData);

// --- Optimizer: deduplication and tuning ---
const optimizer = new SwarmOptimizer({ /* config */ });

const similarities = optimizer.findSimilar(agents);
const merges = optimizer.suggestMerges(similarities);
const tuning = optimizer.tunePersonality(agent, feedback);
```

## Exports

| Export                | Kind  | Description                                |
| --------------------- | ----- | ------------------------------------------ |
| `SwarmEvolver`        | Class | Gap detection, agent spawning, pruning     |
| `SwarmOptimizer`      | Class | Similarity analysis, merging, tuning       |
| `GapSignal`           | Type  | Detected capability gap                    |
| `SpawnProposal`       | Type  | Proposal to create a new agent             |
| `EvaluationResult`    | Type  | Result of evaluating a spawned agent       |
| `PruneReport`         | Type  | Report of agents recommended for removal   |
| `PruneCandidate`      | Type  | Single agent considered for pruning        |
| `MergeSuggestion`     | Type  | Suggestion to merge similar agents         |
| `PersonalityTuning`   | Type  | Recommended personality adjustments        |
| `AgentProfile`        | Type  | Profile used for similarity analysis       |
| `PairwiseSimilarity`  | Type  | Similarity score between two agents        |
| `EvolverConfig`       | Type  | Evolver configuration                      |
| `OptimizerConfig`     | Type  | Optimizer configuration                    |

## Links

- [Root repository](https://github.com/medonomator/cognitive-swarm)
