import type { EngineConfig } from '@cognitive-engine/core'
import type { SwarmAgentDef } from '@cognitive-swarm/core'
import { SwarmOrchestrator } from '@cognitive-swarm/orchestrator'
import { QdrantVectorMemory } from '@cognitive-swarm/memory-qdrant'
import type { BenchmarkDef, BenchmarkResult } from '../types.js'
import {
  OpenAiLlmProvider,
  OpenAiEmbeddingProvider,
  InMemoryStore,
} from '../providers.js'
import { estimateCost, compare } from '../harness.js'

// Benchmark: Research Breadth
//
// Compare: swarm of 5 gpt-4o-mini vs 1 gpt-4o-mini
// Task: brainstorm unique, valid insights on a topic
// Metric: number of UNIQUE perspectives/insights found
// We use an LLM judge to count unique insights.

const RESEARCH_TOPIC =
  'What are the implications of large language models for software engineering practices? Consider both opportunities and risks across the full development lifecycle.'

function makeEngine(
  llm: OpenAiLlmProvider,
  embedding: OpenAiEmbeddingProvider,
): EngineConfig {
  return { llm, embedding, store: new InMemoryStore() }
}

function makeResearchAgent(
  id: string,
  perspective: string,
  llm: OpenAiLlmProvider,
  embedding: OpenAiEmbeddingProvider,
): SwarmAgentDef {
  return {
    config: {
      id,
      name: id,
      role: perspective,
      personality: {
        curiosity: 0.8,
        caution: 0.3,
        conformity: 0.3,
        verbosity: 0.6,
      },
      listens: ['task:new', 'discovery', 'proposal', 'challenge'],
      canEmit: ['discovery', 'proposal', 'doubt', 'vote', 'challenge'],
      weight: 1,
    },
    engine: makeEngine(llm, embedding),
  }
}

async function countUniqueInsights(
  llm: OpenAiLlmProvider,
  answer: string,
): Promise<number> {
  const response = await llm.completeJson<{ count: number; insights: string[] }>(
    [
      {
        role: 'system',
        content:
          'You are an impartial evaluator. Count the number of UNIQUE, non-trivial insights in the text. Do not count restatements or trivial observations. Return JSON: {"count": number, "insights": ["insight1", ...]}',
      },
      {
        role: 'user',
        content: `Count unique insights in this analysis:\n\n${answer}`,
      },
    ],
    { maxTokens: 1000 },
  )

  return response.parsed.count ?? 0
}

export const researchBenchmark: BenchmarkDef = {
  name: 'Research Breadth',
  description:
    'Generate unique insights on LLMs in software engineering. Swarm of 5 vs single model.',

  async run(apiKey: string): Promise<BenchmarkResult> {
    const task = `Research and analyze: ${RESEARCH_TOPIC}\n\nProvide as many unique, non-obvious insights as possible. Each insight should be a distinct perspective.`

    const baselineLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const baselineStart = Date.now()

    const baselineResponse = await baselineLlm.complete(
      [
        {
          role: 'system',
          content:
            'You are a thorough researcher. Provide as many unique, diverse perspectives as possible. Each insight should cover a different angle. Be specific and non-obvious.',
        },
        { role: 'user', content: task },
      ],
      { maxTokens: 2000 },
    )

    const baselineDuration = Date.now() - baselineStart
    const baselineTokens = baselineLlm.tokensUsed

    // Judge baseline
    const judgeLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const baselineInsights = await countUniqueInsights(
      judgeLlm,
      baselineResponse.content,
    )

    const swarmLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const embedding = new OpenAiEmbeddingProvider(apiKey)

    const agents: SwarmAgentDef[] = [
      makeResearchAgent(
        'explorer-dev',
        'Explore implications for developers and coding practices. Focus on code generation, debugging, testing. Challenge others if they miss nuances.',
        swarmLlm,
        embedding,
      ),
      makeResearchAgent(
        'explorer-org',
        'Explore organizational implications — team structure, hiring, skill requirements, management. Propose unique organizational insights.',
        swarmLlm,
        embedding,
      ),
      makeResearchAgent(
        'explorer-risk',
        'Focus on risks — security, reliability, vendor lock-in, skill atrophy, ethical concerns. Challenge overly optimistic views.',
        swarmLlm,
        embedding,
      ),
      makeResearchAgent(
        'explorer-future',
        'Think about long-term future implications — what changes in 5-10 years? New roles, tools, paradigms? Be bold and speculative.',
        swarmLlm,
        embedding,
      ),
      makeResearchAgent(
        'synthesizer',
        'Synthesize discoveries from all explorers into a comprehensive analysis. Ensure no insight is lost. Propose the final consolidated list of unique insights.',
        swarmLlm,
        embedding,
      ),
    ]

    // Qdrant memory - persistent collective knowledge
    const qdrantUrl = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
    const memory = new QdrantVectorMemory(embedding, {
      url: qdrantUrl,
      collection: 'bench-research',
    })

    const synthLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const orchestrator = new SwarmOrchestrator({
      agents,
      maxRounds: 3,
      maxSignals: 50,
      timeout: 90_000,
      consensus: { strategy: 'confidence-weighted', threshold: 0.4 },
      synthesizer: {
        llm: synthLlm,
        prompt: 'Compile all unique insights from the research agents into a comprehensive numbered list. Ensure every distinct perspective is preserved.',
      },
      memory,
      math: {
        entropyThreshold: 0.4,
        minInformationGain: 0.03,
        redundancyThreshold: 0.6,
      },
    })

    const swarmStart = Date.now()
    const swarmResult = await orchestrator.solve(task)
    const swarmDuration = Date.now() - swarmStart
    const swarmTokens = swarmLlm.tokensUsed + synthLlm.tokensUsed

    orchestrator.destroy()
    const memoriesStored = await memory.count()
    console.log(`  Memory: ${memoriesStored} discoveries stored in Qdrant`)

    // Judge swarm
    const swarmInsights = await countUniqueInsights(judgeLlm, swarmResult.answer)

    // Normalize scores: insights / 20 (cap at 1.0)
    const maxInsights = 20

    const swarmRun = {
      answer: swarmResult.answer,
      score: Math.min(swarmInsights / maxInsights, 1),
      tokensUsed: swarmTokens + judgeLlm.tokensUsed,
      durationMs: swarmDuration,
      costUsd: estimateCost(swarmTokens),
      signalCount: swarmResult.signalLog.length,
      roundsUsed: swarmResult.timing.roundsUsed,
    }

    const baselineRun = {
      answer: baselineResponse.content,
      score: Math.min(baselineInsights / maxInsights, 1),
      tokensUsed: baselineTokens,
      durationMs: baselineDuration,
      costUsd: estimateCost(baselineTokens),
    }

    return {
      name: this.name,
      description: this.description,
      swarm: swarmRun,
      baseline: baselineRun,
      comparison: compare(swarmRun, baselineRun),
      mathAnalysis: swarmResult.mathAnalysis,
      timestamp: Date.now(),
    }
  },
}
