import type { SwarmConfig } from '@cognitive-swarm/core'
import type { TemplateProviders } from './shared.js'
import { agentDef } from './shared.js'

/**
 * Creates a swarm config for research tasks with 5 agents:
 * - Explorer A & B: generate diverse hypotheses and discoveries
 * - Fact checker: validates claims and evidence
 * - Critic: challenges assumptions and identifies gaps
 * - Synthesizer: combines findings into a coherent answer
 */
export function researchTemplate(
  providers: TemplateProviders,
): SwarmConfig {
  return {
    agents: [
      agentDef(
        {
          id: 'explorer-a',
          name: 'Explorer Alpha',
          role: 'Generate hypotheses and discover relevant facts. Take creative, divergent approaches to the problem.',
          personality: 'creative',
          listens: ['task:new', 'discovery', 'challenge'],
          canEmit: ['discovery', 'proposal'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'explorer-b',
          name: 'Explorer Beta',
          role: 'Generate hypotheses from alternative angles. Explore unconventional interpretations and edge cases.',
          personality: 'bold',
          listens: ['task:new', 'discovery', 'challenge'],
          canEmit: ['discovery', 'proposal'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'fact-checker',
          name: 'Fact Checker',
          role: 'Verify claims, check for logical consistency, identify unsupported assertions, and rate evidence quality.',
          personality: 'cautious',
          listens: ['discovery', 'proposal'],
          canEmit: ['discovery', 'doubt', 'vote'],
          weight: 1.3,
        },
        providers,
      ),
      agentDef(
        {
          id: 'critic',
          name: 'Research Critic',
          role: 'Challenge assumptions, identify methodological flaws, point out missing evidence, and play devil\'s advocate.',
          personality: 'critical',
          listens: ['discovery', 'proposal'],
          canEmit: ['challenge', 'doubt', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'synthesizer',
          name: 'Research Synthesizer',
          role: 'Combine all discoveries into a comprehensive, well-structured answer with clear confidence levels.',
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
      threshold: 0.65,
      minVoters: 3,
    },
    maxRounds: 6,
    math: {
      entropyThreshold: 0.4,
      minInformationGain: 0.03,
      redundancyThreshold: 0.6,
    },
  }
}
