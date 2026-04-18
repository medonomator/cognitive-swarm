import type {
  PersonalityVector,
  SwarmAgentConfig,
  SwarmAgentDef,
  SignalType,
} from '@cognitive-swarm/core'
import type { EngineConfig } from '@cognitive-engine/core'

/** Minimal engine dependencies that templates need from the user. */
export interface TemplateProviders {
  readonly engine: EngineConfig
}

/** Predefined personality vectors for common agent archetypes. */
export const PERSONALITIES = {
  analytical: {
    curiosity: 0.8,
    caution: 0.6,
    conformity: 0.4,
    verbosity: 0.5,
  },
  creative: {
    curiosity: 0.9,
    caution: 0.2,
    conformity: 0.2,
    verbosity: 0.7,
  },
  critical: {
    curiosity: 0.6,
    caution: 0.9,
    conformity: 0.3,
    verbosity: 0.6,
  },
  supportive: {
    curiosity: 0.4,
    caution: 0.3,
    conformity: 0.8,
    verbosity: 0.4,
  },
  balanced: {
    curiosity: 0.5,
    caution: 0.5,
    conformity: 0.5,
    verbosity: 0.5,
  },
  bold: {
    curiosity: 0.7,
    caution: 0.1,
    conformity: 0.2,
    verbosity: 0.8,
  },
  cautious: {
    curiosity: 0.3,
    caution: 0.9,
    conformity: 0.7,
    verbosity: 0.3,
  },
} as const satisfies Record<string, PersonalityVector>

export type PersonalityPreset = keyof typeof PERSONALITIES

/** Options for creating a single agent definition. */
export interface AgentDefOptions {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly personality: PersonalityPreset | PersonalityVector
  readonly listens: readonly SignalType[]
  readonly canEmit: readonly SignalType[]
  readonly weight?: number
}

/**
 * Creates a SwarmAgentDef from concise options + shared engine config.
 * Templates use this internally to keep definitions clean.
 */
export function agentDef(
  options: AgentDefOptions,
  providers: TemplateProviders,
): SwarmAgentDef {
  const personality =
    typeof options.personality === 'string'
      ? PERSONALITIES[options.personality]
      : options.personality

  const config: SwarmAgentConfig = {
    id: options.id,
    name: options.name,
    role: options.role,
    personality,
    listens: options.listens,
    canEmit: options.canEmit,
    weight: options.weight,
  }

  return { config, engine: providers.engine }
}
