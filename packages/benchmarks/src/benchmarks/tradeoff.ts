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

// Benchmark: Adversarial Trade-off Debate
//
// A genuinely HARD problem with no single right answer.
// Multiple valid positions must be debated to find the
// best trade-off. Single model tends to pick one side.

const TRADEOFF_TASK = `
You are the CTO of a fintech startup (Series A, 15 engineers, $8M runway).
You need to rebuild your payment processing backend that currently handles
$2M/day in transactions. The system must be production-ready in 6 months.

Three teams have proposed competing architectures:

**Option A: Event-Sourced Microservices (Kotlin + Kafka + PostgreSQL)**
- Full event sourcing for audit trail and replay
- Kafka for async communication between 12 microservices
- PostgreSQL with CQRS for read/write separation
- Kubernetes on AWS EKS

**Option B: Modular Monolith (Go + NATS + CockroachDB)**
- Single deployable binary, internally modular
- NATS for internal pub/sub (lighter than Kafka)
- CockroachDB for distributed SQL without manual sharding
- Deployed on AWS ECS Fargate (no K8s overhead)

**Option C: Serverless-First (TypeScript + AWS Lambda + DynamoDB + Step Functions)**
- Lambda functions for each payment flow step
- Step Functions for orchestration and saga pattern
- DynamoDB for zero-ops database
- API Gateway + CloudFront

Analyze ALL THREE options across these dimensions:
1. Time-to-market with 15 engineers (6 month deadline)
2. Operational complexity and on-call burden
3. Cost at current scale ($2M/day) AND projected 10x growth
4. Regulatory compliance (PCI DSS Level 1, SOX audit)
5. Hiring difficulty for the chosen stack
6. Disaster recovery and data durability
7. Testing and debugging complexity
8. Vendor lock-in risk
9. Performance under load (p99 latency for payment processing)
10. Team morale and developer experience

For EACH dimension, explain which option wins and WHY.
Then make a final recommendation that acknowledges the legitimate
strengths of the options you didn't choose.

A good answer shows genuine tension between options, not a clear winner.
`

/** Trade-off dimensions to check for balanced analysis. */
const DIMENSIONS = [
  { name: 'time-to-market', keywords: ['deadline', '6 month', 'time to market', 'velocity', 'shipping'] },
  { name: 'ops complexity', keywords: ['operational', 'on-call', 'monitoring', 'debugging', 'observability'] },
  { name: 'cost analysis', keywords: ['cost', 'pricing', 'infrastructure cost', 'lambda pricing', 'reserved'] },
  { name: 'compliance', keywords: ['pci', 'sox', 'audit', 'compliance', 'regulatory', 'pci dss'] },
  { name: 'hiring', keywords: ['hiring', 'talent', 'engineer', 'recruitment', 'kotlin', 'go developer'] },
  { name: 'disaster recovery', keywords: ['disaster', 'recovery', 'durability', 'backup', 'failover', 'rpo', 'rto'] },
  { name: 'testing', keywords: ['testing', 'integration test', 'contract test', 'debugging', 'local development'] },
  { name: 'vendor lock-in', keywords: ['lock-in', 'vendor', 'portability', 'migration', 'proprietary'] },
  { name: 'performance', keywords: ['latency', 'p99', 'throughput', 'cold start', 'performance'] },
  { name: 'team morale', keywords: ['morale', 'developer experience', 'dx', 'burnout', 'satisfaction'] },
]

