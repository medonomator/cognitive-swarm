# @cognitive-swarm/evaluation

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/evaluation)](https://www.npmjs.com/package/@cognitive-swarm/evaluation)

Outcome evaluation, reputation updates, and calibration tracking for swarm solves. Closes the feedback loop: after a swarm produces an answer, how good was it?

## Install

```bash
npm install @cognitive-swarm/evaluation
```

## Quick Start

### Manual outcome recording

```typescript
import { OutcomeTracker } from '@cognitive-swarm/evaluation'

const tracker = new OutcomeTracker({
  calibrationBuckets: 10,
  rewardValues: { correct: 1.0, partial: 0.5, incorrect: -0.5 },
})

tracker.record(
  {
    solveId: 'solve-abc-123',
    result: {
      answer: 'The time complexity is O(n log n)',
      confidence: 0.85,
      agentContributions: ['analyst-1', 'coder-1'],
    },
    taskType: 'analysis',
  },
  'correct',
  { details: 'Verified against known solution' },
)

const report = tracker.getReport()
console.log(report.accuracy)       // 1.0
console.log(report.calibration)    // calibration curve data
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

## OutcomeTracker API

### `record(context, verdict, options?)`

Record the outcome of a solve. Computes reward, updates calibration buckets, and optionally updates agent reputation via `weightProvider`.

```typescript
tracker.record(context, 'partial', {
  weightProvider: reputationTracker,
  memory: memoryPool,
  details: 'Correct approach but missing edge case',
})
```

### `getReward(verdict)`

Get the numeric reward value for a verdict.

| Verdict | Default Reward |
|---------|----------------|
| `correct` | `1.0` |
| `partial` | `0.5` |
| `incorrect` | `-0.5` |

### `getReport()`

Returns `OutcomeReport` with accuracy, soft accuracy, average reward, calibration buckets, and per-task-type breakdown.

```typescript
const report = tracker.getReport()

for (const bucket of report.calibration) {
  const gap = Math.abs(bucket.predictedConfidence - bucket.actualAccuracy)
  console.log(`Confidence ${bucket.rangeStart}-${bucket.rangeEnd}: gap=${gap.toFixed(2)}`)
}
```

### `reset()`

Clear all recorded outcomes and calibration data.

## LlmOutcomeEvaluator API

### `evaluate(task, answer, criteria?)`

Evaluate an answer using LLM judgment. Returns verdict, confidence, reasoning, and optional per-criterion scores.

```typescript
const result = await evaluator.evaluate(
  'Explain the CAP theorem',
  swarmAnswer,
  ['accuracy', 'completeness', 'clarity'],
)

console.log(result.criteriaScores) // { accuracy: 0.9, completeness: 0.85, clarity: 0.9 }
```

## End-to-End Pipeline

```typescript
import { OutcomeTracker, LlmOutcomeEvaluator } from '@cognitive-swarm/evaluation'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'

const tracker = new OutcomeTracker()
const evaluator = new LlmOutcomeEvaluator({ provider: llm })

// Solve
const result = await orchestrator.solve(task)

// Auto-evaluate
const evaluation = await evaluator.evaluate(task, result.answer)

// Record with reputation updates
tracker.record(
  {
    solveId: result.id,
    result: {
      answer: result.answer,
      confidence: result.confidence,
      agentContributions: result.contributions.map(c => c.agentId),
    },
    taskType: 'reasoning',
  },
  evaluation.verdict,
  { weightProvider: reputationTracker, details: evaluation.reasoning },
)
```

## Calibration

Calibration measures how well the swarm's confidence predictions match actual accuracy. The tracker divides [0, 1] into `calibrationBuckets` equal-width buckets, tracking predicted vs actual accuracy per bucket.

```typescript
// Detect overconfidence
for (const bucket of report.calibration) {
  if (bucket.count < 5) continue
  const overconfidence = bucket.predictedConfidence - bucket.actualAccuracy
  if (overconfidence > 0.15) {
    console.warn(`Overconfident in range ${bucket.rangeStart}-${bucket.rangeEnd}`)
  }
}
```

## Configuration

### OutcomeTracker

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `calibrationBuckets` | `number` | `10` | Number of confidence buckets |
| `rewardValues.correct` | `number` | `1.0` | Reward for correct verdict |
| `rewardValues.partial` | `number` | `0.5` | Reward for partial verdict |
| `rewardValues.incorrect` | `number` | `-0.5` | Penalty for incorrect verdict |

### LlmOutcomeEvaluator

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | `EvaluatorLlmProvider` | required | LLM provider instance |
| `model` | `string` | -- | Model identifier |
| `temperature` | `number` | `0.1` | Low temperature for consistency |
| `maxTokens` | `number` | `1024` | Max tokens in evaluation response |

## Key Types

```typescript
type Verdict = 'correct' | 'partial' | 'incorrect'

interface SolveOutcomeContext {
  readonly solveId: string
  readonly result: { answer: string; confidence: number; agentContributions: readonly string[] }
  readonly taskType?: string
}

interface EvaluationResult {
  readonly verdict: Verdict
  readonly confidence: number
  readonly reasoning: string
  readonly criteriaScores?: Record<string, number>
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/evaluation) | [GitHub](https://github.com/medonomator/cognitive-swarm)
