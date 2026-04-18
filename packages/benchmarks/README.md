# @cognitive-swarm/benchmarks

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/benchmarks)](https://www.npmjs.com/package/@cognitive-swarm/benchmarks)

Benchmark suite for comparing swarm-based problem solving against single-model baselines. Measures quality, cost, speed, and quality-per-dollar across standardized scenarios.

## Install

```bash
npm install @cognitive-swarm/benchmarks
```

## Quick Start

```typescript
import {
  codeReviewBenchmark,
  compare,
  formatResult,
  OpenAiLlmProvider,
} from '@cognitive-swarm/benchmarks'

const llm = new OpenAiLlmProvider({ model: 'gpt-4o-mini' })

// Run a benchmark
const result = await codeReviewBenchmark.run({ llm })

// Compare swarm vs baseline
const comparison = compare(result.swarm, result.baseline)
console.log(`Winner: ${comparison.winner}`)
console.log(`Score delta: ${comparison.scoreDelta.toFixed(3)}`)
console.log(`Cost ratio: ${comparison.costRatio.toFixed(2)}x`)

// Human-readable output
console.log(formatResult(result))
```

## Built-in Benchmarks

Five standardized scenarios covering different problem types:

| Benchmark | Focus | Scoring Criteria |
|-----------|-------|-------------------|
| `codeReviewBenchmark` | Bug/security/perf review | Issue coverage, suggestion quality |
| `researchBenchmark` | Multi-perspective synthesis | Breadth, depth, accuracy, source diversity |
| `adversarialBenchmark` | Misleading inputs | Correctness under pressure, manipulation resistance |
| `architectureBenchmark` | System design | Completeness, trade-off analysis, scalability |
| `tradeoffBenchmark` | Multi-objective decisions | Trade-off identification, nuance, recommendations |

All benchmarks share the same interface:

```typescript
const result = await codeReviewBenchmark.run({ llm })
```

## Providers

### OpenAiLlmProvider

```typescript
import { OpenAiLlmProvider } from '@cognitive-swarm/benchmarks'

const llm = new OpenAiLlmProvider({
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,  // defaults to env
  temperature: 0.7,
})
```

### OpenAiEmbeddingProvider

```typescript
import { OpenAiEmbeddingProvider } from '@cognitive-swarm/benchmarks'

const embeddings = new OpenAiEmbeddingProvider({ model: 'text-embedding-3-small' })
const vector = await embeddings.embed('sample text')
```

### InMemoryStore

Simple in-memory vector store for benchmark runs (no external DB needed).

```typescript
import { InMemoryStore } from '@cognitive-swarm/benchmarks'

const store = new InMemoryStore()
await store.upsert('doc-1', vector, { source: 'test' })
const results = await store.query(queryVector, 5)
```

## Key Functions

### `compare(swarm, baseline)`

Compares swarm and baseline run results:

```typescript
const comparison = compare(swarmResult, baselineResult)
comparison.scoreDelta       // positive = swarm better
comparison.costRatio        // swarm cost / baseline cost
comparison.speedRatio       // swarm time / baseline time
comparison.qualityPerDollar // { swarm, baseline }
comparison.winner           // 'swarm' | 'baseline' | 'tie'
```

**Winner logic:** `scoreDelta > 0.05` = swarm wins, `< -0.05` = baseline wins, otherwise tie.

### `estimateCost(tokens, pricing?)`

```typescript
import { estimateCost } from '@cognitive-swarm/benchmarks'

const cost = estimateCost({ inputTokens: 5000, outputTokens: 2000 })
// Default pricing: GPT-4o-mini ($0.15/$0.60 per 1M tokens)
```

### `aggregateReport(results)`

Aggregates multiple benchmark results into a summary:

```typescript
import { aggregateReport, formatReport } from '@cognitive-swarm/benchmarks'

const report = aggregateReport([codeResult, researchResult, archResult])
console.log(report.swarmWins)      // 2
console.log(report.avgScoreDelta)  // 0.12
console.log(report.overallWinner)  // 'swarm'
console.log(formatReport(report))
```

### Formatting Functions

| Function | Description |
|----------|-------------|
| `formatResult(result)` | Single benchmark with comparison and verdict |
| `formatReport(report)` | Aggregated report across all benchmarks |
| `formatMathAnalysis(analysis)` | Entropy, agreement, diversity, convergence |

## Running All Benchmarks

```typescript
import * as B from '@cognitive-swarm/benchmarks'

const llm = new B.OpenAiLlmProvider({ model: 'gpt-4o-mini' })
const all = [
  B.codeReviewBenchmark, B.researchBenchmark,
  B.adversarialBenchmark, B.architectureBenchmark, B.tradeoffBenchmark,
]

const results = []
for (const bench of all) {
  results.push(await bench.run({ llm }))
}

console.log(B.formatReport(B.aggregateReport(results)))
```

## CI/CD Integration

```typescript
for (const result of results) {
  if (result.swarm.score < 0.6) {
    console.error(`FAIL: ${result.name} score ${result.swarm.score} < 0.6`)
    process.exit(1)
  }
}
```

## Key Types

```typescript
interface BenchmarkResult {
  readonly benchmarkId: string
  readonly name: string
  readonly swarm: RunResult
  readonly baseline: RunResult
  readonly comparison: Comparison
}

interface RunResult {
  readonly score: number        // 0-1 quality score
  readonly answer: string
  readonly tokens: { input: number; output: number }
  readonly costUsd: number
  readonly durationMs: number
  readonly mathAnalysis?: MathAnalysis  // swarm only
  readonly rounds?: number             // swarm only
}
```

## License

Apache-2.0

[Full documentation](https://medonomator.github.io/cognitive-swarm/packages/benchmarks) | [GitHub](https://github.com/medonomator/cognitive-swarm)
