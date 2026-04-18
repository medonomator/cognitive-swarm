#!/usr/bin/env tsx
/**
 * Research Swarm Example
 *
 * 5 agents (explorer-a, explorer-b, fact-checker, critic, synthesizer)
 * collaborate to research a topic and produce a comprehensive answer.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/research/index.ts
 */
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { researchTemplate } from '@cognitive-swarm/templates'
import { createEngine, OpenAiLlm, printStats } from '../shared/openai-provider.js'

async function main() {
  if (!process.env['OPENAI_API_KEY']) {
    console.error('Set OPENAI_API_KEY environment variable')
    process.exit(1)
  }

  const engine = createEngine()
  const config = researchTemplate({ engine })

  const swarm = new SwarmOrchestrator({
    ...config,
    timeout: 120_000,
    maxSignals: 60,
    synthesizer: {
      llm: new OpenAiLlm('gpt-4o-mini'),
      prompt: 'You are a research synthesizer. Combine all findings into a well-structured, evidence-based answer with sources and confidence levels for each claim.',
    },
  })

  const QUESTION = `What are the most promising approaches to solving the alignment problem in large language models? Compare RLHF, Constitutional AI, and debate-based approaches.`

  console.log('Research Swarm')
  console.log('==============')
  console.log('5 agents: explorer-a, explorer-b, fact-checker, critic, synthesizer')
  console.log(`\nQuestion: ${QUESTION}\n`)

  const start = Date.now()

  for await (const event of swarm.solveWithStream(QUESTION)) {
    switch (event.type) {
      case 'round:start':
        console.log(`--- Round ${event.round} ---`)
        break
      case 'agent:reacted':
        console.log(`  [${event.reaction.agentId}] ${event.reaction.strategyUsed} → ${event.reaction.signals.length} signal(s)`)
        break
      case 'consensus:check':
        console.log(`  Consensus: ${event.result.decided ? 'REACHED' : 'pending'} (${(event.result.confidence * 100).toFixed(0)}%)`)
        break
      case 'synthesis:start':
        console.log('\nSynthesizing final answer...')
        break
      case 'solve:complete':
        console.log(`\n${'='.repeat(60)}`)
        console.log('RESEARCH RESULT')
        console.log('='.repeat(60))
        console.log(event.result.answer)
        printStats(event.result, start)
        break
    }
  }

  swarm.destroy()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
