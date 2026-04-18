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

// Benchmark: Multi-Domain Architecture
//
// A HARD task that requires expertise in 6 domains simultaneously:
// security, scalability, GDPR compliance, cost optimization,
// developer experience, and failure recovery.
//
// Single model tends to go deep on 2-3 domains and miss the rest.
// Swarm should cover ALL domains via specialized agents.
//
// Metric: LLM judge counts how many domain-specific concerns
// are addressed with ACTIONABLE recommendations (not just mentioned).

const ARCHITECTURE_TASK = `
You are designing a real-time collaborative document editor (like Google Docs)
for a European healthcare company. The system must handle:

- 10,000 concurrent users editing documents simultaneously
- Documents contain sensitive patient health data (HIPAA + GDPR)
- Real-time collaboration with <100ms latency for character-by-character sync
- Offline mode with conflict resolution when reconnecting
- Audit trail of every edit for regulatory compliance
- Multi-region deployment (EU-West, EU-Central) with data residency requirements
- Integration with existing LDAP/Active Directory for authentication
- Document versioning with ability to restore any point in time
- End-to-end encryption where even the server cannot read document content
- Budget constraint: infrastructure cost must stay under $50k/month

Design the complete system architecture. For each component, explain:
1. Technology choice and WHY (not just what)
2. How it handles the constraints above
3. What trade-offs you're making
4. Failure modes and recovery strategies
5. How it interacts with other components

Be specific — name actual technologies, protocols, data structures.
Address ALL constraints, not just the ones you're most comfortable with.
`

/** Domains we expect comprehensive coverage of. */
const DOMAINS = [
  {
    name: 'real-time sync',
    keywords: ['crdt', 'ot', 'operational transform', 'websocket', 'conflict-free', 'yjs', 'automerge'],
  },
  {
    name: 'encryption',
    keywords: ['e2e', 'end-to-end', 'client-side encryption', 'key management', 'key rotation', 'envelope encryption', 'kms'],
  },
  {
    name: 'GDPR compliance',
    keywords: ['gdpr', 'data residency', 'right to erasure', 'dpo', 'data protection', 'consent', 'processing agreement', 'schrems'],
  },
  {
    name: 'HIPAA compliance',
    keywords: ['hipaa', 'baa', 'phi', 'audit log', 'access control', 'minimum necessary'],
  },
  {
    name: 'scalability',
    keywords: ['horizontal', 'sharding', 'partition', 'load balanc', 'auto-scal', 'cdn', 'caching'],
  },
  {
    name: 'offline mode',
    keywords: ['offline', 'service worker', 'local storage', 'indexeddb', 'sync queue', 'conflict resolution', 'merge'],
  },
  {
    name: 'authentication',
    keywords: ['ldap', 'active directory', 'saml', 'oidc', 'sso', 'oauth', 'jwt', 'mfa'],
  },
  {
    name: 'audit trail',
    keywords: ['audit', 'immutable log', 'append-only', 'tamper', 'event sourcing', 'changelog'],
  },
  {
    name: 'failure recovery',
    keywords: ['failover', 'disaster recovery', 'backup', 'rpo', 'rto', 'circuit breaker', 'retry', 'dead letter'],
  },
  {
    name: 'cost optimization',
    keywords: ['cost', 'budget', '$50k', 'reserved instance', 'spot', 'tiered storage', 'cold storage'],
  },
  {
    name: 'versioning',
    keywords: ['version', 'snapshot', 'point-in-time', 'restore', 'branching', 'history'],
  },
  {
    name: 'multi-region',
    keywords: ['multi-region', 'data residency', 'eu-west', 'eu-central', 'replication', 'geo'],
  },
]

/**
 * Score: count domains that have ACTIONABLE recommendations
 * (keyword + specific tech/protocol named).
 */
