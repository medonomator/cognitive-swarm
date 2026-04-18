#!/usr/bin/env tsx
/**
 * Decision-Making Swarm Example
 *
 * 6 agents (pros, cons, risk, opportunity, devil's advocate, judge)
 * debate a decision and reach consensus with structured argumentation.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/decision/index.ts
 */
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { decisionTemplate } from '@cognitive-swarm/templates'
import { createEngine, OpenAiLlm, printStats } from '../shared/openai-provider.js'

async function main() {
  if (!process.env['OPENAI_API_KEY']) {
    console.error('Set OPENAI_API_KEY environment variable')
    process.exit(1)
  }

  const engine = createEngine()
  const config = decisionTemplate({ engine })

  const swarm = new SwarmOrchestrator({
    ...config,
    timeout: 120_000,
    maxSignals: 80,
    maxRounds: 4,
    synthesizer: {
      llm: new OpenAiLlm('gpt-4o-mini'),
      prompt: 'You are a decision analyst. Weigh all arguments (pros, cons, risks, opportunities) and provide a clear recommendation with confidence level. Structure as: Recommendation → Key Arguments → Risks to Monitor → Action Items.',
    },
  })

  const DECISION = `Should a 10-person startup switch from a monolith Node.js backend to microservices architecture? They have 50K users, growing 20% monthly, and are experiencing increasing deployment friction and test flakiness.`

  console.log('Decision Swarm')
  console.log('==============')
  console.log('6 agents: pros, cons, risk-assessor, opportunity-spotter, devils-advocate, judge')
  console.log(`\nDecision: ${DECISION}\n`)

  const start = Date.now()

  for await (const event of swarm.solveWithStream(DECISION)) {
    switch (event.type) {
      case 'round:start':
        console.log(`--- Round ${event.round} ---`)
        break
      case 'agent:reacted': {
        const r = event.reaction
        const emoji = r.strategyUsed === 'challenge' ? '⚔️' : r.strategyUsed === 'support' ? '👍' : '🔍'
        console.log(`  ${emoji} [${r.agentId}] ${r.strategyUsed} (${r.processingTimeMs}ms)`)
        break
      }
      case 'consensus:check':
        console.log(`  Consensus: ${event.result.decided ? '✅ REACHED' : '⏳ pending'} (${(event.result.confidence * 100).toFixed(0)}%)`)
        break
      case 'synthesis:start':
        console.log('\nSynthesizing decision...')
        break
      case 'solve:complete':
        console.log(`\n${'='.repeat(60)}`)
        console.log('DECISION')
        console.log('='.repeat(60))
        console.log(event.result.answer)
        printStats(event.result, start)

        // Show agent contributions
        console.log('\n--- Contributions ---')
        for (const [id, c] of event.result.agentContributions) {
          console.log(`  ${id}: ${c.signalsEmitted} signals, ${c.proposalsMade} proposals, ${c.challengesMade} challenges`)
        }
        break
    }
  }

  swarm.destroy()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
