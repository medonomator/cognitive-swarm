// Leverage Points — Meadows' 12 Places to Intervene in a System.
//
// Ranks swarm interventions by systemic impact (lower = stronger):
//   12. Constants, parameters (weakest)
//   11. Buffer sizes
//   10. Stock-and-flow structures
//    9. Delays
//    8. Balancing feedback loops
//    7. Reinforcing feedback loops
//    6. Information flows
//    5. Rules of the system
//    4. Self-organization (ability to change structure)
//    3. Goals of the system
//    2. Mindset/paradigm
//    1. Transcending paradigms (strongest)
//
// Applied to swarm: maps advisor actions to their leverage level
// so the advisor can prioritize high-leverage interventions.

/** Meadows leverage level (1 = strongest, 12 = weakest). */
export type LeverageLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** A classified intervention with its leverage level. */
export interface LeverageIntervention {
  /** What kind of intervention this is. */
  readonly action: string
  /** Meadows leverage level. */
  readonly level: LeverageLevel
  /** Human-readable description of why this level applies. */
  readonly rationale: string
  /** Category name from Meadows. */
  readonly category: string
}

/** Maps action types to their Meadows leverage level. */
const LEVERAGE_MAP: Record<string, { level: LeverageLevel; category: string; rationale: string }> = {
  // Level 12: Constants, parameters — least leverage
  'adjust-threshold': {
    level: 12,
    category: 'Constants & parameters',
    rationale: 'Changing a numerical threshold (entropy, confidence). Easy but rarely transformative.',
  },
  'adjust-weight': {
    level: 12,
    category: 'Constants & parameters',
    rationale: 'Tweaking vote weights or attention multipliers. Parametric change.',
  },

  // Level 11: Buffer sizes
  'adjust-rounds': {
    level: 11,
    category: 'Buffer sizes',
    rationale: 'Changing maxRounds or evaluation window. Alters system inertia.',
  },

  // Level 10: Stock-and-flow structures
  'add-agent': {
    level: 10,
    category: 'Stock-and-flow structures',
    rationale: 'Adding an agent changes the physical structure of information flow.',
  },
  'remove-agent': {
    level: 10,
    category: 'Stock-and-flow structures',
    rationale: 'Removing an agent changes the physical structure.',
  },

  // Level 9: Delays
  'add-cooldown': {
    level: 9,
    category: 'Delays',
    rationale: 'Cooldown periods delay when actions can repeat. Critical for stability.',
  },

  // Level 8: Balancing feedback loops
  'inject-doubt': {
    level: 8,
    category: 'Balancing feedback loops',
    rationale: 'Doubt signals are negative feedback against premature consensus.',
  },
  'inject-challenge': {
    level: 8,
    category: 'Balancing feedback loops',
    rationale: 'Challenges balance reinforcing agreement loops.',
  },

  // Level 7: Reinforcing feedback loops
  'reputation-boost': {
    level: 7,
    category: 'Reinforcing feedback loops',
    rationale: 'Reputation amplifies successful agents — positive feedback loop.',
  },

  // Level 6: Information flows
  'update-topology': {
    level: 6,
    category: 'Information flows',
    rationale: 'Changing who sees whom fundamentally alters information access.',
  },
  'inject-discovery': {
    level: 6,
    category: 'Information flows',
    rationale: 'Introducing new information changes what agents can reason about.',
  },

  // Level 5: Rules of the system
  'enforce-diversity': {
    level: 5,
    category: 'Rules of the system',
    rationale: 'Requiring signal diversity constrains agent behavior at the rule level.',
  },
  'prune-redundant': {
    level: 5,
    category: 'Rules of the system',
    rationale: 'Pruning rules determine which agents survive — system selection pressure.',
  },

  // Level 4: Self-organization
  'evolve-agent': {
    level: 4,
    category: 'Self-organization',
    rationale: 'Spawning new agent types — the system changes its own structure.',
  },
  'restructure-task': {
    level: 4,
    category: 'Self-organization',
    rationale: 'Decomposing the task differently — system restructures itself.',
  },

  // Level 3: Goals of the system
  'reframe-problem': {
    level: 3,
    category: 'Goals of the system',
    rationale: 'Changing what the swarm is trying to achieve. Rare but powerful.',
  },

  // Level 2: Mindset/paradigm
  'change-personality': {
    level: 2,
    category: 'Mindset/paradigm',
    rationale: 'Changing agent personality shifts fundamental reasoning approach.',
  },
}

/**
 * Classify an intervention by its Meadows leverage level.
 *
 * @param action - The action type (e.g. 'inject-doubt', 'update-topology')
 * @returns Classified intervention, or a default level-12 classification for unknown actions
 */
export function classifyLeverage(action: string): LeverageIntervention {
  const entry = LEVERAGE_MAP[action]
  if (entry) {
    return {
      action,
      level: entry.level,
      rationale: entry.rationale,
      category: entry.category,
    }
  }

  // Unknown actions default to level 12 (weakest)
  return {
    action,
    level: 12,
    category: 'Constants & parameters',
    rationale: `Unknown action "${action}" — defaulting to lowest leverage.`,
  }
}

/**
 * Rank a set of interventions by leverage (strongest first).
 *
 * Lower level = stronger leverage = higher priority.
 */
export function rankByLeverage(actions: readonly string[]): readonly LeverageIntervention[] {
  return actions
    .map(classifyLeverage)
    .sort((a, b) => a.level - b.level)
}

/**
 * Get the leverage category name for a given level.
 */
export function leverageCategoryName(level: LeverageLevel): string {
  const names: Record<LeverageLevel, string> = {
    1: 'Transcending paradigms',
    2: 'Mindset/paradigm',
    3: 'Goals of the system',
    4: 'Self-organization',
    5: 'Rules of the system',
    6: 'Information flows',
    7: 'Reinforcing feedback loops',
    8: 'Balancing feedback loops',
    9: 'Delays',
    10: 'Stock-and-flow structures',
    11: 'Buffer sizes',
    12: 'Constants & parameters',
  }
  return names[level]
}