async function scoreDomainCoverage(
  llm: OpenAiLlmProvider,
  answer: string,
): Promise<{ score: number; domainsHit: string[]; domainsMissed: string[] }> {
  const response = await llm.completeJson<{
    domains: { name: string; covered: boolean; depth: 'shallow' | 'actionable' | 'deep' }[]
  }>(
    [
      {
        role: 'system',
        content: `You are an expert architecture reviewer. Evaluate the architecture proposal below.
For each of these ${DOMAINS.length} domains, determine if the answer provides ACTIONABLE recommendations (specific technologies, protocols, or approaches — not just mentioning the concern).

Domains to check: ${DOMAINS.map((d) => d.name).join(', ')}

Return JSON: {"domains": [{"name": "domain name", "covered": true/false, "depth": "shallow"|"actionable"|"deep"}]}
- "shallow" = mentioned but no specifics
- "actionable" = specific technology or approach recommended
- "deep" = detailed trade-off analysis with alternatives considered`,
      },
      { role: 'user', content: `Evaluate this architecture:\n\n${answer}` },
    ],
    { maxTokens: 1500 },
  )

  const domainsHit: string[] = []
  const domainsMissed: string[] = []

  for (const d of response.parsed.domains) {
    if (d.covered && d.depth !== 'shallow') {
      domainsHit.push(d.name)
    } else {
      domainsMissed.push(d.name)
    }
  }

  // Also do keyword-based fallback check
  const lower = answer.toLowerCase()
  for (const domain of DOMAINS) {
    const alreadyHit = domainsHit.includes(domain.name)
    if (!alreadyHit) {
      const keywordHits = domain.keywords.filter((k) => lower.includes(k))
      if (keywordHits.length >= 2) {
        domainsHit.push(domain.name)
        const idx = domainsMissed.indexOf(domain.name)
        if (idx >= 0) domainsMissed.splice(idx, 1)
      }
    }
  }

  return {
    score: domainsHit.length / DOMAINS.length,
    domainsHit,
    domainsMissed,
  }
}

function makeEngine(
  llm: OpenAiLlmProvider,
  embedding: OpenAiEmbeddingProvider,
): EngineConfig {
  return { llm, embedding, store: new InMemoryStore() }
}

