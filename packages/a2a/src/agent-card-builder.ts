import type { AgentCard } from '@a2a-js/sdk'
import type { A2ASwarmServerConfig } from './types.js'

const DEFAULT_INPUT_MODES = ['text/plain']
const DEFAULT_OUTPUT_MODES = ['text/plain', 'application/json']

/**
 * Builds an A2A-compliant Agent Card from cognitive-swarm config.
 * The agent card is served at `/.well-known/agent-card.json`
 * and describes the swarm's identity, capabilities, and skills.
 */
export function buildAgentCard(config: A2ASwarmServerConfig): AgentCard {
  return {
    name: config.name,
    description: config.description,
    url: config.url,
    version: config.version ?? '1.0.0',
    protocolVersion: '0.2.2',
    provider: config.provider
      ? {
          organization: config.provider.organization,
          url: config.provider.url,
        }
      : undefined,
    capabilities: {
      streaming: config.streaming ?? true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: DEFAULT_INPUT_MODES,
    defaultOutputModes: DEFAULT_OUTPUT_MODES,
    skills: config.skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags ? [...s.tags] : [],
      examples: s.examples ? [...s.examples] : [],
      inputModes: DEFAULT_INPUT_MODES,
      outputModes: DEFAULT_OUTPUT_MODES,
    })),
  }
}
