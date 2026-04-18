#!/usr/bin/env tsx
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineConfig } from '@cognitive-engine/core'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'
import {
  OpenAiLlmProvider,
  OpenAiEmbeddingProvider,
  InMemoryStore,
} from './providers.js'
import { createObserverAgents } from './agents.js'
import { loadRecentConversations, buildAnalysisTask } from './log-parser.js'
import { formatTelegramReport, sendReport } from './telegram.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} environment variable is required`)
    process.exit(1)
  }
  return value
}

// Claude Observer - Main Entry Point
//
// Reads recent Claude Code conversations,
// runs swarm analysis, stores insights in Qdrant,
// sends report to Telegram.
//
// Usage:
//   tsx src/run.ts              - analyze last 24h, send report
//   tsx src/run.ts --hours=48   - analyze last 48h
//   tsx src/run.ts --dry-run    - analyze but don't send to Telegram
//   tsx src/run.ts --verbose    - show full swarm output

const API_KEY = requireEnv('OPENAI_API_KEY')
const TELEGRAM_BOT_TOKEN = requireEnv('TELEGRAM_BOT_TOKEN')
const TELEGRAM_CHAT_ID = requireEnv('TELEGRAM_CHAT_ID')

const QDRANT_URL = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
const STATE_DIR = join(
  new URL('..', import.meta.url).pathname,
  '.state',
)
const LAST_RUN_FILE = join(STATE_DIR, 'last-run.json')

interface RunState {
  lastRunAt: string
  conversationsAnalyzed: number
  totalInsights: number
}

function loadState(): RunState | null {
  if (!existsSync(LAST_RUN_FILE)) return null
  try {
    return JSON.parse(readFileSync(LAST_RUN_FILE, 'utf-8')) as RunState
  } catch {
    return null
  }
}

function saveState(state: RunState): void {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(LAST_RUN_FILE, JSON.stringify(state, null, 2))
}

function parseArgs(): {
  hours: number
  dryRun: boolean
  verbose: boolean
  noTelegram: boolean
} {
  const args = process.argv.slice(2)
  const hoursArg = args.find((a) => a.startsWith('--hours='))
  const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 24
  const dryRun = args.includes('--dry-run')
  const verbose = args.includes('--verbose')
  const noTelegram = args.includes('--no-telegram')
  return { hours, dryRun, verbose, noTelegram }
}

