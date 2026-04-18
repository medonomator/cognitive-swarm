#!/usr/bin/env tsx
/**
 * Streaming + Observability Example
 *
 * Demonstrates:
 * - Real-time SSE-style streaming of swarm events
 * - OpenTelemetry instrumentation (prints spans to console)
 * - Token budget enforcement
 * - Retry configuration
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/streaming/index.ts
 */
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { researchTemplate } from '@cognitive-swarm/templates'
import { instrumentSwarm } from '@cognitive-swarm/otel'
import { createEngine, OpenAiLlm } from '../shared/openai-provider.js'

async function main() {
  if (!process.env['OPENAI_API_KEY']) {
    console.error('Set OPENAI_API_KEY environment variable')
    process.exit(1)
  }

  const engine = createEngine()
  const config = researchTemplate({ engine })

  // Create orchestrator with resilience features
  const swarm = new SwarmOrchestrator({
    ...config,
    timeout: 60_000,
    maxSignals: 40,
    // Token budget: stop if we exceed 10K tokens
    tokenBudget: 10_000,
    // Retry: 2 retries with 500ms base delay
    retry: {
      maxRetries: 2,
      baseDelayMs: 500,
      circuitBreakerThreshold: 3,
    },
    synthesizer: {
      llm: new OpenAiLlm('gpt-4o-mini'),
    },
  })

  // Wrap with OpenTelemetry instrumentation
  const instrumented = instrumentSwarm(swarm)

  console.log('Streaming + Observability Example')
  console.log('=================================')
  console.log('Features: streaming, OTel traces, token budget (10K), retry (2 attempts)\n')

  const start = Date.now()
  let signalCount = 0

  const QUESTION = 'What are the key differences between transformer and state-space model architectures for sequence modeling?'

  for await (const event of instrumented.solveWithStream(QUESTION)) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)

    switch (event.type) {
      case 'solve:start':
        console.log(`[${elapsed}s] Solve started: "${event.task.slice(0, 60)}..."`)
        break
      case 'round:start':
        console.log(`[${elapsed}s] Round ${event.round}`)
        break
      case 'signal:emitted':
        signalCount++
        console.log(`[${elapsed}s]   signal #${signalCount}: ${event.signal.type} from ${event.signal.source} (conf: ${event.signal.confidence.toFixed(2)})`)
        break
      case 'agent:reacted':
        console.log(`[${elapsed}s]   ${event.reaction.agentId}: ${event.reaction.strategyUsed} (${event.reaction.processingTimeMs}ms)`)
        break
      case 'consensus:check':
        console.log(`[${elapsed}s]   consensus: ${event.result.decided ? 'YES' : 'no'} (${(event.result.confidence * 100).toFixed(0)}%)`)
        break
      case 'math:round-analysis':
        console.log(`[${elapsed}s]   entropy: ${event.entropy.toFixed(3)} (norm: ${event.normalizedEntropy.toFixed(3)}), info gain: ${event.informationGain.toFixed(3)}`)
        break
      case 'advisor:action':
        console.log(`[${elapsed}s]   advisor: ${event.advice.type} — ${event.advice.reason}`)
        break
      case 'synthesis:complete':
        console.log(`[${elapsed}s] Synthesis done (${event.answer.length} chars)`)
        break
      case 'solve:complete':
        console.log(`\n[${elapsed}s] COMPLETE`)
        console.log(`Answer: ${event.result.answer.slice(0, 200)}...`)
        console.log(`\nTokens: ${event.result.cost.tokens} / 10,000 budget`)
        console.log(`Cost: ~$${event.result.cost.estimatedUsd.toFixed(4)}`)
        console.log(`Rounds: ${event.result.timing.roundsUsed}`)
        console.log(`Signals: ${event.result.signalLog.length}`)
        break
    }
  }

  instrumented.destroy()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
