#!/usr/bin/env tsx
import { writeFileSync, mkdirSync } from 'node:fs'
import { codeReviewBenchmark } from './benchmarks/code-review.js'
import { researchBenchmark } from './benchmarks/research.js'
import { adversarialBenchmark } from './benchmarks/adversarial.js'
import { architectureBenchmark } from './benchmarks/architecture.js'
import { tradeoffBenchmark } from './benchmarks/tradeoff.js'
import { aggregateReport, formatReport, formatResult } from './harness.js'
import type { BenchmarkDef, BenchmarkResult } from './types.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} environment variable is required`)
    process.exit(1)
  }
  return value
}

const API_KEY = requireEnv('OPENAI_API_KEY')

const ALL_BENCHMARKS: Record<string, BenchmarkDef> = {
  'code-review': codeReviewBenchmark,
  research: researchBenchmark,
  adversarial: adversarialBenchmark,
  architecture: architectureBenchmark,
  tradeoff: tradeoffBenchmark,
}

async function main() {
  const args = process.argv.slice(2)
  const benchArg = args.find((a) => a.startsWith('--bench='))
  const selectedName = benchArg?.split('=')[1]

  const benchmarks: BenchmarkDef[] = selectedName
    ? ALL_BENCHMARKS[selectedName]
      ? [ALL_BENCHMARKS[selectedName]!]
      : (() => {
          console.error(`Unknown benchmark: ${selectedName}`)
          console.error(`Available: ${Object.keys(ALL_BENCHMARKS).join(', ')}`)
          process.exit(1)
        })()
    : Object.values(ALL_BENCHMARKS)

  console.log(`\n🔬 Running ${benchmarks.length} benchmark(s)...\n`)

  const results: BenchmarkResult[] = []

  for (const bench of benchmarks) {
    console.log(`> ${bench.name}...`)
    try {
      const result = await bench.run(API_KEY)
      results.push(result)
      console.log(formatResult(result))
    } catch (error) {
      console.error(`  ✘ FAILED: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }

  if (results.length > 0) {
    const report = aggregateReport(results)
    console.log(formatReport(report))

    // Save results to file
    mkdirSync('results', { recursive: true })
    const filename = `results/benchmark-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    writeFileSync(filename, JSON.stringify(report, null, 2))
    console.log(`Results saved to ${filename}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
