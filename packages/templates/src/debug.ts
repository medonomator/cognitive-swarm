import type { SwarmConfig } from '@cognitive-swarm/core'
import type { TemplateProviders } from './shared.js'
import { agentDef } from './shared.js'

/**
 * Creates a swarm config for debugging with 7 agents:
 * - Reproducer: understands the bug and reproduction steps
 * - Log analyzer: examines logs, stack traces, and error messages
 * - Hypothesis A & B: generate possible root causes
 * - Verifier: tests hypotheses against known facts
 * - Fixer: proposes concrete fixes
 * - Reviewer: validates proposed fixes for correctness and side effects
 */
export function debugTemplate(
  providers: TemplateProviders,
): SwarmConfig {
  return {
    agents: [
      agentDef(
        {
          id: 'reproducer',
          name: 'Bug Reproducer',
          role: 'Understand the bug report, identify reproduction steps, isolate the minimal failing case, and clarify symptoms.',
          personality: 'analytical',
          listens: ['task:new'],
          canEmit: ['discovery'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'log-analyzer',
          name: 'Log Analyzer',
          role: 'Examine error messages, stack traces, logs, and timing data to extract factual clues about the root cause.',
          personality: 'analytical',
          listens: ['task:new', 'discovery'],
          canEmit: ['discovery'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'hypothesis-a',
          name: 'Hypothesis Generator Alpha',
          role: 'Generate possible root causes based on discoveries. Consider common failure patterns and known pitfalls.',
          personality: 'creative',
          listens: ['discovery'],
          canEmit: ['proposal', 'discovery'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'hypothesis-b',
          name: 'Hypothesis Generator Beta',
          role: 'Generate alternative root causes. Focus on less obvious causes: race conditions, state corruption, environment issues.',
          personality: 'bold',
          listens: ['discovery', 'challenge'],
          canEmit: ['proposal', 'discovery'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'verifier',
          name: 'Hypothesis Verifier',
          role: 'Test each hypothesis against known facts. Identify which hypotheses are consistent with all evidence and which are ruled out.',
          personality: 'critical',
          listens: ['discovery', 'proposal'],
          canEmit: ['vote', 'challenge', 'doubt'],
          weight: 1.3,
        },
        providers,
      ),
      agentDef(
        {
          id: 'fixer',
          name: 'Fix Proposer',
          role: 'Propose concrete, minimal fixes for the most likely root cause. Include code changes, config updates, or workarounds.',
          personality: 'balanced',
          listens: ['proposal', 'vote', 'discovery'],
          canEmit: ['proposal', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'reviewer',
          name: 'Fix Reviewer',
          role: 'Validate proposed fixes for correctness, side effects, regressions, and completeness. Ensure the fix addresses the root cause.',
          personality: 'cautious',
          listens: ['proposal'],
          canEmit: ['vote', 'challenge', 'doubt'],
          weight: 1.5,
        },
        providers,
      ),
    ],
    consensus: {
      strategy: 'confidence-weighted',
      threshold: 0.7,
      minVoters: 3,
    },
    maxRounds: 8,
    math: {
      entropyThreshold: 0.15,
      minInformationGain: 0.06,
      redundancyThreshold: 0.75,
    },
  }
}
