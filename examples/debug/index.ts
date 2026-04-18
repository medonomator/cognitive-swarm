#!/usr/bin/env tsx
/**
 * Debug Swarm Example
 *
 * 7 agents (reproducer, log-analyzer, hypothesis-a, hypothesis-b, verifier, fixer, reviewer)
 * collaborate to diagnose and fix a bug from an error report.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/debug/index.ts
 */
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { debugTemplate } from '@cognitive-swarm/templates'
import { createEngine, OpenAiLlm, printStats } from '../shared/openai-provider.js'

async function main() {
  if (!process.env['OPENAI_API_KEY']) {
    console.error('Set OPENAI_API_KEY environment variable')
    process.exit(1)
  }

  const engine = createEngine()
  const config = debugTemplate({ engine })

  const swarm = new SwarmOrchestrator({
    ...config,
    timeout: 120_000,
    maxSignals: 60,
    synthesizer: {
      llm: new OpenAiLlm('gpt-4o-mini'),
      prompt: 'You are a senior debugging engineer. Synthesize the investigation into: Root Cause → Evidence → Fix → Prevention. Be specific about code changes needed.',
    },
  })

  const BUG_REPORT = `
Bug Report: Users intermittently get "Cannot read properties of undefined (reading 'map')"

Stack trace:
  at renderUserList (src/components/UserList.tsx:24:18)
  at processChild (node_modules/react-dom/...)

Context:
- Happens ~5% of the time on page load
- Only affects the /dashboard route
- Started after PR #847 which added caching to the user API endpoint
- The API returns { users: [...] } normally, but sometimes returns { users: null }
- Redis cache TTL is 60 seconds
- The UserList component does: const items = data.users.map(u => ...)
- No error boundary catches this currently

Related code:
  // API handler
  app.get('/api/users', async (req, res) => {
    const cached = await redis.get('users')
    if (cached) return res.json(JSON.parse(cached))

    const users = await db.query('SELECT * FROM users WHERE active = true')
    await redis.set('users', JSON.stringify({ users }), 'EX', 60)
    res.json({ users })
  })

  // React component
  function UserList({ data }) {
    const items = data.users.map(u => <UserCard key={u.id} user={u} />)
    return <div>{items}</div>
  }
`

  console.log('Debug Swarm')
  console.log('===========')
  console.log('7 agents: reproducer, log-analyzer, hypothesis-a/b, verifier, fixer, reviewer')
  console.log('\nBug: "Cannot read properties of undefined (reading \'map\')"')
  console.log('Investigating...\n')

  const start = Date.now()

  for await (const event of swarm.solveWithStream(`Debug this issue:\n${BUG_REPORT}`)) {
    switch (event.type) {
      case 'round:start':
        console.log(`--- Round ${event.round} ---`)
        break
      case 'agent:reacted': {
        const r = event.reaction
        console.log(`  [${r.agentId}] ${r.strategyUsed} → ${r.signals.length} signal(s) (${r.processingTimeMs}ms)`)
        break
      }
      case 'consensus:check':
        console.log(`  Consensus: ${event.result.decided ? 'REACHED' : 'investigating...'} (${(event.result.confidence * 100).toFixed(0)}%)`)
        break
      case 'synthesis:start':
        console.log('\nSynthesizing diagnosis...')
        break
      case 'solve:complete':
        console.log(`\n${'='.repeat(60)}`)
        console.log('DIAGNOSIS & FIX')
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
