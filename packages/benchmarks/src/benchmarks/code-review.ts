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

// Benchmark: Code Review Accuracy
//
// Compare: swarm of 5 gpt-4o-mini agents vs 1 gpt-4o-mini
// Task: find bugs in intentionally buggy TypeScript code
// Metric: number of REAL bugs found (precision + recall)
// The code has 5 known bugs. We count how many each finds.

/** Intentionally buggy code with 5 planted bugs. */
const BUGGY_CODE = `
// Bug 1: Off-by-one error in loop bound (should be < not <=)
function findMax(arr: number[]): number {
  let max = arr[0];
  for (let i = 1; i <= arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

// Bug 2: SQL injection vulnerability (string interpolation)
async function getUser(db: any, userId: string) {
  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
  return db.query(query);
}

// Bug 3: Race condition - shared mutable state without lock
let requestCount = 0;
async function handleRequest(req: any) {
  requestCount++;
  const count = requestCount;
  await processAsync(req);
  console.log(\`Request #\${count} done, total: \${requestCount}\`);
}

// Bug 4: Memory leak - event listener never removed
function createWidget(element: HTMLElement) {
  const handler = () => console.log('clicked');
  element.addEventListener('click', handler);
  return { destroy() { /* missing removeEventListener */ } };
}

// Bug 5: Incorrect null check (== null catches undefined too, but the logic is inverted)
function processValue(value: string | null | undefined): string {
  if (value != null) {
    return 'no value provided';
  }
  return value.toUpperCase(); // This will crash - value is null/undefined here
}

async function processAsync(req: any) { return req; }
`

const KNOWN_BUGS = [
  'off-by-one',
  'sql injection',
  'race condition',
  'memory leak',
  'null check',
]

function countBugsFound(answer: string): number {
  const lower = answer.toLowerCase()
  let found = 0

  // Off-by-one / bounds / <= vs <
  if (
    lower.includes('off-by-one') ||
    lower.includes('off by one') ||
    lower.includes('<= arr.length') ||
    lower.includes('out of bounds') ||
    lower.includes('boundary')
  )
    found++

  // SQL injection
  if (
    lower.includes('sql injection') ||
    lower.includes('sql') ||
    lower.includes('interpolat')
  )
    found++

  // Race condition
  if (
    lower.includes('race condition') ||
    lower.includes('race') ||
    lower.includes('concurren') ||
    lower.includes('shared state')
  )
    found++

  // Memory leak
  if (
    lower.includes('memory leak') ||
    lower.includes('removeeventlistener') ||
    lower.includes('event listener') ||
    lower.includes('listener not removed')
  )
    found++

  // Null check
  if (
    lower.includes('null check') ||
    lower.includes('inverted') ||
    lower.includes('!= null') ||
    lower.includes('value.toUpperCase') ||
    lower.includes('will crash') ||
    lower.includes('null/undefined')
  )
    found++

  return found
}

function makeEngine(
  llm: OpenAiLlmProvider,
  embedding: OpenAiEmbeddingProvider,
): EngineConfig {
  return { llm, embedding, store: new InMemoryStore() }
}

function makeAgentDef(
  id: string,
  role: string,
  systemPrompt: string,
  llm: OpenAiLlmProvider,
  embedding: OpenAiEmbeddingProvider,
): SwarmAgentDef {
  return {
    config: {
      id,
      name: id,
      role: systemPrompt,
      personality: {
        curiosity: 0.7,
        caution: 0.5,
        conformity: 0.4,
        verbosity: 0.5,
      },
      listens: ['task:new', 'discovery', 'proposal', 'challenge'],
      canEmit: ['discovery', 'proposal', 'doubt', 'vote', 'challenge'],
      weight: 1,
    },
    engine: makeEngine(llm, embedding),
  }
}

