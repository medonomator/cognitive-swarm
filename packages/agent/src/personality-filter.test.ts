import { describe, it, expect } from 'vitest'
import type { Signal, PersonalityVector } from '@cognitive-swarm/core'
import { PersonalityFilter } from './personality-filter.js'

function makeSignal(
  overrides: Partial<Signal> = {},
): Signal {
  return {
    id: 'sig-1',
    type: 'discovery',
    source: 'other-agent',
    payload: { finding: 'test', relevance: 0.5 },
    confidence: 0.8,
    timestamp: Date.now(),
    ...overrides,
  }
}

const BOLD_CURIOUS: PersonalityVector = {
  curiosity: 0.9,
  caution: 0.2,
  conformity: 0.3,
  verbosity: 0.5,
}

const CAUTIOUS_CONFORMIST: PersonalityVector = {
  curiosity: 0.3,
  caution: 0.9,
  conformity: 0.9,
  verbosity: 0.5,
}

const BALANCED: PersonalityVector = {
  curiosity: 0.5,
  caution: 0.5,
  conformity: 0.5,
  verbosity: 0.5,
}

describe('PersonalityFilter', () => {
  it('cautious agent rejects low-confidence signals', () => {
    const filter = new PersonalityFilter(CAUTIOUS_CONFORMIST)
    const signal = makeSignal({ confidence: 0.2 })

    expect(filter.shouldReact(signal)).toBe(false)
  })

  it('bold agent accepts low-confidence signals', () => {
    const filter = new PersonalityFilter(BOLD_CURIOUS)
    const signal = makeSignal({ confidence: 0.2 })

    expect(filter.shouldReact(signal)).toBe(true)
  })

  it('conformist agent ignores challenges', () => {
    const filter = new PersonalityFilter(CAUTIOUS_CONFORMIST)
    const signal = makeSignal({
      type: 'challenge',
      payload: {
        targetSignalId: 'x',
        counterArgument: 'nope',
      },
    })

    expect(filter.shouldReact(signal)).toBe(false)
  })

  it('non-conformist agent reacts to challenges', () => {
    const filter = new PersonalityFilter(BOLD_CURIOUS)
    const signal = makeSignal({
      type: 'challenge',
      payload: {
        targetSignalId: 'x',
        counterArgument: 'nope',
      },
    })

    expect(filter.shouldReact(signal)).toBe(true)
  })

  it('curious agent reacts to discoveries', () => {
    const filter = new PersonalityFilter(BOLD_CURIOUS)
    const signal = makeSignal({ type: 'discovery' })

    expect(filter.shouldReact(signal)).toBe(true)
  })

  it('incurious agent skips discoveries', () => {
    const filter = new PersonalityFilter({
      curiosity: 0.1,
      caution: 0.5,
      conformity: 0.5,
      verbosity: 0.5,
    })
    const signal = makeSignal({ type: 'discovery' })

    expect(filter.shouldReact(signal)).toBe(false)
  })

  it('balanced agent reacts to normal signals', () => {
    const filter = new PersonalityFilter(BALANCED)
    const signal = makeSignal({ type: 'proposal' })

    expect(filter.shouldReact(signal)).toBe(true)
  })

  it('conformist ignores doubts', () => {
    const filter = new PersonalityFilter(CAUTIOUS_CONFORMIST)
    const signal = makeSignal({
      type: 'doubt',
      payload: {
        targetSignalId: 'x',
        concern: 'hmm',
        severity: 'medium',
      },
    })

    expect(filter.shouldReact(signal)).toBe(false)
  })
})
