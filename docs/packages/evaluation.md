# @cognitive-swarm/evaluation

Outcome evaluation, reputation updates, and calibration tracking for swarm solves.

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/evaluation)](https://www.npmjs.com/package/@cognitive-swarm/evaluation)

## Install

```bash
npm install @cognitive-swarm/evaluation
```

## Overview

The evaluation package closes the feedback loop: after a swarm produces an answer, **how good was it?** Two complementary classes handle this:

- **`OutcomeTracker`** -- record outcomes, update agent reputation, and compute calibration metrics over time
- **`LlmOutcomeEvaluator`** -- use an LLM to automatically evaluate answer quality when ground truth is unavailable

Together they enable the swarm to learn from its own performance and improve agent selection (via `@cognitive-swarm/composer`) and reputation weights (via `@cognitive-swarm/reputation`).

## Quick Start

### Manual outcome recording

```typescript
import { OutcomeTracker } from '@cognitive-swarm/evaluation'
import type { SolveOutcomeContext } from '@cognitive-swarm/evaluation'

const tracker = new OutcomeTracker({
  calibrationBuckets: 10,
  rewardValues: {
    correct: 1.0,
    partial: 0.5,
    incorrect: -0.5,
  },
})

const context: SolveOutcomeContext = {
  solveId: 'solve-abc-123',
  result: {
    answer: 'The time complexity is O(n log n)',
    confidence: 0.85,
    agentContributions: ['analyst-1', 'coder-1'],
  },
  taskType: 'analysis',
}

tracker.record(context, 'correct', {
  details: 'Verified against known solution',
})

const report = tracker.getReport()
console.log(report.totalRecords)       // 1
console.log(report.accuracy)           // 1.0
console.log(report.calibration)        // calibration curve data
```

### Automated LLM evaluation

```typescript
import { LlmOutcomeEvaluator } from '@cognitive-swarm/evaluation'

const evaluator = new LlmOutcomeEvaluator({
  provider: myLlmProvider,
  model: 'gpt-4o-mini',
  temperature: 0.1,
})

const result = await evaluator.evaluate(
  'What is the time complexity of merge sort?',
  'The time complexity is O(n log n) in all cases.',
)

console.log(result.verdict)    // 'correct'
console.log(result.confidence) // 0.95
console.log(result.reasoning)  // 'The answer correctly identifies...'
```

## API Reference

### `OutcomeTracker`

Tracks solve outcomes, computes rewards, and maintains calibration statistics.

#### Constructor

```typescript
new OutcomeTracker(config?: Partial<OutcomeTrackerConfig>)
```

---

#### `record(context, verdict, options?)`

Record the outcome of a solve.

```typescript
record(
  context: SolveOutcomeContext,
  verdict: Verdict,
  options?: RecordOptions,
): void
```

**Parameters:**

| Parameter  | Type                  | Description                                  |
| ---------- | --------------------- | -------------------------------------------- |
| `context`  | `SolveOutcomeContext` | The solve result and metadata                |
| `verdict`  | `Verdict`             | `'correct'`, `'partial'`, or `'incorrect'`   |
| `options`  | `RecordOptions`       | Optional weight provider, memory, details    |

The method:

1. Computes the reward value based on the verdict
2. Updates the calibration bucket for the result's confidence level
3. Invokes the optional `weightProvider` to update agent reputation
4. Stores the outcome in the optional `memory` for future reference

```typescript
tracker.record(context, 'partial', {
  weightProvider: reputationTracker,
  memory: memoryPool,
  details: 'Correct approach but missing edge case for empty input',
})
```

---

#### `getReward(verdict)`

Get the numeric reward value for a verdict.

```typescript
getReward(verdict: Verdict): number
```

| Verdict       | Default Reward |
| ------------- | -------------- |
| `correct`     | `1.0`          |
| `partial`     | `0.5`          |
| `incorrect`   | `-0.5`         |

```typescript
const reward = tracker.getReward('partial') // 0.5
```

---

#### `getReport()`

Compute a summary report of all recorded outcomes.

```typescript
getReport(): OutcomeReport
```

**Returns:**

```typescript
interface OutcomeReport {
  /** Total number of recorded outcomes */
  readonly totalRecords: number

  /** Fraction of 'correct' verdicts */
  readonly accuracy: number

  /** Fraction of 'correct' + 'partial' verdicts */
  readonly softAccuracy: number

  /** Average reward across all records */
  readonly averageReward: number

  /** Calibration data: predicted confidence vs actual accuracy */
  readonly calibration: CalibrationBucket[]

  /** Per-task-type breakdown */
  readonly byTaskType: Record<string, TaskTypeStats>
}

interface CalibrationBucket {
  /** Lower bound of confidence range */
  readonly rangeStart: number

  /** Upper bound of confidence range */
  readonly rangeEnd: number

  /** Number of outcomes in this bucket */
  readonly count: number

  /** Average predicted confidence */
  readonly predictedConfidence: number

  /** Actual accuracy (fraction correct) */
  readonly actualAccuracy: number
}
```

```typescript
const report = tracker.getReport()

for (const bucket of report.calibration) {
  const gap = Math.abs(bucket.predictedConfidence - bucket.actualAccuracy)
  console.log(
    `Confidence ${bucket.rangeStart}-${bucket.rangeEnd}: ` +
    `predicted=${bucket.predictedConfidence.toFixed(2)}, ` +
    `actual=${bucket.actualAccuracy.toFixed(2)}, ` +
    `gap=${gap.toFixed(2)}`,
  )
}
```

---

#### `reset()`

Clear all recorded outcomes and calibration data.

```typescript
reset(): void
```

---

### `LlmOutcomeEvaluator`

Uses an LLM to automatically evaluate answer quality.

#### Constructor

```typescript
new LlmOutcomeEvaluator(config: LlmEvaluatorConfig)
```

```typescript
interface LlmEvaluatorConfig {
  /** LLM provider instance */
  readonly provider: EvaluatorLlmProvider

  /** Model identifier */
  readonly model?: string

  /** Temperature for evaluation (low = more deterministic) */
  readonly temperature?: number

  /** Maximum tokens for the evaluation response */
  readonly maxTokens?: number
}
```

---

#### `evaluate(task, answer, criteria?)`

Evaluate an answer against a task using LLM judgment.

```typescript
async evaluate(
  task: string,
  answer: string,
  criteria?: string[],
): Promise<EvaluationResult>
```

**Parameters:**

| Parameter  | Type       | Default                    | Description                              |
| ---------- | ---------- | -------------------------- | ---------------------------------------- |
| `task`     | `string`   | --                         | The original task/question               |
| `answer`   | `string`   | --                         | The swarm's answer to evaluate           |
| `criteria` | `string[]` | `['accuracy', 'complete']` | Custom evaluation criteria               |

**Returns:**

```typescript
interface EvaluationResult {
  /** The verdict: correct, partial, or incorrect */
  readonly verdict: Verdict

  /** Confidence in the evaluation (0-1) */
  readonly confidence: number

  /** Human-readable reasoning for the verdict */
  readonly reasoning: string

  /** Per-criterion scores if criteria were provided */
  readonly criteriaScores?: Record<string, number>
}
```

```typescript
const result = await evaluator.evaluate(
  'Explain the CAP theorem',
  swarmAnswer,
  ['accuracy', 'completeness', 'clarity'],
)

console.log(result.verdict)        // 'correct'
console.log(result.confidence)     // 0.88
console.log(result.criteriaScores) // { accuracy: 0.9, completeness: 0.85, clarity: 0.9 }
```

## Types

### `Verdict`

```typescript
type Verdict = 'correct' | 'partial' | 'incorrect'
```

### `SolveOutcomeContext`

```typescript
interface SolveOutcomeContext {
  /** Unique identifier of the solve */
  readonly solveId: string

  /** The solve result containing the answer */
  readonly result: {
    readonly answer: string
    readonly confidence: number
    readonly agentContributions: readonly string[]
  }

  /** Category of the task (used for per-type reporting) */
  readonly taskType?: string
}
```

### `RecordOptions`

```typescript
interface RecordOptions {
  /**
   * Provider to update agent reputation based on outcome.
   * Called with each contributing agent ID and the reward value.
   */
  readonly weightProvider?: {
    update(agentId: string, reward: number): void
  }

  /**
   * Memory pool to store the outcome for future reference.
   */
  readonly memory?: {
    share(agentId: string, input: ShareMemoryInput): void
  }

  /** Free-form details about the evaluation */
  readonly details?: string
}
```

### `OutcomeTrackerConfig`

```typescript
interface OutcomeTrackerConfig {
  /**
   * Number of calibration buckets to divide the [0, 1]
   * confidence range into.
   */
  readonly calibrationBuckets: number

  /** Reward values for each verdict type */
  readonly rewardValues: {
    readonly correct: number
    readonly partial: number
    readonly incorrect: number
  }
}
```

### `EvaluatorLlmProvider`

```typescript
interface EvaluatorLlmProvider {
  /**
   * Send a prompt to the LLM and return the response text.
   */
  complete(prompt: string, options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }): Promise<string>
}
```

## Configuration Reference

### OutcomeTracker

| Option               | Type     | Default | Description                               |
| -------------------- | -------- | ------- | ----------------------------------------- |
| `calibrationBuckets` | `number` | `10`    | Number of confidence buckets (0-1 range)  |
| `rewardValues.correct`   | `number` | `1.0`  | Reward for correct verdict           |
| `rewardValues.partial`   | `number` | `0.5`  | Reward for partial verdict           |
| `rewardValues.incorrect` | `number` | `-0.5` | Reward (penalty) for incorrect verdict |

### LlmOutcomeEvaluator

| Option        | Type                  | Default | Description                        |
| ------------- | --------------------- | ------- | ---------------------------------- |
| `provider`    | `EvaluatorLlmProvider`| --      | Required. LLM provider instance    |
| `model`       | `string`              | --      | Model identifier for the provider  |
| `temperature` | `number`              | `0.1`   | Low temperature for consistency    |
| `maxTokens`   | `number`              | `1024`  | Max tokens in evaluation response  |

## Calibration

Calibration measures how well the swarm's confidence predictions match actual accuracy. A well-calibrated swarm that reports 80% confidence should be correct ~80% of the time.

The tracker divides the confidence range [0, 1] into `calibrationBuckets` equal-width buckets. For each bucket it tracks:

- **Predicted confidence**: average confidence of outcomes in that bucket
- **Actual accuracy**: fraction of outcomes in that bucket that were `correct`

A perfectly calibrated system has `predictedConfidence === actualAccuracy` for every bucket.

```typescript
// Check if the swarm is overconfident
const report = tracker.getReport()

for (const bucket of report.calibration) {
  if (bucket.count < 5) continue // not enough data
  const overconfidence = bucket.predictedConfidence - bucket.actualAccuracy
  if (overconfidence > 0.15) {
    console.warn(
      `Overconfident in range ${bucket.rangeStart}-${bucket.rangeEnd}: ` +
      `claims ${(bucket.predictedConfidence * 100).toFixed(0)}% but ` +
      `actually ${(bucket.actualAccuracy * 100).toFixed(0)}%`,
    )
  }
}
```

## Usage Patterns

### End-to-end evaluation pipeline

```typescript
import { OutcomeTracker, LlmOutcomeEvaluator } from '@cognitive-swarm/evaluation'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const tracker = new OutcomeTracker()
const evaluator = new LlmOutcomeEvaluator({ provider: llm })
const orchestrator = new SwarmOrchestrator(config)

// Solve
const result = await orchestrator.solve(task)

// Auto-evaluate
const evaluation = await evaluator.evaluate(task, result.answer)

// Record
tracker.record(
  {
    solveId: result.id,
    result: {
      answer: result.answer,
      confidence: result.confidence,
      agentContributions: result.contributions.map((c) => c.agentId),
    },
    taskType: 'reasoning',
  },
  evaluation.verdict,
  {
    weightProvider: reputationTracker,
    details: evaluation.reasoning,
  },
)
```

### Batch evaluation with reporting

```typescript
const tracker = new OutcomeTracker()
const evaluator = new LlmOutcomeEvaluator({ provider: llm })

for (const testCase of testSuite) {
  const result = await orchestrator.solve(testCase.question)
  const evaluation = await evaluator.evaluate(
    testCase.question,
    result.answer,
    ['accuracy', 'completeness'],
  )

  tracker.record(
    {
      solveId: result.id,
      result: {
        answer: result.answer,
        confidence: result.confidence,
        agentContributions: result.contributions.map((c) => c.agentId),
      },
      taskType: testCase.category,
    },
    evaluation.verdict,
  )
}

const report = tracker.getReport()
console.log(`Accuracy: ${(report.accuracy * 100).toFixed(1)}%`)
console.log(`Soft accuracy: ${(report.softAccuracy * 100).toFixed(1)}%`)
console.log(`Average reward: ${report.averageReward.toFixed(2)}`)

// Per-category breakdown
for (const [type, stats] of Object.entries(report.byTaskType)) {
  console.log(`  ${type}: ${(stats.accuracy * 100).toFixed(1)}% (n=${stats.count})`)
}
```

## Dependencies

- `@cognitive-swarm/core` -- signal types, swarm result interfaces
- `@cognitive-engine/core` -- engine abstraction (used by `LlmOutcomeEvaluator`)