async function scoreTradeoffAnalysis(
  llm: OpenAiLlmProvider,
  answer: string,
): Promise<{
  score: number
  dimensionsCovered: number
  allOptionsAnalyzed: boolean
  acknowledgesCounterarguments: boolean
  genuineTension: boolean
}> {
  const response = await llm.completeJson<{
    dimensionsCovered: number
    allThreeOptionsCompared: boolean
    acknowledgesCounterarguments: boolean
    genuineTensionShown: boolean
    biasDetected: string | null
    overallQuality: number
  }>(
    [
      {
        role: 'system',
        content: `You are an expert evaluator of technical decision-making quality.
Evaluate the trade-off analysis below. Return JSON:
{
  "dimensionsCovered": <number of the 10 dimensions analyzed with per-option comparison (not just mentioned)>,
  "allThreeOptionsCompared": <true if all 3 options are compared for most dimensions>,
  "acknowledgesCounterarguments": <true if the final recommendation acknowledges strengths of rejected options>,
  "genuineTensionShown": <true if the analysis shows genuine difficulty in choosing, not obvious winner>,
  "biasDetected": <null or string describing detected bias toward one option>,
  "overallQuality": <0-1 float, overall quality of the trade-off analysis>
}`,
      },
      { role: 'user', content: `Evaluate this analysis:\n\n${answer}` },
    ],
    { maxTokens: 500 },
  )

  const p = response.parsed
  const dimensionScore = p.dimensionsCovered / DIMENSIONS.length
  const qualityBonus = (
    (p.allThreeOptionsCompared ? 0.15 : 0) +
    (p.acknowledgesCounterarguments ? 0.15 : 0) +
    (p.genuineTensionShown ? 0.1 : 0)
  )

  return {
    score: Math.min(1, dimensionScore * 0.6 + qualityBonus + p.overallQuality * 0.1),
    dimensionsCovered: p.dimensionsCovered,
    allOptionsAnalyzed: p.allThreeOptionsCompared,
    acknowledgesCounterarguments: p.acknowledgesCounterarguments,
    genuineTension: p.genuineTensionShown,
  }
}

function makeEngine(
  llm: OpenAiLlmProvider,
  embedding: OpenAiEmbeddingProvider,
): EngineConfig {
  return { llm, embedding, store: new InMemoryStore() }
}

