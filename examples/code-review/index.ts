#!/usr/bin/env tsx
/**
 * Code Review Swarm Example
 *
 * 5 agents (security, performance, architecture, edge-cases, synthesizer)
 * analyze code and reach consensus on issues found.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/code-review/index.ts
 */
import OpenAI from 'openai'
import type {
  LlmProvider,
  LlmMessage,
  LlmOptions,
  LlmResponse,
  EmbeddingProvider,
  Store,
  StoreFilter,
} from '@cognitive-engine/core'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { codeReviewTemplate } from '@cognitive-swarm/templates'

// Minimal OpenAI provider

class OpenAiLlm implements LlmProvider {
  private readonly client: OpenAI
  constructor(private readonly model = 'gpt-4o-mini') {
    this.client = new OpenAI()
  }

  async complete(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse> {
    const res = await this.client.chat.completions.create({
      model: options?.model ?? this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 500,
    })
    const choice = res.choices[0]
    const usage = res.usage
    return {
      content: choice?.message?.content ?? '',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: 'stop',
    }
  }

  async completeJson<T>(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse & { parsed: T }> {
    const res = await this.client.chat.completions.create({
      model: options?.model ?? this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 500,
      response_format: { type: 'json_object' },
    })
    const content = res.choices[0]?.message?.content ?? '{}'
    const usage = res.usage
    return {
      content,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: 'stop',
      parsed: JSON.parse(content) as T,
    }
  }
}

class NoopEmbedding implements EmbeddingProvider {
  readonly dimensions = 256
  async embed(): Promise<number[]> { return new Array(256).fill(0) }
  async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => new Array(256).fill(0)) }
}

class NoopStore implements Store {
  async get(): Promise<null> { return null }
  async set(): Promise<void> {}
  async delete(): Promise<void> {}
  async find(): Promise<never[]> { return [] }
  async upsert(): Promise<void> {}
}

// Run the swarm

const SAMPLE_CODE = `
// User authentication handler
app.post('/login', async (req, res) => {
  const { username, password } = req.body
  const user = await db.query(\`SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}'\`)
  if (user.length > 0) {
    const token = jwt.sign({ id: user[0].id, role: user[0].role }, 'secret123')
    res.cookie('auth', token)
    res.json({ success: true, user: user[0] })
  } else {
    res.json({ success: false, message: 'Invalid credentials' })
  }
})

// File upload
app.post('/upload', async (req, res) => {
  const file = req.files?.document
  const path = \`./uploads/\${file.name}\`
  await file.mv(path)
  await db.query(\`INSERT INTO files (name, path, user_id) VALUES ('\${file.name}', '\${path}', \${req.user.id})\`)
  res.json({ url: path })
})

// Admin panel
app.get('/admin/users', async (req, res) => {
  const users = await db.query('SELECT * FROM users')
  res.json(users)
})
`

async function main() {
  if (!process.env['OPENAI_API_KEY']) {
    console.error('Set OPENAI_API_KEY environment variable')
    process.exit(1)
  }

  const llm = new OpenAiLlm('gpt-4o-mini')
  const engine = { llm, embedding: new NoopEmbedding(), store: new NoopStore() }

  // Create swarm from template
  const config = codeReviewTemplate({ engine })

  // Add synthesizer for final answer
  const synthLlm = new OpenAiLlm('gpt-4o-mini')

  const swarm = new SwarmOrchestrator({
    ...config,
    timeout: 120_000,
    maxSignals: 50,
    synthesizer: {
      llm: synthLlm,
      prompt: 'You are a senior code reviewer. Synthesize all findings into a prioritized list of issues with severity (critical/high/medium/low), clear descriptions, and fix suggestions.',
    },
  })

  console.log('Code Review Swarm')
  console.log('=================')
  console.log('5 agents: security, performance, architecture, edge-cases, synthesizer')
  console.log('Analyzing code...\n')

  const start = Date.now()

  // Stream events to show progress
  for await (const event of swarm.solveWithStream(`Review this code for bugs, security issues, and improvements:\n${SAMPLE_CODE}`)) {
    switch (event.type) {
      case 'round:start':
        console.log(`--- Round ${event.round} ---`)
        break
      case 'agent:reacted':
        console.log(`  [${event.reaction.agentId}] ${event.reaction.strategyUsed} (${event.reaction.processingTimeMs}ms)`)
        break
      case 'consensus:check':
        console.log(`  Consensus: ${event.result.decided ? 'REACHED' : 'not yet'} (confidence: ${(event.result.confidence * 100).toFixed(0)}%)`)
        break
      case 'solve:complete': {
        const duration = ((Date.now() - start) / 1000).toFixed(1)
        console.log(`\n${'='.repeat(60)}`)
        console.log('REVIEW RESULT')
        console.log('='.repeat(60))
        console.log(event.result.answer)
        console.log(`\n--- Stats ---`)
        console.log(`Time: ${duration}s`)
        console.log(`Rounds: ${event.result.timing.roundsUsed}`)
        console.log(`Signals: ${event.result.signalLog.length}`)
        console.log(`Confidence: ${(event.result.confidence * 100).toFixed(0)}%`)
        console.log(`Tokens: ${event.result.cost.tokens}`)
        console.log(`Cost: ~$${event.result.cost.estimatedUsd.toFixed(4)}`)
        break
      }
    }
  }

  swarm.destroy()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
