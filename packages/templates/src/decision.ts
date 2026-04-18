import type { SwarmConfig } from '@cognitive-swarm/core'
import type { TemplateProviders } from './shared.js'
import { agentDef } from './shared.js'

/**
 * Creates a swarm config for decision-making with 6 agents:
 * - Pros advocate: finds benefits and opportunities
 * - Cons advocate: finds drawbacks and costs
 * - Risk assessor: evaluates risks and worst-case scenarios
 * - Opportunity spotter: identifies hidden advantages
 * - Devil's advocate: challenges the emerging consensus
 * - Judge: weighs all arguments and proposes a decision
 */
export function decisionTemplate(
  providers: TemplateProviders,
): SwarmConfig {
  return {
    agents: [
      agentDef(
        {
          id: 'pros',
          name: 'Pros Advocate',
          role: 'Identify benefits, advantages, and positive outcomes. Build the strongest case FOR the proposal.',
          personality: 'supportive',
          listens: ['task:new', 'discovery', 'challenge'],
          canEmit: ['discovery', 'proposal', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'cons',
          name: 'Cons Advocate',
          role: 'Identify drawbacks, costs, and negative outcomes. Build the strongest case AGAINST the proposal.',
          personality: 'critical',
          listens: ['task:new', 'discovery', 'proposal'],
          canEmit: ['discovery', 'challenge', 'doubt', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'risks',
          name: 'Risk Assessor',
          role: 'Evaluate risks, worst-case scenarios, failure modes, and mitigation strategies. Quantify uncertainty.',
          personality: 'cautious',
          listens: ['task:new', 'discovery', 'proposal'],
          canEmit: ['discovery', 'doubt', 'vote'],
          weight: 1.2,
        },
        providers,
      ),
      agentDef(
        {
          id: 'opportunities',
          name: 'Opportunity Spotter',
          role: 'Find hidden advantages, synergies, second-order effects, and long-term strategic value.',
          personality: 'creative',
          listens: ['task:new', 'discovery'],
          canEmit: ['discovery', 'proposal', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'devils-advocate',
          name: "Devil's Advocate",
          role: 'Challenge the emerging consensus. If the group leans YES, argue NO — and vice versa. Stress-test logic.',
          personality: 'bold',
          listens: ['proposal', 'vote', 'discovery'],
          canEmit: ['challenge', 'doubt', 'vote'],
        },
        providers,
      ),
      agentDef(
        {
          id: 'judge',
          name: 'Decision Judge',
          role: 'Weigh all arguments, assess the balance of evidence, and propose a final decision with clear reasoning.',
          personality: 'balanced',
          listens: ['task:new', 'discovery', 'challenge', 'doubt', 'proposal'],
          canEmit: ['proposal', 'vote'],
          weight: 2.0,
        },
        providers,
      ),
    ],
    consensus: {
      strategy: 'hierarchical',
      threshold: 0.7,
      minVoters: 4,
    },
    maxRounds: 6,
    math: {
      entropyThreshold: 0.2,
      minInformationGain: 0.05,
      redundancyThreshold: 0.65,
    },
  }
}