export const tradeoffBenchmark: BenchmarkDef = {
  name: 'Trade-off Debate',
  description:
    'Analyze 3 competing architectures across 10 dimensions with genuine tension. Swarm of 6 vs single model.',

  async run(apiKey: string): Promise<BenchmarkResult> {
    const baselineLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const baselineStart = Date.now()

    const baselineResponse = await baselineLlm.complete(
      [
        {
          role: 'system',
          content:
            'You are a seasoned CTO advisor. Analyze technology trade-offs with nuance. Show genuine tension between options. Acknowledge counterarguments. Do not default to the "safe" or popular choice without justification.',
        },
        { role: 'user', content: TRADEOFF_TASK },
      ],
      { maxTokens: 4000 },
    )

    const baselineDuration = Date.now() - baselineStart
    const baselineTokens = baselineLlm.tokensUsed

    const swarmLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const embedding = new OpenAiEmbeddingProvider(apiKey)

    const agents: SwarmAgentDef[] = [
      {
        config: {
          id: 'advocate-microservices',
          name: 'advocate-microservices',
          role: 'You ADVOCATE for Option A (Event-Sourced Microservices with Kotlin + Kafka). Argue its strengths: event sourcing audit trail, proven at scale, strong typing. BUT be honest about its weaknesses when challenged. Emit discoveries about where it excels.',
          personality: { curiosity: 0.7, caution: 0.3, conformity: 0.2, verbosity: 0.6 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
          weight: 1.0,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'advocate-monolith',
          name: 'advocate-monolith',
          role: 'You ADVOCATE for Option B (Modular Monolith with Go + NATS). Argue its strengths: simplicity, fast deployment, low ops burden, Go performance. BUT honestly acknowledge when microservices or serverless would be better. Emit discoveries about pragmatic engineering.',
          personality: { curiosity: 0.7, caution: 0.4, conformity: 0.2, verbosity: 0.6 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
          weight: 1.0,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'advocate-serverless',
          name: 'advocate-serverless',
          role: 'You ADVOCATE for Option C (Serverless with Lambda + DynamoDB). Argue its strengths: zero ops, pay-per-use, fast iteration. BUT be honest about cold starts, vendor lock-in, and testing difficulty when challenged.',
          personality: { curiosity: 0.7, caution: 0.3, conformity: 0.2, verbosity: 0.6 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
          weight: 1.0,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'devils-advocate',
          name: 'devils-advocate',
          role: 'You are the devil\'s advocate. Challenge EVERY proposal. Find the weakness in each option. Ask uncomfortable questions: "What happens when Kafka goes down?" "Can you hire Go developers in your city?" "What\'s the Lambda cold start for payment processing?" Your job is to stress-test each argument.',
          personality: { curiosity: 0.6, caution: 0.9, conformity: 0.1, verbosity: 0.5 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['challenge', 'doubt', 'discovery'],
          weight: 1.2,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'compliance-risk',
          name: 'compliance-risk',
          role: 'You evaluate each option ONLY through the lens of PCI DSS Level 1 compliance, SOX audit requirements, and operational risk. Which option makes the auditor happy? Which creates compliance headaches? Be specific about PCI requirements (network segmentation, encryption, access logging).',
          personality: { curiosity: 0.5, caution: 0.95, conformity: 0.4, verbosity: 0.6 },
          listens: ['task:new', 'discovery', 'proposal'],
          canEmit: ['discovery', 'challenge', 'vote'],
          weight: 1.3,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'decision-maker',
          name: 'decision-maker',
          role: 'You are the CTO making the final call. Synthesize all arguments into a decision. Your recommendation MUST: (1) address all 10 dimensions, (2) show genuine tension, (3) acknowledge what you sacrifice by not choosing the other options, (4) explain why the trade-offs are acceptable. Do NOT just pick the "safe" option.',
          personality: { curiosity: 0.6, caution: 0.5, conformity: 0.6, verbosity: 0.8 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge', 'vote'],
          canEmit: ['proposal', 'vote'],
          weight: 1.5,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
    ]

    const qdrantUrl = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
    const memory = new QdrantVectorMemory(embedding, {
      url: qdrantUrl,
      collection: 'bench-tradeoff',
    })

    const synthLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const orchestrator = new SwarmOrchestrator({
      agents,
      maxRounds: 4,
      maxSignals: 60,
      timeout: 180_000,
      consensus: { strategy: 'confidence-weighted', threshold: 0.35 },
      synthesizer: {
        llm: synthLlm,
        prompt: `You are writing the CTO's final decision memo. Compile ALL agent arguments into a structured trade-off analysis.

For EACH of the 10 dimensions (time-to-market, ops complexity, cost, compliance, hiring, DR, testing, vendor lock-in, performance, team morale):
- State which option wins that dimension and why
- Include dissenting arguments from other agents

Then make a final recommendation that honestly acknowledges what you lose by not choosing the other options.
Show that this was a genuinely hard decision, not an obvious one.`,
      },
      memory,
      math: {
        entropyThreshold: 0.2,
        minInformationGain: 0.03,
        redundancyThreshold: 0.6,
      },
    })

    const swarmStart = Date.now()
    const swarmResult = await orchestrator.solve(TRADEOFF_TASK)
    const swarmDuration = Date.now() - swarmStart
    const swarmTokens = swarmLlm.tokensUsed + synthLlm.tokensUsed

    orchestrator.destroy()
    const memoriesStored = await memory.count()
    console.log(`  Memory: ${memoriesStored} discoveries stored in Qdrant`)

    // Judge
    const judgeLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const swarmScore = await scoreTradeoffAnalysis(judgeLlm, swarmResult.answer)
    const baselineScore = await scoreTradeoffAnalysis(judgeLlm, baselineResponse.content)

    console.log(`  Swarm:    dims=${swarmScore.dimensionsCovered}/10 allOpts=${swarmScore.allOptionsAnalyzed} counter=${swarmScore.acknowledgesCounterarguments} tension=${swarmScore.genuineTension}`)
    console.log(`  Baseline: dims=${baselineScore.dimensionsCovered}/10 allOpts=${baselineScore.allOptionsAnalyzed} counter=${baselineScore.acknowledgesCounterarguments} tension=${baselineScore.genuineTension}`)

    const swarmRun = {
      answer: swarmResult.answer,
      score: swarmScore.score,
      tokensUsed: swarmTokens,
      durationMs: swarmDuration,
      costUsd: estimateCost(swarmTokens),
      signalCount: swarmResult.signalLog.length,
      roundsUsed: swarmResult.timing.roundsUsed,
    }

    const baselineRun = {
      answer: baselineResponse.content,
      score: baselineScore.score,
      tokensUsed: baselineTokens + judgeLlm.tokensUsed,
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
