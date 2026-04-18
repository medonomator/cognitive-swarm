import type { PersonalityVector, Signal } from '@cognitive-swarm/core'

/**
 * Filters signal reactions based on personality traits.
 * Personality modulates which signals the agent pays attention to.
 */
export class PersonalityFilter {
  private readonly personality: PersonalityVector

  constructor(personality: PersonalityVector) {
    this.personality = personality
  }

  /**
   * Determine if the agent should react to this signal
   * based on personality traits.
   *
   * - High caution -> skip low-confidence signals
   * - Low conformity -> more interested in challenges/doubts
   * - High curiosity -> eager to react to discoveries
   */
  shouldReact(signal: Signal): boolean {
    if (
      this.personality.caution > 0.7 &&
      signal.confidence < 0.4
    ) {
      return false
    }

    if (
      signal.type === 'challenge' ||
      signal.type === 'doubt'
    ) {
      return this.personality.conformity < 0.8
    }

    if (signal.type === 'discovery') {
      return this.personality.curiosity > 0.3
    }

    return true
  }
}