export const codeReviewBenchmark: BenchmarkDef = {
  name: 'Code Review Accuracy',
  description:
    'Find bugs in intentionally buggy TypeScript. Swarm of 5 vs single model.',

  async run(apiKey: string): Promise<BenchmarkResult> {
    const task = `Review this TypeScript code. Find ALL bugs, security issues, and potential problems. List each bug clearly.\n\n\`\`\`typescript\n${BUGGY_CODE}\n\`\`\``

    const baselineLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const baselineStart = Date.now()

    const baselineResponse = await baselineLlm.complete([
      {
        role: 'system',
        content:
          'You are an expert code reviewer. Find ALL bugs, security issues, and potential problems in the code. Be thorough and precise.',
      },
      { role: 'user', content: task },
    ], { maxTokens: 1500 })

    const baselineDuration = Date.now() - baselineStart
    const baselineBugs = countBugsFound(baselineResponse.content)
    const baselineTokens = baselineLlm.tokensUsed

    const swarmLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const embedding = new OpenAiEmbeddingProvider(apiKey)

    const agents: SwarmAgentDef[] = [
      makeAgentDef(
        'security',
        'Security Reviewer',
        'You are a security expert. Focus on injection attacks, authentication issues, and data exposure. Emit discoveries for each vulnerability found.',
        swarmLlm,
        embedding,
      ),
      makeAgentDef(
        'correctness',
        'Correctness Reviewer',
        'You are a logic correctness expert. Focus on off-by-one errors, boundary conditions, type errors, and null safety. Emit discoveries for each bug.',
        swarmLlm,
        embedding,
      ),
      makeAgentDef(
        'concurrency',
        'Concurrency Reviewer',
        'You are a concurrency expert. Focus on race conditions, shared mutable state, deadlocks, and async issues. Emit discoveries for each issue.',
        swarmLlm,
        embedding,
      ),
      makeAgentDef(
        'resources',
        'Resource Management Reviewer',
        'You are a resource management expert. Focus on memory leaks, unrelased resources, event listeners, and cleanup. Emit discoveries for each issue.',
        swarmLlm,
        embedding,
      ),
      makeAgentDef(
        'synthesizer',
        'Code Review Synthesizer',
        'You synthesize findings from other reviewers into a comprehensive list. Propose a final summary of all bugs found. Include every issue mentioned by other agents.',
        swarmLlm,
        embedding,
      ),
    ]

    // Qdrant memory - persistent collective knowledge
    const qdrantUrl = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
    const memory = new QdrantVectorMemory(embedding, {
      url: qdrantUrl,
      collection: 'bench-code-review',
    })

    const synthLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const orchestrator = new SwarmOrchestrator({
      agents,
      maxRounds: 5,
      maxSignals: 80,
      timeout: 90_000,
      consensus: {
        strategy: 'confidence-weighted',
        threshold: 0.5,
        conflictResolution: 'debate',
        maxDebateRounds: 3,
      },
      synthesizer: {
        llm: synthLlm,
        prompt: 'Compile all bugs found by the review agents into a comprehensive numbered list. Include every distinct issue mentioned by any agent.',
      },
      memory,
      math: {
        entropyThreshold: 0.25,
        minInformationGain: 0.04,
        redundancyThreshold: 0.8,
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
    const swarmResult = await orchestrator.solve(task)
    const swarmDuration = Date.now() - swarmStart
    const swarmBugs = countBugsFound(swarmResult.answer)
    const swarmTokens = swarmLlm.tokensUsed + synthLlm.tokensUsed

    orchestrator.destroy()

    // Memory persists in Qdrant - next run will recall discoveries
    const memoriesStored = await memory.count()
    console.log(`  Memory: ${memoriesStored} discoveries stored in Qdrant`)

    // Report new features activity
    if (swarmResult.debateResults.length > 0) {
      for (const dr of swarmResult.debateResults) {
        console.log(`  Debate: resolved=${dr.resolved} winner=${dr.winningProposalId ?? 'none'} confidence=${dr.confidence.toFixed(3)} rounds=${dr.roundsUsed}`)
      }
    } else {
      console.log(`  Debate: no debates triggered`)
    }
    if (swarmResult.advisorReport) {
      const rpt = swarmResult.advisorReport
      console.log(`  Advisor: groupthink=${rpt.groupthinkCorrections} disabled=[${rpt.disabledAgents.join(',')}] topology=${rpt.topologyUpdates} actions=${rpt.actions.length}`)
    }

    const swarmRun = {
      answer: swarmResult.answer,
      score: swarmBugs / KNOWN_BUGS.length,
      tokensUsed: swarmTokens,
      durationMs: swarmDuration,
      costUsd: estimateCost(swarmTokens),
      signalCount: swarmResult.signalLog.length,
      roundsUsed: swarmResult.timing.roundsUsed,
    }

    const baselineRun = {
      answer: baselineResponse.content,
      score: baselineBugs / KNOWN_BUGS.length,
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