export const architectureBenchmark: BenchmarkDef = {
  name: 'Multi-Domain Architecture',
  description:
    'Design healthcare collaborative editor covering 12 domain concerns. Swarm of 7 vs single model.',

  async run(apiKey: string): Promise<BenchmarkResult> {
    const baselineLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const baselineStart = Date.now()

    const baselineResponse = await baselineLlm.complete(
      [
        {
          role: 'system',
          content:
            'You are a senior systems architect with 20 years experience. Design comprehensive, production-ready architectures. Cover ALL requirements — security, scalability, compliance, cost, failure modes. Be specific about technologies.',
        },
        { role: 'user', content: ARCHITECTURE_TASK },
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
          id: 'security-arch',
          name: 'security-arch',
          role: 'You are a security architect specializing in encryption, key management, and zero-trust architectures. Focus on E2E encryption, key rotation, threat modeling. Challenge designs that have security gaps. Name specific protocols (AES-256-GCM, X25519, etc).',
          personality: { curiosity: 0.6, caution: 0.9, conformity: 0.2, verbosity: 0.6 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
          weight: 1.2,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'compliance',
          name: 'compliance',
          role: 'You are a GDPR/HIPAA compliance expert. Focus on data residency, audit trails, right to erasure, BAA requirements, consent management. Challenge any design that stores PHI improperly or violates data residency.',
          personality: { curiosity: 0.5, caution: 0.95, conformity: 0.3, verbosity: 0.7 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'challenge', 'vote', 'doubt'],
          weight: 1.3,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'distributed-sys',
          name: 'distributed-sys',
          role: 'You are a distributed systems engineer. Focus on CRDTs vs OT for real-time sync, multi-region replication, conflict resolution, offline mode, and sub-100ms latency. Name specific algorithms (Yjs, Automerge, vector clocks).',
          personality: { curiosity: 0.8, caution: 0.4, conformity: 0.3, verbosity: 0.6 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
          weight: 1.2,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'infra-cost',
          name: 'infra-cost',
          role: 'You are a cloud infrastructure and cost optimization expert. Focus on staying under $50k/month, choosing between managed vs self-hosted, reserved instances, auto-scaling policies, and multi-region deployment costs. Provide actual cost estimates.',
          personality: { curiosity: 0.6, caution: 0.7, conformity: 0.4, verbosity: 0.5 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
          weight: 1.0,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'reliability',
          name: 'reliability',
          role: 'You are an SRE/reliability engineer. Focus on failure modes, disaster recovery, RPO/RTO targets, circuit breakers, dead letter queues, health checks, and graceful degradation. Every component must have a failure plan.',
          personality: { curiosity: 0.5, caution: 0.85, conformity: 0.3, verbosity: 0.5 },
          listens: ['task:new', 'discovery', 'proposal', 'challenge'],
          canEmit: ['discovery', 'challenge', 'vote', 'doubt'],
          weight: 1.1,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'identity',
          name: 'identity',
          role: 'You are an identity and access management specialist. Focus on LDAP/AD integration, SSO (SAML/OIDC), MFA, session management, and role-based access control for healthcare. Ensure authentication meets compliance requirements.',
          personality: { curiosity: 0.6, caution: 0.7, conformity: 0.5, verbosity: 0.5 },
          listens: ['task:new', 'discovery', 'proposal'],
          canEmit: ['discovery', 'proposal', 'vote'],
          weight: 1.0,
        },
        engine: makeEngine(swarmLlm, embedding),
      },
      {
        config: {
          id: 'arch-lead',
          name: 'arch-lead',
          role: 'You are the lead architect. Synthesize all domain expert findings into a coherent architecture. Resolve conflicts between domains (e.g., E2E encryption vs audit requirements). Ensure the final design addresses ALL 12 requirements. Propose the integrated architecture.',
          personality: { curiosity: 0.7, caution: 0.5, conformity: 0.6, verbosity: 0.8 },
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
      collection: 'bench-architecture',
    })

    const synthLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const orchestrator = new SwarmOrchestrator({
      agents,
      maxRounds: 5,
      maxSignals: 100,
      timeout: 180_000,
      consensus: {
        strategy: 'confidence-weighted',
        threshold: 0.4,
        conflictResolution: 'debate',
        maxDebateRounds: 3,
      },
      synthesizer: {
        llm: synthLlm,
        prompt: `Compile ALL findings from the architecture experts into a comprehensive system design document.
Structure it by component. For EACH component include: technology choice, rationale, trade-offs, failure modes, and how it satisfies compliance.
Do NOT omit any expert's findings. Every domain concern must be addressed.`,
      },
      memory,
      math: {
        entropyThreshold: 0.15,
        minInformationGain: 0.02,
        redundancyThreshold: 0.7,
      },
      advisor: {
        groupthinkCorrection: true,
        agentPruning: true,
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
    const swarmResult = await orchestrator.solve(ARCHITECTURE_TASK)
    const swarmDuration = Date.now() - swarmStart
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
      console.log(`  Debate: no debates triggered`)
    }
    if (swarmResult.advisorReport) {
      const rpt = swarmResult.advisorReport
      console.log(`  Advisor: groupthink=${rpt.groupthinkCorrections} disabled=[${rpt.disabledAgents.join(',')}] topology=${rpt.topologyUpdates} actions=${rpt.actions.length}`)
    }

    // Judge both answers
    const judgeLlm = new OpenAiLlmProvider(apiKey, 'gpt-4o-mini')
    const swarmScore = await scoreDomainCoverage(judgeLlm, swarmResult.answer)
    const baselineScore = await scoreDomainCoverage(judgeLlm, baselineResponse.content)

    console.log(`  Swarm domains hit:   [${swarmScore.domainsHit.join(', ')}]`)
    console.log(`  Swarm domains missed: [${swarmScore.domainsMissed.join(', ')}]`)
    console.log(`  Base domains hit:    [${baselineScore.domainsHit.join(', ')}]`)
    console.log(`  Base domains missed:  [${baselineScore.domainsMissed.join(', ')}]`)

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
