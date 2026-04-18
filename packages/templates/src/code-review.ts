import type { SwarmConfig } from '@cognitive-swarm/core'
import type { TemplateProviders } from './shared.js'
import { agentDef } from './shared.js'

/**
 * Creates a swarm config for code review with 5 specialized agents:
 * - Security analyst: finds vulnerabilities
 * - Performance reviewer: spots bottlenecks
 * - Architecture critic: evaluates design patterns
 * - Edge-case hunter: finds boundary conditions and error paths
 * - Synthesis judge: consolidates findings into final review
 */
export function codeReviewTemplate(
  providers: TemplateProviders,
): SwarmConfig {
  return {
    agents: [
      agentDef(
        {
          id: 'security',
          name: 'Security Analyst',
          role: 'Identify security vulnerabilities, injection risks, auth issues, data exposure, and OWASP Top 10 violations.',
          personality: 'critical',
          listens: ['task:new', 'discovery', 'proposal'],
          canEmit: ['discovery', 'challenge', 'vote'],
          weight: 1.2,
        },
        providers,
      ),
      agentDef(
        {
          id: 'performance',
          name: 'Performance Reviewer',
          role: 'Spot performance bottlenecks, memory leaks, N+1 queries, unnecessary allocations, and scalability concerns.',
          personality: 'analytical',
          listens: ['task:new', 'discovery', 'proposal'],
          canEmit: ['discovery', 'challenge', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'architecture',
          name: 'Architecture Critic',
          role: 'Evaluate design patterns, SOLID violations, coupling, cohesion, abstractions, and maintainability.',
          personality: 'analytical',
          listens: ['task:new', 'discovery', 'proposal'],
          canEmit: ['discovery', 'proposal', 'challenge', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'edge-cases',
          name: 'Edge-Case Hunter',
          role: 'Find boundary conditions, error paths, race conditions, null cases, and missing validation.',
          personality: 'cautious',
          listens: ['task:new', 'discovery'],
          canEmit: ['discovery', 'doubt', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'synthesizer',
          name: 'Review Synthesizer',
          role: 'Consolidate all findings into a prioritized, actionable code review with clear severity ratings.',
          personality: 'balanced',
          listens: ['task:new', 'discovery', 'challenge', 'doubt'],
          canEmit: ['proposal', 'vote'],
          weight: 1.5,
        },
        providers,
      ),
    ],
    consensus: {
      strategy: 'confidence-weighted',
      threshold: 0.6,
      minVoters: 3,
    },
    maxRounds: 5,
    math: {
      entropyThreshold: 0.25,
      minInformationGain: 0.04,
      redundancyThreshold: 0.8,
    },
  }
}
