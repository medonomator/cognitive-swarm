import { describe, it, expect } from 'vitest'
import { AgreeChallenge } from './game-theory.js'

describe('AgreeChallenge', () => {
  it('agent with high belief agrees', () => {
    const game = new AgreeChallenge()
    const decision = game.decide({
      belief: 0.95,
      groupConsensus: 0.5,
      reputationStake: 1.0,
    })

    expect(decision.action).toBe('agree')
    expect(decision.agreeEV).toBeGreaterThan(decision.challengeEV)
    expect(decision.margin).toBeLessThan(0)
  })

  it('agent with low belief challenges', () => {
    const game = new AgreeChallenge()
    const decision = game.decide({
      belief: 0.1,
      groupConsensus: 0.5,
      reputationStake: 1.0,
    })

    expect(decision.action).toBe('challenge')
    expect(decision.challengeEV).toBeGreaterThan(decision.agreeEV)
    expect(decision.margin).toBeGreaterThan(0)
  })

  it('high group consensus makes challenging more attractive', () => {
    const game = new AgreeChallenge()

    // Same belief, different consensus levels
    const lowConsensus = game.decide({
      belief: 0.5,
      groupConsensus: 0.2,
      reputationStake: 1.0,
    })
    const highConsensus = game.decide({
      belief: 0.5,
      groupConsensus: 0.9,
      reputationStake: 1.0,
    })

    // Higher consensus -> higher challenge EV (hero bonus amplified)
    expect(highConsensus.challengeEV).toBeGreaterThan(
      lowConsensus.challengeEV,
    )
  })

  it('devil\'s advocate emerges with unanimous consensus', () => {
    const game = new AgreeChallenge()
    // Agent is moderately confident (0.6) but group is at 95% consensus
    const decision = game.decide({
      belief: 0.6,
      groupConsensus: 0.95,
      reputationStake: 1.0,
    })

    // The amplified hero bonus should make challenging attractive
    // even when agent is more confident than not
    expect(decision.challengeEV).toBeGreaterThan(0)
  })

  it('criticalBelief increases with group consensus', () => {
    const game = new AgreeChallenge()

    const bStarLow = game.criticalBelief(0.1)
    const bStarHigh = game.criticalBelief(0.9)

    // Higher consensus -> higher critical threshold ->
    // agents need MORE confidence to justify agreeing
    expect(bStarHigh).toBeGreaterThan(bStarLow)
  })

  it('criticalBelief is between 0 and 1', () => {
    const game = new AgreeChallenge()

    for (let g = 0; g <= 1; g += 0.1) {
      const bStar = game.criticalBelief(g)
      expect(bStar).toBeGreaterThan(0)
      expect(bStar).toBeLessThan(1)
    }
  })

  it('challengeProbability is 1 when belief < b*', () => {
    const game = new AgreeChallenge()
    const bStar = game.criticalBelief(0.5)

    const decision = game.decide({
      belief: bStar - 0.1,
      groupConsensus: 0.5,
      reputationStake: 1.0,
    })

    expect(decision.challengeProbability).toBe(1.0)
  })

  it('challengeProbability is 0 when belief > b*', () => {
    const game = new AgreeChallenge()
    const bStar = game.criticalBelief(0.5)

    const decision = game.decide({
      belief: bStar + 0.1,
      groupConsensus: 0.5,
      reputationStake: 1.0,
    })

    expect(decision.challengeProbability).toBe(0.0)
  })

  it('higher reputation stake increases disruption cost', () => {
    const game = new AgreeChallenge()

    const lowStake = game.decide({
      belief: 0.5,
      groupConsensus: 0.5,
      reputationStake: 0.1,
    })
    const highStake = game.decide({
      belief: 0.5,
      groupConsensus: 0.5,
      reputationStake: 5.0,
    })

    // Higher stake -> lower challenge EV (more to lose)
    expect(highStake.challengeEV).toBeLessThan(lowStake.challengeEV)
  })

  it('expectedChallengers counts agents who would challenge', () => {
    const game = new AgreeChallenge()

    // 5 agents with varying beliefs, high consensus
    const beliefs = [0.9, 0.8, 0.3, 0.2, 0.1]
    const challengers = game.expectedChallengers(beliefs, 0.8)

    // Low-belief agents should challenge
    expect(challengers).toBeGreaterThanOrEqual(2)
    expect(challengers).toBeLessThanOrEqual(5)
  })

  it('custom payoffs affect behavior', () => {
    // Very high hero bonus -> agents challenge more easily
    const aggressive = new AgreeChallenge({
      heroBonus: 10.0,
      groupthinkCost: 5.0,
      disruptionCost: 0.1,
    })

    const decision = aggressive.decide({
      belief: 0.7,
      groupConsensus: 0.5,
      reputationStake: 1.0,
    })

    // With huge hero bonus and low disruption cost,
    // even moderate skepticism triggers challenge
    expect(decision.challengeEV).toBeGreaterThan(0)
  })

  it('clamps belief and consensus to [0, 1]', () => {
    const game = new AgreeChallenge()

    // Should not throw with out-of-range values
    const d1 = game.decide({
      belief: -0.5,
      groupConsensus: 1.5,
      reputationStake: 1.0,
    })
    expect(d1.action).toBeDefined()

    const d2 = game.decide({
      belief: 2.0,
      groupConsensus: -1.0,
      reputationStake: 1.0,
    })
    expect(d2.action).toBeDefined()
  })
})