async function main() {
  const { hours, dryRun, verbose, noTelegram } = parseArgs()
  const state = loadState()

  console.log(`\n🔭 Claude Observer`)
  console.log(`   Analyzing last ${hours}h of conversations...`)
  if (state) {
    console.log(`   Last run: ${state.lastRunAt} (${state.totalInsights} total insights)`)
  }

  const conversations = loadRecentConversations(hours)

  if (conversations.length === 0) {
    console.log('   No conversations found. Nothing to analyze.')
    return
  }

  const totalMessages = conversations.reduce(
    (sum, c) => sum + c.messages.length,
    0,
  )
  const totalTokens = conversations.reduce(
    (sum, c) => sum + c.totalTokens,
    0,
  )

  console.log(`   Found ${conversations.length} conversations (${totalMessages} messages, ${totalTokens.toLocaleString()} tokens)`)

  const task = buildAnalysisTask(conversations)

  if (verbose) {
    console.log('\n--- Task ---')
    console.log(task.slice(0, 2000))
    console.log('...\n')
  }

  const llm = new OpenAiLlmProvider(API_KEY, 'gpt-4o-mini')
  const embedding = new OpenAiEmbeddingProvider(API_KEY)
  const engine: EngineConfig = { llm, embedding, store: new InMemoryStore() }

  const agents = createObserverAgents(engine)

  const memory = new QdrantVectorMemory(embedding, {
    url: QDRANT_URL,
    collection: 'claude-observer',
  })

  const synthLlm = new OpenAiLlmProvider(API_KEY, 'gpt-4o-mini')
  const orchestrator = new SwarmOrchestrator({
    agents,
    maxRounds: 3,
    maxSignals: 50,
    timeout: 120_000,
    consensus: { strategy: 'confidence-weighted', threshold: 0.3 },
    synthesizer: {
      llm: synthLlm,
      prompt: `You are compiling a daily intelligence report about the user's Claude Code activity.

Structure your report as:

SUMMARY
One paragraph: what was the user working on today?

KEY DECISIONS
- Decision: ... | Why: ... | Alternatives considered: ...

RECURRING PATTERNS
- Pattern: ... | Frequency: ... | Action: ...

MISTAKES & LESSONS
- Mistake: ... | Root cause: ... | Prevention: ...

NEW KNOWLEDGE
- Fact: ... | Context: ... | When useful: ...

FOCUS & PRODUCTIVITY
- Projects worked on and time distribution
- Context switches
- Unfinished work

Keep it concise. Every bullet point must be ACTIONABLE or INFORMATIVE.
Write in RUSSIAN with technical terms in English.
Example: "Повторяющийся баг: забывает wait:true в Qdrant setPayload — 3-й раз за неделю."
Use plain text, no markdown formatting.`,
    },
    memory,
    math: {
      entropyThreshold: 0.3,
      minInformationGain: 0.03,
      redundancyThreshold: 0.5,
    },
  })

  const MAX_COST_USD = 0.50 // Safety cap: abort if cost exceeds $0.50
  const HARD_TIMEOUT_MS = 300_000 // 5 minutes absolute maximum

  console.log(`   Running swarm analysis (6 agents, max 3 rounds, cap $${MAX_COST_USD})...`)
  const startTime = Date.now()

  const hardTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Hard timeout exceeded (5 min)')), HARD_TIMEOUT_MS),
  )

  let result: Awaited<ReturnType<typeof orchestrator.solve>>
  try {
    result = await Promise.race([orchestrator.solve(task), hardTimeout])
  } catch (error) {
    orchestrator.destroy()
    console.error(`   ❌ Aborted: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  orchestrator.destroy()

  // Check cost cap
  const tokensUsed = llm.tokensUsed + synthLlm.tokensUsed
  const costUsdRaw = tokensUsed * 0.00000015
  if (costUsdRaw > MAX_COST_USD) {
    console.error(`   ⚠️ Cost cap hit: $${costUsdRaw.toFixed(4)} > $${MAX_COST_USD}`)
  }

  const memoriesStored = await memory.count()
  const costUsd = costUsdRaw

  console.log(`   Done in ${duration}s`)
  console.log(`   Signals: ${result.signalLog.length}, Rounds: ${result.timing.roundsUsed}`)
  console.log(`   Memories in Qdrant: ${memoriesStored}`)
  console.log(`   Cost: $${costUsd.toFixed(4)}`)

  if (verbose) {
    console.log('\n--- Analysis ---')
    console.log(result.answer)
    console.log('---\n')
  }

  if (!dryRun && !noTelegram) {
    console.log('   Sending report to Telegram...')

    const report = formatTelegramReport(result.answer, {
      conversations: conversations.length,
      totalMessages,
      totalTokens,
      memoriesStored,
    })

    const sent = await sendReport(
      { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID },
      report,
    )

    console.log(sent ? '   ✅ Report sent!' : '   ❌ Failed to send report')
  } else if (noTelegram) {
    console.log('   [no-telegram] Analysis saved to Qdrant, no report sent')
  } else {
    console.log('   [dry-run] Skipping Telegram send')
    console.log('\n--- Report Preview ---')
    console.log(result.answer)
  }

  saveState({
    lastRunAt: new Date().toISOString(),
    conversationsAnalyzed: (state?.conversationsAnalyzed ?? 0) + conversations.length,
    totalInsights: memoriesStored,
  })

  mkdirSync('results', { recursive: true })
  const filename = `results/observer-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  writeFileSync(
    filename,
    JSON.stringify(
      {
        timestamp: Date.now(),
        conversations: conversations.length,
        messages: totalMessages,
        tokens: totalTokens,
        analysis: result.answer,
        signals: result.signalLog.length,
        rounds: result.timing.roundsUsed,
        cost: costUsd,
        memoriesStored,
      },
      null,
      2,
    ),
  )
  console.log(`   Results saved to ${filename}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
