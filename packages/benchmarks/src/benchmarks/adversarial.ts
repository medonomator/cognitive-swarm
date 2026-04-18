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

// Benchmark: Adversarial Robustness
//
// Inject deliberately wrong information into a factual task.
// Measure whether the system catches the error.
// The task mixes true facts with one planted falsehood.
// Score: 1 if caught, 0 if not.

const TASK_WITH_WRONG_INFO = `
Analyze these technical claims and determine which are correct and which are wrong:

1. JavaScript uses prototypal inheritance, not classical inheritance.
2. TCP is a connectionless protocol that does not guarantee delivery order.
3. In PostgreSQL, a B-tree index is the default index type.
4. React's virtual DOM compares the new tree with the previous one using a diffing algorithm.
5. HTTP/2 uses binary framing instead of text-based protocols like HTTP/1.1.

Evaluate each claim. Identify which are TRUE and which are FALSE. Explain your reasoning.
`

// Claim 2 is FALSE: TCP is connection-oriented and guarantees delivery order.
// All others are TRUE.

function scoreAnswer(answer: string): number {
  const lower = answer.toLowerCase()

  let score = 0

  // Must identify claim 2 (TCP) as false/incorrect
  const identifiedTcpFalse =
    (lower.includes('tcp') || lower.includes('claim 2') || lower.includes('#2')) &&
    (lower.includes('false') ||
      lower.includes('incorrect') ||
      lower.includes('wrong') ||
      lower.includes('connection-oriented') ||
      lower.includes('not connectionless'))

  if (identifiedTcpFalse) score += 0.5

  // Must identify other claims as true/correct
  const identifiedOthersTrue =
    (lower.includes('claim 1') || lower.includes('prototypal')) &&
    (lower.includes('true') || lower.includes('correct'))

  if (identifiedOthersTrue) score += 0.125

  // Check PostgreSQL claim identified as true
  if (
    lower.includes('b-tree') &&
    (lower.includes('true') || lower.includes('correct') || lower.includes('default'))
  )
    score += 0.125

  // Check React claim
  if (
    lower.includes('virtual dom') &&
    (lower.includes('true') || lower.includes('correct') || lower.includes('diff'))
  )
    score += 0.125

  // Check HTTP/2 claim
  if (
    lower.includes('http/2') &&
    (lower.includes('true') || lower.includes('correct') || lower.includes('binary'))
  )
    score += 0.125

  return Math.min(score, 1)
}

function makeEngine(
  llm: OpenAiLlmProvider,
  embedding: OpenAiEmbeddingProvider,
): EngineConfig {
  return { llm, embedding, store: new InMemoryStore() }
}

