# @cognitive-swarm/benchmarks

[![npm](https://img.shields.io/npm/v/@cognitive-swarm/benchmarks)](https://www.npmjs.com/package/@cognitive-swarm/benchmarks)

Benchmark suite for comparing swarm-based problem solving against single-model baselines. Measures quality, cost, speed, and quality-per-dollar across standardized scenarios. Includes built-in benchmark definitions, comparison utilities, and human-readable report formatting.

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

// Run the benchmark
const result = await codeReviewBenchmark.run({
  llm: new OpenAiLlmProvider({ model: 'gpt-4o-mini' }),
})

// Compare swarm vs baseline
const comparison = compare(result.swarm, result.baseline)
console.log(`Winner: ${comparison.winner}`)
console.log(`Score delta: ${comparison.scoreDelta.toFixed(3)}`)
console.log(`Cost ratio: ${comparison.costRatio.toFixed(2)}x`)

// Human-readable output
console.log(formatResult(result))
```

## Providers

### OpenAiLlmProvider

LLM provider backed by OpenAI-compatible APIs. Used by benchmark scenarios to run both swarm and baseline solves.

```typescript
import { OpenAiLlmProvider } from '@cognitive-swarm/benchmarks'

const llm = new OpenAiLlmProvider({
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,   // optional, defaults to env
  baseUrl: 'https://api.openai.com/v1', // optional
  temperature: 0.7,                      // optional
})
```

### OpenAiEmbeddingProvider

Embedding provider using `text-embedding-3-small`. Used internally by benchmarks requiring vector similarity scoring.

```typescript
const embeddings = new OpenAiEmbeddingProvider({ model: 'text-embedding-3-small' })
const vector = await embeddings.embed('sample text') // number[] (1536 dims)
```

### InMemoryStore

Simple in-memory vector store -- avoids external DB dependencies during benchmark runs.

```typescript
const store = new InMemoryStore()
await store.upsert('doc-1', vector, { source: 'test' })
const results = await store.query(queryVector, 5)
```

## Functions

### estimateCost(tokens, pricing?)

Estimates the USD cost of a given token count based on model pricing.

```typescript
import { estimateCost } from '@cognitive-swarm/benchmarks'

// Default pricing: GPT-4o-mini ($0.15/1M input, $0.60/1M output)
const cost = estimateCost({ inputTokens: 5000, outputTokens: 2000 })
console.log(cost) // 0.00195

// Custom pricing
const cost2 = estimateCost(
  { inputTokens: 5000, outputTokens: 2000 },
  { inputPer1M: 5.00, outputPer1M: 15.00 }
)
console.log(cost2) // 0.055
```

### compare(swarm, baseline)

Compares a swarm run result against a baseline single-model run. Returns score delta, cost ratio, speed ratio, quality-per-dollar, and a winner determination.

```typescript
import { compare } from '@cognitive-swarm/benchmarks'

const comparison = compare(swarmResult, baselineResult)

console.log(comparison.scoreDelta)       // positive = swarm better
console.log(comparison.costRatio)        // swarm cost / baseline cost
console.log(comparison.speedRatio)       // swarm time / baseline time
console.log(comparison.qualityPerDollar) // score / cost for each
console.log(comparison.winner)           // 'swarm' | 'baseline' | 'tie'
```

**Winner logic:**
- `scoreDelta > 0.05` -- swarm wins (meaningfully better quality)
- `scoreDelta < -0.05` -- baseline wins (swarm not worth the overhead)
- `|scoreDelta| <= 0.05` -- tie (no meaningful quality difference)

### aggregateReport(results)

Aggregates multiple benchmark results into a summary report with averages, win counts, and overall assessment.

```typescript
import { aggregateReport } from '@cognitive-swarm/benchmarks'

const report = aggregateReport([
  codeReviewResult,
  researchResult,
  architectureResult,
])

console.log(report.totalBenchmarks)    // 3
console.log(report.swarmWins)          // 2
console.log(report.baselineWins)       // 0
console.log(report.ties)              // 1
console.log(report.avgScoreDelta)     // 0.12
console.log(report.avgCostRatio)      // 2.3
console.log(report.overallWinner)     // 'swarm'
```

### Formatting Functions

Human-readable output formatters for terminal or report generation.

| Function | Input | Description |
|----------|-------|-------------|
| `formatMathAnalysis(analysis)` | `MathAnalysis` | Entropy, agreement, diversity, convergence |
| `formatResult(result)` | `BenchmarkResult` | Single benchmark with comparison and verdict |
| `formatReport(report)` | `BenchmarkReport` | Aggregated report across all benchmarks |

```typescript
import { formatResult, formatReport, aggregateReport } from '@cognitive-swarm/benchmarks'

console.log(formatResult(result))
// ╔══════════════════════════════════════╗
// ║  Code Review Benchmark              ║
// ║  Swarm: 0.85 ($0.012) │ Base: 0.72  ║
// ║  Delta: +0.13  │  Winner: swarm     ║
// ╚══════════════════════════════════════╝

const report = aggregateReport(allResults)
console.log(formatReport(report))
```

## Built-in Benchmark Scenarios

Five standardized benchmarks cover different problem types. Each benchmark defines a task prompt, evaluation criteria, and scoring rubric.

| Benchmark | Focus | Scoring Criteria |
|-----------|-------|-------------------|
| `codeReviewBenchmark` | Bug/security/perf review | Issue coverage, suggestion quality |
| `researchBenchmark` | Multi-perspective synthesis | Breadth, depth, accuracy, source diversity |
| `adversarialBenchmark` | Misleading inputs | Correctness under pressure, manipulation resistance |
| `architectureBenchmark` | System design | Completeness, trade-off analysis, scalability |
| `tradeoffBenchmark` | Multi-objective decisions | Trade-off identification, nuance, recommendations |

All benchmarks share the same interface:

```typescript
import { codeReviewBenchmark, OpenAiLlmProvider } from '@cognitive-swarm/benchmarks'

const result = await codeReviewBenchmark.run({
  llm: new OpenAiLlmProvider({ model: 'gpt-4o-mini' }),
})
```

## Types

### BenchmarkDef

Defines a benchmark scenario.

```typescript
interface BenchmarkDef {
  /** Unique benchmark identifier. */
  readonly id: string

  /** Human-readable benchmark name. */
  readonly name: string

  /** Task prompt given to both swarm and baseline. */
  readonly prompt: string

  /** Evaluation criteria and rubric for scoring. */
  readonly rubric: readonly string[]

  /** Swarm configuration for this benchmark. */
  readonly swarmConfig: SwarmConfig

  /** Run the benchmark and return results. */
  run(opts: { llm: LlmProvider }): Promise<BenchmarkResult>
}
```

### BenchmarkResult

Result of running a single benchmark.

```typescript
interface BenchmarkResult {
  /** Benchmark definition ID. */
  readonly benchmarkId: string

  /** Benchmark display name. */
  readonly name: string

  /** Swarm run result. */
  readonly swarm: RunResult

  /** Single-model baseline run result. */
  readonly baseline: RunResult

  /** Comparison between swarm and baseline. */
  readonly comparison: Comparison
}
```

### RunResult

Result of a single run (either swarm or baseline).

```typescript
interface RunResult {
  readonly score: number          // 0.0 to 1.0 quality score
  readonly answer: string         // generated answer text
  readonly tokens: { readonly input: number; readonly output: number }
  readonly costUsd: number        // estimated USD cost
  readonly durationMs: number     // wall-clock time
  readonly mathAnalysis?: MathAnalysis  // swarm only
  readonly rounds?: number              // swarm only
}
```

### Comparison

```typescript
interface Comparison {
  readonly scoreDelta: number     // swarm.score - baseline.score (positive = swarm better)
  readonly costRatio: number      // swarm cost / baseline cost (>1 = swarm more expensive)
  readonly speedRatio: number     // swarm time / baseline time (>1 = swarm slower)
  readonly qualityPerDollar: { readonly swarm: number; readonly baseline: number }
  readonly winner: 'swarm' | 'baseline' | 'tie'
}
```

### ModelPricing

```typescript
interface ModelPricing {
  readonly inputPer1M: number   // USD per 1M input tokens (default: 0.15)
  readonly outputPer1M: number  // USD per 1M output tokens (default: 0.60)
}
```

### BenchmarkReport

```typescript
interface BenchmarkReport {
  readonly totalBenchmarks: number
  readonly swarmWins: number
  readonly baselineWins: number
  readonly ties: number
  readonly avgScoreDelta: number
  readonly avgCostRatio: number
  readonly avgSpeedRatio: number
  readonly overallWinner: 'swarm' | 'baseline' | 'tie'
  readonly results: readonly BenchmarkResult[]
}
```

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | **required** (LLM) / `'text-embedding-3-small'` (embed) | Model ID |
| `apiKey` | `string` | `process.env.OPENAI_API_KEY` | API key |
| `baseUrl` | `string` | `'https://api.openai.com/v1'` | API base URL |
| `temperature` | `number` | `0.7` | Sampling temperature (LLM only) |

**Default pricing:** GPT-4o-mini ($0.15/$0.60 per 1M tokens in/out)

## Usage Patterns

### Running All Benchmarks

```typescript
import * as B from '@cognitive-swarm/benchmarks'

const llm = new B.OpenAiLlmProvider({ model: 'gpt-4o-mini' })
const all = [B.codeReviewBenchmark, B.researchBenchmark,
  B.adversarialBenchmark, B.architectureBenchmark, B.tradeoffBenchmark]

const results = []
for (const bench of all) {
  const result = await bench.run({ llm })
  results.push(result)
}

console.log(B.formatReport(B.aggregateReport(results)))
```

### Custom Benchmark Definition

```typescript
import { type BenchmarkDef } from '@cognitive-swarm/benchmarks'

const myBenchmark: BenchmarkDef = {
  id: 'custom-security-audit',
  name: 'Security Audit Benchmark',
  prompt: 'Analyze this code for security vulnerabilities...',
  rubric: ['Identifies SQL injection', 'Identifies XSS', 'Suggests fixes'],
  swarmConfig: { agents: [/* ... */], maxRounds: 5, timeout: 60_000 },
  async run({ llm }) { /* return BenchmarkResult */ },
}
```

### CI/CD Integration

```typescript
const results = await Promise.all([
  codeReviewBenchmark.run({ llm }),
  researchBenchmark.run({ llm }),
])

// Fail CI if swarm quality regresses below threshold
for (const result of results) {
  if (result.swarm.score < 0.6) {
    console.error(`FAIL: ${result.name} score ${result.swarm.score} < 0.6`)
    process.exit(1)
  }
}
```

## Winner Determination

The `compare` function uses a threshold-based winner logic:

| Condition | Winner | Interpretation |
|-----------|--------|----------------|
| `scoreDelta > 0.05` | `swarm` | Swarm meaningfully outperforms baseline |
| `scoreDelta < -0.05` | `baseline` | Baseline outperforms swarm |
| `abs(scoreDelta) <= 0.05` | `tie` | No meaningful quality difference |

The 0.05 threshold prevents noise from flipping winner status. When results are a tie, consider cost ratio and speed ratio to determine which approach is more practical.