export const adversarialBenchmark: BenchmarkDef = {
  name: 'Adversarial Robustness',
  description:
    'Detect planted falsehood among true claims. Swarm of 4 vs single model.',

  async run(apiKey: string): Promise<BenchmarkResult> {
    const baselineLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const baselineStart = Date.now()

    const baselineResponse = await baselineLlm.complete(
      [
        {
          role: 'system',
          content:
            'You are a technical fact-checker. Carefully evaluate each claim. Be precise about what is true and what is false.',
        },
        { role: 'user', content: TASK_WITH_WRONG_INFO },
      ],
      { maxTokens: 1500 },
    )

    const baselineDuration = Date.now() - baselineStart
    const baselineScore = scoreAnswer(baselineResponse.content)
    const baselineTokens = baselineLlm.tokensUsed

    const swarmLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const embedding = new OpenAiEmbeddingProvider(apiKey)

    const agents: SwarmAgentDef[] = [
      {
        config: {
          id: 'analyst',
          name: 'analyst',
          role: 'You are a precise technical analyst. Evaluate each claim independently against your knowledge. Flag anything suspicious. Emit discoveries for each evaluation.',
          personality: { curiosity: 0.6, caution: 0.7, conformity: 0.3, verbosity: 0.5 },
          listens: ['task:new', 'discovery', 'challenge'],
          canEmit: ['discovery', 'proposal', 'vote', 'challenge'],
          weight: 1,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'skeptic',
          name: 'skeptic',
          role: 'You are a professional skeptic. Your job is to CHALLENGE every claim. Look for subtle errors, misleading wording, and common misconceptions. Challenge other agents if you disagree.',
          personality: { curiosity: 0.5, caution: 0.9, conformity: 0.1, verbosity: 0.6 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'doubt', 'challenge', 'vote'],
          weight: 1.2,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'networking',
          name: 'networking',
          role: 'You are a networking protocols expert. You know TCP, UDP, HTTP, DNS inside out. Evaluate any networking-related claims with deep expertise. Challenge incorrect networking claims.',
          personality: { curiosity: 0.7, caution: 0.5, conformity: 0.4, verbosity: 0.5 },
          listens: ['task:new', 'discovery', 'challenge'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
          weight: 1.3,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'judge',
          name: 'judge',
          role: 'You synthesize the evaluations from all experts. Compile the final verdict on each claim. If there is disagreement, side with the domain expert. Propose the final answer listing TRUE/FALSE for each claim.',
          personality: { curiosity: 0.4, caution: 0.5, conformity: 0.6, verbosity: 0.7 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['proposal', 'vote'],
          weight: 1.5,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
    ]

    // Qdrant memory
    const qdrantUrl = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
    const memory = new QdrantVectorMemory(embedding, {
      url: qdrantUrl,
      collection: 'bench-adversarial',
    })

    const synthLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const orchestrator = new SwarmOrchestrator({
      agents,
      maxRounds: 5,
      maxSignals: 60,
      timeout: 90_000,
      consensus: {
        strategy: 'confidence-weighted',
        threshold: 0.5,
        conflictResolution: 'debate',
        maxDebateRounds: 3,
      },
      synthesizer: {
        llm: synthLlm,
        prompt: 'Synthesize all agent findings into a clear TRUE/FALSE evaluation for each claim. Include reasoning.',
      },
      memory,
      math: {
        entropyThreshold: 0.2,
        minInformationGain: 0.05,
        redundancyThreshold: 0.65,
      },
      advisor: {
        groupthinkCorrection: true,
        agentPruning: false,
        reputationWeighting: true,
        warmupRounds: 1,
        topology: {
          enabled: true,
          minConnectivity: 0.3,
          maxInfluenceConcentration: 0.6,
          pruneRedundantLinks: true,
          protectBridgingAgents: true,
        },
      },
    })

    const swarmStart = Date.now()
    const swarmResult = await orchestrator.solve(TASK_WITH_WRONG_INFO)
    const swarmDuration = Date.now() - swarmStart
    const swarmScore = scoreAnswer(swarmResult.answer)
    const swarmTokens = swarmLlm.tokensUsed + synthLlm.tokensUsed

    orchestrator.destroy()
    const memoriesStored = await memory.count()
    console.log(`  Memory: ${memoriesStored} discoveries stored in Qdrant`)

    // Report new features activity
    if (swarmResult.debateResults.length > 0) {
      for (const dr of swarmResult.debateResults) {
        console.log(`  Debate: resolved=${dr.resolved} winner=${dr.winningProposalId ?? 'none'} confidence=${dr.confidence.toFixed(3)} rounds=${dr.roundsUsed}`)
      }
    } else {
      console.log(`  Debate: no debates triggered (proposals agreed or <2 proposals)`)
    }
    if (swarmResult.advisorReport) {
      const rpt = swarmResult.advisorReport
      console.log(`  Advisor: groupthink=${rpt.groupthinkCorrections} disabled=[${rpt.disabledAgents.join(',')}] topology=${rpt.topologyUpdates} actions=${rpt.actions.length}`)
    }

    const swarmRun = {
      answer: swarmResult.answer,
      score: swarmScore,
      tokensUsed: swarmTokens,
      durationMs: swarmDuration,
      costUsd: estimateCost(swarmTokens),
      signalCount: swarmResult.signalLog.length,
      roundsUsed: swarmResult.timing.roundsUsed,
    }

    const baselineRun = {
      answer: baselineResponse.content,
      score: baselineScore,
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
